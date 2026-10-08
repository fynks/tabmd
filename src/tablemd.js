export const ALIGNMENT = Object.freeze({
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
});

export const OUTPUT_FORMAT = Object.freeze({
  MARKDOWN: 'markdown',
  JSON: 'json',
  HTML: 'html',
});

// Default values for the check column builder.
const CHECK_MARK = '✅';
const CROSS_MARK = '❌';

// Nested JSON objects keep the label column used by the legacy md-table-to-json export.
export const JSON_LABEL_HEADER = 'Service Name';
export const JSON_PAIR_HEADERS = Object.freeze(['Key', 'Value']);

const ALIGNMENT_MARKDOWN = Object.freeze({
  [ALIGNMENT.LEFT]: ':---',
  [ALIGNMENT.CENTER]: ':---:',
  [ALIGNMENT.RIGHT]: '---:',
});

const CHECKED_VALUES = new Set(['yes', 'true', 'y', '✅', '✔️', '✔', '✓']);
const UNCHECKED_VALUES = new Set(['no', 'false', 'n', '❌', '✖️', '✖', '✗', '×']);

export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isChecked(value) {
  const text = String(value ?? '').trim();
  return CHECKED_VALUES.has(text.toLowerCase()) || CHECKED_VALUES.has(text);
}

export function isUnchecked(value) {
  const text = String(value ?? '').trim();
  return UNCHECKED_VALUES.has(text.toLowerCase()) || UNCHECKED_VALUES.has(text);
}

export function normalizeCheckValue(value) {
  if (isChecked(value)) return '✅';
  if (isUnchecked(value)) return '❌';
  return String(value ?? '');
}

function text(value) {
  return String(value ?? '');
}

function parseMarkdownRow(line) {
  const cells = [];
  let cell = '';

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '\\' && line[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());

  if (cells.length > 1 && cells[0] === '') cells.shift();
  if (cells.length > 1 && cells.at(-1) === '') cells.pop();
  return cells;
}

function isMarkdownSeparator(line) {
  const cells = parseMarkdownRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

export function parseMarkdownTable(input) {
  const lines = text(input).trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error('Markdown table must have at least a header and separator row');
  }

  const headers = parseMarkdownRow(lines[0]);
  const separators = parseMarkdownRow(lines[1]);
  if (headers.length !== separators.length) {
    throw new Error('Header and separator row must have the same number of columns');
  }
  if (!isMarkdownSeparator(lines[1])) {
    throw new Error('The second row must contain Markdown column separators');
  }

  const alignments = separators.map((separator) => {
    const value = separator.trim();
    if (value.startsWith(':') && value.endsWith(':')) return ALIGNMENT.CENTER;
    if (value.endsWith(':')) return ALIGNMENT.RIGHT;
    return ALIGNMENT.LEFT;
  });

  const rows = lines.slice(2).map((line) => {
    const row = parseMarkdownRow(line).map(normalizeCheckValue);
    while (row.length < headers.length) row.push('');
    row.length = headers.length;
    return row;
  });

  return normalizeTable({ headers, alignments, rows });
}

function directCells(row) {
  return Array.from(row.children).filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD');
}

function cellAlignment(cell) {
  const textAlign = (cell.style?.textAlign || cell.getAttribute('align') || '').toLowerCase();
  if (cell.classList.contains('text-center') || textAlign === 'center') return ALIGNMENT.CENTER;
  if (cell.classList.contains('text-right') || textAlign === 'right') return ALIGNMENT.RIGHT;
  return ALIGNMENT.LEFT;
}

function colspanOf(cell) {
  const colspan = Number.parseInt(cell.getAttribute('colspan') || '1', 10);
  return Number.isFinite(colspan) ? Math.min(Math.max(colspan, 1), 1000) : 1;
}

