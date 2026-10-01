#!/usr/bin/env python3
"""Production Compose operations. No secrets are printed or passed to host shells."""

import argparse
import base64
import contextlib
import datetime
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
APPS = ("gateway", "api", "worker")


class DeployError(Exception):
    pass


@contextlib.contextmanager
def deployment_lock():
    with (ROOT / ".deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeployError("另一个部署任务正在执行，请等待完成。") from None
        yield


def init_env(path):
    template = (ROOT / ".env.production.example").read_text()
    values = {
        "POSTGRES_PASSWORD": secrets.token_hex(32),
        "DB_PASSWORD": secrets.token_hex(32),
        "JWT_ACCESS_SECRET": secrets.token_hex(32),
        "JWT_REFRESH_SECRET": secrets.token_hex(32),
        "CREDENTIAL_ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
        "BOOTSTRAP_PASSWORD": secrets.token_urlsafe(24),
    }
    for key, value in values.items():
        template = template.replace("GENERATE_" + key, value)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise DeployError("配置已存在；为保护数据库和密钥，拒绝覆盖。") from None
    with os.fdopen(descriptor, "w") as target:
        target.write(template)
    print(f"已生成 {path}（权限 0600）。请编辑域名、证书邮箱和管理员邮箱；密钥不会输出。")


class Deployment:
    def __init__(self, env_file):
        self.env_file = env_file.resolve()
        if not self.env_file.is_file():
            raise DeployError("生产配置不存在，请先执行 make init。")
        if stat.S_IMODE(self.env_file.stat().st_mode) & 0o077:
            raise DeployError("生产配置可被其他用户读取，请将配置文件权限设置为 chmod 600。")
        if shutil.which("docker") is None:
            raise DeployError("需要 Docker Engine 和 Docker Compose 插件。")
        # The explicit env file is authoritative; ignore inherited overrides and local .env.
        keys = set(re.findall(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", self.env_file.read_text(), re.M))
        keys.update(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)", (ROOT / "compose.yaml").read_text()))
        self.environment = {
            key: value for key, value in os.environ.items()
            if key not in keys and not key.startswith("COMPOSE_")
        }
        self.environment["COMPOSE_DISABLE_ENV_FILE"] = "true"
        self.prefix = [
            "docker", "compose", "--project-directory", str(ROOT),
            "--env-file", str(self.env_file), "-f", str(ROOT / "compose.yaml"),
            "--profile", "tools",
        ]
        version = self.command(["docker", "compose", "version", "--short"], capture=True)
        match = re.search(r"(\d+)\.(\d+)", version)
        if not match or tuple(map(int, match.groups())) < (2, 24):
            raise DeployError("需要 Docker Compose v2.24 或更新版本。")
        self.config = json.loads(self.compose("config", "--format", "json", capture=True))

    def command(self, args, *, capture=False, output=None, allow_failure=False):
        result = subprocess.run(
            args, cwd=ROOT, env=self.environment, text=True,
            stdout=subprocess.PIPE if capture else output,
            stderr=subprocess.PIPE if capture else None,
        )
        if result.returncode and not allow_failure:
            # Captured config/inspect output may contain credentials; never echo it.
            raise DeployError("Docker 命令失败，请检查 Docker 权限、配置或容器日志。")
        return result if allow_failure else (result.stdout or "")

    def compose(self, *args, **kwargs):
        return self.command(self.prefix + list(args), **kwargs)

    def validate(self, *, bootstrap=False):
        services = self.config["services"]
        env = services["api"]["environment"]
        for key, expected in {
            "APP_ENV": "production", "APP_MODE": "live", "DB_DRIVER": "postgres",
            "AUTO_MIGRATE": "false", "SEED_DEMO": "false", "ALLOW_LOCAL_OUTBOUND": "false",
        }.items():
            if env.get(key) != expected:
                raise DeployError(f"生产配置必须设置 {key}={expected}。")
        access, refresh = env["JWT_ACCESS_SECRET"], env["JWT_REFRESH_SECRET"]
        if min(len(access.encode()), len(refresh.encode())) < 32 or access == refresh:
            raise DeployError("两个 JWT 密钥必须不同，且各自至少 32 字节。")
        try:
            key = base64.b64decode(env["CREDENTIAL_ENCRYPTION_KEY"], validate=True)
        except (ValueError, TypeError):
            key = b""
        if len(key) != 32:
            raise DeployError("凭证加密密钥必须是 32 字节随机值的 Base64 编码。")
        database = services["postgres"]["environment"]
        if len(database["POSTGRES_PASSWORD"].encode()) < 32:
            raise DeployError("PostgreSQL 管理密码至少需要 32 字节。")
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,}", database["APP_DB_PASSWORD"]):
            raise DeployError("DB_PASSWORD 至少需要 32 个 URL 安全字符（字母、数字、_、-）。")
        gateway = services["gateway"]["environment"]
        self.domain = gateway["DOMAIN"].lower()
        if (not re.fullmatch(r"(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}", self.domain)
                or self.domain == "example.com" or self.domain.endswith(".example.com")):
            raise DeployError("DOMAIN 必须改为真实公网域名，不含协议、路径或端口。")
        if not valid_email(gateway["ACME_EMAIL"]):
            raise DeployError("请设置真实 ACME_EMAIL。")
        if not 1 <= int(env["WORKER_CONCURRENCY"]) <= 32:
            raise DeployError("WORKER_CONCURRENCY 必须为 1..32。")
        try:
            for proxy in env["TRUSTED_PROXIES"].split(","):
                ipaddress.ip_network(proxy.strip(), strict=False)
        except ValueError:
            raise DeployError("TRUSTED_PROXIES 必须包含有效 IP 地址或 CIDR 网段。") from None
        if bootstrap:
            initial = services["bootstrap"]["environment"]
            if not valid_email(initial["BOOTSTRAP_EMAIL"]) or not initial["BOOTSTRAP_BRAND"].strip():
                raise DeployError("首次安装需要真实 BOOTSTRAP_EMAIL 和非空 BOOTSTRAP_BRAND。")
            if not 12 <= len(initial["BOOTSTRAP_PASSWORD"].encode()) <= 72:
                raise DeployError("BOOTSTRAP_PASSWORD 必须为 12..72 字节。")
        print("生产配置检查通过（未输出密钥）。")

    def daemon(self):
        self.command(["docker", "info", "--format", "{{.ServerVersion}}"], capture=True)

    def volume_exists(self, name):
        result = self.command(
            ["docker", "volume", "inspect", "--format", "{{.Name}}", name],
            capture=True, allow_failure=True,
        )
        return result.returncode == 0

    def database_exists(self):
        return self.volume_exists(self.config["volumes"]["postgres_data"]["name"])

    def container(self, service):
        return self.compose("ps", "--all", "--quiet", service, capture=True).strip()

    def preserve_credentials(self):
        for service, keys in {
            "api": ("DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CREDENTIAL_ENCRYPTION_KEY"),
            "worker": ("DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CREDENTIAL_ENCRYPTION_KEY"),
            "postgres": ("POSTGRES_PASSWORD", "APP_DB_PASSWORD"),
        }.items():
            container = self.container(service)
            if not container:
                continue
            existing = json.loads(self.command(
                ["docker", "inspect", "--format", "{{json .Config.Env}}", container], capture=True,
            ))
            existing = dict(item.split("=", 1) for item in existing)
            desired = self.config["services"][service]["environment"]
            if any(existing.get(key) != desired.get(key) for key in keys):
                raise DeployError("已有安装的数据库凭证或应用密钥发生变化；部署已停止，请恢复原配置。")

    def build(self):
        print("构建应用并拉取 PostgreSQL / Caddy 镜像……", flush=True)
        self.compose("build", "--pull", "api")
        self.compose("pull", "postgres", "gateway")
        self.compose("run", "--rm", "--no-deps", "-T", "--pull", "never", "gateway",
                     "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile")

    def start_database(self):
        if self.container("postgres"):
            self.compose("start", "--wait", "--wait-timeout", "120", "postgres")
        else:
            self.compose("up", "-d", "--wait", "--wait-timeout", "120", "--no-build", "postgres")

    def running_apps(self):
        running = self.compose("ps", "--status", "running", "--services", capture=True).splitlines()
        return [service for service in APPS if service in running]

    def stop_apps(self):
        print("停止 HTTPS 入口、API 和 Worker，准备一致性备份……", flush=True)
        self.compose("stop", *APPS)

    def backup_files(self):
        root = ROOT / "backups"
        root.mkdir(mode=0o700, exist_ok=True)
        root.chmod(0o700)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        partial = root / (stamp + ".partial")
        partial.mkdir(mode=0o700)
        with (partial / "database.dump").open("wb") as output:
            self.compose("exec", "-T", "postgres", "sh", "-ec",
                         'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl',
                         output=output)
        images, image_refs = {}, {}
        for service in ("api", "worker", "postgres", "gateway"):
            container = self.container(service)
            if container:
                images[service] = self.command(
                    ["docker", "inspect", "--format", "{{.Image}}", container], capture=True,
                ).strip()
                image_refs[service] = self.command(
                    ["docker", "inspect", "--format", "{{.Config.Image}}", container], capture=True,
                ).strip()
        image = images.get("api", self.config["services"]["api"]["image"])
        uploads = self.config["volumes"]["uploads"]["name"]
        if self.volume_exists(uploads):
            with (partial / "uploads.tar.gz").open("wb") as output:
                self.command([
                    "docker", "run", "--rm", "--network", "none", "--read-only", "--user", "10001:10001",
                    "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                    "--mount", f"type=volume,source={uploads},target=/uploads,readonly",
                    image, "tar", "-czf", "-", "-C", "/uploads", ".",
                ], output=output)
        else:
            # Do not create an uninitialized root-owned volume before API copy-up.
            with tarfile.open(partial / "uploads.tar.gz", "w:gz"):
                pass
        shutil.copyfile(self.env_file, partial / "production.env")
        hashes = {}
        for name in ("database.dump", "uploads.tar.gz", "production.env"):
            digest = hashlib.sha256()
            with (partial / name).open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            hashes[name] = digest.hexdigest()
        metadata = {"project": self.config["name"], "images": images, "image_refs": image_refs,
                    "sha256": hashes, "created_utc": stamp}
        (partial / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
        for path in partial.iterdir():
            path.chmod(0o600)
        complete = root / stamp
        partial.rename(complete)
        print(f"备份完成：{complete}（包含私有密钥，请安全保存）。", flush=True)
        return complete

    def backup(self):
        if not self.database_exists():
            raise DeployError("没有生产数据库卷，无法备份。")
        self.preserve_credentials()
        running = self.running_apps()
        self.stop_apps()
        try:
            self.start_database()
            self.backup_files()
        finally:
            if running:
                # Start the same stopped containers, even if APP_VERSION was edited.
                self.compose("start", *running)

    def deploy(self, *, first_install=False):
        exists = self.database_exists()
        if first_install and exists:
            raise DeployError("生产数据库卷已存在；已有安装请用 make deploy，首次安装中断请参考部署文档。")
        if not first_install and not exists:
            raise DeployError("生产数据库卷不存在；首次安装请用 make install。")
        self.preserve_credentials()
        self.build()
        stopped = False
        try:
            if not first_install:
                self.stop_apps()
                stopped = True
                self.start_database()
                self.backup_files()
            self.compose("up", "-d", "--wait", "--wait-timeout", "120", "--no-build", "postgres")
            self.compose("run", "--rm", "--no-deps", "-T", "--pull", "never", "migrate")
            if first_install:
                self.compose("run", "--rm", "--no-deps", "-T", "--pull", "never", "bootstrap")
            self.compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "180",
                         "postgres", "api", "worker", "gateway")
            self.health(wait=180)
        except BaseException:
            if stopped:
                print("部署未完成。已停止的旧容器不会自动启动；请检查日志、schema 与备份后再恢复。", file=sys.stderr)
            raise
        print(f"生产服务已就绪：https://{self.domain}")

    def health(self, *, wait=0):
        deadline = time.monotonic() + wait
        while True:
            try:
                with urllib.request.urlopen(f"https://{self.domain}/ready", timeout=10) as response:
                    data = json.load(response)
                    if response.status == 200 and isinstance(data, dict) and data.get("status") == "ready":
                        print("HTTPS /ready 检查通过。")
                        return
            except (urllib.error.URLError, TimeoutError, ValueError, OSError):
                pass
            if time.monotonic() >= deadline:
                raise DeployError("HTTPS /ready 未通过；检查域名解析、80/443 端口、证书和容器日志。")
            time.sleep(2)


def valid_email(value):
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value)) and not value.lower().endswith("@example.com")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.production")
    parser.add_argument("action", choices=("init", "config", "build", "install", "deploy", "backup", "bootstrap", "logs", "status", "health", "down"))
    args = parser.parse_args()
    if args.action == "init":
        with deployment_lock():
            init_env(args.env_file)
        return
    deployment = Deployment(args.env_file)
    if args.action not in ("logs", "status", "down"):
        deployment.validate(bootstrap=args.action in ("install", "bootstrap"))
    if args.action == "config":
        return
    if args.action == "health":
        deployment.health()
        return
    deployment.daemon()
    if args.action in ("logs", "status"):
        deployment.compose(*(("logs", "--follow", "--tail", "200") if args.action == "logs" else ("ps", "--all")))
        return
    with deployment_lock():
        if args.action == "build":
            deployment.build()
        elif args.action in ("install", "deploy"):
            deployment.deploy(first_install=args.action == "install")
        elif args.action == "backup":
            deployment.backup()
        elif args.action == "bootstrap":
            if deployment.running_apps():
                raise DeployError("请先停止业务容器，再为首次安装的空数据库创建管理员。")
            deployment.preserve_credentials()
            deployment.start_database()
            deployment.compose("run", "--rm", "--no-deps", "-T", "--pull", "never", "bootstrap")
        elif args.action == "down":
            deployment.compose("down", "--remove-orphans")


if __name__ == "__main__":
    try:
        main()
    except (DeployError, ValueError, KeyError, OSError) as error:
        # Avoid leaking arbitrary values from parsers or OS errors.
        print(str(error) if isinstance(error, DeployError) else "配置或文件操作失败，请检查文件格式和权限。", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("操作已中断；请用 make status 检查当前容器状态。", file=sys.stderr)
        sys.exit(130)
