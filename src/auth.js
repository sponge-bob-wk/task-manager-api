// 引入 Node.js 内置加密模块：randomBytes 生成盐和 token，scrypt 做口令哈希，timingSafeEqual 做常量时间比较
const crypto = require('crypto');

// 把回调风格的 crypto.scrypt 转成 Promise 风格，方便在 async 函数里 await
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);

// 从 data.js 引入共享数据与 ID 生成函数
const { users, tokens, nextUserId } = require('./data');

// ---------- 口令哈希参数 ----------

// scrypt 的 CPU/内存开销参数，参考 Node.js 默认值与 OWASP 建议
const SCRYPT_N = 16384; // CPU/内存成本，必须是 2 的幂
const SCRYPT_R = 8;     // 块大小
const SCRYPT_P = 1;     // 并行度
const SCRYPT_KEYLEN = 64; // 派生密钥长度（字节）

// 存储格式：scrypt$N$r$p$盐(hex)$派生密钥(hex)
// 把参数一起存进去，将来调高强度时旧口令仍然可以验证
const HASH_PREFIX = 'scrypt';

// 用户不存在时使用的固定盐：让「查无此人」也付出一次同等成本的 scrypt 计算，
// 从而抹平响应时间差异，防止攻击者通过耗时枚举出哪些用户名存在
const DUMMY_SALT = Buffer.from('00000000000000000000000000000000', 'hex');

// ---------- 账号输入规则 ----------

const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;

// 允许任意语言的字母、数字以及 _ . - （\p{L} 包含中文等 Unicode 字母）
const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]+$/u;

// 登录失败统一文案：不区分「用户不存在」与「密码错误」
const LOGIN_FAILED_MESSAGE = '用户名或密码错误';
const EMPTY_CREDENTIALS_MESSAGE = '用户名和密码不能为空';

// ---------- token 配置 ----------

// token 有效期默认 2 小时；可通过环境变量 TOKEN_TTL_MS 覆盖（单测用来缩短到毫秒级）
const DEFAULT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function parseTokenTtl(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_TTL_MS;
}

const TOKEN_TTL_MS = parseTokenTtl(process.env.TOKEN_TTL_MS);

// ---------- 口令哈希 ----------

// 生成口令哈希：每次注册都使用新的随机盐，因此相同密码的哈希也不同
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    HASH_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    derivedKey.toString('hex'),
  ].join('$');
}

// 校验口令：解析存储格式并重新派生，再用 timingSafeEqual 做常量时间比较
// 任何格式异常都返回 false，而不是抛错（避免把存储细节泄漏成 500）
async function verifyPassword(password, storedHash) {
  try {
    if (typeof storedHash !== 'string') return false;

    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return false;

    const [, n, r, p, saltHex, keyHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expectedKey = Buffer.from(keyHex, 'hex');
    if (salt.length === 0 || expectedKey.length === 0) return false;

    const derivedKey = await scryptAsync(password, salt, expectedKey.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    // timingSafeEqual 要求两个 Buffer 长度一致，先判长度再比较
    return derivedKey.length === expectedKey.length && crypto.timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

// ---------- 账号操作 ----------

// 注册新用户
async function register(username, password) {
  // 统一先做类型与空值校验
  const name = typeof username === 'string' ? username.trim() : '';
  const pwd = typeof password === 'string' ? password : '';
  if (!name || !pwd) throw new Error(EMPTY_CREDENTIALS_MESSAGE);

  // 用户名：长度 + 字符集
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX || !USERNAME_PATTERN.test(name)) {
    throw new Error(`用户名需为 ${USERNAME_MIN}-${USERNAME_MAX} 位字母、数字、下划线、点或短横线`);
  }

  // 密码：长度上下限（下限防止弱口令，上限防止超长输入拖慢哈希计算）
  if (pwd.length < PASSWORD_MIN || pwd.length > PASSWORD_MAX) {
    throw new Error(`密码长度需为 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`);
  }

  // 检查用户名是否已存在
  if (users.find(u => u.username === name)) throw new Error('用户已存在');

  // 只存哈希，绝不落地明文
  const passwordHash = await hashPassword(pwd);
  const user = { id: nextUserId(), username: name, passwordHash, createdAt: new Date() };

  // 存入内存数组
  users.push(user);

  // 返回脱敏后的用户信息，避免调用方顺手把哈希回显出去
  return { id: user.id, username: user.username };
}

// 生成并登记一个新 token，返回 token 与有效期（毫秒）
function issueToken(userId) {
  // 16 字节随机数转十六进制，即 32 个字符
  const token = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;

  // tokens 的值从「userId」升级为带过期时间的小对象
  tokens.set(token, { userId, createdAt: now, expiresAt });

  return { token, expiresIn: TOKEN_TTL_MS };
}

// 用户登录
async function login(username, password) {
  const name = typeof username === 'string' ? username.trim() : '';
  const pwd = typeof password === 'string' ? password : '';

  // 字段缺失时也走统一的失败文案，避免暴露「是用户名错了还是密码错了」
  if (!name || !pwd) throw new Error(LOGIN_FAILED_MESSAGE);

  const user = users.find(u => u.username === name);

  if (!user) {
    // 用户不存在：做一次等成本的哈希运算后再失败，抹平时间差
    await scryptAsync(pwd, DUMMY_SALT, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    throw new Error(LOGIN_FAILED_MESSAGE);
  }

  // 超长密码不可能通过注册校验，直接判失败（仍然先做一次验算以保持耗时一致）
  const valid = pwd.length <= PASSWORD_MAX && (await verifyPassword(pwd, user.passwordHash));
  if (!valid) throw new Error(LOGIN_FAILED_MESSAGE);

  return issueToken(user.id);
}

// 认证中间件，保护需要登录的路由
function authMiddleware(req, res, next) {
  const header = req.header('Authorization') || '';
  // 只接受标准的 "Bearer <token>" 形式
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

  const session = token ? tokens.get(token) : undefined;

  // token 不存在 / 已被清理 / 已过期，一律返回 401
  if (!session || session.expiresAt <= Date.now()) {
    // 顺手清掉过期条目，避免 Map 无限增长
    if (session) tokens.delete(token);
    return res.status(401).json({ message: '未授权' });
  }

  // 把用户 ID 挂到 req 上，供后续路由使用
  req.userId = session.userId;
  req.auth = session;

  next();
}

// 导出函数与常量（常量供测试断言使用）
module.exports = {
  register,
  login,
  authMiddleware,
  hashPassword,
  verifyPassword,
  TOKEN_TTL_MS,
  PASSWORD_MAX,
};