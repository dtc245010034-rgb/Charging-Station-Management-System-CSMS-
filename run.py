#!/usr/bin/env python3
"""Chạy CSMS bằng Docker — một lệnh, máy chưa build gì cũng chạy được.

    python run.py            build (nếu cần) + chạy + tạo tài khoản admin + dữ liệu demo + mở trình duyệt
    python run.py down       dừng (GIỮ dữ liệu)
    python run.py reset      dừng và XOÁ dữ liệu (hỏi xác nhận)
    python run.py logs       xem log (Ctrl+C để thoát, app vẫn chạy)
    python run.py status     trạng thái, địa chỉ, tài khoản
    python run.py test       lint + toàn bộ test (unit, integration, acceptance) trong Docker — giống: python test.py

Windows: dùng `python run.py` hoặc `py run.py`. Linux/macOS: `python3 run.py`.
Chỉ dùng thư viện chuẩn của Python (>= 3.8), không cần cài thêm gì.

An toàn: tài khoản admin/admin và mật khẩu demo chỉ dành cho MÁY CÁ NHÂN. Chúng chỉ được tạo khi cổng chỉ mở cho
127.0.0.1 (BIND_HOST); nếu bạn mở cho cả mạng, script tự sinh mật khẩu ngẫu nhiên thay vì dùng `admin`.
"""
import argparse
import http.client
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import webbrowser
from urllib.parse import urlsplit
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"
LOG_DIR = ROOT / ".run"

DEFAULT_APP_PORT = 3000
DEFAULT_DB_PORT = 5432
TEST_DB_PORT = 5433  # db_test luôn dùng cổng này, không cho db chính chiếm
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")

# Chỉ để dùng trên máy cá nhân (xem docstring). Cố ý đặt ở đây, ngoài backend/.
LOCAL_ADMIN_EMAIL = "admin@csms.local"
LOCAL_ADMIN_PASSWORD = "admin"
DEMO_PASSWORD = "demo12345"
DEMO_ACCOUNTS = ["owner", "owner2", "operator", "accountant", "driver", "multi"]
DEMO_DOMAIN = "demo.csms.local"


# ---------------------------------------------------------------- tiện ích in ấn
def _setup_console():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def say(message=""):
    print(message, flush=True)


def step(message):
    say(f"\n==> {message}")


def ok(message):
    say(f"  [OK] {message}")


def warn(message):
    say(f"  [!]  {message}")


class Fail(Exception):
    """Lỗi có thông báo thân thiện; in ra và thoát với mã 1."""


# ---------------------------------------------------------------- chạy lệnh
def run(cmd, check=True, capture=False, env=None, cwd=None, input_text=None):
    """Chạy lệnh (không qua shell nên giống nhau trên Windows/Linux)."""
    try:
        result = subprocess.run(
            cmd, cwd=str(cwd or ROOT), env=env, check=False, text=True, encoding="utf-8", errors="replace",
            stdout=subprocess.PIPE if capture else None, stderr=subprocess.STDOUT if capture else None,
            input=input_text,
        )
    except FileNotFoundError:
        raise Fail(f"Không tìm thấy lệnh '{cmd[0]}'. Hãy cài đặt rồi thử lại.")
    if check and result.returncode != 0:
        raise Fail(f"Lệnh thất bại (mã {result.returncode}): {' '.join(cmd)}")
    return result


