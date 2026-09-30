# Bgeo / GeoPilot

当前实现：Go + Gin + GORM、React + TypeScript + Vite、LangGraphgo，MCP 使用官方 Go SDK。生产数据库为 PostgreSQL；SQLite 仅用于开发和单进程测试。HTTP 服务与持久任务 Worker 独立运行。

## 启动

需要 Go（版本见 go.mod）、Node.js 22.20+。复制 `.env.go.example` 为本机私有配置并导出环境变量；Go 不读取原有 Laravel `.env`。为两个 JWT 密钥分别生成随机值（至少 32 字节），为 `CREDENTIAL_ENCRYPTION_KEY` 设置 `openssl rand -base64 32` 生成的值。HTTP 与 Worker 必须使用相同密钥，保持密钥持久化。

```sh
go mod download
go run ./cmd/manage migrate
# 新安装：设置 BOOTSTRAP_EMAIL、BOOTSTRAP_PASSWORD（12..72 字节）、BOOTSTRAP_BRAND 后执行：
go run ./cmd/manage bootstrap
```

`bootstrap` 只允许空安装，不会重置已有账号。演示数据必须显式设置 `APP_MODE=demo` 后运行 `go run ./cmd/manage seed-demo`。演示账号为 `admin@bgeo.cc` / `admin123`，仅用于隔离的演示环境，禁止用于生产。`APP_MODE=live` 下缺少模型密钥或外部请求失败会明确报错，不回退为模拟成功。

分别启动：

```sh
go run ./cmd/server
go run ./cmd/worker
# 在 web 目录执行：
npm ci
npm run dev
```

前端开发代理转发 `/api`、`/ws` 到 8080；访问 5173。生产先执行 `web` 目录的 `npm run build`，HTTP 服务从 `web/dist` 提供 SPA。前端登录后获取有权限的项目列表并选择项目，业务 API 必须带 `X-Project-ID`。组织管理员可以维护项目成员；普通成员角色为 viewer / editor / reviewer。

## 真实业务路径

1. 在可信事实页面提交事实及可核验来源，由 reviewer 或管理员批准。待审核事实和对话提取的品牌声明不进入事实核验。
2. 创建目标问题并启动监测。当前真实采样连接器是 Perplexity（`PERPLEXITY_API_KEY`）；其他引擎必须实现连接器后才能接入。每个问题最多尝试 3 次，预算预留涵盖重试。副驾驶每项目滚动 24 小时默认最多 500 次模型调用，每次输出最多 2048 token，输入请求最多 128KB；`/model-calls` 保存实际调用状态与提供方报告的 token 用量。请求失败也占用调用预算，未返回用量时保持未知。
3. 查看批次、任务和原始回答。名称/别名和编号列表采用保守解析；无法识别位次时显示未知。指标使用最近已结束批次中的 live、valid、非拒答回答；失败、demo、legacy 数据不计入分母。
4. 根据证据创建策略和内容。逐句匹配已批准事实，未核验声明保留为草稿；匹配通过后进入人工审批。编辑会增加版本并撤销审批。自动核验较保守，不代表完整语义或法律审查。
5. 配置 Webhook 发布渠道，在副驾驶执行配置中启用发布能力。批准内容之后生成发布预览，再批准投递。预览绑定项目配置、内容版本及哈希、渠道版本、工具 schema，15 分钟过期；重复审批只能投递一个任务。
6. 发布只有得到真实回执才标记 published。超时、响应丢失或无效回执标记 outcome_unknown；先使用“核对真实回执”，不要直接重复对外发布。当前不支持自动撤稿。
7. 创建两个已完成批次的配对评估。比较相同问题、品牌别名、参数、解析版本、渠道及模型；至少 20 对有效真实样本、95% 置信水平、5 个百分点绝对增益才生成候选。该观察性比较不能证明因果关系，仍需审核干预、时间偏差和混杂因素。候选规则只能补充已批准事实，人工批准后才执行；回滚恢复此前被暂停的规则。

