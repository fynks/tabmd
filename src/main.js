import './ui.css';
import {
  createIcons,
  Activity,
  ArrowDownAZ,
  Columns3,
  Copy,
  GripVertical,
  Minus,
  Moon,
  Play,
  Plus,
  Redo2,
  Rows3,
  Sun,
  Table2,
  Trash2,
  Undo2,
} from 'lucide';
import {
  ALIGNMENT,
  OUTPUT_FORMAT,
  TableMD,
  analyzeTable,
  formatTable,
  normalizeCheckValue,
  parseTable,
} from './tablemd.js';

const editor = new TableMD();
const ui = {
  outputFormat: OUTPUT_FORMAT.MARKDOWN,
  renderVersion: 0,
  activeDrag: null,
  pendingDragRender: null,
  notificationTimer: null,
  parseTimer: null,
  pendingInlineEdits: new Set(),
};

const elements = {
  themeToggle: document.querySelector('#themeToggle'),
  undoButton: document.querySelector('#undoBtn'),
  redoButton: document.querySelector('#redoBtn'),
  source: document.querySelector('#input'),
  output: document.querySelector('#output'),
  outputFormat: document.querySelector('#outputFormat'),
  parseButton: document.querySelector('#parseBtn'),
  clearButton: document.querySelector('#clearBtn'),
  copyButton: document.querySelector('#copyBtn'),
  analyzeButton: document.querySelector('#analyzeBtn'),
  sortButton: document.querySelector('#sortRowsBtn'),
  reorderButton: document.querySelector('#reorderBtn'),
  addColumnButton: document.querySelector('#addColumnBtn'),
  addRowButton: document.querySelector('#addRowBtn'),
  removeColumnButton: document.querySelector('#removeColumnBtn'),
  removeRowButton: document.querySelector('#removeRowBtn'),
  analysisSection: document.querySelector('#analysisSection'),
  analysisOutput: document.querySelector('#analysisOutput'),
  analysisSummary: document.querySelector('#analysisSummary'),
  viewport: document.querySelector('#tableViewport'),
  emptyState: document.querySelector('#emptyState'),
  tableHost: document.querySelector('#tableHost'),
  dimensions: document.querySelector('#tableDimensions'),
  tableStatus: document.querySelector('#tableStatus'),
  notification: document.querySelector('#notification'),
};

const iconSet = {
  Activity,
  ArrowDownAZ,
  Columns3,
  Copy,
  GripVertical,
  Minus,
  Moon,
  Play,
  Plus,
  Redo2,
  Rows3,
  Sun,
  Table2,
  Trash2,
  Undo2,
};

createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.8 } });

function readSavedTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in private browsing or sandboxed documents.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme, persist = true) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
  const label = value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  elements.themeToggle.setAttribute('aria-label', label);
  elements.themeToggle.title = label;
  elements.themeToggle.querySelector('.visually-hidden').textContent = label;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    value === 'dark' ? '#0b101a' : '#f8fafc',
  );
  if (persist) {
    try {
      localStorage.setItem('theme', value);
    } catch {
      // The theme still applies for this page load when storage is unavailable.
    }
  }
}

setTheme(readSavedTheme(), false);

function notify(message, type = 'success', duration = 3000) {
  window.clearTimeout(ui.notificationTimer);
  elements.notification.textContent = message;
  elements.notification.hidden = false;
  elements.notification.className = `notification notification-${type}`;
  elements.notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
  elements.notification.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  ui.notificationTimer = window.setTimeout(() => {
    elements.notification.hidden = true;
  }, duration);
}

function syncHistoryButtons() {
  elements.undoButton.disabled = !editor.canUndo;
  elements.redoButton.disabled = !editor.canRedo;
}

