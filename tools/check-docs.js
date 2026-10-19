#!/usr/bin/env node
'use strict';

// Kiểm tra docs/project/TONG-KET-DU-AN.md: mọi tên tệp kiểm thử được nhắc phải tồn tại và
// số thẻ trong tiêu đề phải bằng số dòng của bảng. Chạy trong CI: node tools/check-docs.js
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'backend', 'tests');

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function checkSummary(docPath = path.join(root, 'docs', 'project', 'TONG-KET-DU-AN.md')) {
  const text = fs.readFileSync(docPath, 'utf8');
  const problems = [];
  const known = listFiles(testsDir).map((file) => path.relative(testsDir, file).split(path.sep).join('/'));

  for (const [, token] of text.matchAll(/`([^`\s]+\.(?:test\.js|py))`/g)) {
    const exists = token.startsWith('tools/')
      ? fs.existsSync(path.join(root, token))
      : known.includes(token) || known.some((file) => path.posix.basename(file) === token);
    if (!exists) problems.push(`Tệp kiểm thử không tồn tại: ${token}`);
  }

  const declared = text.match(/Bảng Tổng Hợp (\d+) Thẻ/);
  const rows = (text.match(/^\| S-\d+ \|/gm) || []).length;
  if (!declared) problems.push('Không tìm thấy tiêu đề dạng «Bảng Tổng Hợp N Thẻ»');
  else if (Number(declared[1]) !== rows) problems.push(`Tiêu đề ghi ${declared[1]} thẻ nhưng bảng có ${rows} dòng`);

  const codes = [...text.matchAll(/^\| (S-\d+) \|/gm)].map((m) => m[1]);
  const duplicated = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicated.length) problems.push(`Thẻ lặp trong bảng: ${[...new Set(duplicated)].join(', ')}`);
  return { problems, rows };
}

if (require.main === module) {
  const { problems, rows } = checkSummary();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`TONG-KET-DU-AN.md hợp lệ: ${rows} thẻ, mọi tệp kiểm thử được nhắc đều tồn tại.`);
}

module.exports = { checkSummary };