class Docker:
    """Bọc lệnh docker / docker compose (v2) hoặc docker-compose (v1)."""

    def __init__(self):
        self.compose = None

    def ensure_ready(self):
        if run(["docker", "--version"], check=False, capture=True).returncode != 0:
            raise Fail(
                "Chưa cài Docker.\n"
                "  Windows/macOS: cài Docker Desktop (https://www.docker.com/products/docker-desktop) rồi mở nó lên.\n"
                "  Linux: cài Docker Engine + plugin compose (https://docs.docker.com/engine/install/)."
            )
        info = run(["docker", "info"], check=False, capture=True)
        if info.returncode != 0:
            text = (info.stdout or "").lower()
            if "permission denied" in text:
                raise Fail(
                    "Docker chạy nhưng tài khoản của bạn chưa có quyền dùng.\n"
                    "  Linux: sudo usermod -aG docker $USER  rồi đăng xuất/đăng nhập lại (hoặc chạy bằng sudo)."
                )
            raise Fail(
                "Docker đã cài nhưng chưa chạy.\n"
                "  Windows/macOS: mở Docker Desktop và đợi biểu tượng báo 'running'.\n"
                "  Linux: sudo systemctl start docker"
            )
        if run(["docker", "compose", "version"], check=False, capture=True).returncode == 0:
            self.compose = ["docker", "compose"]
        elif run(["docker-compose", "version"], check=False, capture=True).returncode == 0:
            self.compose = ["docker-compose"]
        else:
            raise Fail("Không tìm thấy 'docker compose' (v2) hoặc 'docker-compose' (v1). Hãy cập nhật Docker.")

    def c(self, *args, **kwargs):
        kwargs.setdefault("env", compose_env())
        return run([*self.compose, *args], **kwargs)

    def running_services(self):
        result = self.c("ps", "--services", "--filter", "status=running", check=False, capture=True)
        return set((result.stdout or "").split()) if result.returncode == 0 else set()

    def volume_exists(self, suffix="postgres_data"):
        result = run(["docker", "volume", "ls", "--format", "{{.Name}}"], check=False, capture=True)
        project = re.sub(r"[^a-z0-9_-]", "", ROOT.name.lower())
        return any(name.strip() == f"{project}_{suffix}" or name.strip() == f"{project}-{suffix}"
                   for name in (result.stdout or "").splitlines())


# ---------------------------------------------------------------- .env
def parse_env(text):
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def compose_env():
    """Môi trường cho lệnh compose. docker-compose.yml bắt buộc có POSTGRES_PASSWORD/JWT_SECRET
    (cú pháp ${VAR:?}) ngay cả với down/ps/logs, nên khi .env mất ta điền giá trị tạm để các lệnh
    dọn dẹp vẫn chạy được (không thể tạo deadlock "không có .env → không reset được")."""
    env = dict(os.environ)
    saved = read_env()
    for key in ("POSTGRES_PASSWORD", "JWT_SECRET"):
        if not saved.get(key) and not env.get(key):
            env[key] = "placeholder-only-for-down-" + "x" * 32
    return env


def read_env():
    return parse_env(ENV_FILE.read_text(encoding="utf-8")) if ENV_FILE.exists() else {}


def write_env_updates(updates):
    """Ghi/cập nhật đúng các khoá cần đổi, giữ nguyên phần còn lại của .env."""
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    seen = set()
    for index, line in enumerate(lines):
        key = line.partition("=")[0].strip()
        if key in updates and not line.lstrip().startswith("#"):
            lines[index] = f"{key}={updates[key]}"
            seen.add(key)
    for key, value in updates.items():
        if key not in seen:
            lines.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        os.chmod(ENV_FILE, 0o600)
    except OSError:
        pass  # Windows không hỗ trợ chmod kiểu này


def new_secrets():
    return {"POSTGRES_PASSWORD": secrets.token_hex(16), "JWT_SECRET": secrets.token_hex(32)}


# ---------------------------------------------------------------- cổng
def port_busy(port, host="127.0.0.1"):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.3)
        if probe.connect_ex((host, port)) == 0:
            return True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if os.name != "nt":
            # Không có cờ này, kết nối TIME_WAIT (~60 giây sau khi app tắt) làm cổng cũ bị coi là bận và cổng nhảy +1 mỗi lần chạy lại.
            # Windows thì không dùng: ở đó SO_REUSEADDR cho bind chồng lên cổng đang có người nghe.
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("0.0.0.0", port))
        except OSError:
            return True
    return False


