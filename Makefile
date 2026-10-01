.DEFAULT_GOAL := help

# ==============================================================================
# 环境与全局参数定义
# ==============================================================================
PYTHON ?= python3

# 生产环境配置（基于 compose.yaml 与 scripts/deploy.py，支持自动 HTTPS 与 Caddy）
ENV_FILE ?= .env.production
DEPLOY = $(PYTHON) scripts/deploy.py --env-file "$(ENV_FILE)"

# 本地基础设施容器（PostgreSQL、Redis、MinIO 对象存储）
INFRA_COMPOSE = docker compose -f compose.infra.yaml
LOCAL_COMPOSE = docker compose -f compose.local.yaml

# 本地服务端口定义（可按需通过命令行环境变量覆盖）
LOCAL_HTTP_PORT ?= 8080
LOCAL_DB_PORT ?= 127.0.0.1:54320
LOCAL_REDIS_PORT ?= 127.0.0.1:6379
LOCAL_MINIO_PORT ?= 127.0.0.1:9000
LOCAL_MINIO_CONSOLE_PORT ?= 127.0.0.1:9001

.PHONY: help \
        dev dev-check dev-stop dev-server dev-worker dev-web dev-migrate dev-bootstrap dev-seed dev-infra \
        infra-up infra-down infra-logs infra-status infra-ps infra-clean \
        local-up local-down local-logs local-status local-ps local-bootstrap local-build local-clean local dev-compose \
        prod-init prod-config prod-install prod-deploy prod-up prod-build prod-backup prod-bootstrap prod-logs prod-status prod-health prod-down \
        init config install deploy up build backup bootstrap logs status health down \
        check

# ==============================================================================
# 帮助信息 (make help)
# ==============================================================================
help:
	@printf '%s\n' \
	  '===================================================================================' \
	  '                       GeoPilot 自动化运维与开发管理工具 (Makefile)                  ' \
	  '===================================================================================' \
	  '' \
	  '[1] 本地开发环境：基础设施容器 + 应用源码实时调试 (Local Dev: Infra Docker + Source)' \
	  '-----------------------------------------------------------------------------------' \
	  '  make dev              ★【推荐】一键全栈源码开发调试（自动起基础容器 + 编译运行 API/Worker/Vite）' \
	  '                        基础设施跑在 Docker (PG + Redis + MinIO)，应用源码实时热更新调试' \
	  '  make dev-server       仅以源码运行 Go API 后端服务 (cmd/server，实时输出控制台日志)' \
	  '  make dev-worker       仅以源码运行 Go 异步任务 Worker (cmd/worker，实时输出控制台日志)' \
	  '  make dev-web          仅以源码启动前端 Vite 开发服务器 (:5173，支持 HMR 热更新)' \
	  '  make dev-migrate      以源码方式执行数据库结构迁移 (go run ./cmd/manage migrate)' \
	  '  make dev-bootstrap    以源码方式初始化管理员账号 (admin@bgeo.local / admin12345678)' \
	  '  make dev-stop         停止本地可能残留的后台源码开发进程' \
	  '  make dev-check        检查本地开发环境的前置依赖、端口连通性与配置' \
	  '' \
	  '[2] 本地基础设施容器管理 (PostgreSQL 17, Redis 7, MinIO 对象存储)' \
	  '-----------------------------------------------------------------------------------' \
	  '  make infra-up         一键启动基础设施 Docker 容器 (Postgres:54320, Redis:6379, MinIO:9000/9001)' \
	  '                        (别名: make dev-infra)' \
	  '  make infra-down       停止本地基础设施 Docker 容器' \
	  '  make infra-logs       实时跟踪基础设施容器运行日志 (Ctrl+C 退出)' \
	  '  make infra-status     查看基础设施容器运行状态与端口映射 (别名: make infra-ps)' \
	  '  make infra-clean      停止并彻底清理基础设施数据卷 (重置 PostgreSQL、Redis 与 MinIO 数据)' \
	  '' \
	  '[3] 本地全容器化环境 (Full Containerized Local Stack - 可选备用)' \
	  '-----------------------------------------------------------------------------------' \
	  '  make local-up         全栈容器化启动（包含基础服务 + 容器化 API + Worker，访问 :8080）' \
	  '  make local-down       停止并移除本地全栈 Docker 容器' \
	  '  make local-logs       查看全栈本地容器运行日志' \
	  '  make local-clean      清理全栈本地容器与数据卷' \
	  '' \
	  '[4] 生产部署环境 (Production Deployment via Compose & Caddy HTTPS)' \
	  '-----------------------------------------------------------------------------------' \
	  '  make prod-deploy      ★【推荐】生产一键平滑部署/更新 (别名: make deploy / make up)' \
	  '                        流程: 构建镜像 -> 优雅停服 -> 一致性安全备份 -> 数据库迁移' \
	  '                        -> 启动新容器 -> 自动验证公网 HTTPS /ready 探针' \
	  '  make prod-install     生产首次全新安装 (别名: make install)' \
	  '                        构建应用 -> 启动数据库 -> 运行初始迁移 -> 初始化管理账号 -> 启动 Caddy' \
	  '  make prod-init        生成生产环境私有配置文件 .env.production 与随机强密钥 (别名: make init)' \
	  '  make prod-config      离线验证生产配置规范 (域名、ACME 邮箱、密钥长度等，不泄露密钥)' \
	  '  make prod-backup      生产停服一致性备份 (备份 PostgreSQL、上传文件和配置，结束后自动恢复服务)' \
	  '  make prod-bootstrap   首次安装异常中断后，为已迁移的空数据库补充创建管理员账号' \
	  '  make prod-logs        跟踪生产服务实时日志 (最近 200 行，Ctrl+C 退出)' \
	  '  make prod-status      查看生产容器的健康状态与运行指标 (别名: make status)' \
	  '  make prod-health      发起公网 HTTPS /ready 健康检查验证' \
	  '  make prod-down        安全停止并移除生产容器与网络 (保留所有持久数据卷、上传文件与证书)' \
	  '  make prod-build       仅构建生产容器镜像并拉取基础依赖，不启动服务 (别名: make build)' \
	  '' \
	  '[5] 质量与流程检验' \
	  '-----------------------------------------------------------------------------------' \
	  '  make check            运行部署流程与安全规则单元测试 (无需 Docker daemon)' \
	  '==================================================================================='

