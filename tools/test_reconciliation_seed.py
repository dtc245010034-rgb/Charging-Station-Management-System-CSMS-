import pathlib
import re
import unittest


class ReconciliationSeedTests(unittest.TestCase):
    def test_seed_requires_connection_from_environment_and_has_no_demo_password(self):
        source = pathlib.Path(__file__).with_name("seed-reconciliation-demo.js").read_text(encoding="utf-8")
        self.assertIn("process.env.DATABASE_URL", source)
        self.assertIn("process.env.TEST_DATABASE_URL", source)
        self.assertNotRegex(source, re.compile(r"admin\s*/\s*admin", re.IGNORECASE))
        self.assertNotIn("password123456", source)
        self.assertNotIn("password: 'admin'", source)


if __name__ == "__main__":
    unittest.main()
