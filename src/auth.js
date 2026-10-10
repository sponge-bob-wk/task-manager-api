// 引入 Node.js 内置加密模块，用于生成随机 token
const crypto = require('crypto');

// 从 data.js 引入共享数据与 ID 生成函数
const { users, tokens, nextUserId } = require('./data');

// 注册新用户
function register(username, password) {
  // 校验用户名和密码不能为空
  if (!username || !password) throw new Error('用户名和密码不能为空');

  // 检查用户名是否已存在
  if (users.find(u => u.username === username)) throw new Error('用户已存在');

  // 创建用户对象，密码明文存储（仅教学用，生产环境必须哈希）
  const user = { id: nextUserId(), username, password };

  // 存入内存数组
  users.push(user);

  // 返回用户信息（不含密码更安全，这里简化）
  return user;
}

// 用户登录
function login(username, password) {
  // 查找匹配用户名和密码的用户
  const user = users.find(u => u.username === username && u.password === password);

  // 如果没找到，抛出错误
  if (!user) throw new Error('用户名或密码错误');

  // 生成 16 字节随机 token，转为十六进制字符串
  const token = crypto.randomBytes(16).toString('hex');

  // 把 token 和用户 ID 的映射存入 Map
  tokens.set(token, user.id);

  // 返回 token
  return token;
}

// 认证中间件，保护需要登录的路由
function authMiddleware(req, res, next) {
  // 从请求头 Authorization 中取出 token，格式通常为 "Bearer xxx"
  const token = req.header('Authorization')?.replace('Bearer ', '');

  // 如果 token 不存在或不在 tokens 中，返回 401
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ message: '未授权' });
  }

  // 把用户 ID 挂到 req 上，供后续路由使用
  req.userId = tokens.get(token);

  // 继续执行下一个中间件或路由
  next();
}

// 导出函数
module.exports = { register, login, authMiddleware };
