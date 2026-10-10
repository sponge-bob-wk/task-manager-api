// 引入 express 应用
const app = require('./app');

// 从环境变量读取端口，默认 3000
const port = process.env.PORT || 3000;

// 启动服务器并监听端口
app.listen(port, () => console.log(`服务器运行在 http://localhost:${port}`));
