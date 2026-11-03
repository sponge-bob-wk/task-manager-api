// token 过期测试
// 注意：必须在 require('../src/app') 之前设置环境变量，
// 因为 auth.js 在模块加载时读取 TOKEN_TTL_MS。
// 测试运行器为每个文件启动独立进程，因此不会影响其他测试文件。
process.env.TOKEN_TTL_MS = '100';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

after(() => server.close());

// 等待指定毫秒
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('token 过期后访问受保护接口返回 401', async () => {
  const register = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'expiry-user', password: '123456' }),
  });
  assert.strictEqual(register.status, 201);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'expiry-user', password: '123456' }),
  });
  const body = await login.json();
  assert.strictEqual(body.expiresIn, 100, '有效期应当来自 TOKEN_TTL_MS');

  // 未过期时可以访问
  const ok = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: `Bearer ${body.token}` },
  });
  assert.strictEqual(ok.status, 200);

  // 等待超过有效期后再次访问
  await sleep(250);
  const expired = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: `Bearer ${body.token}` },
  });
  assert.strictEqual(expired.status, 401);
  assert.strictEqual((await expired.json()).message, '未授权');
});