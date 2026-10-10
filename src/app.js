// 引入 express
const express = require('express');

// 引入自定义路由
const routes = require('./routes');

// 创建 express 应用
const app = express();

// 使用内置中间件解析 JSON 请求体
app.use(express.json());

// 健康检查路由
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 挂载 API 路由，所有路由以 /api 开头
app.use('/api', routes);

// 未匹配到任何路由时，统一返回 404，保证错误响应格式与其它接口一致
// 注意：必须放在所有路由之后，否则会把正常的路由也一起拦掉
app.use((req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 统一错误处理中间件，捕获未处理的错误
// 注意：Express 依靠「四个参数」来识别错误处理中间件，next 不能删（即使这里用不到）
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).json({ message: '服务器内部错误' });
});

// 导出 app 供测试和服务器使用
module.exports = app;