# ==============================================================================
# [1] 本地基础设施容器 (PostgreSQL 17, Redis 7, MinIO S3)
# ==============================================================================
infra-up:
	@echo "==> 启动本地基础设施 Docker 容器 (PostgreSQL 17, Redis 7, MinIO 对象存储)..."
	@$(INFRA_COMPOSE) up -d
	@echo "==> 基础设施容器已启动并就绪："
	@echo "    - PostgreSQL:  127.0.0.1:54320 (bgeo/bgeodevpass)"
	@echo "    - Redis:       127.0.0.1:6379"
	@echo "    - MinIO API:   http://127.0.0.1:9000 (minioadmin/minioadmin)"
	@echo "    - MinIO UI:    http://127.0.0.1:9001 (Web 控制台)"

dev-infra: infra-up

infra-down:
	@echo "==> 停止本地基础设施 Docker 容器..."
	@$(INFRA_COMPOSE) down

infra-logs:
	@$(INFRA_COMPOSE) logs -f --tail=200

infra-status:
	@$(INFRA_COMPOSE) ps

infra-ps: infra-status

infra-clean:
	@echo "==> 停止基础设施并彻底清空数据卷 (PostgreSQL, Redis, MinIO)..."
	@$(INFRA_COMPOSE) down -v

# ==============================================================================
# [2] 本地源码开发与调试 (Source Code Hot Development)
# ==============================================================================
dev: infra-up
	@echo "==> 启动本地应用服务（源码开发调试模式）..."
	@$(PYTHON) scripts/start-local.py

dev-check:
	@$(PYTHON) scripts/start-local.py --check

dev-stop:
	@echo "==> 停止可能残留的本地源码进程..."
	@-pkill -f "scripts/start-local.py" 2>/dev/null || true
	@-pkill -f "data/local-run/bin/server" 2>/dev/null || true
	@-pkill -f "data/local-run/bin/worker" 2>/dev/null || true
	@echo "==> 本地源码进程已清理。"

dev-server:
	@echo "==> 源码运行 Go API Server (直接输出至当前终端)..."
	@set -a; [ -f .env.go ] && . ./.env.go; set +a; go run ./cmd/server

dev-worker:
	@echo "==> 源码运行 Go 任务 Worker (直接输出至当前终端)..."
	@set -a; [ -f .env.go ] && . ./.env.go; set +a; go run ./cmd/worker

dev-web:
	@echo "==> 源码运行前端 Vite 开发服务器 (:5173)..."
	@npm --prefix web run dev