def pick_port(preferred, avoid=(), limit=50, is_busy=port_busy):
    for port in range(preferred, preferred + limit):
        if port in avoid:
            continue
        if not is_busy(port):
            return port
    raise Fail(f"Không tìm được cổng trống từ {preferred} đến {preferred + limit - 1}. Hãy tắt bớt chương trình đang chạy.")


def is_local_only(bind_host):
    return bind_host in LOCAL_HOSTS


# ---------------------------------------------------------------- health
def wait_healthy(port, timeout=120, interval=2):
    deadline = time.time() + timeout
    last = "chưa kết nối được"
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            conn.request("GET", "/api/health")
            response = conn.getresponse()
            body = response.read().decode("utf-8", "replace")
            conn.close()
            if response.status == 200 and '"ok":true' in body.replace(" ", ""):
                return True
            last = f"HTTP {response.status}"
        except (OSError, http.client.HTTPException) as error:
            last = str(error)
        time.sleep(interval)
    warn(f"Hết {timeout} giây mà app chưa sẵn sàng ({last}).")
    return False


# ---------------------------------------------------------------- chế độ công khai (ngrok…)
def normalize_public_url(value):
    """Chỉ nhận địa chỉ gốc https (vd https://ten.ngrok-free.app); trả về 'https://host[:port]'."""
    parsed = urlsplit((value or "").strip())
    if parsed.scheme != "https":
        raise Fail("--public-url phải bắt đầu bằng https:// (cookie đăng nhập chỉ an toàn qua HTTPS). Ví dụ: https://ten.ngrok-free.app")
    if not parsed.hostname or parsed.username or parsed.password or ":" in parsed.hostname:
        raise Fail("--public-url không hợp lệ. Ví dụ đúng: https://ten.ngrok-free.app")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise Fail("--public-url chỉ ghi địa chỉ gốc, không kèm đường dẫn hay tham số.")
    if parsed.hostname.lower() in LOCAL_HOSTS:
        raise Fail("--public-url không được là localhost. Muốn chạy máy này thì dùng: python run.py --local")
    try:
        port = parsed.port
    except ValueError:
        raise Fail("--public-url có cổng không hợp lệ.")
    return f"https://{parsed.hostname.lower()}" + (f":{port}" if port and port != 443 else "")


def find_weak_logins(post, pairs):
    """post(email, mật_khẩu) -> mã HTTP hoặc None. Trả (đăng nhập được, không kiểm tra được)."""
    weak, unknown = [], []
    for email, password in pairs:
        status = post(email, password)
        if status == 200:
            weak.append(email)
        elif status != 401:
            unknown.append(f"{email} (HTTP {status})" if status else f"{email} (không kết nối được)")
    return weak, unknown


def http_login_poster(port, origin):
    def post(email, password):
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
            body = json.dumps({"email": email, "password": password})
            conn.request("POST", "/api/auth/login", body, {"Content-Type": "application/json", "Origin": origin})
            status = conn.getresponse().status
            conn.close()
            return status
        except OSError:
            return None
    return post


def refuse_default_credentials(docker, app_port, origin):
    """Chế độ công khai: dừng nếu DB còn tài khoản mật khẩu mặc định (admin/admin, demo12345) từ các lần chạy local."""
    step("Kiểm tra tài khoản mật khẩu mặc định (bắt buộc khi công khai)")
    pairs = [(LOCAL_ADMIN_EMAIL, LOCAL_ADMIN_PASSWORD)] + [(f"{a}@{DEMO_DOMAIN}", DEMO_PASSWORD) for a in DEMO_ACCOUNTS]
    weak, unknown = find_weak_logins(http_login_poster(app_port, origin), pairs)
    if not weak and not unknown:
        ok("Không có tài khoản nào còn mật khẩu mặc định")
        return
    docker.c("stop", "app", check=False)  # không để lại app chạy với mật khẩu yếu
    if weak:
        raise Fail(
            "Database này còn tài khoản dùng mật khẩu mặc định: " + ", ".join(weak) + ".\n"
            "  Không được công khai như vậy. Đã dừng app. Tắt tunnel (ngrok) nếu đang chạy, rồi:\n"
            "    python run.py reset --yes      (xoá dữ liệu local)\n"
            "    python run.py --public-url " + origin
        )
    raise Fail(
        "Không kiểm tra được mật khẩu mặc định: " + ", ".join(unknown) + ".\n"
        "  (HTTP 429 = đang bị khoá đăng nhập tạm 15 phút; HTTP 403 = APP_ORIGIN chưa khớp; 'không kết nối được' = app chưa lên.)\n"
        "  Đã dừng app cho an toàn. Sửa nguyên nhân rồi chạy lại, hoặc: python run.py reset --yes"
    )


