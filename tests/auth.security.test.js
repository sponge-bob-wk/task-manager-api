// 认证安全增强相关测试
// 说明：Node.js 测试运行器会为每个测试文件启动独立进程，
// 因此这里的用户数据与 app.test.js 互不影响。
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { users } = require('../src/data');

let server;
let baseUrl;

before(() => {
  server = app.listen(0); // 0 表示由系统分配空闲端口
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

after(() => server.close());

// 注册 / 登录小助手
async function registerUser(username, password) {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

async function loginUser(username, password) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

// 带 token 的 JSON 请求
function api(path, token, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- 口令存储 ----------

test('注册后内存里只保存 scrypt 哈希，不保存明文密码', async () => {
  const res = await registerUser('hashcheck', 'secret123');
  assert.strictEqual(res.status, 201);

  const stored = users.find(u => u.username === 'hashcheck');
  assert.ok(stored, '用户应当已写入内存');
  assert.strictEqual(stored.password, undefined, '不应存在 password 明文字段');
  assert.match(stored.passwordHash, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(!stored.passwordHash.includes('secret123'), '哈希里不应出现明文');
});

test('相同密码两次注册得到的哈希不同（随机盐）', async () => {
  await registerUser('saltuser1', 'same-pass-123');
  await registerUser('saltuser2', 'same-pass-123');

  const u1 = users.find(u => u.username === 'saltuser1');
  const u2 = users.find(u => u.username === 'saltuser2');
  assert.notStrictEqual(u1.passwordHash, u2.passwordHash);
});

test('注册响应不包含密码或哈希', async () => {
  const res = await registerUser('leakcheck', 'another-pass');
  const body = await res.json();
  assert.deepStrictEqual(body, { id: body.id, username: 'leakcheck' });
});

// ---------- 登录 ----------

test('登录成功返回 32 位 token 与有效期', async () => {
  const res = await loginUser('hashcheck', 'secret123');
  assert.strictEqual(res.status, 200);

  const body = await res.json();
  assert.strictEqual(body.token.length, 32);
  assert.strictEqual(typeof body.expiresIn, 'number');
  assert.ok(body.expiresIn > 0);
});

test('不存在的用户与错误密码返回完全相同的响应（防止枚举用户名）', async () => {
  const unknown = await loginUser('no-such-user', 'whatever123');
  const wrongPassword = await loginUser('hashcheck', 'wrong-password');

  assert.strictEqual(unknown.status, wrongPassword.status);
  assert.strictEqual(unknown.status, 400);

  const a = await unknown.json();
  const b = await wrongPassword.json();
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.message, '用户名或密码错误');
});

test('登录时字段类型非法不会导致 500', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: { $ne: null }, password: ['x'] }),
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).message, '用户名或密码错误');
});

test('不带请求体的注册请求返回 400 而不是 500', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).message, '用户名和密码不能为空');
});

// ---------- 输入校验 ----------

test('用户名过短或含非法字符返回 400', async () => {
  const short = await registerUser('ab', '123456');
  assert.strictEqual(short.status, 400);

  const illegal = await registerUser('bad name!', '123456');
  assert.strictEqual(illegal.status, 400);
});

test('密码过短或过长返回 400', async () => {
  const tooShort = await registerUser('lengthuser', '12345');
  assert.strictEqual(tooShort.status, 400);
  assert.match((await tooShort.json()).message, /密码长度/);

  const tooLong = await registerUser('lengthuser', 'a'.repeat(129));
  assert.strictEqual(tooLong.status, 400);
});

// ---------- token 校验 ----------

test('Authorization 缺少 Bearer 前缀返回 401', async () => {
  const login = await (await loginUser('hashcheck', 'secret123')).json();

  const res = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: login.token },
  });
  assert.strictEqual(res.status, 401);
});

test('已登录用户可以正常访问受保护路由', async () => {
  const { token } = await (await loginUser('hashcheck', 'secret123')).json();
  const res = await api('/api/tasks', token);
  assert.strictEqual(res.status, 200);
});

// ---------- 越权访问（IDOR） ----------

test('不能通过任务 ID 读取其他用户的任务', async () => {
  // 用户 A 创建任务
  await registerUser('owner-a', 'password-a');
  const tokenA = (await (await loginUser('owner-a', 'password-a')).json()).token;
  const created = await (await api('/api/tasks', tokenA, {
    method: 'POST',
    body: { title: 'A 的私密任务' },
  })).json();

  // 用户 B 拿着 A 的任务 ID 访问
  await registerUser('owner-b', 'password-b');
  const tokenB = (await (await loginUser('owner-b', 'password-b')).json()).token;

  const forbidden = await api(`/api/tasks/${created.id}`, tokenB);
  assert.strictEqual(forbidden.status, 404);
  assert.strictEqual((await forbidden.json()).message, '任务不存在');

  // 任务的所有者仍然能正常读取
  const allowed = await api(`/api/tasks/${created.id}`, tokenA);
  assert.strictEqual(allowed.status, 200);
  assert.strictEqual((await allowed.json()).title, 'A 的私密任务');
});

// ---------- 任务字段校验 ----------

test('更新任务时 title 类型非法返回 400（而不是 404）', async () => {
  const { token } = await (await loginUser('hashcheck', 'secret123')).json();
  const created = await (await api('/api/tasks', token, {
    method: 'POST',
    body: { title: '待更新' },
  })).json();

  const res = await api(`/api/tasks/${created.id}`, token, {
    method: 'PUT',
    body: { title: 123 },
  });
  assert.strictEqual(res.status, 400);
});

test('更新任务时 done 非布尔值返回 400', async () => {
  const { token } = await (await loginUser('hashcheck', 'secret123')).json();
  const created = await (await api('/api/tasks', token, {
    method: 'POST',
    body: { title: '待更新 done' },
  })).json();

  const res = await api(`/api/tasks/${created.id}`, token, {
    method: 'PUT',
    body: { done: 'false' },
  });
  assert.strictEqual(res.status, 400);
});

test('创建任务时 done 非布尔值返回 400', async () => {
  const { token } = await (await loginUser('hashcheck', 'secret123')).json();
  const res = await api('/api/tasks', token, {
    method: 'POST',
    body: { title: '非法 done', done: 'yes' },
  });
  assert.strictEqual(res.status, 400);
});