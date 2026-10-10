// 引入 Node.js 内置测试模块
const { test, before, after } = require('node:test');
const assert = require('node:assert');

// 引入 express 应用
const app = require('../src/app');

// 定义服务器和基础 URL 变量
let server;
let baseUrl;
let token;

// 所有测试前启动服务器，监听随机端口
before(() => {
  server = app.listen(0); // 0 表示由系统分配空闲端口
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
});

// 所有测试后关闭服务器
after(() => server.close());

// 带 token 的 JSON 请求小助手
function api(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (auth && token) h.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- 模块 0：健康检查 ----------

test('GET /health 返回 ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

// ---------- 模块 2：认证 ----------

test('注册成功返回 201 且不泄露密码', async () => {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: '123456' },
    auth: false,
  });
  assert.strictEqual(res.status, 201);
  const body = await res.json();
  assert.strictEqual(body.username, 'alice');
  assert.strictEqual(body.password, undefined);
});

test('重复用户名注册返回 400', async () => {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'alice', password: '123456' },
    auth: false,
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).message, '用户已存在');
});

test('缺少密码注册返回 400', async () => {
  const res = await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'bob' },
    auth: false,
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).message, '用户名和密码不能为空');
});

test('密码错误登录返回 400', async () => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'alice', password: 'wrong' },
    auth: false,
  });
  assert.strictEqual(res.status, 400);
});

test('登录成功返回 token', async () => {
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'alice', password: '123456' },
    auth: false,
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.token, '应当返回 token');
  assert.strictEqual(body.token.length, 32); // 16 字节随机数的十六进制
  token = body.token;
});

test('无 token 访问受保护路由返回 401', async () => {
  const res = await fetch(`${baseUrl}/api/tasks`);
  assert.strictEqual(res.status, 401);
  assert.strictEqual((await res.json()).message, '未授权');
});

test('伪造 token 访问受保护路由返回 401', async () => {
  const res = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: 'Bearer deadbeef' },
  });
  assert.strictEqual(res.status, 401);
});

// ---------- 模块 1：任务 CRUD ----------

test('创建任务返回 201', async () => {
  const res = await api('/api/tasks', { method: 'POST', body: { title: '学习 Express' } });
  assert.strictEqual(res.status, 201);
  const task = await res.json();
  assert.strictEqual(task.id, 1);
  assert.strictEqual(task.title, '学习 Express');
  assert.strictEqual(task.done, false);
});

test('创建任务缺少 title 返回 400', async () => {
  const res = await api('/api/tasks', { method: 'POST', body: {} });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).message, '标题不能为空');
});

test('查看任务详情', async () => {
  const res = await api('/api/tasks/1');
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).title, '学习 Express');
});

test('查看不存在的任务返回 404', async () => {
  const res = await api('/api/tasks/9999');
  assert.strictEqual(res.status, 404);
  assert.strictEqual((await res.json()).message, '任务不存在');
});

test('更新任务', async () => {
  const res = await api('/api/tasks/1', { method: 'PUT', body: { done: true } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).done, true);
});

test('更新不存在的任务返回 404', async () => {
  const res = await api('/api/tasks/9999', { method: 'PUT', body: { done: true } });
  assert.strictEqual(res.status, 404);
});

test('删除任务返回 204，重复删除返回 404', async () => {
  const create = await api('/api/tasks', { method: 'POST', body: { title: '待删除' } });
  const created = await create.json();

  const del = await api(`/api/tasks/${created.id}`, { method: 'DELETE' });
  assert.strictEqual(del.status, 204);

  const again = await api(`/api/tasks/${created.id}`, { method: 'DELETE' });
  assert.strictEqual(again.status, 404);
});

// ---------- 模块 3：过滤与分页 ----------

test('列表按创建时间倒序返回', async () => {
  await api('/api/tasks', { method: 'POST', body: { title: '第二件事' } });
  await api('/api/tasks', { method: 'POST', body: { title: '第三件事' } });

  const res = await api('/api/tasks');
  const list = await res.json();
  assert.strictEqual(list.length, 3);
  assert.strictEqual(list[0].title, '第三件事');
  assert.strictEqual(list[2].title, '学习 Express');
});

test('按 done=true 过滤', async () => {
  const list = await (await api('/api/tasks?done=true')).json();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].title, '学习 Express');
});

test('按 done=false 过滤', async () => {
  const list = await (await api('/api/tasks?done=false')).json();
  assert.strictEqual(list.length, 2);
});

test('分页 limit=1 只返回一条', async () => {
  const list = await (await api('/api/tasks?page=1&limit=1')).json();
  assert.strictEqual(list.length, 1);
});

test('翻到第二页拿到不同的记录', async () => {
  const page1 = await (await api('/api/tasks?page=1&limit=1')).json();
  const page2 = await (await api('/api/tasks?page=2&limit=1')).json();
  assert.notStrictEqual(page1[0].id, page2[0].id);
});

test('任务列表只包含自己的任务（数据隔离）', async () => {
  // 换一个用户，它的列表应当是空的
  await api('/api/auth/register', {
    method: 'POST',
    body: { username: 'mallory', password: '123456' },
    auth: false,
  });
  const other = await (
    await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'mallory', password: '123456' },
      auth: false,
    })
  ).json();

  const res = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), []);
});
