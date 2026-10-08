// Everything rendered from the editor state: the output panel, the analysis
// total row, the status line, and the history button states.
import { OUTPUT_FORMAT, analyzeTable, formatTable, normalizeCheckValue } from '../tablemd.js';
import { editor, elements, ui } from './state.js';

const formatLabels = {
  [OUTPUT_FORMAT.MARKDOWN]: 'Markdown',
  [OUTPUT_FORMAT.JSON]: 'JSON',
  [OUTPUT_FORMAT.HTML]: 'HTML',
};

export function renderAnalysis() {
  // One copyable Markdown row to paste at the end of the table:
  // | **Total** = N | **checked/N** | ... |   (one ✅ counts as 1)
  const row = analyzeTable(editor.state);
  elements.analysisOutput.textContent = row;
  const bar = elements.analysisOutput.closest('.analysis-row-bar');
  if (bar) bar.hidden = !row;
  elements.copyAnalysisButton.disabled = !row;
}

export function updateDerivedOutput() {
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

export function updateTableMeta() {
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

export function syncHistoryButtons() {
  elements.undoButton.disabled = !editor.canUndo;
  elements.redoButton.disabled = !editor.canRedo;
}
