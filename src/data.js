// 内存数据存储，进程重启后清空
// 说明：这些数据保存在内存中，Node.js 进程一重启，所有数据都会丢失。
// 适合教学和测试，不需要数据库。

const users = [];          // 存放用户对象，例如 { id, username, password }
const tasks = [];          // 存放任务对象，例如 { id, userId, title, done, createdAt }
const tokens = new Map();  // token -> userId，登录后生成 token，用于验证用户身份

let nextUserId = 1;        // 下一个用户 ID 的起始值，每创建一个用户就自增
let nextTaskId = 1;        // 下一个任务 ID 的起始值，每创建一个任务就自增

// 使用 CommonJS 模块导出语法，把数据与 ID 生成函数暴露给其他文件
module.exports = {
  users,                   // 引用导出：其他文件拿到的是同一个数组，可共享数据
  tasks,                   // 同上
  tokens,                  // 同上，Map 也是引用共享

  // 箭头函数，每次调用返回自增前的值，然后内部计数器加 1
  // 例如：第一次调用 nextUserId() 返回 1，nextUserId 变成 2
  nextUserId: () => nextUserId++,
  nextTaskId: () => nextTaskId++,
};
