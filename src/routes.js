// 引入 express 用于创建路由
const express = require('express');

// 引入认证相关函数和中间件
const { register, login, authMiddleware } = require('./auth');

// 引入任务相关函数
const { createTask, listTasks, updateTask, deleteTask, getTask } = require('./tasks');

// 创建路由实例
const router = express.Router();

// 分页参数上限：避免一次请求拉取过大的切片
const MAX_LIMIT = 100;

// 解析正整数查询参数：非法或缺失时回退到默认值
function parsePositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// 统一错误响应：优先使用错误自带的状态码，否则用调用方给的兜底状态码
function sendError(res, err, fallbackStatus) {
  res.status(err.status || fallbackStatus).json({ message: err.message });
}

// 注册路由：POST /api/auth/register
router.post('/auth/register', async (req, res) => {
  try {
    // 请求体可能缺失（例如没带 Content-Type），用空对象兜底，避免读取 undefined 属性报 500
    const { username, password } = req.body || {};
    // 调用 register 函数，内部会做格式校验并做 scrypt 哈希（异步，所以这里要 await）
    const user = await register(username, password);
    // 成功返回 201 和脱敏后的用户信息
    res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    // 出错返回 400 和错误信息
    sendError(res, err, 400);
  }
});

// 登录路由：POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    // 登录成功返回 token 与有效期（毫秒）
    const result = await login(username, password);
    res.json({ token: result.token, expiresIn: result.expiresIn });
  } catch (err) {
    // 统一返回 400（沿用既有接口约定），但「用户不存在」与「密码错误」的文案完全一致
    sendError(res, err, 400);
  }
});

// 以下所有路由都需要认证，使用 authMiddleware 保护
router.use(authMiddleware);

// 创建任务：POST /api/tasks
router.post('/tasks', (req, res) => {
  try {
    // 调用 createTask，传入当前用户 ID 和请求体
    res.status(201).json(createTask(req.userId, req.body));
  } catch (err) {
    sendError(res, err, 400);
  }
});

// 列出任务：GET /api/tasks
router.get('/tasks', (req, res) => {
  // 从查询参数中解构 done、page、limit
  const { done, page, limit } = req.query;

  // done 只接受 true/false，拼错时明确报错，而不是悄悄按 false 过滤
  let doneFilter;
  if (done !== undefined) {
    if (done === 'true' || done === '1') doneFilter = true;
    else if (done === 'false' || done === '0') doneFilter = false;
    else return res.status(400).json({ message: "done 只能是 'true' 或 'false'" });
  }

  // 调用 listTasks，处理分页默认值并对 limit 封顶
  const result = listTasks(req.userId, {
    done: doneFilter,
    page: parsePositiveInt(page, 1),
    limit: Math.min(parsePositiveInt(limit, 10), MAX_LIMIT),
  });

  // 返回任务列表
  res.json(result);
});

// 更新任务：PUT /api/tasks/:id
router.put('/tasks/:id', (req, res) => {
  try {
    // 调用 updateTask，传入用户 ID、任务 ID 和更新内容
    res.json(updateTask(req.userId, req.params.id, req.body));
  } catch (err) {
    // 参数校验失败是 400（由 HttpError 自带状态码），任务不存在才是 404
    sendError(res, err, 404);
  }
});

// 删除任务：DELETE /api/tasks/:id
router.delete('/tasks/:id', (req, res) => {
  try {
    // 调用 deleteTask
    deleteTask(req.userId, req.params.id);
    // 成功删除返回 204 无内容
    res.status(204).end();
  } catch (err) {
    sendError(res, err, 404);
  }
});

// 任务详情：GET /api/tasks/:id
router.get('/tasks/:id', (req, res) => {
  // 必须把当前用户 ID 一起传进去，否则会越权读到别人的任务
  const result = getTask(req.userId, req.params.id);
  if (result) {
    // 返回任务详情
    res.json(result);
  } else {
    // 别人的任务与不存在的任务返回同样的 404，避免泄露任务 ID 是否存在
    res.status(404).json({ message: '任务不存在' });
  }
});

// 导出路由
module.exports = router;