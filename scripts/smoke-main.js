// Runtime smoke check for src/main.js inside happy-dom. Not part of the test
// suite; run with: bun scripts/smoke-main.js
import { Window } from 'happy-dom';

const window = new Window({ url: 'https://tabmd.local/' });
const { document } = window;

// Minimal globals so main.js can initialize.
for (const key of ['document', 'window', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'getSelection', 'DOMParser', 'navigator', 'localStorage', 'customElements', 'MutationObserver']) {
  if (!(key in globalThis) && key in window) globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.document = document;

const errors = [];
window.addEventListener('error', (event) => errors.push(String(event.message || event.error)));

// Build the static markup from index.html (script/style ignored).
const html = await Bun.file(new URL('../index.html', import.meta.url)).text();
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<link[\s\S]*?>/g, '');
document.body.innerHTML = body;

await import('../src/main.js');

const assert = (condition, label) => {
  if (condition) console.log(`ok - ${label}`);
  else {
    console.error(`FAIL - ${label}`);
    process.exitCode = 1;
  }
};

const $ = (selector) => document.querySelector(selector);

// --- Icon placeholders are replaced by real SVGs.
assert(document.querySelectorAll('i[data-lucide]').length === 0, 'all icon placeholders rendered');
assert(document.querySelectorAll('svg.lucide').length === 0, 'no lucide runtime classes needed');
assert(document.querySelectorAll('.button svg, .icon-button svg').length > 5, 'buttons carry inline SVG icons');
assert(document.querySelector('.mini-icon')?.tagName?.toLowerCase() === 'svg', 'badge icons keep their classes');

// --- Initial render: empty state visible.
assert(!$('#emptyState').hidden, 'empty state visible before data');
assert($('#tableHost').hidden, 'table host hidden before data');
assert($('#tableStatus').textContent === 'No table loaded', 'status reads "No table loaded"');

// --- Import a Markdown table.
$('#input').value = '| Name | Done |\n| :--- | :---: |\n| Ada | yes |\n| Lin | no |';
$('#parseBtn').click();
await new Promise((resolve) => window.setTimeout(resolve, 30));

assert($('#emptyState').hidden, 'empty state hides after import');
assert(!$('#tableHost').hidden, 'table host shows after import');
assert(document.querySelectorAll('.data-table tbody tr').length === 2, 'two body rows rendered');
assert(document.querySelectorAll('.data-table .gutter-cell').length === 3, 'gutter cells rendered (head + rows)');
assert(document.querySelectorAll('.data-table .cell-text[contenteditable="true"]').length === 6, 'editable spans for 2 headers + 4 cells');
assert(/2 rows × 2 columns · 4 cells · Markdown/.test($('#tableStatus').textContent), `status line: ${$('#tableStatus').textContent}`);

// --- Analysis shows one copyable Markdown total row (one ✅ = 1).
assert($('#analysisOutput').textContent === '| **Total** = 2 | **1/2** |', `analysis row: ${$('#analysisOutput').textContent}`);
assert(!$('#analysisOutput').closest('.analysis-row-bar').hidden, 'analysis row bar visible');
assert(!$('#copyAnalysisBtn').disabled, 'analysis copy button enabled');

// --- Inline edit commits.
const firstCell = document.querySelector('.data-table tbody td[data-column-index="0"] .cell-text');
firstCell.textContent = 'Grace';
firstCell.dispatchEvent(new window.Event('input', { bubbles: true }));
firstCell.blur();
// focusout handler commits.
firstCell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
assert(/Grace/.test($('#output').value), 'inline edit committed to output');

// --- Undo restores.
$('#undoBtn').click();
assert(/Ada/.test($('#output').value), 'undo restored previous value');
$('#redoBtn').click();
assert(/Grace/.test($('#output').value), 'redo reapplied edit');

