import './ui.css';
import {
  createIcons,
  createElement as createIconElement,
  Activity,
  ArrowDownAZ,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Copy,
  GripVertical,
  Import,
  Minus,
  Moon,
  MoreVertical,
  Pencil,
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
  matchRowKey,
  normalizeCheckValue,
  parseTable,
  splitMemberList,
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
  contextMenu: { trigger: null, scope: null, index: -1, focusTarget: null },
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
  copyAnalysisButton: document.querySelector('#copyAnalysisBtn'),
  viewport: document.querySelector('#tableViewport'),
  emptyState: document.querySelector('#emptyState'),
  emptyImportButton: document.querySelector('#emptyImportBtn'),
  tableHost: document.querySelector('#tableHost'),
  tableStatus: document.querySelector('#tableStatus'),
  notification: document.querySelector('#notification'),
  contextMenu: document.querySelector('#contextMenu'),
  columnDialog: document.querySelector('#columnDialog'),
  columnName: document.querySelector('#columnName'),
  columnMembers: document.querySelector('#columnMembers'),
  columnMatchHint: document.querySelector('#columnMatchHint'),
  columnMarked: document.querySelector('#columnMarked'),
  columnUnmarked: document.querySelector('#columnUnmarked'),
  columnCreateRows: document.querySelector('#columnCreateRows'),
  columnCancelButton: document.querySelector('#columnCancelBtn'),
};

