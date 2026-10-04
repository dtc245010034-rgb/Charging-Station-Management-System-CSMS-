"""Kiểm thử phần logic thuần của run.py (không cần Docker). Chạy: python -m unittest discover -s tools"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import run  # noqa: E402


class EnvFile(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.original = run.ENV_FILE
        run.ENV_FILE = Path(self.dir.name) / ".env"

    def tearDown(self):
        run.ENV_FILE = self.original
        self.dir.cleanup()

    def test_parse_bo_qua_ghi_chu_va_nhay_kep(self):
        values = run.parse_env('# ghi chú\nA=1\nB="hai"\n\nC = ba \nkhong_co_dau_bang\n')
        self.assertEqual(values, {"A": "1", "B": "hai", "C": "ba"})

    def test_ghi_cap_nhat_giu_nguyen_phan_con_lai(self):
        run.ENV_FILE.write_text("# giữ nguyên\nJWT_SECRET=abc\nAPP_PORT=3000\nKHAC=x\n", encoding="utf-8")
        run.write_env_updates({"APP_PORT": "3001", "BIND_HOST": "127.0.0.1"})
        text = run.ENV_FILE.read_text(encoding="utf-8")
        self.assertIn("# giữ nguyên", text)
        self.assertIn("JWT_SECRET=abc", text)
        self.assertIn("APP_PORT=3001", text)
        self.assertNotIn("APP_PORT=3000", text)
        self.assertIn("BIND_HOST=127.0.0.1", text)
        self.assertIn("KHAC=x", text)

    def test_tao_moi_khi_chua_co_file(self):
        run.write_env_updates({"A": "1"})
        self.assertEqual(run.read_env(), {"A": "1"})

    def test_bi_mat_ngau_nhien_du_dai_va_khac_nhau(self):
        a, b = run.new_secrets(), run.new_secrets()
        self.assertGreaterEqual(len(a["JWT_SECRET"]), 32)
        self.assertGreaterEqual(len(a["POSTGRES_PASSWORD"]), 16)
        self.assertNotEqual(a, b)
        self.assertNotIn("#", a["POSTGRES_PASSWORD"])  # ký tự # từng làm hỏng .env


class MatEnv(unittest.TestCase):
    """Ca 'máy đã có volume Postgres nhưng mất .env' (lỗi deadlock reset/down)."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.original = run.ENV_FILE
        run.ENV_FILE = Path(self.dir.name) / ".env"

    def tearDown(self):
        run.ENV_FILE = self.original
        self.dir.cleanup()

    def test_compose_env_dien_gia_tri_tam_khi_mat_env(self):
        import os
        saved = {k: os.environ.pop(k, None) for k in ("POSTGRES_PASSWORD", "JWT_SECRET")}
        try:
            env = run.compose_env()
            self.assertTrue(env["POSTGRES_PASSWORD"])
            self.assertGreaterEqual(len(env["JWT_SECRET"]), 32)
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v

    def test_compose_env_khong_de_len_gia_tri_that_trong_env(self):
        run.ENV_FILE.write_text("POSTGRES_PASSWORD=that\nJWT_SECRET=" + "j" * 40 + "\n", encoding="utf-8")
        import os
        for k in ("POSTGRES_PASSWORD", "JWT_SECRET"):
            os.environ.pop(k, None)
        # .env đã có giá trị thật: không được chèn giá trị tạm (compose tự đọc .env)
        self.assertIsNone(run.compose_env().get("POSTGRES_PASSWORD"))

    def test_khong_ban_phim_va_khong_yes_thi_bao_loi_ro_rang(self):
        class Args: yes = False
        class D:
            def c(self, *a, **k): raise AssertionError("không được xoá khi chưa xác nhận")
        with self.assertRaises(run.Fail):
            run.wipe_stale_data(D(), Args(), "lý do")

    def test_yes_thi_xoa_va_tiep_tuc(self):
        calls = []
        class Args: yes = True
        class D:
            def c(self, *a, **k): calls.append(a)
        run.wipe_stale_data(D(), Args(), "lý do")
        self.assertIn("-v", calls[0])


