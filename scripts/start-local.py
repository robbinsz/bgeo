#!/usr/bin/env python3
"""Start the local application services from source code; Ctrl+C stops the services."""
import argparse
import os
from pathlib import Path
import shlex
import signal
import socket
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 3


def configuration():
    env = os.environ.copy()
    path = ROOT / ".env.go"
    if not path.is_file():
        raise RuntimeError("缺少 .env.go，请先按 README 配置本机环境。")
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.removeprefix("export ").partition("=")
        if not separator:
            raise RuntimeError(".env.go 中存在无效配置行。")
        value = value.strip()
        if value.startswith(("'", '"')):
            parts = shlex.split(value, comments=True)
            if len(parts) != 1:
                raise RuntimeError(".env.go 中存在无效引用值。")
            value = parts[0]
        else:
            value = value.partition(" #")[0].strip()
        env[key.strip()] = value
    if env.get("APP_ENV", "development") != "development":
        raise RuntimeError("本脚本仅启动本机 development 环境。")
    driver = env.get("DB_DRIVER", "postgres")
    if driver not in ("postgres", "sqlite"):
        raise RuntimeError(f"不支持的 DB_DRIVER: {driver}，支持 postgres 或 sqlite。")
    env["AUTO_MIGRATE"] = "false"
    env["SEED_DEMO"] = "false"
    for key in ("JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CREDENTIAL_ENCRYPTION_KEY"):
        if not env.get(key) or env[key] == "CHANGE_ME":
            raise RuntimeError(f"请先配置 {key}，本脚本不会替换现有密钥。")
    return env


def available_port(port):
    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", port))
        except PermissionError:
            raise RuntimeError("当前执行环境禁止监听本地端口；请在本机终端运行此脚本。") from None
        except OSError:
            raise RuntimeError(f"端口 {port} 已占用，请先停止使用该端口的服务。") from None


def check_postgres_reachable(url):
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 54320
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(2)
        try:
            s.connect((host, port))
        except (OSError, socket.timeout):
            raise RuntimeError(
                f"无法连接 PostgreSQL ({host}:{port})。\n"
                f"请先执行 `make infra-up` 启动 PostgreSQL、Redis 和 MinIO 容器基础设施。"
            ) from None
    return host, port


def wait_http(url, process):
    for _ in range(60):
        if process.poll() is not None:
            break
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.5)
    raise RuntimeError("服务未通过启动检查，请查看 data/local-run 对应日志。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只检查配置、数据库与端口")
    args = parser.parse_args()
    processes, logs = [], []
    try:
        env = configuration()
        driver = env.get("DB_DRIVER", "postgres")
        backend_port = int(env.get("HTTP_ADDR", ":8080").rsplit(":", 1)[-1])
        if not 1 <= backend_port <= 65535 or backend_port == 5173:
            raise RuntimeError("HTTP_ADDR 端口必须有效且不能与前端 5173 重复。")

        version_info = ""
        if driver == "postgres":
            db_url = env.get("DATABASE_URL")
            if not db_url:
                raise RuntimeError("使用 PostgreSQL 驱动时必须配置 DATABASE_URL。")
            pg_host, pg_port = check_postgres_reachable(db_url)
            version_info = f"PostgreSQL ({pg_host}:{pg_port})"
        else:
            database = (ROOT / env.get("SQLITE_PATH", "data/geopilot.db")).resolve()
            if not database.is_file():
                raise RuntimeError("数据库不存在，本脚本不会创建演示账号或重置数据。")
            with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as source:
                version = source.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0] or 0
            if version > SCHEMA_VERSION:
                raise RuntimeError("数据库版本比当前程序更新，请使用匹配版本。")
            version_info = f"SQLite (schema v{version})"

        print(f"本机配置：后端 {backend_port}，前端 5173，数据库 {version_info}", flush=True)
        available_port(backend_port)
        available_port(5173)

        if args.check:
            print("启动检查通过。")
            return 0

        if not (ROOT / "web/node_modules").is_dir():
            raise RuntimeError("请先在 web 目录运行 npm ci 安装前端依赖。")

        runtime = ROOT / "data/local-run"
        binaries = runtime / "bin"
        binaries.mkdir(parents=True, exist_ok=True)

        def log(name):
            path = runtime / (name + ".log")
            handle = open(path, "a")
            os.chmod(path, 0o600)
            logs.append(handle)
            return handle

        build_log = log("build")
        print("编译 Go 服务 (server, worker, manage)...", flush=True)
        subprocess.run(
            ["go", "build", "-o", str(binaries) + "/", "./cmd/server", "./cmd/worker", "./cmd/manage"],
            cwd=ROOT, env=env, stdout=build_log, stderr=build_log, check=True
        )

        migration_log = log("migration")
        if driver == "sqlite":
            if version < SCHEMA_VERSION:
                backup_dir = ROOT / "data/backups"
                backup_dir.mkdir(parents=True, exist_ok=True)
                backup = backup_dir / f"geopilot-before-v{SCHEMA_VERSION}-{time.time_ns()}.db"
                backup.touch(mode=0o600, exist_ok=False)
                with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(backup) as target:
                    source.backup(target)
                os.chmod(backup, 0o600)
                print(f"数据库备份：{backup.relative_to(ROOT)}", flush=True)
                subprocess.run([str(binaries / "manage"), "migrate"], cwd=ROOT, env=env, stdout=migration_log, stderr=migration_log, check=True)
        else:
            print("同步 PostgreSQL 数据库迁移...", flush=True)
            subprocess.run([str(binaries / "manage"), "migrate"], cwd=ROOT, env=env, stdout=migration_log, stderr=migration_log, check=True)

        def launch(command, name, cwd=ROOT):
            output = log(name)
            process = subprocess.Popen(command, cwd=cwd, env=env, stdout=output, stderr=output, start_new_session=True)
            processes.append(process)
            return process

        origin = f"http://127.0.0.1:{backend_port}"
        print("启动 Go API Server...", flush=True)
        server = launch([str(binaries / "server")], "server")
        wait_http(origin + "/ready", server)

        print("启动 Go 任务 Worker...", flush=True)
        launch([str(binaries / "worker")], "worker")

        env["VITE_API_TARGET"] = origin
        print("启动前端 Vite 开发服务器...", flush=True)
        frontend = launch(["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], "frontend", ROOT / "web")
        wait_http("http://127.0.0.1:5173", frontend)

        print(
            f"\n============================================================\n"
            f"  GeoPilot 本地应用源码启动成功！\n"
            f"  前端页面 (Vite HMR):   http://localhost:5173\n"
            f"  后端服务 (Go API):     {origin} (就绪: {origin}/ready)\n"
            f"  数据库模式:            {version_info}\n"
            f"  按 Ctrl+C 停止应用，运行日志在 data/local-run/*.log\n"
            f"============================================================\n",
            flush=True
        )

        while all(process.poll() is None for process in processes):
            time.sleep(1)
        raise RuntimeError("有服务退出，请查看 data/local-run 对应日志。")

    except KeyboardInterrupt:
        print("\n正在停止本次启动的服务...")
        return 0
    except (RuntimeError, ValueError, OSError, sqlite3.Error, subprocess.CalledProcessError) as error:
        if isinstance(error, subprocess.CalledProcessError):
            print("构建或迁移失败，请查看 data/local-run/build.log 或 migration.log。")
        else:
            print(str(error))
        return 1
    finally:
        for process in reversed(processes):
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
        for handle in logs:
            handle.close()


if __name__ == "__main__":
    raise SystemExit(main())