const iconSet = {
  Activity,
  ArrowDownAZ,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Copy,
  GripVertical,
  Import,
  Minus,
  Moon,
  MoreVertical,
  Pencil,
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
  elements.notification.replaceChildren();
  if (type === 'success') {
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✓';
    elements.notification.append(icon);
  }
  elements.notification.append(document.createTextNode(message));
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

function renderAnalysis() {
  // One copyable Markdown row to paste at the end of the table:
  // | **Total** = N | **checked/N** | ... |   (one ✅ counts as 1)
  const row = analyzeTable(editor.state);
  elements.analysisOutput.textContent = row;
  const bar = elements.analysisOutput.closest('.analysis-row-bar');
  if (bar) bar.hidden = !row;
  elements.copyAnalysisButton.disabled = !row;
}

function updateDerivedOutput() {
  elements.output.value = editor.isValid ? formatTable(editor.state, ui.outputFormat) : '';
  renderAnalysis();

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

const formatLabels = {
  [OUTPUT_FORMAT.MARKDOWN]: 'Markdown',
  [OUTPUT_FORMAT.JSON]: 'JSON',
  [OUTPUT_FORMAT.HTML]: 'HTML',
};

function updateTableMeta() {
  const { headers, rows } = editor.state;
  if (!editor.isValid) {
    elements.tableStatus.textContent = 'No table loaded';
    return;
  }

  const rowCount = rows.length;
  const columnCount = headers.length;
  elements.tableStatus.textContent = [
    `${rowCount} ${rowCount === 1 ? 'row' : 'rows'} × ${columnCount} ${columnCount === 1 ? 'column' : 'columns'}`,
    `${rowCount * columnCount} ${rowCount * columnCount === 1 ? 'cell' : 'cells'}`,
    formatLabels[ui.outputFormat] || 'Markdown',
  ].join(' · ');
}

function cellText(element) {
  return element?.querySelector('.cell-text');
}

function setCellText(element, value) {
  const text = cellText(element);
  if (text) text.textContent = value;
}

function createMenuTrigger(scope) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'context-trigger';
  button.dataset.menuTrigger = scope;
  button.tabIndex = -1;
  button.contentEditable = 'false';
  button.draggable = false;
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-label', scope === 'column' ? 'Column actions' : 'Row actions');
  button.append(createIconElement(MoreVertical, {
    width: 14,
    height: 14,
    'aria-hidden': 'true',
    'stroke-width': 1.8,
  }));
  return button;
}

function createGutterCell(scope) {
  const cell = document.createElement(scope ? 'td' : 'th');
  cell.className = 'gutter-cell';
  cell.setAttribute('aria-hidden', 'true');
  if (scope) cell.append(createMenuTrigger(scope));
  return cell;
}

function createEditableCell({ value, field, rowIndex, columnIndex, version, label, alignment }) {
  const cell = document.createElement(field === 'header' ? 'th' : 'td');
  cell.dataset.renderVersion = String(version);
  cell.dataset.columnIndex = String(columnIndex);
  cell.dataset.editable = field;

  const text = document.createElement('span');
  text.className = 'cell-text';
  text.contentEditable = String(!editor.reorderMode);
  text.tabIndex = 0;
  text.spellcheck = false;
  text.textContent = value;
  text.setAttribute('aria-label', label);
  cell.append(text);

  if (field === 'header') {
    cell.scope = 'col';
    cell.tabIndex = -1;
    cell.draggable = editor.reorderMode;
    if (editor.reorderMode) {
      cell.setAttribute('aria-label', `Column ${columnIndex + 1}: ${value}. Drag to reorder, or press Alt plus Left or Right.`);
    }
    cell.append(createMenuTrigger('column'));
  } else {
    cell.dataset.rowIndex = String(rowIndex);
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
  headerRow.append(createGutterCell());
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
    tableRow.append(createGutterCell('row'));

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
  syncCellContext();

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
  const cell = element instanceof HTMLElement ? element.closest('[data-editable]') : null;
  if (!(cell instanceof HTMLElement)) return false;
  const version = Number(cell.dataset.renderVersion);
  if (version !== ui.renderVersion) {
    ui.pendingInlineEdits.delete(cell);
    return false;
  }

  const columnIndex = readIndex(cell, 'columnIndex', editor.state.headers.length);
  const value = () => cellText(cell)?.textContent || '';
  let changed = false;
  if (cell.dataset.editable === 'header' && columnIndex >= 0) {
    changed = editor.editHeader(columnIndex, value());
    setCellText(cell, editor.state.headers[columnIndex]);
  } else if (cell.dataset.editable === 'cell') {
    const row = cell.closest('tbody tr');
    const rowIndex = readIndex(row, 'rowIndex', editor.state.rows.length);
    if (rowIndex >= 0 && columnIndex >= 0) {
      changed = editor.editCell(rowIndex, columnIndex, value());
      setCellText(cell, editor.state.rows[rowIndex][columnIndex]);
    }
  }

  ui.pendingInlineEdits.delete(cell);
  if (changed) {
    if (cell.dataset.editable === 'header') {
      const header = editor.state.headers[columnIndex] || `column ${columnIndex + 1}`;
      cellText(cell)?.setAttribute('aria-label', `Edit header ${columnIndex + 1}: ${header}`);
      elements.tableHost.querySelectorAll('tbody tr').forEach((row, rowIndex) => {
        cellText(row.querySelector(`[data-column-index="${columnIndex}"]`))
          ?.setAttribute('aria-label', `Edit row ${rowIndex + 1}, ${header}`);
      });
    }
    updateDerivedOutput();
    updateTableMeta();
    syncHistoryButtons();
  }
  return changed;
}

function restoreInlineEdit(element) {
  const cell = element instanceof HTMLElement ? element.closest('[data-editable]') : null;
  if (!(cell instanceof HTMLElement)) return;
  const columnIndex = readIndex(cell, 'columnIndex', editor.state.headers.length);
  if (columnIndex < 0) return;
  if (cell.dataset.editable === 'header') {
    setCellText(cell, editor.state.headers[columnIndex]);
  } else {
    const row = cell.closest('tbody tr');
    const rowIndex = readIndex(row, 'rowIndex', editor.state.rows.length);
    if (rowIndex >= 0) setCellText(cell, editor.state.rows[rowIndex][columnIndex]);
  }
  ui.pendingInlineEdits.delete(cell);
}

function syncCellContext() {
  elements.tableHost.querySelectorAll('.is-col-active, .is-row-active').forEach((node) => {
    node.classList.remove('is-col-active', 'is-row-active');
  });
  const active = document.activeElement;
  const cell = active instanceof HTMLElement && elements.tableHost.contains(active)
    ? active.closest('[data-editable]')
    : null;
  if (!cell) return;

  cell.closest('tr')?.classList.add('is-row-active');
  const columnIndex = cell.dataset.columnIndex;
  if (columnIndex === undefined) return;
  elements.tableHost.querySelectorAll(`[data-column-index="${columnIndex}"]`).forEach((node) => {
    node.classList.add('is-col-active');
  });
}

function contextMenuItems() {
  return Array.from(elements.contextMenu.querySelectorAll('.context-item'));
}

function closeContextMenu({ restoreFocus = false } = {}) {
  if (elements.contextMenu.hidden) return;
  elements.contextMenu.hidden = true;
  const { trigger, focusTarget } = ui.contextMenu;
  if (trigger instanceof HTMLElement) {
    trigger.classList.remove('is-menu-anchor');
    trigger.closest('tr, th')?.classList.remove('is-menu-anchor');
  }
  ui.contextMenu = { trigger: null, scope: null, index: -1, focusTarget: null };
  if (restoreFocus && focusTarget instanceof HTMLElement) {
    focusTarget.focus({ preventScroll: true });
  }
}

function positionContextMenu(anchor) {
  const menu = elements.contextMenu;
  const anchorRect = (anchor instanceof HTMLElement ? anchor : elements.viewport).getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - menuRect.width - margin));
  let top = anchorRect.bottom + 4;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = Math.max(margin, anchorRect.top - menuRect.height - 4);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function openContextMenu(scope, index, anchor) {
  const count = scope === 'row' ? editor.state.rows.length : editor.state.headers.length;
  if (!(anchor instanceof HTMLElement)) return;
  if (!Number.isInteger(index) || index < 0 || index >= count) return;

  const activeElement = document.activeElement;
  const focusTarget = activeElement instanceof HTMLElement && elements.tableHost.contains(activeElement)
    ? activeElement
    : (cellText(anchor) || anchor);

  closeContextMenu();
  ui.contextMenu = { trigger: anchor, scope, index, focusTarget };
  anchor.classList.add('is-menu-anchor');
  anchor.closest('tr, th')?.classList.add('is-menu-anchor');
  elements.contextMenu.setAttribute('aria-label', scope === 'row' ? 'Row actions' : 'Column actions');

  contextMenuItems().forEach((item) => {
    item.hidden = item.dataset.scope !== scope;
    item.disabled = false;
  });
  const prev = elements.contextMenu.querySelector(`[data-action="move-prev"][data-scope="${scope}"]`);
  const next = elements.contextMenu.querySelector(`[data-action="move-next"][data-scope="${scope}"]`);
  const remove = elements.contextMenu.querySelector(`[data-action="delete"][data-scope="${scope}"]`);
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= count - 1;
  if (remove) remove.disabled = scope === 'column' && count <= 1;

  elements.contextMenu.hidden = false;
  positionContextMenu(anchor);
  contextMenuItems().find((item) => !item.hidden && !item.disabled)?.focus({ preventScroll: true });
}

function openContextMenuForCell(cell, trigger = null) {
  const resolved = cell instanceof HTMLElement ? cell.closest('thead th[data-column-index], tbody tr') : null;
  if (!resolved || !elements.tableHost.contains(resolved)) return;

  if (resolved.matches('thead th')) {
    openContextMenu('column', readIndex(resolved, 'columnIndex', editor.state.headers.length), trigger || resolved);
    return;
  }
  const cellInRow = trigger ? null : (cell.closest('[data-editable]') || resolved);
  openContextMenu('row', readIndex(resolved, 'rowIndex', editor.state.rows.length), trigger || cellInRow);
}

function runContextAction(item) {
  const { scope, index } = ui.contextMenu;
  const action = item.dataset.action;
  if (document.activeElement instanceof HTMLElement) commitInlineEdit(document.activeElement);

  if (action === 'rename') {
    closeContextMenu();
    const text = cellText(elements.tableHost.querySelector(`thead th[data-column-index="${index}"]`));
    if (text) {
      text.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    return;
  }

  if (action === 'move-prev' || action === 'move-next') {
    const direction = action === 'move-prev' ? -1 : 1;
    const toIndex = index + direction;
    closeContextMenu();
    if (editor.reorderMode) {
      notify('Finish reorder mode before editing the table.', 'warning');
      return;
    }
    const moved = scope === 'row'
      ? editor.moveRow(index, toIndex)
      : editor.moveColumn(index, toIndex);
    if (moved) {
      renderTable({ focus: { type: scope, index: toIndex } });
      const destinations = scope === 'row' ? ['up', 'down'] : ['left', 'right'];
      notify(`${scope === 'row' ? 'Row' : 'Column'} moved ${destinations[direction > 0 ? 1 : 0]}.`);
    } else {
      notify('That move is not available.', 'warning');
    }
    return;
  }

  if (action === 'delete') {
    closeContextMenu();
    if (editor.reorderMode) {
      notify('Finish reorder mode before editing the table.', 'warning');
      return;
    }
    const removed = scope === 'row' ? editor.removeRow(index) : editor.removeColumn(index);
    if (removed) {
      renderTable();
      notify(`${scope === 'row' ? 'Row' : 'Column'} removed.`);
    } else {
      notify(scope === 'row' ? 'There are no rows to remove.' : 'A table must keep at least one column.', 'warning');
    }
  }
}

function onContextMenuKeydown(event) {
  const items = contextMenuItems().filter((item) => !item.hidden && !item.disabled);
  const current = items.indexOf(document.activeElement);

  if (event.key === 'Escape') {
    event.preventDefault();
    closeContextMenu({ restoreFocus: true });
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(current + step + items.length) % items.length]?.focus({ preventScroll: true });
  } else if (event.key === 'Home') {
    event.preventDefault();
    items[0]?.focus({ preventScroll: true });
  } else if (event.key === 'End') {
    event.preventDefault();
    items[items.length - 1]?.focus({ preventScroll: true });
  } else if (event.key === 'Tab') {
    closeContextMenu();
  }
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
    const rowCount = editor.state.rows.length;
    notify(rowCount > 0 ? `Imported ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}.` : 'Table imported.');
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

async function copyText(value) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return copyUsingFallback(value);
  }
}