class PublicMode(unittest.TestCase):
    def test_url_hop_le_duoc_chuan_hoa(self):
        self.assertEqual(run.normalize_public_url("https://Ten.NGROK-free.app/"), "https://ten.ngrok-free.app")
        self.assertEqual(run.normalize_public_url("https://x.example.com:8443"), "https://x.example.com:8443")
        self.assertEqual(run.normalize_public_url("https://x.example.com:443"), "https://x.example.com")

    def test_url_khong_an_toan_bi_tu_choi(self):
        for bad in ("http://x.ngrok-free.app", "https://localhost", "https://127.0.0.1", "https://x.com/duong-dan",
                    "https://x.com?a=1", "https://user:pw@x.com", "", "ten.ngrok-free.app", "https://x.com:abc"):
            with self.assertRaises(run.Fail, msg=bad):
                run.normalize_public_url(bad)

    def test_phat_hien_tai_khoan_mat_khau_mac_dinh(self):
        def post(email, password):
            return 200 if (email, password) == ("admin@csms.local", "admin") else 401
        weak, unknown = run.find_weak_logins(post, [("admin@csms.local", "admin"), ("owner@demo.csms.local", "demo12345")])
        self.assertEqual(weak, ["admin@csms.local"])
        self.assertEqual(unknown, [])

    def test_khong_kiem_tra_duoc_thi_khong_coi_la_an_toan(self):
        codes = iter([429, None, 403])
        weak, unknown = run.find_weak_logins(lambda e, p: next(codes), [("a@x", "1"), ("b@x", "1"), ("c@x", "1")])
        self.assertEqual(weak, [])
        self.assertEqual(len(unknown), 3)

    def test_che_do_cong_khai_khong_bao_gio_dung_mat_khau_yeu(self):
        class Args: no_demo = True
        calls = []
        class D:
            def c(self, *a, **k):
                calls.append(a)
                class R: returncode = 0; stdout = ""
                return R()
        creds = run.ensure_accounts(D(), Args(), "127.0.0.1", public=True)
        self.assertNotEqual(creds["admin_password"], run.LOCAL_ADMIN_PASSWORD)
        self.assertFalse(creds["local"])
        self.assertFalse(any("ALLOW_WEAK_ADMIN_PASSWORD=1" in part for call in calls for part in call))


class Ports(unittest.TestCase):
    def test_chon_cong_ke_tiep_khi_ban(self):
        self.assertEqual(run.pick_port(3000, is_busy=lambda p: p in (3000, 3001)), 3002)

    def test_tranh_cong_cua_db_test(self):
        self.assertEqual(run.pick_port(5432, avoid=(5433,), is_busy=lambda p: p == 5432), 5434)

    def test_het_cong_thi_bao_loi(self):
        with self.assertRaises(run.Fail):
            run.pick_port(3000, limit=3, is_busy=lambda p: True)


class Safety(unittest.TestCase):
    def test_chi_may_nay_moi_duoc_dung_mat_khau_yeu(self):
        for host in ("127.0.0.1", "localhost", "::1"):
            self.assertTrue(run.is_local_only(host))
        for host in ("0.0.0.0", "192.168.1.5", ""):
            self.assertFalse(run.is_local_only(host))


class Arguments(unittest.TestCase):
    def test_khong_ghi_lenh_con_la_up(self):
        seen = {}
        original_up, original_ready = run.cmd_up, run.Docker.ensure_ready
        run.cmd_up = lambda docker, args: seen.update(port=args.port, no_open=args.no_open)
        run.Docker.ensure_ready = lambda self: None
        try:
            self.assertEqual(run.main(["--port", "4000", "--no-open"]), 0)
        finally:
            run.cmd_up, run.Docker.ensure_ready = original_up, original_ready
        self.assertEqual(seen, {"port": 4000, "no_open": True})

    def test_lenh_con_hop_le(self):
        parser = run.build_parser()
        for command in ("up", "down", "reset", "logs", "status", "test"):
            self.assertEqual(parser.parse_args([command]).command, command)
        self.assertEqual(parser.parse_args(["test", "--only", "unit"]).only, "unit")


class ComposeFile(unittest.TestCase):
    def test_app_co_ten_image_tuong_minh(self):
        """docker-compose v1 tự đặt tag '<thư-mục>_app'; thư mục kết thúc bằng '-' làm tag không hợp lệ."""
        text = (Path(run.ROOT) / "docker-compose.yml").read_text(encoding="utf-8")
        block = text.split("\n  app:\n", 1)[1].split("\n  tests:", 1)[0]
        self.assertRegex(block, r"(?m)^    image: [a-z0-9_.-]+(:[\w.-]+)?$")


if __name__ == "__main__":
    unittest.main()
