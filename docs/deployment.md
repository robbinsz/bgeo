# Docker Compose 生产部署

这是单机生产方案：Caddy 提供 HTTPS，Go API 同时提供 React 构建产物，Worker 独立执行持久任务，PostgreSQL 17 保存业务数据。只有 Caddy 的 80/443 端口对外开放；80 仅用于证书验证和 HTTPS 跳转。数据库使用内部网络，应用数据库账号不是超级用户。API、Worker、迁移和初始化命令使用同一应用镜像、数据库和持久密钥。

## 首次部署

服务器需要 Docker Engine、Docker Compose **v2.24+**、GNU Make 和 Python **3.10+**，无需在宿主机安装 Go 或 Node。建议至少 2 核、4GB 内存及足够的数据库和备份磁盘空间；镜像构建可能需要额外内存。构建时需要访问镜像仓库、npm 和 Go 模块源。域名 A/AAAA 记录必须指向服务器；配置了 AAAA 时 IPv6 也必须可达。开放 TCP 80/443，UDP 443 可用于 HTTP/3；这两个 TCP 端口不能被其他服务占用。服务器需要出站 HTTPS 访问证书机构、模型提供方和业务发布接口。

在项目根目录执行：

```sh
make init
vi .env.production
make config
make install
```

`make init` 创建权限为 `0600` 的私有配置，为两个数据库密码、两个 JWT 密钥、凭证加密密钥及管理员密码生成独立随机值，不输出密钥，也不会覆盖已有文件。编辑 `DOMAIN`（不带协议或端口）、`ACME_EMAIL`、`BOOTSTRAP_EMAIL` 和 `BOOTSTRAP_BRAND`。管理员密码已经生成，也可替换为 12..72 字节的强密码。需要真实监测/副驾驶能力时配置相应提供方密钥。建议为 `APP_VERSION` 设置唯一发布版本，例如 `2026.10.01-1`，便于保留和识别镜像。带 `$`、`#` 等特殊字符的配置值使用 Compose dotenv 单引号语法。

配置完成后 **`make install` 一条命令**构建前后端、验证 Caddy 配置、启动数据库、显式迁移、创建管理员和品牌项目、启动 API/Worker/HTTPS，并检查公网 `https://DOMAIN/ready`。数据库初始化会创建 `bgeo` 非超级用户角色，只授予本应用数据库和 schema 的所有权。应用镜像以 UID/GID `10001` 运行，只读根文件系统，上传目录使用持久卷。前端使用同源 API，无需配置生产 Vite 代理。

Compose 的 `TRUSTED_PROXIES` 显式信任 RFC1918 容器私网中的代理，配合 API 不开放宿主端口和 Caddy 重写转发头，使登录限流按真实客户端 IP 计算。自定义 Docker 地址池不在这些网段内时需修改该配置。不要公开 API 端口，也不要将不可信容器加入项目网络。独立运行 Go 服务时默认不信任转发头；另有反向代理时应显式设置其实际 IP/CIDR。

已有数据库卷时 `make install` 会拒绝执行。`bootstrap` 也会拒绝覆盖现有账号。已有本机 `.env.go` 和 SQLite 安装不会被读取或自动导入 PostgreSQL；需要单独制定并验证数据迁移流程。

## 日常更新

获取新代码并更新 `.env.production` 的 `APP_VERSION`，然后执行：

```sh
make deploy
make status
make health
```

更新顺序：检查配置与已有容器密钥 → 构建镜像及验证 Caddy → 停止入口/API/Worker → 备份数据库、上传文件和私有配置 → 更新数据库容器 → `manage migrate` → 启动全部服务 → 等待内部健康检查及公网 HTTPS 就绪。构建失败不会停止现有业务；备份或迁移失败会终止后续部署，旧业务容器保持停止，便于人工核查数据库版本。此方案有停机窗口，不承诺零停机或高可用。

不要在更新时重新生成 JWT 或加密密钥，或直接修改数据库密码。已有容器存在时脚本会拒绝这些变化；容器已移除时无法替你比对旧值，因此必须保留原配置。PostgreSQL 初始化脚本只在空数据库卷运行，改环境变量不会修改已有角色密码。密钥轮换和 PostgreSQL 大版本升级需要另行维护流程。保持 `COMPOSE_PROJECT_NAME` 不变，它决定持久卷名称。

脚本始终使用指定生产配置，忽略同名宿主环境变量和旧 Laravel `.env`。操作加文件锁，避免同一工作目录中并发部署。自定义文件使用 `make deploy ENV_FILE=/secure/path/bgeo.env`，初始化与其他命令同样支持 `ENV_FILE`。

## 命令与运行行为

| 命令 | 用途 |
| --- | --- |
| `make config` | 验证 Compose 和生产必需配置，不连接 Docker daemon，不输出密钥 |
| `make build` | 构建应用、拉取基础服务镜像、验证 Caddy，不启动业务服务 |
| `make install` | 空安装的一键部署 |
| `make deploy` / `make up` | 已有安装的更新或恢复启动 |
| `make bootstrap` | 首次安装中断后，为已迁移的空数据库创建管理员；业务容器必须停止 |
| `make backup` | 停服一致性备份，结束后启动原来运行的容器 |
| `make logs` | 跟踪最近 200 行服务日志，Ctrl+C 退出 |
| `make status` / `make health` | 容器状态 / 公网 HTTPS 就绪检查 |
| `make down` | 停止并移除容器和网络，保留数据、上传文件及证书持久卷 |
| `make check` | 运行部署安全流程测试，无需 Docker daemon |
| `make dev` | 使用 `.env.go` 启动本机开发环境 |