## 发布接收端协议

发送 `POST <endpoint>`，JSON 为 `title/content/format/target_slug/metadata`，请求头含 `Idempotency-Key` 和可选 `Authorization: Bearer ...`。接收端必须先按幂等键去重，保存回执，再响应：

```json
{"external_id":"article-123","published_url":"https://example.com/article-123","version_id":"v1"}
```

重复 POST 必须返回相同回执。`GET <endpoint>` 携带同一幂等键返回已保存回执，用于响应丢失后的核对。没有找到回执应返回非 200，系统保持未知状态。系统不会为未知结果自动生成 URL。凭证在数据库使用 AES-GCM 加密，API 仅返回是否已配置。

## 验证

```sh
go test -race ./... -timeout 120s
go vet ./...
go build ./cmd/server ./cmd/worker ./cmd/manage
# web 目录：
npm ci
npm run lint
npm test
npm run build
```

将 `TEST_POSTGRES_DSN` 指向**专用测试 PostgreSQL** 后运行 `go test -race ./internal/usecase ./internal/delivery/http -timeout 120s`。每个测试新建并销毁自己的 schema。测试账户需要建 schema 权限。CI 执行 SQLite、PostgreSQL 并发和前端测试。

## 生产运行与恢复

`APP_ENV=production` 强制 `APP_MODE=live`、PostgreSQL、不同的 JWT 强密钥和 32 字节加密密钥；禁止启动自动迁移与种子数据。仅允许 HTTPS 外部接口，DNS 解析后再次拒绝非公网地址，禁止跨主机重定向。配置允许的前端 Origin；反向代理日志必须去掉 WebSocket URL 中的 token 查询参数。部署 HTTPS 并关闭明文入口。

构建 HTTP / Worker / manage 三个二进制，使用同一版本、数据库和密钥。进程管理器分别运行 HTTP、Worker，发送 SIGTERM 可优雅停止；停止 Worker 后未结束任务由租约恢复。监测任务为至少一次执行、快照按批次/问题/渠道去重，外部采样可能因响应丢失重复收费。审批任务最多执行一次；崩溃后的外部副作用必须核对回执或目标系统，不能假定没有执行。

`/health` 为存活检查，`/ready` 验证数据库与 schema。监控结构化请求日志、任务状态/重试/错误、队列等待时间与租约过期；业务接口 `/jobs`、`/monitor/runs`、`/evolution/runs`、`/publications` 提供持久状态。建议告警：可领取任务等待超过 2 分钟、监测批次持续失败、未知发布回执出现、Worker 日志中租约或数据库错误。多 HTTP 实例下内存登录限流需由网关统一补充；跨进程推送以数据库轮询恢复为准。

取消运行中的任务是尽力停止后续步骤，不能撤销已经发出的外部请求；发布是否成功仍以持久回执为准。成功投递和核对未知回执时，回执与 48 小时复测任务在同一事务中保存。

上线前先备份 PostgreSQL 和 `data/uploads`，加密密钥必须独立安全备份。只在发布步骤运行 `manage migrate`，HTTP/Worker 启动只验证 schema。当前为首个版本化基线迁移，不提供自动向下迁移；代码回退必须匹配数据库版本，必要时使用备份恢复。旧的未标记回答不会被当成真实采样，旧的明文凭证先在停服并备份后显式运行 `go run ./cmd/manage encrypt-credentials` 加密，旧的全局模型配置需要按项目重新配置，旧的无实验依据规则需重新审核。不要把旧 SQLite 文件直接当生产数据库。

恢复演练：把备份恢复到新数据库，使用备份密钥启动匹配版本，验证登录/权限、事实及内容、一个受控采样批次和测试渠道的幂等回执；确认任务租约回收与未知回执处理；记录恢复时间和丢失窗口。压测、真实渠道联调和恢复演练必须在实际部署环境验收。本次代码改造不代表已经完成这些环境验收或达到任何认证级别。
