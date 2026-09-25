const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { ESLint } = require('eslint');

const root = path.resolve(__dirname, '../../..');
const eslint = new ESLint({ cwd: root });
const lint = async (code, file) => (await eslint.lintText(code, { filePath: path.join(root, file) }))[0].messages;

describe('S-03: cấm express.Router() trực tiếp trong modules/', () => {
  const variants = [
    "const express = require('express');\nconst router = express.Router();\nmodule.exports = router;\n",
    "const { Router } = require('express');\nmodule.exports = Router();\n",
    "const express = require('express');\nconst router = express.Router();\nrouter.route('/x');\nmodule.exports = router;\n",
  ];

  it('modules/**: express.Router / Router / .route → lỗi no-restricted-syntax', async () => {
    for (const code of variants) {
      const messages = await lint(code, 'backend/src/modules/x/x.routes.js');
      assert.ok(messages.some((m) => m.ruleId === 'no-restricted-syntax'), code);
    }
  });

  it('security/ và app.js được phép dùng express.Router', async () => {
    for (const file of ['backend/src/security/routeGuard.js', 'backend/src/app.js']) {
      const messages = await lint(variants[0], file);
      assert.ok(!messages.some((m) => m.ruleId === 'no-restricted-syntax'), file);
    }
  });

  it('secureRouter() trong modules/ hợp lệ', async () => {
    const messages = await lint("const { secureRouter } = require('../../security/routeGuard');\nmodule.exports = secureRouter();\n", 'backend/src/modules/x/x.routes.js');
    assert.ok(!messages.some((m) => m.ruleId === 'no-restricted-syntax'));
  });
});