`make down` 后沿用原配置执行 `make deploy` 即可恢复。首次安装在迁移前中断时，先 `make build`，使用下面的管理命令启动数据库并迁移；迁移已经完成时直接 `make bootstrap`，随后 `make deploy`。首次安装产生的数据卷保留，脚本不自动清空它。

```sh
docker compose --env-file .env.production -f compose.yaml up -d --wait postgres
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps migrate
make bootstrap
make deploy
```

正常更新只在部署步骤执行迁移，HTTP 和 Worker 不会自动迁移或写演示数据。API 健康检查使用 `/ready` 验证数据库和 schema；Worker 的进程状态不能代替队列健康监控，应结合管理员系统状态和 Worker 日志告警。SIGTERM 有优雅停止窗口，任务依靠持久租约恢复；未知的对外发布结果仍需人工核对真实回执。

Caddy 持久保存证书，自动申请和续期，支持 WebSocket 与 SSE 即时流式传输；访问日志和运行日志对 WebSocket 的 `token` / `access_token` 查询参数及请求头做过滤。Docker 日志每服务最多保留 5 个 10MB 文件。禁止把包含凭证的 `docker compose config`、`docker inspect` 全量输出粘贴到公开日志。镜像构建排除所有 `.env*`、本机数据、备份、私钥、node_modules 和旧构建产物。

Dockerfile 固定 Go 工具链版本与 `go.mod` 一致，运行时禁用 CGO，仅支持生产 PostgreSQL。Node 22、PostgreSQL 17、Caddy 2 与 Alpine 运行时按指定版本线拉取补丁更新；严格审计环境可将镜像标签替换为经过验证的 digest。不要直接改变 PostgreSQL 大版本标签并复用旧数据卷。

## 备份与恢复

`make backup` 或每次 `make deploy` 会在 `backups/<UTC时间>/` 保存：

- `database.dump`：PostgreSQL 自定义格式备份，不含角色创建及 ACL。
- `uploads.tar.gz`：上传文件。
- `production.env`：该部署使用的私有配置与密钥，权限 `0600`。
- `metadata.json`：项目名称、旧容器镜像标签/ID、备份时间和文件 SHA-256。

备份过程关闭业务写入，数据库与上传文件保持同一停服窗口。失败的目录带 `.partial` 后缀，不会标记为完成。`make backup` 在备份失败时也尝试启动原来运行的容器；`make deploy` 失败不自动恢复旧版本。备份不会自动上传到异机，也没有自动清理保留期；应按运维要求加密转存到独立位置，并定期演练。配置里含加密密钥，不能与备份一同丢失。另行保存旧发布代码和镜像；备份不包含镜像本体，恢复时按 `metadata.json` 的旧版本选择镜像，不能直接沿用备份配置中的待发布 `APP_VERSION`。

恢复应先在**隔离服务器或独立 Compose 项目**演练：使用备份对应代码和镜像版本，复制 `production.env` 为私有配置并设置 `0600`，改用新的项目名称、测试域名，启动空数据库。不要运行 `make install` 或自动执行新版本迁移。将数据库 dump 恢复进已初始化的 `bgeo` 数据库，例如：

```sh
docker compose --env-file .env.production -f compose.yaml up -d --wait postgres
docker compose --env-file .env.production -f compose.yaml exec -T postgres \
  sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_restore -U postgres -d bgeo --role=bgeo --no-owner --no-acl --exit-on-error' \
  < /secure/backup/database.dump
```

恢复上传卷时，使用对应应用镜像和 UID/GID `10001`。例如隔离项目设为 `COMPOSE_PROJECT_NAME=bgeo-restore`，对应旧版本镜像已载入并标记为 `bgeo:restore`，且配置中的 `APP_VERSION=restore`，可执行：

```sh
docker run --rm -i --network none --read-only --user 10001:10001 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --mount type=volume,source=bgeo-restore_uploads,target=/app/data/uploads \
  bgeo:restore tar -xzf - -C /app/data/uploads < /secure/backup/uploads.tar.gz
docker compose --env-file .env.production -f compose.yaml up -d --no-build --wait api worker gateway
make health
```

在启动业务前验证 SHA-256、数据库 schema 版本、配置密钥及上传文件；随后验证登录、权限、关键业务及受控外部任务。全新隔离部署可重新申请测试域名证书；当前方案不备份 Caddy 证书卷。

不提供自动向下迁移。数据库迁移已提交后不能只回退代码，应使用兼容版本或恢复完整备份；恢复到备份时间点会丢失之后的数据。恢复原生产目标、替换数据卷和清空数据库必须由运维人员确认目标后执行。

配置依据：[Docker Compose 服务配置](https://docs.docker.com/reference/compose-file/services/)、[Caddy 反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[Caddy 日志过滤](https://caddyserver.com/docs/caddyfile/directives/log)。
