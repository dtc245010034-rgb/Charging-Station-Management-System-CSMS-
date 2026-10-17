function csvCell(value, delimiter = ';', isText = typeof value === 'string') {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = isText && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return safe.includes(delimiter) || /["\r\n]/.test(safe)
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

function toCsv(headers, rows, { delimiter = ';', textColumns } = {}) {
  const lines = [
    headers.map((header) => csvCell(header, delimiter)).join(delimiter),
    ...rows.map((row) => headers.map((header) => {
      const isText = textColumns
        ? textColumns.includes(header)
        : typeof row[header] === 'string';
      return csvCell(row[header], delimiter, isText);
    }).join(delimiter)),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

module.exports = { csvCell, toCsv };
