# GeoPilot Web

React 19 + TypeScript strict + Vite + Tailwind CSS。业务 API 由 Go 服务提供。

## 开发与验证

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

开发服务器代理 `/api` 和 `/ws` 到 `127.0.0.1:8080`。生产构建写入 `dist`，由 Go HTTP 服务提供。浏览器回归使用独立的 5178 端口和 API fixtures。可以通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 使用已有 Chromium 浏览器。

## 维护约定

- 页面在 `features`，路由按需加载。业务统计来自 API；没有观测值时显示未知，不用样例填补业务结果。
- `services/api.ts` 定义接口类型和 SSE 协议，项目请求携带 `X-Project-ID`。鉴权刷新通过会话代数隔离，退出后迟到的刷新不能恢复会话。
- `useResource` 合并并发读取并隔离用户及项目缓存；`usePagedResource` 读取每页最多 100 项，页面筛选作用于本页。通过 `bgeo:updated` 刷新，隐藏页面暂停定时轮询。
- `PermissionProvider` 使用服务端有效项目权限，读取失败时拒绝变更。`PermissionButton` 统一 write / review / admin 控件，后端独立授权。
- 工作台和抽屉共享 `useCopilotSession`。切换会话时中止旧流并丢弃迟到结果，审批完成状态以持久任务记录为准。
- 模型 Markdown 在插入 DOM 前由 DOMPurify 清洗。弹窗使用 `useDialogFocus` 处理 Tab、Escape 和焦点恢复。

运行说明见 [根 README](../README.md)，验证记录与架构复评见 [优化报告](../docs/architecture-optimization.md)。
