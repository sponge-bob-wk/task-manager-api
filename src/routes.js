// 引入 express 用于创建路由
const express = require('express');

// 引入认证相关函数和中间件
const { register, login, authMiddleware } = require('./auth');

// 引入任务相关函数
const { createTask, listTasks, updateTask, deleteTask, getTask } = require('./tasks');

// 创建路由实例
const router = express.Router();

// 注册路由：POST /api/auth/register
router.post('/auth/register', (req, res) => {
  try {
    // 调用 register 函数，传入请求体中的用户名和密码
    const user = register(req.body.username, req.body.password);
    // 成功返回 201 和用户信息
    res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    // 出错返回 400 和错误信息
    res.status(400).json({ message: err.message });
  }
});

// 登录路由：POST /api/auth/login
router.post('/auth/login', (req, res) => {
  try {
    // 调用 login 函数，获取 token
    const token = login(req.body.username, req.body.password);
    // 返回 token
    res.json({ token });
  } catch (err) {
    // 出错返回 400
    res.status(400).json({ message: err.message });
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
    res.status(400).json({ message: err.message });
  }
});

// 列出任务：GET /api/tasks
router.get('/tasks', (req, res) => {
  // 从查询参数中解构 done、page、limit
  const { done, page, limit } = req.query;

  // 调用 listTasks，处理 done 的布尔值转换和分页默认值
  const result = listTasks(req.userId, {
    done: done === undefined ? undefined : done === 'true',
    page: Number(page) || 1,
    limit: Number(limit) || 10,
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
    res.status(404).json({ message: err.message });
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
    res.status(404).json({ message: err.message });
  }
});

// 任务详情：GET /api/tasks/:id
router.get('/tasks/:id', (req, res) => {
  // 调用 getTask
  const result = getTask(req.params.id);
  if (result){
    // 返回任务详情
    res.json(result);
  } else {
    res.status(404).json({ message: '任务不存在' });
  }
});

// 导出路由
module.exports = router;