# ---------------------------------------------------------------- lệnh con
def wipe_stale_data(docker, args, reason):
    """Volume Postgres cũ mà không biết mật khẩu thì không dùng lại được: hỏi rồi xoá để chạy tiếp."""
    warn(reason)
    warn("Mật khẩu cũ không khôi phục được, nên phải xoá dữ liệu cũ (thường chỉ là dữ liệu demo) để tạo mới.")
    if not args.yes:
        if not sys.stdin.isatty():
            raise Fail("Không có bàn phím để xác nhận. Chạy lại: python run.py --yes   (chấp nhận xoá dữ liệu cũ)")
        if input("  Gõ 'xoa' để xoá dữ liệu cũ và tiếp tục (Enter = huỷ): ").strip().lower() != "xoa":
            raise Fail("Đã huỷ, không xoá gì. Nếu cần giữ dữ liệu: tạo .env với đúng POSTGRES_PASSWORD/JWT_SECRET cũ.")
    docker.c("--profile", "tools", "down", "-v", "--remove-orphans")
    ok("Đã xoá dữ liệu cũ")


def cmd_up(docker, args):
    step("Kiểm tra Docker")
    docker.ensure_ready()
    ok("Docker sẵn sàng (" + " ".join(docker.compose) + ")")

    env = read_env()
    stack_running = "app" in docker.running_services()

    step("Chuẩn bị cấu hình (.env)")
    updates = {}
    if not ENV_FILE.exists():
        if docker.volume_exists():
            wipe_stale_data(docker, args, "Có dữ liệu Postgres từ lần chạy trước nhưng không còn file .env (mất mật khẩu cũ).")
        updates.update(new_secrets())
        ok("Đã tạo .env mới với mật khẩu/khoá ngẫu nhiên (file này không được commit)")
    else:
        for key, value in new_secrets().items():
            if not env.get(key):
                if key == "POSTGRES_PASSWORD" and docker.volume_exists():
                    wipe_stale_data(docker, args, "Thiếu POSTGRES_PASSWORD trong .env nhưng đã có dữ liệu Postgres cũ.")
                updates[key] = value
                ok(f"Bổ sung {key} còn thiếu")
    if len(env.get("JWT_SECRET", "x" * 32)) < 32:
        raise Fail("JWT_SECRET trong .env ngắn hơn 32 ký tự. Xoá dòng đó để script tự sinh lại.")

    if args.local:
        public_url = ""
    elif args.public_url is not None:
        public_url = normalize_public_url(args.public_url)
    else:
        public_url = env.get("PUBLIC_URL", "")
    if public_url:
        ok(f"Chế độ CÔNG KHAI: {public_url} (cookie Secure, mật khẩu ngẫu nhiên, cổng chỉ mở cho máy này)")
        updates.update({"NODE_ENV": "production"})
        if env.get("TRUST_PROXY", "0") in ("", "0"):
            updates["TRUST_PROXY"] = "1"  # phía trước có tunnel: lấy IP thật để giới hạn đăng nhập theo IP
    elif env.get("PUBLIC_URL"):
        ok("Quay về chế độ máy này (--local)")
        updates.update({"NODE_ENV": "development", "TRUST_PROXY": "0"})

    bind_host = env.get("BIND_HOST", "127.0.0.1")
    if public_url and not is_local_only(bind_host):
        warn(f"Chế độ công khai: đổi BIND_HOST={bind_host} về 127.0.0.1 (tunnel chạy cùng máy; Postgres không được lộ ra mạng)")
        bind_host = "127.0.0.1"
        updates["BIND_HOST"] = bind_host
    elif "BIND_HOST" not in env:
        updates["BIND_HOST"] = bind_host

    # Cổng: giữ nguyên nếu chính stack này đang chạy; nếu không thì chọn cổng trống.
    wanted_app = args.port or int(env.get("APP_PORT", DEFAULT_APP_PORT))
    wanted_db = int(env.get("POSTGRES_PORT", DEFAULT_DB_PORT))
    if stack_running and not args.port:
        app_port, db_port = wanted_app, wanted_db
    else:
        app_port = pick_port(wanted_app)
        db_port = pick_port(wanted_db, avoid=(TEST_DB_PORT, app_port))
        if app_port != wanted_app:
            warn(f"Cổng {wanted_app} đang bận, dùng cổng {app_port}")
        if db_port != wanted_db:
            warn(f"Cổng Postgres {wanted_db} đang bận, dùng cổng {db_port}")
    local_origin = f"http://localhost:{app_port}"
    origin = public_url or local_origin
    for key, value in (("APP_PORT", str(app_port)), ("POSTGRES_PORT", str(db_port)), ("APP_ORIGIN", origin), ("PUBLIC_URL", public_url)):
        if env.get(key, "") != value:
            updates[key] = value
    if updates:
        write_env_updates(updates)
    ok(f"Địa chỉ: {origin}")

    step("Build và chạy (lần đầu có thể mất vài phút)")
    if args.rebuild:
        docker.c("build", "--no-cache", "app")
    # Chỉ bật db + app: không bật db_test (tránh xung đột cổng 5433).
    docker.c("up", "-d", "--build", "db", "app")

    step("Đợi ứng dụng sẵn sàng")
    if not wait_healthy(app_port):
        say("\n--- 40 dòng log cuối của app ---")
        docker.c("logs", "--tail", "40", "app", check=False)
        raise Fail("App không lên được. Xem log ở trên, hoặc: python run.py logs")
    ok("App đã sẵn sàng")

    if public_url:
        refuse_default_credentials(docker, app_port, origin)
    credentials = ensure_accounts(docker, args, bind_host, public=bool(public_url))
    print_summary(origin, credentials, args, app_port if public_url else None)
    if not args.no_open and not public_url:
        webbrowser.open(origin)