function updateDerivedOutput() {
  elements.output.value = editor.isValid ? formatTable(editor.state, ui.outputFormat) : '';
  const analysis = analyzeTable(editor.state);
  elements.analysisOutput.textContent = analysis;

  const { headers, rows } = editor.state;
  if (!headers.length || !rows.length) {
    elements.analysisSummary.textContent = headers.length ? 'No data rows' : 'Not analyzed';
  } else {
    const checkedCount = rows.reduce((sum, row) => (
      sum + row.slice(1).filter((value) => normalizeCheckValue(value) === '✅').length
    ), 0);
    elements.analysisSummary.textContent = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} · ${checkedCount} checked`;
  }
}

function updateTableMeta() {
  const { headers, rows } = editor.state;
  if (!editor.isValid) {
    elements.dimensions.textContent = 'No table loaded';
    elements.tableStatus.textContent = 'Ready for a table';
    return;
  }

  elements.dimensions.textContent = `${headers.length} ${headers.length === 1 ? 'column' : 'columns'} · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  elements.tableStatus.textContent = `${rows.length} data ${rows.length === 1 ? 'row' : 'rows'} · ${headers.length} ${headers.length === 1 ? 'column' : 'columns'}`;
}

function createEditableCell({ value, field, rowIndex, columnIndex, version, label, alignment }) {
  const cell = document.createElement(field === 'header' ? 'th' : 'td');
  cell.dataset.renderVersion = String(version);
  cell.dataset.columnIndex = String(columnIndex);
  cell.dataset.editable = field;
  cell.contentEditable = String(!editor.reorderMode);
  cell.tabIndex = 0;
  cell.spellcheck = false;
  cell.textContent = value;
  cell.setAttribute('aria-label', label);

  if (field === 'header') {
    cell.scope = 'col';
    cell.draggable = editor.reorderMode;
    if (editor.reorderMode) {
      cell.setAttribute('aria-label', `Column ${columnIndex + 1}: ${value}. Drag to reorder, or press Alt plus Left or Right.`);
    }
  } else {
    cell.dataset.rowIndex = String(rowIndex);
    cell.dataset.columnIndex = String(columnIndex);
    cell.classList.add(`align-${alignment}`);
  }
  return cell;
}

function renderTable({ focus } = {}) {
  ui.renderVersion += 1;
  const version = ui.renderVersion;
  const table = document.createElement('table');
  table.className = 'data-table';
  table.setAttribute('aria-label', 'Editable table');

  const caption = document.createElement('caption');
  caption.className = 'visually-hidden';
  caption.textContent = 'Table editor. Edit each header and cell inline.';
  table.append(caption);

  const { headers, alignments, rows } = editor.state;
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach((header, columnIndex) => {
    const cell = createEditableCell({
      value: header,
      field: 'header',
      rowIndex: -1,
      columnIndex,
      version,
      label: `Edit header ${columnIndex + 1}: ${header}`,
    });
    cell.classList.add(`align-${alignments[columnIndex] || ALIGNMENT.LEFT}`);
    headerRow.append(cell);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, rowIndex) => {
    const tableRow = document.createElement('tr');
    tableRow.dataset.rowIndex = String(rowIndex);
    tableRow.dataset.renderVersion = String(version);
    tableRow.draggable = editor.reorderMode;
    tableRow.tabIndex = editor.reorderMode ? 0 : -1;
    if (editor.reorderMode) {
      tableRow.setAttribute('aria-label', `Row ${rowIndex + 1}. Drag to reorder, or press Alt plus Up or Down.`);
    }

    row.forEach((value, columnIndex) => {
      tableRow.append(createEditableCell({
        value,
        field: 'cell',
        rowIndex,
        columnIndex,
        version,
        label: `Edit row ${rowIndex + 1}, ${headers[columnIndex] || `column ${columnIndex + 1}`}`,
        alignment: alignments[columnIndex] || ALIGNMENT.LEFT,
      }));
    });
    tbody.append(tableRow);
  });
  table.append(tbody);

  const hasTable = editor.isValid;
  elements.emptyState.hidden = hasTable;
  elements.tableHost.hidden = !hasTable;
  elements.viewport.classList.toggle('reorder-mode', editor.reorderMode);
  elements.viewport.setAttribute('aria-busy', 'false');
  if (hasTable) elements.tableHost.replaceChildren(table);
  else elements.tableHost.replaceChildren();

  elements.reorderButton.classList.toggle('is-active', editor.reorderMode);
  elements.reorderButton.setAttribute('aria-pressed', String(editor.reorderMode));
  elements.reorderButton.querySelector('span').textContent = editor.reorderMode ? 'Finish reorder' : 'Reorder';

  updateTableMeta();
  updateDerivedOutput();
  syncHistoryButtons();

  if (focus && hasTable) {
    const selector = focus.type === 'row'
      ? `tbody tr[data-row-index="${focus.index}"]`
      : `thead th[data-column-index="${focus.index}"]`;
    elements.tableHost.querySelector(selector)?.focus({ preventScroll: true });
  }
}

