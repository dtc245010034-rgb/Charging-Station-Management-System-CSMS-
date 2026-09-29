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