def ensure_accounts(docker, args, bind_host, public=False):
    """Tạo admin + dữ liệu demo (chạy lại an toàn: không tạo trùng)."""
    step("Tài khoản và dữ liệu demo")
    local = is_local_only(bind_host) and not public
    admin_password = LOCAL_ADMIN_PASSWORD if local else secrets.token_urlsafe(12)
    exec_env = ["-e", f"ADMIN_EMAIL={LOCAL_ADMIN_EMAIL}", "-e", f"ADMIN_PASSWORD={admin_password}"]
    if local:
        exec_env += ["-e", "ALLOW_WEAK_ADMIN_PASSWORD=1"]
    result = docker.c("exec", "-T", *exec_env, "app", "npm", "run", "create-admin", check=False, capture=True)
    output = result.stdout or ""
    if result.returncode != 0:
        warn("Không tạo được admin:\n" + output.strip()[-600:])
        created = "existing"
    elif "đã tồn tại" in output:
        created = "existing"
        ok("Tài khoản admin đã có sẵn (giữ nguyên mật khẩu hiện tại)")
    else:
        created = "new"
        ok(f"Đã tạo admin {LOCAL_ADMIN_EMAIL}")
    if public:
        ok("Chế độ công khai: mật khẩu admin và demo là ngẫu nhiên, không dùng 'admin'")
    elif not local:
        warn(f"BIND_HOST={bind_host} mở ra ngoài máy này: dùng mật khẩu admin ngẫu nhiên, không dùng 'admin'.")

    demo = not args.no_demo
    demo_password = DEMO_PASSWORD
    if demo and public:
        demo_password = read_env().get("DEMO_PASSWORD") or secrets.token_urlsafe(9)
        write_env_updates({"DEMO_PASSWORD": demo_password})  # giữ trong .env (chmod 600) để xem lại được
    if demo:
        seed = docker.c("exec", "-T", "-e", "ALLOW_DEMO_SEED=1", "-e", f"DEMO_PASSWORD={demo_password}", "-e", f"DEMO_EMAIL_DOMAIN={DEMO_DOMAIN}",
                        "app", "npm", "run", "seed-demo", check=False, capture=True)
        if seed.returncode == 0:
            summary = [line for line in (seed.stdout or "").splitlines() if line.startswith("Seed demo xong")]
            ok(summary[0] if summary else "Dữ liệu demo đã sẵn sàng")
        else:
            warn("Không seed được dữ liệu demo:\n" + (seed.stdout or "").strip()[-600:])
            demo = False
    return {"admin_password": admin_password, "local": local, "created": created, "demo": demo, "demo_password": demo_password}


