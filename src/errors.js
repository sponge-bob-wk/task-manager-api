// 带 HTTP 状态码的错误类型
// 说明：业务层只负责抛出「是什么错、对应什么状态码」，
// 由路由层统一决定如何写回响应，避免路由里到处散落 if/else。
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    // ES5 的 Error 子类默认 name 是 'Error'，手动改成 'HttpError' 便于日志排查
    this.name = 'HttpError';
    this.status = status;
  }
}

// 400：请求参数不合法
function badRequest(message) {
  return new HttpError(400, message);
}

// 404：资源不存在（或无权访问，故意与「不存在」保持同一响应，避免泄露资源是否存在）
function notFound(message) {
  return new HttpError(404, message);
}

module.exports = { HttpError, badRequest, notFound };