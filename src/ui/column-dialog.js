// The Add column builder dialog and its live match preview. The column is
// still created by buildCheckColumn via editor.addCheckColumn.
import { matchRowKey, splitMemberList } from '../tablemd.js';
import { notify } from './notify.js';
import { renderTable } from './table.js';
import { editor, elements } from './state.js';

const columnFieldDefaults = {
  name: elements.columnName.value,
  marked: elements.columnMarked.value,
  unmarked: elements.columnUnmarked.value,
  createRows: elements.columnCreateRows.checked,
};

// Live preview of the builder's existing matching rules.
export function updateColumnMatchHint() {
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

export function openColumnDialog() {
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

export function addColumnFromDialog() {
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

export function bindColumnDialog() {
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
}
