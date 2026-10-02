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
  if (!value) throw new Error('Please enter a Markdown or HTML table');

  if (/<table(?:\s|>)/i.test(value) || /<table/i.test(value)) {
    return parseHTMLTable(value, DOMParserClass);
  }

  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length >= 2 && lines.some((line) => line.includes('|')) && isMarkdownSeparator(lines[1])) {
    return parseMarkdownTable(value);
  }

  throw new Error('Input does not appear to be a valid HTML or Markdown table');
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

export function analyzeTable(table) {
  const current = normalizeTable(table);
  if (current.rows.length === 0 || current.headers.length === 0) return '';

  const total = current.rows.length;
  let result = `| **Total** = ${total} |`;
  for (let column = 1; column < current.headers.length; column += 1) {
    const checked = current.rows.reduce((sum, row) => sum + (isChecked(row[column]) ? 1 : 0), 0);
    result += ` **${checked}/${total}** |`;
  }
  return result;
}

export function getColumnStats(table, columnIndex) {
  const current = normalizeTable(table);
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= current.headers.length) return null;

  const values = current.rows.map((row) => row[columnIndex] || '');
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const mostCommon = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || '';

  return {
    columnName: current.headers[columnIndex],
    totalCells: values.length,
    uniqueValues: new Set(values).size,
    emptyCells: values.filter((value) => !value.trim()).length,
    mostCommon,
  };
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
