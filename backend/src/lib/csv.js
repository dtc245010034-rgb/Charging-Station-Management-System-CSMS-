function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(columns, rows) {
  return `\uFEFF${columns.join(',')}\r\n${rows
    .map((row) => columns.map((column) => csvCell(row[column])).join(','))
    .join('\r\n')}\r\n`;
}

module.exports = { toCsv };