def print_summary(origin, credentials, args, public_port=None):
    say("\n" + "=" * 62)
    say(f"  CSMS đang chạy:  {origin}")
    if public_port:
        say(f"  CÔNG KHAI: chạy tunnel trên máy này: ngrok http {public_port} --url {origin}")
        say(f"  Máy này (không qua tunnel): http://localhost:{public_port}")
    say("=" * 62)
    if credentials["created"] == "new":
        say(f"  Admin:   {LOCAL_ADMIN_EMAIL}   /   {credentials['admin_password']}")
    else:
        hint = f"mặc định '{LOCAL_ADMIN_PASSWORD}' nếu bạn chưa đổi" if credentials["local"] else "mật khẩu ngẫu nhiên đã in ở lần tạo đầu tiên, không lưu lại"
        say(f"  Admin:   {LOCAL_ADMIN_EMAIL}   ({hint}; quên thì: python run.py reset)")
    if credentials["demo"]:
        say(f"  Demo:    {', '.join(f'{a}@{DEMO_DOMAIN}' for a in DEMO_ACCOUNTS)}")
        say(f"           mật khẩu chung: {credentials['demo_password']}")
    say("-" * 62)
    say("  Dừng (giữ dữ liệu):  python run.py down")
    say("  Xem log:             python run.py logs")
    say("  Chạy toàn bộ test:   python test.py")
    say("  Sửa code xong:       python run.py down  →  sửa  →  python run.py")
    say("=" * 62)


def cmd_down(docker, args):
    docker.ensure_ready()
    step("Dừng ứng dụng (dữ liệu được giữ lại)")
    docker.c("--profile", "tools", "down", "--remove-orphans")
    ok("Đã dừng. Chạy lại bằng: python run.py")


def cmd_reset(docker, args):
    docker.ensure_ready()
    say("CẢNH BÁO: lệnh này XOÁ toàn bộ dữ liệu Postgres của dự án (tài khoản, trạm, trụ…).")
    if not args.yes:
        if not sys.stdin.isatty():
            raise Fail("Không có bàn phím để xác nhận. Thêm --yes nếu chắc chắn.")
        if input("Gõ 'xoa' để xác nhận: ").strip().lower() != "xoa":
            say("Đã huỷ, không xoá gì.")
            return
    step("Xoá container và dữ liệu")
    docker.c("--profile", "tools", "down", "-v", "--remove-orphans")
    ok("Đã xoá. Chạy lại bằng: python run.py")


