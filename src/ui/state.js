// Shared singletons: the table model and cached DOM references. Leaf module —
// everything else in src/ui/ builds on it.
import { OUTPUT_FORMAT, TableMD } from '../tablemd.js';

export const editor = new TableMD();

export const ui = {
  outputFormat: OUTPUT_FORMAT.MARKDOWN,
  renderVersion: 0,
  activeDrag: null,
  pendingDragRender: null,
  notificationTimer: null,
  parseTimer: null,
  pendingInlineEdits: new Set(),
};

export const elements = {
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