// --- Context menu: column scope.
const headerTrigger = document.querySelector('.data-table thead th[data-column-index="1"] .context-trigger');
headerTrigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
assert(!$('#contextMenu').hidden, 'context menu opens from header trigger');
assert($('#contextMenu').getAttribute('aria-label') === 'Column actions', 'menu labelled for column');
const visibleItems = [...document.querySelectorAll('#contextMenu .context-item')].filter((item) => !item.hidden);
assert(visibleItems.length === 4, `column menu shows 4 items (got ${visibleItems.length})`);
assert([...document.querySelectorAll('#contextMenu .context-item[data-scope="row"]')].every((item) => item.hidden), 'row items hidden in column menu');
$('#contextMenu').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert($('#contextMenu').hidden, 'Escape closes context menu');

// --- Context menu: row scope + delete.
const rowTrigger = document.querySelector('.data-table tbody tr[data-row-index="1"] .gutter-cell .context-trigger');
rowTrigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
assert($('#contextMenu').getAttribute('aria-label') === 'Row actions', 'menu labelled for row');
const deleteRow = document.querySelector('#contextMenu [data-action="delete"][data-scope="row"]');
deleteRow.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
assert(document.querySelectorAll('.data-table tbody tr').length === 1, 'row deleted from table');
assert(/1 row × 2 columns/.test($('#tableStatus').textContent), `status after delete: ${$('#tableStatus').textContent}`);

// --- Add column dialog + live match hint (names match the first column).
$('#addColumnBtn').click();
assert($('#columnDialog').open ?? true, 'column dialog opens');
$('#columnMembers').value = 'Grace, Nobody';
$('#columnMembers').dispatchEvent(new window.Event('input', { bubbles: true }));
assert(/1 of 1 rows? matched/.test($('#columnMatchHint').textContent), `match hint: ${$('#columnMatchHint').textContent}`);
assert(/not found: Nobody/.test($('#columnMatchHint').textContent), `unmatched named in hint: ${$('#columnMatchHint').textContent}`);
$('#columnCreateRows').checked = true;
$('#columnCreateRows').dispatchEvent(new window.Event('change', { bubbles: true }));
assert(/1 row will be created/.test($('#columnMatchHint').textContent), `created hint: ${$('#columnMatchHint').textContent}`);

// Confirm the dialog the way the form does.
$('#columnDialog').close('confirm');
await new Promise((resolve) => window.setTimeout(resolve, 10));
assert(document.querySelectorAll('.data-table thead th[data-column-index]').length === 3, 'column added via dialog');
assert(/Column "New Column" added/.test($('#notification').textContent), `notify: ${$('#notification').textContent}`);
assert(/✓/.test($('#notification').textContent) || $('#notification .notification-icon'), 'success notification carries check icon');

// --- Move column left from the menu.
const headerTrigger2 = document.querySelector('.data-table thead th[data-column-index="1"] .context-trigger');
headerTrigger2.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const moveLeft = document.querySelector('#contextMenu [data-action="move-prev"][data-scope="column"]');
moveLeft.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
assert($('#contextMenu').hidden, 'menu closes after action');
assert($('#output').value.split('\n')[0] === '| Done | Name | New Column |', `column order swapped: ${$('#output').value.split('\n')[0]}`);

// --- Analysis + output format switch updates status.
$('#outputFormat').value = 'json';
$('#outputFormat').dispatchEvent(new window.Event('change', { bubbles: true }));
assert(/JSON/.test($('#tableStatus').textContent), `status shows format: ${$('#tableStatus').textContent}`);
assert(/^\{/.test($('#output').value), 'JSON output generated');

// --- Clear all returns to empty state.
window.confirm = () => true;
$('#clearBtn').click();
assert(!$('#emptyState').hidden, 'empty state returns after clear');
assert($('#tableStatus').textContent === 'No table loaded', 'status resets');
assert($('#analysisOutput').textContent === '', 'analysis row cleared');
assert($('#analysisOutput').closest('.analysis-row-bar').hidden, 'analysis row bar hidden when empty');

assert(errors.length === 0, `no runtime errors (${errors.join('; ') || 'none'})`);
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