def cmd_logs(docker, args):
    docker.ensure_ready()
    # docker-compose 1.x + Docker engine mới: `compose logs -f` in traceback KeyError 'id' (sự kiện không còn trường id).
    # Đọc thẳng log của container thì không bị; không tìm được container thì dùng compose như cũ.
    ids = (docker.c("ps", "-q", args.service, check=False, capture=True).stdout or "").split()
    try:
        if ids:
            run(["docker", "logs", "-f", "--tail", "100", ids[0]], check=False)
        else:
            docker.c("logs", "-f", "--tail", "100", args.service, check=False)
    except KeyboardInterrupt:
        pass


def cmd_status(docker, args):
    docker.ensure_ready()
    env = read_env()
    step("Trạng thái")
    docker.c("ps", check=False)
    port = int(env.get("APP_PORT", DEFAULT_APP_PORT))
    healthy = "app" in docker.running_services() and wait_healthy(port, timeout=4, interval=1)
    if env.get("PUBLIC_URL"):
        say(f"\n  Công khai: {env['PUBLIC_URL']}  (chế độ --public-url; quay về máy này: python run.py --local)")
    say(f"\n  Địa chỉ:  http://localhost:{port}    Sức khoẻ: {'OK' if healthy else 'KHÔNG chạy / chưa sẵn sàng'}")
    say(f"  .env:     {'có' if ENV_FILE.exists() else 'chưa có (chạy python run.py để tạo)'}")
    say(f"  Dữ liệu:  {'có volume Postgres' if docker.volume_exists() else 'chưa có'}")
    say(f"  Cổng mở:  {env.get('BIND_HOST', '127.0.0.1')}" + ("  (chỉ máy này)" if is_local_only(env.get('BIND_HOST', '127.0.0.1')) else "  (MỞ RA MẠNG)"))


def cmd_test(docker, args):
    docker.ensure_ready()
    if args.file:
        script = f"npm ci --no-audit --no-fund && node --test --test-concurrency=1 {args.file}"
        label = args.file
    elif args.only:
        pattern = f"tests/{args.only}/**/*.test.js"
        script = f'npm ci --no-audit --no-fund && node --test --test-concurrency=1 "{pattern}"'
        label = f"nhóm {args.only}"
    elif args.lint_only:
        script = "npm ci --no-audit --no-fund && npm run lint"
        label = "chỉ lint"
    else:
        script = "npm ci --no-audit --no-fund && npm run lint && npm test"
        label = "lint + toàn bộ test (unit, integration, acceptance)"

    step(f"Chạy kiểm thử: {label}")
    if not (args.file or args.only or args.lint_only):
        own = run([sys.executable, "-m", "unittest", "discover", "-s", "tools", "-q"], check=False, capture=True)
        own_summary = (own.stdout or "").strip().splitlines()[-1:] or ["?"]
        say(f"  run.py tự kiểm: {'ĐẠT' if own.returncode == 0 else 'KHÔNG ĐẠT'} ({own_summary[0]})")
        if own.returncode != 0:
            say((own.stdout or "").strip()[-800:])
            return 1
    say("  Lần đầu sẽ tải Node 22 và cài thư viện (vài phút); các lần sau nhanh hơn.")
    LOG_DIR.mkdir(exist_ok=True)
    log_path = LOG_DIR / "test-output.log"
    started = time.time()
    command = [*docker.compose, "--profile", "tools", "run", "--rm", "tests", "sh", "-c", script]
    passed = failed = None
    problems = []
    with open(log_path, "w", encoding="utf-8") as log:
        try:
            process = subprocess.Popen(command, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                       text=True, encoding="utf-8", errors="replace")
        except FileNotFoundError:
            raise Fail("Không chạy được docker compose.")
        for line in process.stdout:
            log.write(line)
            stripped = line.strip()
            if args.verbose:
                say(line.rstrip())
            match = re.match(r"^# (tests|pass|fail|cancelled) (\d+)", stripped)
            if match:
                if match.group(1) == "pass":
                    passed = int(match.group(2))
                elif match.group(1) == "fail":
                    failed = int(match.group(2))
            if re.match(r"^\s*not ok ", line) or re.match(r"^\d+:\d+\s+error", stripped) or stripped.startswith("npm error"):
                problems.append(stripped)
            if not args.verbose and stripped.startswith(("> csms", "npm error", "added ")):
                say("  " + stripped)
        code = process.wait()
    docker.c("stop", "db_test", check=False, capture=True)
    seconds = time.time() - started
    say("")
    if problems:
        say("Các ca lỗi:")
        for item in problems[:30]:
            say("  - " + item)
    if code == 0:
        detail = f" ({passed} test pass, {failed or 0} fail)" if passed is not None else ""
        say(f"KẾT QUẢ: ĐẠT{detail} — {seconds:.0f} giây")
    else:
        detail = f" ({passed or 0} pass, {failed} fail)" if failed is not None else ""
        say(f"KẾT QUẢ: KHÔNG ĐẠT{detail} — xem chi tiết: {log_path}   hoặc chạy lại với --verbose")
    return code