function flashCopyButton(button, copied) {
  button.classList.toggle('is-success', copied);
  window.setTimeout(() => button.classList.remove('is-success'), 1400);
}

async function copyOutput() {
  const value = elements.output.value;
  if (!value) {
    notify('Nothing to copy yet.', 'warning');
    return;
  }

  const copied = await copyText(value);
  flashCopyButton(elements.copyButton, copied);
  notify(copied ? 'Output copied to clipboard.' : 'Could not copy output. Select the output and copy it manually.', copied ? 'success' : 'error', 4500);
}

async function copyAnalysisRow() {
  const value = elements.analysisOutput.textContent || '';
  if (!value) {
    notify('Add or import data to analyze.', 'warning');
    return;
  }

  const copied = await copyText(value);
  flashCopyButton(elements.copyAnalysisButton, copied);
  notify(copied ? 'Analysis row copied to clipboard.' : 'Could not copy the analysis row.', copied ? 'success' : 'error', 4500);
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

const columnFieldDefaults = {
  name: elements.columnName.value,
  marked: elements.columnMarked.value,
  unmarked: elements.columnUnmarked.value,
  createRows: elements.columnCreateRows.checked,
};

// Live preview of the builder's existing matching rules; the applied column is
// still created by buildCheckColumn via editor.addCheckColumn.
function updateColumnMatchHint() {
  const names = splitMemberList(elements.columnMembers.value);
  const rows = editor.state.rows;
  const createRows = elements.columnCreateRows.checked;

  if (names.length === 0) {
    elements.columnMatchHint.textContent = 'Separate names with commas, semicolons, or new lines.';
    elements.columnMatchHint.classList.remove('is-warning');
    return;
  }

  const wanted = new Set(names.map(matchRowKey));
  const matchedRows = rows.filter((row) => wanted.has(matchRowKey(row[0]))).length;
  const unmatched = [];
  for (const name of names) {
    const key = matchRowKey(name);
    if (!key || unmatched.some((entry) => matchRowKey(entry) === key)) continue;
    if (!rows.some((row) => matchRowKey(row[0]) === key)) unmatched.push(name);
  }

  const parts = [`${matchedRows} of ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} matched`];
  if (unmatched.length > 0) {
    if (createRows) {
      parts.push(`${unmatched.length} ${unmatched.length === 1 ? 'row' : 'rows'} will be created`);
    } else {
      parts.push(`${unmatched.length} ${unmatched.length === 1 ? 'name' : 'names'} not found: ${formatNameList(unmatched)}`);
    }
  }
  elements.columnMatchHint.textContent = parts.join(' · ');
  elements.columnMatchHint.classList.toggle('is-warning', unmatched.length > 0 && !createRows);
}

function openColumnDialog() {
  if (editor.reorderMode) {
    notify('Finish reorder mode before editing the table.', 'warning');
    return;
  }

  elements.columnName.value = columnFieldDefaults.name;
  elements.columnMembers.value = '';
  elements.columnMarked.value = columnFieldDefaults.marked;
  elements.columnUnmarked.value = columnFieldDefaults.unmarked;
  elements.columnCreateRows.checked = columnFieldDefaults.createRows;
  updateColumnMatchHint();
  elements.columnDialog.returnValue = '';
  elements.columnDialog.showModal();
  elements.columnName.select();
}

function formatNameList(names, limit = 3) {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`;
}

function addColumnFromDialog() {
  const header = elements.columnName.value.trim() || columnFieldDefaults.name;
  const result = editor.addCheckColumn(header, {
    members: elements.columnMembers.value,
    marked: elements.columnMarked.value.trim(),
    unmarked: elements.columnUnmarked.value.trim(),
    addMissingRows: elements.columnCreateRows.checked,
  });

  if (!result) {
    notify(`Column "${header}" could not be added.`, 'warning');
    return;
  }

  renderTable();
  const notes = [];
  if (result.created.length > 0) {
    notes.push(`${result.created.length} ${result.created.length === 1 ? 'row' : 'rows'} created`);
  } else if (result.unmatched.length > 0) {
    notes.push(`${result.unmatched.length} ${result.unmatched.length === 1 ? 'name' : 'names'} not found: ${formatNameList(result.unmatched)}`);
  }
  notify(`Column "${header}" added${notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}.`);
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

  const editable = target.closest('[data-editable]');
  if (editable && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    commitInlineEdit(editable);
    cellText(editable)?.blur();
    return;
  }
  if (editable && event.key === 'Escape') {
    event.preventDefault();
    restoreInlineEdit(editable);
    cellText(editable)?.blur();
    notify('Edit canceled.', 'info');
    return;
  }
  if (editable && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
    event.preventDefault();
    openContextMenuForCell(editable, cellText(editable));
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
  elements.copyAnalysisButton.addEventListener('click', copyAnalysisRow);
  elements.source.addEventListener('input', scheduleAutomaticParse);
  elements.outputFormat.addEventListener('change', (event) => {
    ui.outputFormat = Object.values(OUTPUT_FORMAT).includes(event.target.value)
      ? event.target.value
      : OUTPUT_FORMAT.MARKDOWN;
    updateDerivedOutput();
    updateTableMeta();
  });
  elements.analyzeButton.addEventListener('click', () => {
    elements.analysisSection.open = true;
    updateDerivedOutput();
    elements.analysisSection.scrollIntoView({ block: 'nearest' });
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
  elements.addColumnButton.addEventListener('click', openColumnDialog);
  elements.emptyImportButton.addEventListener('click', () => {
    elements.source.focus();
    elements.source.scrollIntoView({ block: 'nearest' });
  });
  elements.columnMembers.addEventListener('input', updateColumnMatchHint);
  elements.columnCreateRows.addEventListener('change', updateColumnMatchHint);
  elements.columnCancelButton.addEventListener('click', () => elements.columnDialog.close());
  elements.columnDialog.addEventListener('close', () => {
    if (elements.columnDialog.returnValue === 'confirm') addColumnFromDialog();
  });
  elements.columnDialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    elements.columnDialog.close('confirm');
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
    queueMicrotask(syncCellContext);
  });
  elements.viewport.addEventListener('focusin', syncCellContext);
  elements.viewport.addEventListener('mousedown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    // Keep the caret and focus state stable when reaching for a contextual trigger.
    if (target?.closest('[data-menu-trigger]')) event.preventDefault();
  });
  elements.viewport.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest('[data-menu-trigger]') : null;
    if (!trigger) return;
    event.preventDefault();
    if (!elements.contextMenu.hidden && ui.contextMenu.trigger === trigger) {
      closeContextMenu();
      return;
    }
    openContextMenuForCell(trigger, trigger);
  });
  elements.viewport.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest('[data-menu-trigger], .gutter-cell');
    if (!anchor || !elements.tableHost.contains(anchor)) return;
    event.preventDefault();
    if (!elements.contextMenu.hidden && ui.contextMenu.trigger === anchor) return;
    openContextMenuForCell(anchor, anchor.closest('[data-menu-trigger]'));
  });
  elements.viewport.addEventListener('keydown', onTableKeydown);
  elements.viewport.addEventListener('dragstart', onDragStart);
  elements.viewport.addEventListener('dragover', onDragOver);
  elements.viewport.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onDragEnd);

  elements.contextMenu.addEventListener('click', (event) => {
    const item = event.target instanceof Element ? event.target.closest('.context-item') : null;
    if (item && !item.disabled) runContextAction(item);
  });
  elements.contextMenu.addEventListener('keydown', onContextMenuKeydown);
  document.addEventListener('pointerdown', (event) => {
    if (elements.contextMenu.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('#contextMenu, [data-menu-trigger], .gutter-cell')) return;
    closeContextMenu();
  });
  window.addEventListener('resize', () => closeContextMenu());
  document.addEventListener('scroll', () => closeContextMenu(), true);

  document.addEventListener('keydown', (event) => {
    if (elements.columnDialog.open) return;
    if (!elements.contextMenu.hidden && event.key === 'Escape') {
      event.preventDefault();
      closeContextMenu({ restoreFocus: true });
      return;
    }
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
