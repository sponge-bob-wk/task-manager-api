// 从 data.js 引入任务数组和 ID 生成函数
const { tasks, nextTaskId } = require('./data');

// 引入带状态码的错误构造器
const { badRequest, notFound } = require('./errors');

// 标题长度上限：防止超长字符串占用内存、撑坏日志
const TITLE_MAX_LENGTH = 200;

// 规范化标题：必须是字符串，去掉首尾空白后长度在 1-200 之间，否则返回 null
function normalizeTitle(title) {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > TITLE_MAX_LENGTH) return null;
  return trimmed;
}

// 创建任务
function createTask(userId, body) {
  const { title, done = false } = body || {};

  // 标题缺失或为空时保持原有文案，兼容既有调用方
  if (title === undefined || title === null || (typeof title === 'string' && title.trim() === '')) {
    throw badRequest('标题不能为空');
  }

  // 类型 / 长度校验
  const normalizedTitle = normalizeTitle(title);
  if (normalizedTitle === null) {
    throw badRequest(`标题需为 1-${TITLE_MAX_LENGTH} 个字符的字符串`);
  }

  // done 必须是布尔值，避免把字符串 "false" 当成 true 存进去
  if (typeof done !== 'boolean') {
    throw badRequest('done 必须为布尔值');
  }

  // 构造任务对象，包含自增 ID、所属用户、标题、完成状态、创建时间
  const task = { id: nextTaskId(), userId, title: normalizedTitle, done, createdAt: new Date() };

  // 存入内存数组
  tasks.push(task);

  // 返回新任务
  return task;
}

// 列出任务，支持按完成状态过滤、分页
function listTasks(userId, { done, page = 1, limit = 10 } = {}) {
  // 先筛选出属于当前用户的任务
  let result = tasks.filter(t => t.userId === userId);

  // 如果传入了 done 参数，按完成状态过滤
  if (done !== undefined) result = result.filter(t => t.done === done);

  // 按创建时间倒序排列（最新的在前）
  result.sort((a, b) => b.createdAt - a.createdAt);

  // 计算分页起始索引
  const start = (page - 1) * limit;

  // 返回当前页的数据
  return result.slice(start, start + Number(limit));
}

// 更新任务
function updateTask(userId, id, updates) {
  const patch = updates || {};

  // 先校验要更新的字段，把「参数错误」和「任务不存在」区分成 400 / 404
  let nextTitle;
  if (patch.title !== undefined) {
    nextTitle = normalizeTitle(patch.title);
    if (nextTitle === null) {
      throw badRequest(`标题需为 1-${TITLE_MAX_LENGTH} 个字符的字符串`);
    }
  }

  if (patch.done !== undefined && typeof patch.done !== 'boolean') {
    throw badRequest('done 必须为布尔值');
  }

  // 查找属于当前用户且 ID 匹配的任务
  const task = tasks.find(t => t.id === Number(id) && t.userId === userId);

  // 找不到则抛出错误
  if (!task) throw notFound('任务不存在');

  // 如果传入了 title，更新标题
  if (nextTitle !== undefined) task.title = nextTitle;

  // 如果传入了 done，更新完成状态
  if (patch.done !== undefined) task.done = patch.done;

  // 返回更新后的任务
  return task;
}

// 删除任务
function deleteTask(userId, id) {
  // 查找任务索引
  const index = tasks.findIndex(t => t.id === Number(id) && t.userId === userId);

  // 找不到则抛出错误
  if (index === -1) throw notFound('任务不存在');

  // 从数组中删除并返回被删除的任务
  return tasks.splice(index, 1)[0];
}

// 显示任务详情
// 注意：必须同时按「任务 ID + 当前用户 ID」过滤，
// 否则只要猜到别人的任务 ID 就能读到别人的数据（IDOR，越权访问）
function getTask(userId, id) {
  return tasks.find(t => t.id === Number(id) && t.userId === userId) || null;
}

// 导出所有任务操作函数
module.exports = { createTask, listTasks, updateTask, deleteTask, getTask };