# ---------------------------------------------------------------- điểm vào
def build_parser():
    parser = argparse.ArgumentParser(prog="run.py", description="Chạy CSMS bằng Docker (build + chạy + admin + demo).")
    sub = parser.add_subparsers(dest="command")

    up = sub.add_parser("up", help="build + chạy (mặc định khi không ghi lệnh)")
    up.add_argument("--port", type=int, help="cổng web mong muốn (mặc định 3000; bận thì tự chọn cổng khác)")
    up.add_argument("--no-open", action="store_true", help="không tự mở trình duyệt")
    up.add_argument("--no-demo", action="store_true", help="không tạo dữ liệu demo")
    up.add_argument("--yes", action="store_true", help="đồng ý xoá dữ liệu cũ nếu mất .env (không hỏi)")
    mode = up.add_mutually_exclusive_group()
    mode.add_argument("--public-url", help="staging công khai qua tunnel, ví dụ https://ten.ngrok-free.app (giữ APP_ORIGIN, mật khẩu ngẫu nhiên, NODE_ENV=production)")
    mode.add_argument("--local", action="store_true", help="quay về chế độ chạy trên máy này (bỏ --public-url đã lưu)")
    up.add_argument("--rebuild", action="store_true", help="build lại từ đầu, bỏ cache")

    sub.add_parser("down", help="dừng, giữ dữ liệu")
    reset = sub.add_parser("reset", help="dừng và XOÁ dữ liệu")
    reset.add_argument("--yes", action="store_true", help="không hỏi xác nhận")
    logs = sub.add_parser("logs", help="xem log")
    logs.add_argument("service", nargs="?", default="app", choices=["app", "db"])
    sub.add_parser("status", help="trạng thái và địa chỉ")

    test = sub.add_parser("test", help="lint + toàn bộ test trong Docker")
    group = test.add_mutually_exclusive_group()
    group.add_argument("--only", choices=["unit", "integration", "acceptance"], help="chỉ chạy một nhóm test")
    group.add_argument("--file", help="chạy riêng một file test, ví dụ tests/acceptance/S-04.station-management.test.js")
    group.add_argument("--lint-only", action="store_true", help="chỉ chạy lint")
    test.add_argument("--verbose", "-v", action="store_true", help="in toàn bộ output")
    return parser


def main(argv=None):
    _setup_console()
    argv = list(argv or [])
    if not argv or (argv[0].startswith("-") and argv[0] not in ("-h", "--help")):
        argv = ["up", *argv]  # không ghi lệnh con = up (kể cả khi chỉ có --port…)
    args = build_parser().parse_args(argv)
    command = args.command
    docker = Docker()
    handlers = {"up": cmd_up, "down": cmd_down, "reset": cmd_reset, "logs": cmd_logs, "status": cmd_status, "test": cmd_test}
    try:
        result = handlers[command](docker, args)
        return result or 0
    except Fail as error:
        say(f"\n[LỖI] {error}")
        return 1
    except KeyboardInterrupt:
        say("\nĐã dừng theo yêu cầu.")
        return 130


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
