.DEFAULT_GOAL := help
PYTHON ?= python3
ENV_FILE ?= .env.production
DEPLOY = $(PYTHON) scripts/deploy.py --env-file "$(ENV_FILE)"

.PHONY: help init config build install deploy up backup bootstrap logs status health down dev check

help:
	@printf '%s\n' \
	  'make init       生成生产配置和随机密钥（不会覆盖已有配置）' \
	  'make config     检查生产配置，不输出密钥' \
	  'make install    首次安装：构建、迁移、创建管理员、启动 HTTPS' \
	  'make deploy     更新：构建、停服、备份、迁移、启动并检查 HTTPS' \
	  'make up         同 make deploy' \
	  'make build      仅构建应用、拉取基础服务镜像并验证 Caddy' \
	  'make backup     停服备份数据库、上传文件和私有配置，随后恢复原容器' \
	  'make bootstrap  仅为已有空数据库创建管理员（修复首次安装中断）' \
	  'make logs       查看服务日志；Ctrl+C 退出' \
	  'make status     查看容器状态' \
	  'make health     检查公网 HTTPS /ready' \
	  'make down       停止并移除容器，保留所有持久卷' \
	  'make check      检查部署安全流程（无需 Docker daemon）' \
	  'make dev        启动本机开发环境' \
	  '自定义配置文件：make <target> ENV_FILE=/path/to/private.env'

init config build install deploy backup bootstrap logs status health down:
	@$(DEPLOY) $@

up: deploy

dev:
	@$(PYTHON) scripts/start-local.py

check:
	@$(PYTHON) -m unittest discover -s scripts -p test_deploy.py
