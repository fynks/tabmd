// TabMD entry point: wires the UI modules together and owns the app-level
// actions (import, export, history, global shortcuts, service worker).
import './ui.css';
import { renderIcons } from './ui/icons.js';
import { parseTable, OUTPUT_FORMAT } from './tablemd.js';
import { editor, elements, ui } from './ui/state.js';
import { initTheme, setTheme } from './ui/theme.js';
import { notify, copyText, flashCopyButton } from './ui/notify.js';
import { updateDerivedOutput, updateTableMeta } from './ui/derived.js';
import {
  commitInlineEdit,
  renderTable,
  runTableAction,
  toggleReorderMode,
  bindTableView,
} from './ui/table.js';
import { openColumnDialog, bindColumnDialog } from './ui/column-dialog.js';

renderIcons();
initTheme();

/* ----- import / export ----- */

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

/* ----- history ----- */

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

/* ----- wiring ----- */

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
  elements.addRowButton.addEventListener('click', () => {
    runTableAction(() => editor.addRow(), {
      message: 'Row added.',
      failure: 'Add a header before adding a row.',
    });
  });

  document.addEventListener('keydown', (event) => {
    if (elements.columnDialog.open) return;
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

  bindTableView();
  bindColumnDialog();
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