function refreshAfterMutation(message) {
  renderTable();
  if (message) notify(message);
}

function readIndex(element, key, count) {
  if (!element || Number(element.dataset.renderVersion) !== ui.renderVersion) return -1;
  const value = Number(element.dataset[key]);
  return Number.isInteger(value) && value >= 0 && value < count ? value : -1;
}

function commitInlineEdit(element) {
  if (!(element instanceof HTMLElement) || !element.dataset.editable) return false;
  const version = Number(element.dataset.renderVersion);
  if (version !== ui.renderVersion) {
    ui.pendingInlineEdits.delete(element);
    return false;
  }

  const columnIndex = readIndex(element, 'columnIndex', editor.state.headers.length);
  let changed = false;
  if (element.dataset.editable === 'header' && columnIndex >= 0) {
    changed = editor.editHeader(columnIndex, element.textContent || '');
    element.textContent = editor.state.headers[columnIndex];
  } else if (element.dataset.editable === 'cell') {
    const row = element.closest('tbody tr');
    const rowIndex = readIndex(row, 'rowIndex', editor.state.rows.length);
    if (rowIndex >= 0 && columnIndex >= 0) {
      changed = editor.editCell(rowIndex, columnIndex, element.textContent || '');
      element.textContent = editor.state.rows[rowIndex][columnIndex];
    }
  }

  ui.pendingInlineEdits.delete(element);
  if (changed) {
    if (element.dataset.editable === 'header') {
      const header = editor.state.headers[columnIndex] || `column ${columnIndex + 1}`;
      element.setAttribute('aria-label', `Edit header ${columnIndex + 1}: ${header}`);
      elements.tableHost.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
        row.children[columnIndex]?.setAttribute('aria-label', `Edit row ${rowIndex + 1}, ${header}`);
      });
    }
    updateDerivedOutput();
    updateTableMeta();
    syncHistoryButtons();
  }
  return changed;
}

function restoreInlineEdit(element) {
  if (!(element instanceof HTMLElement) || !element.dataset.editable) return;
  const columnIndex = readIndex(element, 'columnIndex', editor.state.headers.length);
  if (columnIndex < 0) return;
  if (element.dataset.editable === 'header') {
    element.textContent = editor.state.headers[columnIndex];
  } else {
    const row = element.closest('tbody tr');
    const rowIndex = readIndex(row, 'rowIndex', editor.state.rows.length);
    if (rowIndex >= 0) element.textContent = editor.state.rows[rowIndex][columnIndex];
  }
  ui.pendingInlineEdits.delete(element);
}

function scheduleAutomaticParse() {
  window.clearTimeout(ui.parseTimer);
  ui.parseTimer = window.setTimeout(() => {
    const value = elements.source.value.trim();
    if (!value) return;
    try {
      const parsed = parseTable(value);
      if (editor.load(parsed)) {
        editor.reorderMode = false;
        renderTable();
      }
    } catch {
      // Partial or invalid text is expected while someone is typing; manual Parse reports errors.
    }
  }, 420);
}

async function parseSource() {
  const value = elements.source.value.trim();
  if (!value) {
    notify('Please enter a table to parse.', 'warning');
    return;
  }

  window.clearTimeout(ui.parseTimer);
  elements.parseButton.disabled = true;
  elements.parseButton.classList.add('is-loading');
  elements.viewport.setAttribute('aria-busy', 'true');
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const parsed = parseTable(value);
    editor.reorderMode = false;
    editor.load(parsed);
    renderTable();
    notify('Table parsed successfully.');
  } catch (error) {
    elements.viewport.setAttribute('aria-busy', 'false');
    notify(error instanceof Error ? error.message : 'Unable to parse this table.', 'error', 5000);
  } finally {
    elements.parseButton.disabled = false;
    elements.parseButton.classList.remove('is-loading');
    elements.viewport.setAttribute('aria-busy', 'false');
  }
}

