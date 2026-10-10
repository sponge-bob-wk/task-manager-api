// 引入 Node.js 内置测试模块
const { test, before, after } = require('node:test');
const assert = require('node:assert');

// 引入 express 应用
const app = require('../src/app');

// 定义服务器和基础 URL 变量
let server;
let baseUrl;

// 所有测试前启动服务器，监听随机端口
before(() => {
  server = app.listen(0); // 0 表示由系统分配空闲端口
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

// 所有测试后关闭服务器
after(() => server.close());

// 测试健康检查接口
test('GET /health 返回 ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

// 测试注册、登录、创建任务的完整流程
test('注册、登录、创建任务完整流程', async () => {
  // 注册
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: '123456' }),
  });
  assert.strictEqual(reg.status, 201);

  // 登录
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: '123456' }),
  });
  const { token } = await login.json();
  assert.ok(token);

  // 创建任务
  const create = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: '学习 Express' }),
  });
  assert.strictEqual(create.status, 201);
  const task = await create.json();
  assert.strictEqual(task.title, '学习 Express');
});
