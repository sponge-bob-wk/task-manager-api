# 用火狐 RESTED 扩展测试 Task Manager API

> 配套文件：同目录下 `task-manager-api-带token.json`（已内嵌可用的 token）
> 项目位置：`E:\下载\task-manager-api-new`
> 生成时间：2026-10-10

---

## 一、前置：把服务跑起来

```bash
cd E:\下载\task-manager-api-new
npm install      # 只依赖 express
npm start        # 监听 http://localhost:3000
```

看到 `服务器运行在 http://localhost:3000` 即可。

---

## 二、打开 RESTED

RESTED 已安装在你火狐的配置档里（`rested@restedclient` v2.5.0）。

- 方法 A：点火狐工具栏上的 **RESTED** 图标 —— 它会在**新标签页**里打开（不是小弹窗）。
- 方法 B：直接在地址栏粘贴下面这行（这是本机 RESTED 的真实地址）：

```
moz-extension://4b7a8f2e-8a0c-4200-8992-dd1803fcddf1/dist/index.html
```

---

## 三、把 13 条请求一次性导入（推荐，省一条条填）

1. 在 RESTED 页面右上角点 **齿轮图标**（打开 Options 弹窗）。
2. 切到 **Import data** 页签。
3. 点 **Postman** 按钮（默认是 HAR，**必须切到 Postman**）。
4. 用记事本打开 `task-manager-api-带token.json`，**全选 → 复制**，粘贴进那个大文本框。
5. 点右下角 **Import**。
6. 弹出 `Successfully parsed imports` → 点 **New collection**。
   - 会新建一个叫 `Task Manager API 全流程测试` 的集合，13 条请求都在里面。
7. 左侧点开集合，逐条点击 → 右侧点 **Send**。

> 该文件的格式已用 RESTED 2.5.0 源码里的 `fromPostman()` 逐条验过，13 条全部合法。

---

## 四、逐条请求与预期结果

内嵌的 token 是生成这份文件时真实登录拿到的，**只要你不重启服务就一直有效**。

| # | 方法 | URL | 额外请求头 | 请求体 | 预期状态码 | 预期响应 |
|---|---|---|---|---|---|---|
| 1 | GET | `/health` | — | — | 200 | `{"status":"ok"}` |
| 2 | POST | `/api/auth/register` | Content-Type: application/json | `{"username":"alice","password":"123456"}` | **400** | `{"message":"用户已存在"}`（见下方注①） |
| 3 | POST | `/api/auth/register` | 同上 | 同上 | **400** | `{"message":"用户已存在"}` |
| 4 | POST | `/api/auth/login` | 同上 | 同上 | 200 | `{"token":"..."}` |
| 5 | POST | `/api/tasks` | + Authorization | `{"title":"学习 Express"}` | 201 | `{"id":4,"userId":1,...}` |
| 6 | POST | `/api/tasks` | + Authorization | `{}` | **400** | `{"message":"标题不能为空"}` |
| 7 | GET | `/api/tasks` | + Authorization | — | 200 | 任务数组，按创建时间倒序 |
| 8 | GET | `/api/tasks?done=true&page=1&limit=10` | + Authorization | — | 200 | 过滤 + 分页后的数组 |
| 9 | GET | `/api/tasks/1` | + Authorization | — | 200 | 单条任务详情 |
| 10 | GET | `/api/tasks/9999` | + Authorization | — | **404** | `{"message":"任务不存在"}` |
| 11 | PUT | `/api/tasks/1` | + Authorization | `{"done":true}` | 200 | 更新后的任务 |
| 12 | DELETE | `/api/tasks/3` | + Authorization | — | 204 | 空响应体 |
| 13 | GET | `/api/tasks` | **不带** Authorization | — | **401** | `{"message":"未授权"}` |

`+ Authorization` 表示 `Authorization: Bearer 20183d7b94a7f6c725f8d3df4349fb53`（已写进文件）。

> **注①**：这份文件里内嵌的 token 是靠"alice 已注册并登录"才拿到的，所以当前服务里 alice 已经存在 ——
> 请求 #2（注册 alice）会返回 **400 用户已存在**，这是**预期结果，不是 bug**。
> 若你想要"注册成功返回 201"的原始效果：重启服务（数据清空）后，先手动把 #2 发一次（拿 201），
> 再发 #4 登录拿新 token，然后按第五节把各请求的头换掉。
>
> 同理，当前服务里已有任务 id = 1/2/3，所以请求 #5 新建的任务 id 是 **4**。

---

## 五、token 过期了怎么办

**内存存储，重启 Node 进程 = 数据清空 + 所有 token 失效。** 只要重启过服务，就按下面做：

1. 在 RESTED 里先跑请求 #2（注册）→ 再跑 #4（登录），响应里复制 `token` 的值。
2. 打开请求 #5、#7~#12，把 `Authorization` 头的值改成 `Bearer <新token>` 再 Send。
3. 或者：换用同目录的 `task-manager-api-占位符.json`，把里面的 `在这里粘贴登录返回的-token` 全局替换成新 token，再按第三节重新导入一次。