function copyUsingFallback(value) {
  const activeElement = document.activeElement;
  const temporary = document.createElement('textarea');
  temporary.value = value;
  temporary.setAttribute('readonly', '');
  temporary.setAttribute('aria-hidden', 'true');
  temporary.style.position = 'fixed';
  temporary.style.inset = '0 auto auto -10000px';
  temporary.style.opacity = '0';
  document.body.append(temporary);
  temporary.focus({ preventScroll: true });
  temporary.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  temporary.remove();
  if (activeElement instanceof HTMLElement) activeElement.focus({ preventScroll: true });
  return copied;
}

async function copyOutput() {
  const value = elements.output.value;
  if (!value) {
    notify('Nothing to copy yet.', 'warning');
    return;
  }

  let copied = false;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    copied = true;
  } catch {
    copied = copyUsingFallback(value);
  }

  elements.copyButton.classList.toggle('is-success', copied);
  window.setTimeout(() => elements.copyButton.classList.remove('is-success'), 1400);
  notify(copied ? 'Output copied to clipboard.' : 'Could not copy output. Select the output and copy it manually.', copied ? 'success' : 'error', 4500);
}

function clearAll() {
  const hasContent = Boolean(elements.source.value.trim() || !editor.isEmpty || elements.output.value.trim());
  if (hasContent && !window.confirm('Are you sure you want to clear everything?')) return;

  window.clearTimeout(ui.parseTimer);
  elements.source.value = '';
  editor.clear();
  elements.outputFormat.value = OUTPUT_FORMAT.MARKDOWN;
  ui.outputFormat = OUTPUT_FORMAT.MARKDOWN;
  elements.analysisSection.open = false;
  ui.pendingInlineEdits.clear();
  renderTable();
  notify('All cleared.');
}

function toggleReorderMode() {
  if (editor.isEmpty) {
    notify('Create or import a table before reordering.', 'warning');
    return;
  }
  editor.reorderMode = !editor.reorderMode;
  renderTable({ focus: editor.reorderMode ? { type: 'column', index: 0 } : undefined });
  notify(editor.reorderMode ? 'Reorder mode on. Drag a row or column header to move it.' : 'Reorder mode off.');
}

function runTableAction(action, { message, failure, requiresNoReorder = true } = {}) {
  if (requiresNoReorder && editor.reorderMode) {
    notify('Finish reorder mode before editing the table.', 'warning');
    return;
  }
  if (action()) refreshAfterMutation(message);
  else if (failure) notify(failure, 'warning');
}

function undoHistory() {
  if (document.activeElement instanceof HTMLElement) commitInlineEdit(document.activeElement);
  if (editor.undo()) {
    editor.reorderMode = false;
    renderTable();
    notify('Undone.', 'info');
  } else {
    notify('Nothing to undo.', 'warning');
  }
}

function redoHistory() {
  if (document.activeElement instanceof HTMLElement) commitInlineEdit(document.activeElement);
  if (editor.redo()) {
    editor.reorderMode = false;
    renderTable();
    notify('Redone.', 'info');
  } else {
    notify('Nothing to redo.', 'warning');
  }
}

function clearDropTargets() {
  elements.tableHost.querySelectorAll('.drop-before, .drop-after').forEach((node) => {
    node.classList.remove('drop-before', 'drop-after');
  });
  elements.viewport.classList.remove('is-dragging');
}

function validDragTarget(element, type) {
  if (!element || !elements.tableHost.contains(element)) return null;
  if (Number(element.dataset.renderVersion) !== ui.renderVersion) return null;
  if (type === 'row' && !element.matches('tbody tr')) return null;
  if (type === 'column' && !element.matches('thead th')) return null;
  return element;
}