dev-migrate:
	@echo "==> 对本地数据库执行迁移 (源码运行)..."
	@set -a; [ -f .env.go ] && . ./.env.go; set +a; go run ./cmd/manage migrate

dev-bootstrap:
	@echo "==> 初始化本地管理员 (admin@bgeo.local / admin12345678)..."
	@set -a; [ -f .env.go ] && . ./.env.go; set +a; \
	BOOTSTRAP_EMAIL="admin@bgeo.local" \
	BOOTSTRAP_PASSWORD="admin12345678" \
	BOOTSTRAP_BRAND="Bgeo" \
	go run ./cmd/manage bootstrap

dev-seed:
	@echo "==> 填充演示数据 (admin@bgeo.cc / admin123)..."
	@set -a; [ -f .env.go ] && . ./.env.go; set +a; \
	APP_MODE=demo SEED_DEMO=true go run ./cmd/manage seed-demo

# ==============================================================================
# [3] 本地全容器化环境 (Full Containerized Local Stack)
# ==============================================================================
local-up:
	@echo "==> 构建并启动全栈本地 Docker Compose 服务..."
	@$(LOCAL_COMPOSE) up -d --build
	@echo "==> 正在等待本地 API 服务通过就绪检查 (/ready)..."
	@$(PYTHON) -c 'import time, urllib.request; d = time.time() + 60; ok = False;\
	while time.time() < d:\
		try:\
			with urllib.request.urlopen("http://127.0.0.1:$(LOCAL_HTTP_PORT)/ready", timeout=2) as r:\
				if r.status == 200: ok = True; break\
		except Exception: time.sleep(1);\
	exit(0 if ok else 1)' || (echo "服务启动未完成，请执行 make local-logs 查看容器日志" && exit 1)
	@echo "==> 自动检查并初始化本地管理员账号..."
	@$(LOCAL_COMPOSE) run --rm bootstrap 2>/dev/null || true
	@printf '\n============================================================\n'
	@printf '  GeoPilot 本地全栈 Docker 环境启动成功！\n'
	@printf '  Web 控制台与 API 入口: http://localhost:%s\n' '$(LOCAL_HTTP_PORT)'
	@printf '  默认初始管理员账号:   admin@bgeo.local\n'
	@printf '  默认初始管理员密码:   admin12345678\n'
	@printf '  查看实时日志:         make local-logs\n'
	@printf '  停止服务:             make local-down\n'
	@printf '============================================================\n\n'

local: local-up
dev-compose: local-up

local-down:
	@echo "==> 停止并移除全栈本地 Docker 容器网络..."
	@$(LOCAL_COMPOSE) down --remove-orphans

local-logs:
	@$(LOCAL_COMPOSE) logs -f --tail=200

local-status:
	@$(LOCAL_COMPOSE) ps -a

local-ps: local-status

local-bootstrap:
	@echo "==> 为全栈容器环境创建初始管理员 (admin@bgeo.local / admin12345678)..."
	@$(LOCAL_COMPOSE) run --rm bootstrap

local-build:
	@echo "==> 重新构建本地全栈 Docker 镜像..."
	@$(LOCAL_COMPOSE) build

local-clean:
	@echo "==> 停止本地全栈容器并彻底清理数据卷..."
	@$(LOCAL_COMPOSE) down -v --remove-orphans

# ==============================================================================
# [4] 生产部署环境 (Production Deployment)
# ==============================================================================
prod-init:
	@$(DEPLOY) init

prod-config:
	@$(DEPLOY) config

prod-install:
	@$(DEPLOY) install

prod-deploy:
	@$(DEPLOY) deploy

prod-up: prod-deploy

prod-build:
	@$(DEPLOY) build

prod-backup:
	@$(DEPLOY) backup

prod-bootstrap:
	@$(DEPLOY) bootstrap

prod-logs:
	@$(DEPLOY) logs

prod-status:
	@$(DEPLOY) status

prod-health:
	@$(DEPLOY) health

prod-down:
	@$(DEPLOY) down

# 向后兼容的原生别名（完全无缝兼容既有文档与运维脚本）
init: prod-init
config: prod-config
install: prod-install
deploy: prod-deploy
up: prod-deploy
build: prod-build
backup: prod-backup
bootstrap: prod-bootstrap
logs: prod-logs
status: prod-status
health: prod-health
down: prod-down

# ==============================================================================
# [5] 质量与流程检验
# ==============================================================================
check:
	@$(PYTHON) -m unittest discover -s scripts -p test_deploy.py