---

## 六、说明：为什么没能全自动点完

我用 geckodriver + WebDriver 真的驱动起了火狐（Firefox 157.0.1），并成功让它**启动就直接打开 RESTED 页面**（URL 已确认）。但最终无法代替你点击，原因很硬：

- **火狐 WebDriver 明确拒绝操作扩展页面**：
  `The command does not support browsing contexts in privileged scope`
  ⇒ 导航到 `moz-extension://…`、读标题、截图、执行 JS，全部被拒。
  脚本里 `location.href = "moz-extension://…"` 也被火狐安全策略拦下（"from script denied"）。
- 另一条浏览器自动化通道（agent-browser）基于 Chromium，**装不了也用不了火狐扩展**。

所以：**导入 + 点 Send 这几下得你来点**，但除此之外（建项目、跑测试、验接口、造导入文件、定位扩展、算 UUID）都已经做完了。

---

## 七、常见坑：发出去报 400 Bad Request

**现象**：请求面板左上角方法框显示 `CUSTOM`（旁边多出一个文本框），Send 回来是 **400 Bad Request**，明明 URL 没错。

**原因（已在源码和本地双向验证）**：

1. RESTED 的方法白名单是
   `['GET','POST','PUT','DELETE','PATCH','HEAD','JSONP','CUSTOM']`，
   判断逻辑是 `checkIfCustom(v) = !白名单.slice(0,-1).includes(v)`。
2. 方法一旦不在白名单里，下拉框会被强制显示 `CUSTOM`，旁边多出一个文本框显示这个非法值；
3. **发送时会把 `CUSTOM` 当字面的 HTTP 方法发出去**，Node 的 HTTP 解析器不认，直接回 400。

我本机实测复现过：

```
curl -X CUSTOM http://localhost:3000/health   ->  400
curl         http://localhost:3000/health   ->  200
```

⇒ **服务端没有任何问题**，是请求方法不对。

**修法**：点开每条请求，把左边那个方法下拉重新选成正确的 `GET / POST / PUT / DELETE`（别选 `CUSTOM`），再一次 Send。

### 还有一个坑：导入进来的 POST/PUT 是空请求体

RESTED 的导入只会搬 `method / url / headers / data` 四个字段（源码 `utils/import.js` 里写死了）。
而它发送时是这样的：

```js
if (!['GET', 'HEAD'].includes(request.method)) {
  body = request.bodyType !== 'custom'
    ? buildRequestData(request.bodyType, request.formData)  // 导入的请求没有这两个字段 → 返回 null
    : request.data;                                        // 只有 custom 这一支才会用到 data
}
```

也就是说：**导入进来的请求体，只有把 `Request body` 的 `Type` 手动选成 `Custom`，才会真的发出去**；
否则 `body` 是 `null`，POST 发出去是个空包，服务端就回 400（比如 `用户名和密码不能为空`）。

**修法**：带请求体的 6 条（#2 #3 #4 #5 #6 #11）→ 展开 `Request body` → `Type` 选 **Custom** →
下面的正文框里应该能看到导入进来的 JSON，确认无误再 Send。

### ⚠️ 陷阱：`Type` 显示着 "Custom"，但正文框死活不出来

**这是最容易卡住的一步。** `Type` 下拉的选项顺序是：

```
Custom / JSON / Multipart form data / URLencoded form data
```

**`Custom` 是第 1 项**，而 `bodyType` 字段不在导入范围内（导入只搬 method/url/headers/data），
表单里它是"无值"状态 —— 浏览器对无值的 `<select>` **默认显示第一项**，
所以你看到的 `Custom` 只是表象，实际**什么都没选中**。

判断依据：看它下面渲染的是什么。

| 显示 | 说明 |
|---|---|
| `+ Add parameter`（键值对输入行） | 内部按 JSON / 表单处理 → **正文框不会出现**，POST 会发空包 |
| 一个 **10 行高的文本框** | 这才是真的选中了 Custom，正文框里就是 `data` |

**正确操作**：点开 `Type` 下拉 → **先选一个别的（如 `JSON`）→ 再选回 `Custom`**。

必须"选两次"：如果下拉显示值已经停在 `Custom`，直接点它不触发变化事件，等于没改。

| 需要怎么改 | 哪几条 |
|---|---|
| 只改方法下拉 | #1 #7 #8 #9 #10 #12 #13 |
| 改方法下拉 + Type 选 Custom | #2 #3 #4 #5 #6 #11 |

> 导入终究是有损的。若嫌逐条修麻烦，更快的方法是**手搓 4 条**：#1 GET `/health`、
> #4 POST `/api/auth/login`（Type=Custom，正文填那两个字段）、#5 POST `/api/tasks`（带上 Authorization 头）、
> #7 GET `/api/tasks`（带上 Authorization 头）。这 4 条就能完整演示"公开接口 → 拿 token → 带 token 访问受保护接口"。