function onDragStart(event) {
  if (!editor.reorderMode) return;
  const source = event.target instanceof Element
    ? event.target.closest('thead th, tbody tr')
    : null;
  if (!source || !elements.tableHost.contains(source)) return;

  const type = source.matches('thead th') ? 'column' : 'row';
  const index = readIndex(source, type === 'row' ? 'rowIndex' : 'columnIndex', type === 'row' ? editor.state.rows.length : editor.state.headers.length);
  if (index < 0) return;

  ui.activeDrag = { source, type, index, version: ui.renderVersion, dropAfter: false };
  source.classList.add('dragging');
  elements.viewport.classList.add('is-dragging');
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${type}:${index}`);
  }
}

function onDragOver(event) {
  const active = ui.activeDrag;
  if (!active || active.version !== ui.renderVersion) return;
  const selector = active.type === 'row' ? 'tbody tr' : 'thead th';
  const target = event.target instanceof Element ? validDragTarget(event.target.closest(selector), active.type) : null;
  if (!target || target === active.source) return;

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  clearDropTargets();
  elements.viewport.classList.add('is-dragging');
  const bounds = target.getBoundingClientRect();
  // Drag APIs and device pixel rounding can put a pointer fractionally above the true midpoint.
  active.dropAfter = active.type === 'row'
    ? event.clientY >= bounds.top + bounds.height / 2 - 2
    : event.clientX >= bounds.left + bounds.width / 2 - 2;
  target.classList.add(active.dropAfter ? 'drop-after' : 'drop-before');
  active.target = target;
}

function onDrop(event) {
  const active = ui.activeDrag;
  if (!active || active.version !== ui.renderVersion) return;
  const selector = active.type === 'row' ? 'tbody tr' : 'thead th';
  const target = event.target instanceof Element ? validDragTarget(event.target.closest(selector), active.type) : null;
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();
  const key = active.type === 'row' ? 'rowIndex' : 'columnIndex';
  const count = active.type === 'row' ? editor.state.rows.length : editor.state.headers.length;
  const fromIndex = readIndex(active.source, key, count);
  const targetIndex = readIndex(target, key, count);
  let changed = false;

  if (fromIndex >= 0 && targetIndex >= 0 && fromIndex !== targetIndex) {
    const bounds = target.getBoundingClientRect();
    const dropAfter = active.type === 'row'
      ? event.clientY >= bounds.top + bounds.height / 2 - 2
      : event.clientX >= bounds.left + bounds.width / 2 - 2;
    let insertionIndex = targetIndex + (dropAfter ? 1 : 0);
    if (fromIndex < insertionIndex) insertionIndex -= 1;
    const toIndex = Math.max(0, Math.min(count - 1, insertionIndex));
    changed = active.type === 'row'
      ? editor.moveRow(fromIndex, toIndex)
      : editor.moveColumn(fromIndex, toIndex);
    if (changed) {
      const pending = {
        focus: { type: active.type, index: toIndex },
        message: active.type === 'row' ? 'Row reordered.' : 'Column reordered.',
      };
      ui.pendingDragRender = pending;
      // Keep the dragged node attached until the browser emits its native dragend event.
      window.setTimeout(() => {
        if (ui.pendingDragRender === pending) finishDrag(pending);
      }, 250);
    }
  }

  clearDropTargets();
}

function finishDrag(pending = null) {
  ui.pendingDragRender = null;
  ui.activeDrag = null;
  if (pending) {
    renderTable({ focus: pending.focus });
    notify(pending.message);
  }
}

function onDragEnd(event) {
  if (event.target instanceof Element) event.target.closest('thead th, tbody tr')?.classList.remove('dragging');
  clearDropTargets();
  finishDrag(ui.pendingDragRender);
}

function onTableKeydown(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;

  if (target.dataset.editable && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    commitInlineEdit(target);
    target.blur();
    return;
  }
  if (target.dataset.editable && event.key === 'Escape') {
    event.preventDefault();
    restoreInlineEdit(target);
    target.blur();
    notify('Edit canceled.', 'info');
    return;
  }

  if (!editor.reorderMode || !event.altKey) return;
  const header = target.closest('thead th');
  if (header && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const fromIndex = readIndex(header, 'columnIndex', editor.state.headers.length);
    const toIndex = fromIndex + (event.key === 'ArrowLeft' ? -1 : 1);
    if (fromIndex >= 0 && editor.moveColumn(fromIndex, toIndex)) {
      event.preventDefault();
      renderTable({ focus: { type: 'column', index: toIndex } });
      notify('Column reordered.');
    }
    return;
  }

  const row = target.closest('tbody tr');
  if (row && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    const fromIndex = readIndex(row, 'rowIndex', editor.state.rows.length);
    const toIndex = fromIndex + (event.key === 'ArrowUp' ? -1 : 1);
    if (fromIndex >= 0 && editor.moveRow(fromIndex, toIndex)) {
      event.preventDefault();
      renderTable({ focus: { type: 'row', index: toIndex } });
      notify('Row reordered.');
    }
  }
}

function bindEvents() {
  elements.themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  elements.undoButton.addEventListener('click', undoHistory);
  elements.redoButton.addEventListener('click', redoHistory);
  elements.parseButton.addEventListener('click', parseSource);
  elements.clearButton.addEventListener('click', clearAll);
  elements.copyButton.addEventListener('click', copyOutput);
  elements.source.addEventListener('input', scheduleAutomaticParse);
  elements.outputFormat.addEventListener('change', (event) => {
    ui.outputFormat = Object.values(OUTPUT_FORMAT).includes(event.target.value)
      ? event.target.value
      : OUTPUT_FORMAT.MARKDOWN;
    updateDerivedOutput();
  });
  elements.analyzeButton.addEventListener('click', () => {
    elements.analysisSection.open = true;
    updateDerivedOutput();
    if (!editor.isValid || editor.state.rows.length === 0) notify('Add or import data to analyze.', 'warning');
    else notify('Analysis updated.', 'success');
  });
  elements.sortButton.addEventListener('click', () => {
    if (editor.reorderMode) return notify('Finish reorder mode before sorting.', 'warning');
    runTableAction(() => editor.sortRows(), {
      message: 'Rows sorted alphabetically by the first column.',
      failure: 'Add at least two rows before sorting.',
    });
  });
  elements.reorderButton.addEventListener('click', toggleReorderMode);
  elements.addColumnButton.addEventListener('click', () => {
    runTableAction(() => editor.addColumn(), { message: 'Column added.' });
  });
  elements.addRowButton.addEventListener('click', () => {
    runTableAction(() => editor.addRow(), {
      message: 'Row added.',
      failure: 'Add a header before adding a row.',
    });
  });
  elements.removeColumnButton.addEventListener('click', () => {
    runTableAction(() => editor.removeColumn(), {
      message: 'Last column removed.',
      failure: 'A table must keep at least one column.',
    });
  });
  elements.removeRowButton.addEventListener('click', () => {
    runTableAction(() => editor.removeRow(), {
      message: 'Last row removed.',
      failure: 'There are no rows to remove.',
    });
  });

  elements.viewport.addEventListener('input', (event) => {
    const element = event.target instanceof HTMLElement ? event.target.closest('[data-editable]') : null;
    if (element) ui.pendingInlineEdits.add(element);
  });
  elements.viewport.addEventListener('focusout', (event) => {
    const element = event.target instanceof HTMLElement ? event.target.closest('[data-editable]') : null;
    if (element) commitInlineEdit(element);
  });
  elements.viewport.addEventListener('keydown', onTableKeydown);
  elements.viewport.addEventListener('dragstart', onDragStart);
  elements.viewport.addEventListener('dragover', onDragOver);
  elements.viewport.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onDragEnd);

  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const focusedSource = document.activeElement === elements.source;

    if (key === 'z' && !event.shiftKey && !focusedSource) {
      event.preventDefault();
      undoHistory();
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      if (focusedSource) return;
      event.preventDefault();
      redoHistory();
    } else if (key === 'enter') {
      event.preventDefault();
      parseSource();
    } else if (key === 'c' && event.shiftKey) {
      event.preventDefault();
      copyOutput();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!editor.isEmpty || ui.pendingInlineEdits.size > 0) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      notify('Offline caching could not be enabled in this browser.', 'warning', 5000);
    });
  }, { once: true });
}

bindEvents();
renderTable();
registerServiceWorker();
