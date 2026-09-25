const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

describe('S-01: không backdoor, không bí mật mặc định', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  it('package.json không còn pg-mem và bcryptjs', () => {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!('pg-mem' in deps));
    assert.ok(!('bcryptjs' in deps));
  });

  it('mã nguồn và migration không còn seedAdminPassword, admin123, pg-mem, bcrypt, development-secret', () => {
    const banned = ['seedAdminPassword', 'admin123', 'pg-mem', 'bcrypt', 'development-secret', 'change-this-in-production'];
    for (const file of [...files('src'), ...files('migrations'), ...files('scripts')]) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const word of banned) assert.ok(!text.includes(word), `${file} còn chứa ${word}`);
    }
  });

  it('migration không seed user', () => {
    for (const file of files('migrations').filter((f) => !f.endsWith('.down.sql'))) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(!/INSERT\s+INTO\s+users/i.test(text), file);
    }
  });
});