function tableRowCells(row, { includeAlignment = false } = {}) {
  const values = [];
  const alignments = [];
  for (const cell of directCells(row)) {
    const colspan = colspanOf(cell);
    values.push(cell.textContent?.trim() || '');
    if (includeAlignment) alignments.push(cellAlignment(cell));
    for (let index = 1; index < colspan; index += 1) {
      values.push('');
      if (includeAlignment) alignments.push(cellAlignment(cell));
    }
  }
  return { values, alignments };
}

export function parseHTMLTable(input, DOMParserClass = globalThis.DOMParser) {
  try {
    if (typeof DOMParserClass !== 'function') {
      throw new Error('This browser does not provide an HTML parser');
    }

    const document = new DOMParserClass().parseFromString(text(input), 'text/html');
    const table = document.querySelector('table');
    if (!table) throw new Error('No table element found in HTML input');

    const tableRows = Array.from(table.querySelectorAll('tr')).filter(
      (row) => row.closest('table') === table,
    );
    const headerRow = table.querySelector('thead tr')
      || tableRows.find((row) => directCells(row).some((cell) => cell.tagName === 'TH'))
      || tableRows[0];
    if (!headerRow) throw new Error('No header row found in HTML table');

    const header = tableRowCells(headerRow, { includeAlignment: true });
    if (header.values.length === 0) throw new Error('No headers found in HTML table');

    const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter(
      (row) => row.closest('table') === table && row !== headerRow,
    );
    const dataRows = bodyRows.length > 0
      ? bodyRows
      : tableRows.filter((row) => row !== headerRow);

    const rows = dataRows.map((row) => {
      const values = tableRowCells(row).values.map(normalizeCheckValue);
      while (values.length < header.values.length) values.push('');
      values.length = header.values.length;
      return values;
    });

    return normalizeTable({
      headers: header.values,
      alignments: header.alignments,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Error parsing HTML table:')) throw error;
    throw new Error(`Error parsing HTML table: ${message}`, { cause: error });
  }
}

export function parseTable(input, { DOMParser: DOMParserClass = globalThis.DOMParser } = {}) {
  const value = text(input).trim();
  if (!value) throw new Error('Please enter a Markdown, HTML, or JSON table');

  if (/<table(?:\s|>)/i.test(value) || /<table/i.test(value)) {
    return parseHTMLTable(value, DOMParserClass);
  }

  if (/^[\[{]/.test(value)) {
    return parseJSONTable(value);
  }

  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length >= 2 && lines.some((line) => line.includes('|')) && isMarkdownSeparator(lines[1])) {
    return parseMarkdownTable(value);
  }

  throw new Error('Input does not appear to be a valid HTML, JSON, or Markdown table');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonCellValue(value) {
  if (value === null || value === undefined) return '';
  if (isPlainObject(value) || Array.isArray(value)) return JSON.stringify(value);
  return normalizeCheckValue(String(value));
}

function collectKeys(entries) {
  const keys = [];
  const seen = new Set();
  for (const entry of entries) {
    for (const key of Object.keys(entry)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function tableFromRowObjects(entries) {
  if (entries.length === 0) throw new Error('JSON array must contain at least one row object');
  if (!entries.every(isPlainObject)) throw new Error('Every entry in a JSON row array must be an object');

  const headers = collectKeys(entries);
  if (headers.length === 0) throw new Error('JSON row objects have no keys to use as headers');

  const rows = entries.map((entry) => headers.map((header) => jsonCellValue(entry[header])));
  return normalizeTable({ headers, rows });
}

function tableFromRecord(record) {
  const keys = Object.keys(record);
  if (keys.length === 0) throw new Error('JSON object must contain at least one entry');

  const values = keys.map((key) => record[key]);
  // Nested objects are read as a check/property matrix; plain values become key/value rows.
  if (values.every(isPlainObject)) {
    const headers = [JSON_LABEL_HEADER, ...collectKeys(values)];
    const rows = keys.map((key) => [
      key,
      ...headers.slice(1).map((header) => jsonCellValue(record[key][header])),
    ]);
    return normalizeTable({ headers, rows });
  }

  const rows = keys.map((key) => [key, jsonCellValue(record[key])]);
  return normalizeTable({ headers: [...JSON_PAIR_HEADERS], rows });
}

export function parseJSONTable(input) {
  const value = text(input).trim();
  let data;
  try {
    data = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`, { cause: error });
  }

  if (Array.isArray(data)) return tableFromRowObjects(data);
  if (isPlainObject(data)) return tableFromRecord(data);
  throw new Error('JSON must be an object of rows or an array of row objects');
}

export function normalizeTable(table = {}) {
  const headers = Array.isArray(table.headers) ? table.headers.map(text) : [];
  const alignments = headers.map((_, index) => {
    const alignment = table.alignments?.[index];
    return Object.values(ALIGNMENT).includes(alignment) ? alignment : ALIGNMENT.LEFT;
  });
  const rows = Array.isArray(table.rows)
    ? table.rows.map((row) => {
      const values = Array.isArray(row) ? row.map(normalizeCheckValue) : [];
      while (values.length < headers.length) values.push('');
      values.length = headers.length;
      return values;
    })
    : [];

  return { headers, alignments, rows };
}

export function cloneTable(table) {
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: table.rows.map((row) => [...row]),
  };
}

// Row-name matching used by the check column builder: ignores case, surrounding
// whitespace, and `**` emphasis markers. Exposed for the builder's match preview.
export function matchRowKey(value) {
  return text(value).replace(/\*\*/g, '').trim().toLowerCase();
}

export function splitMemberList(input) {
  return text(input)
    .split(/[\n,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildCheckColumn(table, {
  header = 'New Column',
  members = '',
  marked = CHECK_MARK,
  unmarked = CROSS_MARK,
  addMissingRows = false,
} = {}) {
  const current = normalizeTable(table);
  const memberList = splitMemberList(Array.isArray(members) ? members.join('\n') : members);
  const wanted = new Set(memberList.map(matchRowKey));
  const rows = current.rows.map((row) => [...row]);
  const created = [];
  const unmatched = [];

  // Listed names without a row are reported, and optionally appended as fully unmarked rows.
  for (const member of memberList) {
    const key = matchRowKey(member);
    if (!key || rows.some((row) => matchRowKey(row[0]) === key) || unmatched.some((name) => matchRowKey(name) === key)) continue;
    unmatched.push(member);
    if (!addMissingRows) continue;
    created.push(member);
    rows.push([member, ...new Array(Math.max(0, current.headers.length - 1)).fill(unmarked)]);
  }

  // An empty member list still adds a plain empty column.
  const next = {
    headers: [...current.headers, text(header)],
    alignments: [...current.alignments, ALIGNMENT.LEFT],
    rows: rows.map((row) => [
      ...row,
      memberList.length === 0
        ? ''
        : normalizeCheckValue(wanted.has(matchRowKey(row[0])) ? marked : unmarked),
    ]),
  };

  return { table: normalizeTable(next), created, unmatched };
}

function tablesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formatMarkdown(table) {
  const current = normalizeTable(table);
  const header = `| ${current.headers.join(' | ')} |`;
  const separator = `| ${current.alignments.map((alignment) => ALIGNMENT_MARKDOWN[alignment]).join(' | ')} |`;
  const rows = current.rows.map((row) => `| ${row.map(normalizeCheckValue).join(' | ')} |`);
  return [header, separator, ...rows].join('\n');
}

export function formatJSON(table) {
  const current = normalizeTable(table);
  const result = {};

  current.rows.forEach((row) => {
    const key = row[0]?.replace(/\*\*/g, '');
    if (!key) return;

    result[key] = {};
    for (let index = 1; index < current.headers.length; index += 1) {
      const header = current.headers[index].replace(/\*\*/g, '');
      const value = row[index];
      result[key][header] = isChecked(value) ? '✅' : (isUnchecked(value) ? '❌' : value);
    }
  });

  return JSON.stringify(result, null, 2);
}

export function formatHTML(table) {
  const current = normalizeTable(table);
  const alignClass = (alignment) => alignment === ALIGNMENT.LEFT ? '' : ` class="text-${alignment}"`;
  const headerCells = current.headers
    .map((header, index) => `<th${alignClass(current.alignments[index])}>${escapeHTML(header)}</th>`)
    .join('');
  const bodyRows = current.rows.map((row) => {
    const cells = row
      .map((value, index) => `<td${alignClass(current.alignments[index])}>${escapeHTML(normalizeCheckValue(value))}</td>`)
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `<table>\n<thead>\n<tr>${headerCells}</tr>\n</thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`;
}

export function formatTable(table, format = OUTPUT_FORMAT.MARKDOWN) {
  switch (format) {
    case OUTPUT_FORMAT.MARKDOWN:
      return formatMarkdown(table);
    case OUTPUT_FORMAT.JSON:
      return formatJSON(table);
    case OUTPUT_FORMAT.HTML:
      return formatHTML(table);
    default:
      throw new Error(`Unsupported output format: ${format}`);
  }
}

export function analyzeTableData(table) {
  const current = normalizeTable(table);
  const total = current.rows.length;
  const columns = current.headers.slice(1).map((name, offset) => {
    const column = offset + 1;
    const checked = current.rows.reduce((sum, row) => sum + (isChecked(row[column]) ? 1 : 0), 0);
    return {
      name,
      checked,
      total,
      percent: total > 0 ? Math.round((checked / total) * 100) : 0,
    };
  });

  return { total, columns };
}

export function analyzeTable(table) {
  const current = normalizeTable(table);
  if (current.rows.length === 0 || current.headers.length === 0) return '';

  const { total, columns } = analyzeTableData(current);
  let result = `| **Total** = ${total} |`;
  for (const column of columns) {
    result += ` **${column.checked}/${total}** |`;
  }
  return result;
}

export class TableHistory {
  #entries;
  #index;
  #limit;

  constructor(initialTable = { headers: [], alignments: [], rows: [] }, limit = 50) {
    this.#entries = [normalizeTable(initialTable)];
    this.#index = 0;
    this.#limit = Math.max(1, Math.floor(limit));
  }

  get canUndo() {
    return this.#index > 0;
  }

  get canRedo() {
    return this.#index < this.#entries.length - 1;
  }

  get current() {
    return cloneTable(this.#entries[this.#index]);
  }

  commit(table) {
    const next = normalizeTable(table);
    if (tablesEqual(next, this.#entries[this.#index])) return false;

    this.#entries = this.#entries.slice(0, this.#index + 1);
    this.#entries.push(next);
    if (this.#entries.length > this.#limit + 1) this.#entries.shift();
    this.#index = this.#entries.length - 1;
    return true;
  }

  undo() {
    if (!this.canUndo) return null;
    this.#index -= 1;
    return this.current;
  }

  redo() {
    if (!this.canRedo) return null;
    this.#index += 1;
    return this.current;
  }

  reset(table = { headers: [], alignments: [], rows: [] }) {
    this.#entries = [normalizeTable(table)];
    this.#index = 0;
  }
}

export class TableMD {
  #state;
  #history;

  constructor(initialTable = { headers: [], alignments: [], rows: [] }) {
    this.#state = normalizeTable(initialTable);
    this.#history = new TableHistory(this.#state);
    this.reorderMode = false;
  }

  get state() {
    return this.#state;
  }

  get canUndo() {
    return this.#history.canUndo;
  }

  get canRedo() {
    return this.#history.canRedo;
  }

  get isEmpty() {
    return this.#state.headers.length === 0 && this.#state.rows.length === 0;
  }

  get isValid() {
    return this.#state.headers.length > 0 && this.#state.alignments.length === this.#state.headers.length;
  }

  #commit(next) {
    const normalized = normalizeTable(next);
    if (!this.#history.commit(normalized)) return false;
    this.#state = normalized;
    return true;
  }

  load(table) {
    return this.#commit(table);
  }

  editHeader(columnIndex, value) {
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= this.#state.headers.length) return false;
    const next = cloneTable(this.#state);
    next.headers[columnIndex] = text(value);
    return this.#commit(next);
  }

  editCell(rowIndex, columnIndex, value) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= this.#state.rows.length) return false;
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= this.#state.headers.length) return false;
    const next = cloneTable(this.#state);
    next.rows[rowIndex][columnIndex] = normalizeCheckValue(value);
    return this.#commit(next);
  }

  addRow() {
    if (this.#state.headers.length === 0) return false;
    const next = cloneTable(this.#state);
    next.rows.push(new Array(next.headers.length).fill(''));
    return this.#commit(next);
  }

  removeRow(rowIndex = this.#state.rows.length - 1) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= this.#state.rows.length) return false;
    const next = cloneTable(this.#state);
    next.rows.splice(rowIndex, 1);
    return this.#commit(next);
  }

  addColumn(header = 'New Column') {
    const next = cloneTable(this.#state);
    next.headers.push(text(header));
    next.alignments.push(ALIGNMENT.LEFT);
    next.rows.forEach((row) => row.push(''));
    return this.#commit(next);
  }

  addCheckColumn(header, options = {}) {
    const { table, created, unmatched } = buildCheckColumn(this.#state, { header, ...options });
    if (!this.#commit(table)) return null;
    return { created, unmatched };
  }

  removeColumn(columnIndex = this.#state.headers.length - 1) {
    if (this.#state.headers.length <= 1) return false;
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= this.#state.headers.length) return false;
    const next = cloneTable(this.#state);
    next.headers.splice(columnIndex, 1);
    next.alignments.splice(columnIndex, 1);
    next.rows.forEach((row) => row.splice(columnIndex, 1));
    return this.#commit(next);
  }

  sortRows() {
    if (this.#state.rows.length <= 1) return false;
    const next = cloneTable(this.#state);
    next.rows.sort((left, right) => {
      const a = String(left[0] || '').trim().toLowerCase();
      const b = String(right[0] || '').trim().toLowerCase();
      if (a === '' && b !== '') return 1;
      if (b === '' && a !== '') return -1;
      if (a === '' && b === '') return 0;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return this.#commit(next);
  }

  moveRow(fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
    if (fromIndex < 0 || fromIndex >= this.#state.rows.length) return false;
    if (toIndex < 0 || toIndex >= this.#state.rows.length || fromIndex === toIndex) return false;
    const next = cloneTable(this.#state);
    const [row] = next.rows.splice(fromIndex, 1);
    next.rows.splice(toIndex, 0, row);
    return this.#commit(next);
  }

  moveColumn(fromIndex, toIndex) {
    const width = this.#state.headers.length;
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false;
    if (fromIndex < 0 || fromIndex >= width || toIndex < 0 || toIndex >= width || fromIndex === toIndex) return false;

    const next = cloneTable(this.#state);
    const move = (array) => {
      const [value] = array.splice(fromIndex, 1);
      array.splice(toIndex, 0, value);
    };
    move(next.headers);
    move(next.alignments);
    next.rows.forEach(move);
    return this.#commit(next);
  }

  undo() {
    const previous = this.#history.undo();
    if (!previous) return false;
    this.#state = previous;
    return true;
  }

  redo() {
    const next = this.#history.redo();
    if (!next) return false;
    this.#state = next;
    return true;
  }

  clear() {
    const changed = !this.isEmpty || this.#state.alignments.length > 0;
    this.#state = normalizeTable();
    this.#history.reset(this.#state);
    this.reorderMode = false;
    return changed;
  }
}
