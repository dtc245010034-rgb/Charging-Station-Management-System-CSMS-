// Cấu hình đặt ở thư mục gốc để một lần lint phủ cả backend/ và frontend/js.
// Chạy từ backend/: npm run lint (dependency cài trong backend/node_modules).
const path = require('node:path');
const { createRequire } = require('node:module');

const requireFromBackend = createRequire(path.join(__dirname, 'backend', 'package.json'));
const js = requireFromBackend('@eslint/js');
const globals = requireFromBackend('globals');

module.exports = [
  { ignores: ['**/node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // Route phải khai quyền: dùng secureRouter() (security/routeGuard.js), không dùng express.Router() trực tiếp.
    files: ['backend/src/modules/**/*.js'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "Identifier[name='Router']", message: 'Dùng secureRouter() từ security/routeGuard.js thay cho express.Router().' },
        { selector: "CallExpression[callee.property.name='route']", message: 'Không dùng router.route(); khai route bằng secureRouter().get/post/... với { access }.' },
      ],
    },
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
  },
];
