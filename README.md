# Task Manager API

Express.js 任务管理 API 项目。

## 运行

```bash
npm install
npm start
```

## 测试

```bash
npm test
```

## API

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

## 认证说明

- 口令使用 Node.js 内置 `crypto.scrypt` 哈希后保存，**不存明文**；每次注册使用随机盐，
  存储格式为 `scrypt$N$r$p$盐$派生密钥`。
- 登录返回 `token` 与 `expiresIn`（毫秒），默认有效期 **2 小时**，可通过环境变量
  `TOKEN_TTL_MS` 调整（例如 `TOKEN_TTL_MS=600000 npm start`）。
- 受保护接口需携带请求头：`Authorization: Bearer <token>`。
- 「用户不存在」与「密码错误」返回相同的响应，且耗时一致，避免被用来枚举用户名。
- 任务详情同时按「任务 ID + 当前用户」过滤，无法通过猜测 ID 读取他人任务。

登录响应示例：

```json
{
  "token": "3f2a...（32 位十六进制）",
  "expiresIn": 7200000
}
```
