import base64
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BACKUP_SCRIPT = ROOT / "tools" / "backup-db.sh"
SQL_DUMP = "CREATE TABLE private_data(value text);\nINSERT INTO private_data VALUES ('backup-fixture');\n"


class BackupScripts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.bash = shutil.which("bash")
        self.openssl = shutil.which("openssl")
        self.git_root = None
        if os.name == "nt":
            git = shutil.which("git")
            if git:
                self.git_root = Path(git).resolve().parent.parent
                self.bash = str(self.git_root / "bin" / "bash.exe")
                self.openssl = str(self.git_root / "usr" / "bin" / "openssl.exe")
        if not self.bash or not self.openssl:
            self.fail("bash va openssl can co san de kiem thu script sao luu")

        counter = self.root / "date-counter"
        counter_path = self.shell_path(counter)
        shell_env = self.root / "bash-env"
        dump = base64.b64encode(SQL_DUMP.encode()).decode()
        shell_env.write_text(
            "docker() {\n"
            "  case \"$*\" in\n"
            "    *'compose version'*) return 0 ;;\n"
            f"    *pg_dump*) printf '%s' '{dump}' | base64 -d ;;\n"
            "    *) echo 'unexpected docker command' >&2; return 2 ;;\n"
            "  esac\n"
            "}\n"
            "date() {\n"
            f"  n=$(cat '{counter_path}' 2>/dev/null || echo 0)\n"
            "  n=$((n + 1))\n"
            f"  echo \"$n\" > '{counter_path}'\n"
            "  printf '20261015-1200%02d' \"$n\"\n"
            "}\n",
            encoding="utf-8",
        )
        self.bash_env = self.shell_path(shell_env)

    def shell_path(self, path):
        if os.name != "nt":
            return str(path)
        cygpath = self.git_root / "usr" / "bin" / "cygpath.exe"
        return subprocess.check_output([str(cygpath), "-u", str(path)], text=True).strip()

    def tearDown(self):
        self.temp.cleanup()

    def run_backup(self, **extra):
        env = os.environ.copy()
        shell_path = self.shell_path
        path_entries = []
        if self.git_root:
            path_entries.extend([self.git_root / "usr" / "bin", self.git_root / "bin"])
        path_entries.extend(Path(entry) for entry in env.get("PATH", "").split(os.pathsep) if entry)
        env.update({
            "BACKUP_DIR": shell_path(self.backups),
            "KEEP": "7",
            "PATH": ":".join(shell_path(entry) for entry in path_entries),
            "HOME": shell_path(self.root),
            "BASH_ENV": self.bash_env,
        })
        env.update(extra)
        return subprocess.run(
            [self.bash, self.shell_path(BACKUP_SCRIPT)],
            cwd=ROOT,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )

    def test_requires_passphrase_without_plaintext_override(self):
        result = self.run_backup()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("BACKUP_PASSPHRASE", result.stderr)
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_encrypted_output_is_private_and_not_readable_sql(self):
        passphrase = "test-backup-passphrase-only"
        result = self.run_backup(BACKUP_PASSPHRASE=passphrase)
        self.assertEqual(result.returncode, 0, result.stderr)
        archives = list(self.backups.glob("*.sql.enc"))
        self.assertEqual(len(archives), 1)
        archive = archives[0]
        self.assertNotIn(SQL_DUMP.encode(), archive.read_bytes())
        if os.name == "nt":
            icacls = shutil.which("icacls.exe")
            self.assertIsNotNone(icacls, "Cần icacls để kiểm quyền tệp trên Windows")
            permissions = subprocess.run(
                [icacls, str(archive)],
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                check=False,
            )
            self.assertEqual(permissions.returncode, 0, permissions.stderr)
            self.assertIn(os.environ["USERNAME"].upper(), permissions.stdout.upper())
            self.assertNotIn("BUILTIN\\USERS", permissions.stdout.upper())
            self.assertNotIn("EVERYONE", permissions.stdout.upper())
        else:
            self.assertEqual(stat.S_IMODE(archive.stat().st_mode), 0o600)

        decrypted = subprocess.run(
            [
                self.openssl, "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-salt",
                "-pass", "env:BACKUP_PASSPHRASE", "-in", str(archive),
            ],
            env={**os.environ, "BACKUP_PASSPHRASE": passphrase},
            capture_output=True,
            check=False,
        )
        self.assertEqual(decrypted.returncode, 0, decrypted.stderr.decode(errors="replace"))
        self.assertEqual(decrypted.stdout.decode(), SQL_DUMP)

    def test_keep_removes_only_oldest_archives(self):
        for index, name in enumerate(("csms-20260101-000000.sql.enc", "csms-20260102-000000.sql.enc", "csms-20260103-000000.sql.enc")):
            archive = self.backups / name
            archive.write_bytes(b"old encrypted archive")
            os.utime(archive, (index + 1, index + 1))
        result = self.run_backup(BACKUP_PASSPHRASE="test-backup-passphrase-only", KEEP="2")
        self.assertEqual(result.returncode, 0, result.stderr)
        archives = sorted(path.name for path in self.backups.glob("*.sql.enc"))
        self.assertEqual(len(archives), 2)
        self.assertNotIn("csms-20260101-000000.sql.enc", archives)
        self.assertNotIn("csms-20260102-000000.sql.enc", archives)
        self.assertIn("csms-20260103-000000.sql.enc", archives)


if __name__ == "__main__":
    unittest.main()
