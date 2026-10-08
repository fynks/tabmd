// The table editor surface: cell rendering, inline editing, focus context,
// drag reordering, and the row/column menu actions.
import { ALIGNMENT } from '../tablemd.js';
import { createIcon, icons } from './icons.js';
import { closeContextMenu, bindContextMenu, menuContext, openContextMenu } from './context-menu.js';
import { syncHistoryButtons, updateDerivedOutput, updateTableMeta } from './derived.js';
import { notify } from './notify.js';
import { editor, elements, ui } from './state.js';

export function cellText(element) {
  return element?.querySelector('.cell-text');
}

export function setCellText(element, value) {
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
  button.append(createIcon(icons['more-vertical'], {
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

export function renderTable({ focus } = {}) {
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

export function refreshAfterMutation(message) {
  renderTable();
  if (message) notify(message);
}

export function readIndex(element, key, count) {
  if (!element || Number(element.dataset.renderVersion) !== ui.renderVersion) return -1;
  const value = Number(element.dataset[key]);
  return Number.isInteger(value) && value >= 0 && value < count ? value : -1;
}

export function commitInlineEdit(element) {
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

export function restoreInlineEdit(element) {
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

export function syncCellContext() {
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

export function openContextMenuForCell(cell, trigger = null) {
  const resolved = cell instanceof HTMLElement ? cell.closest('thead th[data-column-index], tbody tr') : null;
  if (!resolved || !elements.tableHost.contains(resolved)) return;

  if (resolved.matches('thead th')) {
    const count = editor.state.headers.length;
    openContextMenu({
      scope: 'column',
      index: readIndex(resolved, 'columnIndex', count),
      anchor: trigger || resolved,
      count,
      allowDelete: count > 1,
    });
    return;
  }
  const count = editor.state.rows.length;
  const cellInRow = trigger ? null : (cell.closest('[data-editable]') || resolved);
  openContextMenu({
    scope: 'row',
    index: readIndex(resolved, 'rowIndex', count),
    anchor: trigger || cellInRow,
    count,
  });
}

export function runContextAction(item) {
  const { scope, index } = menuContext();
  const action = item.dataset.action;
  if (document.activeElement instanceof HTMLElement) commitInlineEdit(document.activeElement);

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

export function runTableAction(action, { message, failure, requiresNoReorder = true } = {}) {
  if (requiresNoReorder && editor.reorderMode) {
    notify('Finish reorder mode before editing the table.', 'warning');
    return;
  }
  if (action()) refreshAfterMutation(message);
  else if (failure) notify(failure, 'warning');
}

export function toggleReorderMode() {
  if (editor.isEmpty) {
    notify('Create or import a table before reordering.', 'warning');
    return;
  }
  editor.reorderMode = !editor.reorderMode;
  renderTable({ focus: editor.reorderMode ? { type: 'column', index: 0 } : undefined });
  notify(editor.reorderMode ? 'Reorder mode on. Drag a row or column header to move it.' : 'Reorder mode off.');
}

/* ----- drag reordering ----- */

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

export function onTableKeydown(event) {
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

export function bindTableView() {
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
    if (!elements.contextMenu.hidden && menuContext().trigger === trigger) {
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
    if (!elements.contextMenu.hidden && menuContext().trigger === anchor) return;
    openContextMenuForCell(anchor, anchor.closest('[data-menu-trigger]'));
  });
  elements.viewport.addEventListener('keydown', onTableKeydown);
  elements.viewport.addEventListener('dragstart', onDragStart);
  elements.viewport.addEventListener('dragover', onDragOver);
  elements.viewport.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onDragEnd);

  bindContextMenu({ onAction: runContextAction });
}
