(() => {
  'use strict';

  // ========== Constants ==========
  const THEME = Object.freeze({ DARK: 'dark', LIGHT: 'light' });
  const FORMAT = Object.freeze({ MARKDOWN: 'markdown', JSON: 'json', HTML: 'html' });
  const ALIGN = Object.freeze({ CENTER: 'center', RIGHT: 'right', LEFT: 'left' });
  // Markdown alignment tokens (keeping original behavior)
  const MD_ALIGN = Object.freeze({
    [ALIGN.CENTER]: ':---:',
    [ALIGN.RIGHT]: '---:',
    [ALIGN.LEFT]: ':---',
  });
  const NOTICE = Object.freeze({ SUCCESS: 'success', ERROR: 'error', WARNING: 'warning', INFO: 'info' });

  // ========== UI ==========
  const ui = {
    themeToggle: document.getElementById('themeToggle'),
    get sunPath() { return this.themeToggle?.querySelector('.sun'); },
    get moonPath() { return this.themeToggle?.querySelector('.moon'); },

    inputTextArea: document.getElementById('input'),
    outputTextArea: document.getElementById('output'),
    outputFormat: document.getElementById('outputFormat'),

    tableContainer: document.getElementById('tableContainer'),

    analysisSection: document.getElementById('analysisSection'),
    analysisMarkdownOutput: document.getElementById('analysisMarkdownOutput'),

    parseBtn: document.getElementById('parseBtn'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    copyBtn: document.getElementById('copyBtn'),
    clearBtn: document.getElementById('clearBtn'),

    addColumnBtn: document.getElementById('addColumnBtn'),
    addRowBtn: document.getElementById('addRowBtn'),
    sortRowsBtn: document.getElementById('sortRowsBtn'),
    removeColumnBtn: document.getElementById('removeColumnBtn'),
    removeRowBtn: document.getElementById('removeRowBtn'),
    reorderBtn: document.getElementById('reorderBtn'),

    notificationDiv: document.getElementById('notification'),
  };

  // ========== Utils ==========
  const toCell = (val) => {
    if (val == null) return '';
    return String(val).trim();
  };

  const escapeHTML = (value) => {
    if (typeof value !== 'string') return String(value ?? '');
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const debounce = (fn, wait = 300) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  let notifyTimer = 0;
  const notify = (message, type = NOTICE.SUCCESS, duration = 3000) => {
    if (!ui.notificationDiv) return;
    const colors = {
      [NOTICE.SUCCESS]: '#4CAF50',
      [NOTICE.ERROR]: '#dc3545',
      [NOTICE.WARNING]: '#ff9800',
      [NOTICE.INFO]: '#2196F3',
    };
    ui.notificationDiv.textContent = message;
    ui.notificationDiv.style.backgroundColor = colors[type] || colors[NOTICE.SUCCESS];
    ui.notificationDiv.style.display = 'block';
    ui.notificationDiv.setAttribute('aria-live', 'polite');

    clearTimeout(notifyTimer);
    notifyTimer = window.setTimeout(() => {
      ui.notificationDiv.style.display = 'none';
    }, duration);
  };

  const isTruthyYes = (value) => {
    const t = (value ?? '').toString().trim();
    const r = t.toLowerCase();
    return (
      r === 'yes' ||
      r === 'true' ||
      r === '1' ||
      r === 'y' ||
      t === '✅' ||
      t === '✔️' ||
      t === '✔' ||
      t === '✓'
    );
  };

  const moveInArray = (arr, from, to) => {
    if (!arr || from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
  };

  // ========== Theme ==========
  const Theme = {
    toggle() {
      const next = document.documentElement.getAttribute('data-theme') === THEME.DARK ? THEME.LIGHT : THEME.DARK;
      this.set(next);
    },
    set(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem('theme', theme);
      } catch (_) {}
      this.updateIcons(theme);
    },
    updateIcons(theme) {
      if (!ui.sunPath || !ui.moonPath) return;
      const isDark = theme === THEME.DARK;
      ui.sunPath.style.display = isDark ? 'block' : 'none';
      ui.moonPath.style.display = isDark ? 'none' : 'block';
    },
    init() {
      let theme = THEME.LIGHT;
      try {
        theme =
          localStorage.getItem('theme') ||
          (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME.DARK : THEME.LIGHT);
      } catch (_) {
        // fallback
      }
      this.set(theme);
    },
  };

  // ========== State with History ==========
  class TableState {
    constructor() {
      this.reset();
    }

    reset() {
      this.headers = [];
      this.rows = [];
      this.alignments = [];
      this.isReorderMode = false;
      this.outputFormat = FORMAT.MARKDOWN;
      this.history = [];
      this.historyIndex = -1;
    }

    isEmpty() {
      return this.headers.length === 0 && this.rows.length === 0;
    }

    isValid() {
      return this.headers.length > 0 && this.alignments.length === this.headers.length;
    }

    saveToHistory() {
      const snapshot = {
        headers: [...this.headers],
        rows: this.rows.map((r) => [...r]),
        alignments: [...this.alignments],
      };
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(snapshot);
      this.historyIndex++;
      if (this.history.length > 50) {
        this.history.shift();
        this.historyIndex--;
      }
    }

    undo() {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        const snap = this.history[this.historyIndex];
        this.headers = [...snap.headers];
        this.rows = snap.rows.map((r) => [...r]);
        this.alignments = [...snap.alignments];
        return true;
      }
      return false;
    }

    redo() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        const snap = this.history[this.historyIndex];
        this.headers = [...snap.headers];
        this.rows = snap.rows.map((r) => [...r]);
        this.alignments = [...snap.alignments];
        return true;
      }
      return false;
    }
  }
  const state = new TableState();

  // ========== Parser ==========
  const Parser = {
    parse(input) {
      const raw = (input || '').trim();
      if (!raw) throw new Error('Please enter a markdown or HTML table');

      if (this.detectHTMLTable(raw)) return this.parseHTML(raw);
      if (this.detectMarkdownTable(raw)) return this.parseMarkdown(raw);

      throw new Error('Input does not appear to be a valid HTML or Markdown table');
    },

    detectHTMLTable(str) {
      // Robust HTML table detection
      const re = /<table\b[\s\S]*?>[\s\S]*?<\/table>/i;
      return re.test(str);
    },

    detectMarkdownTable(str) {
      const lines = str.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return false;

      const hasPipes = lines.some((l) => l.includes('|'));
      const alignmentRow = lines.some((l) => /(^|\|)\s*:?-{3,}:?\s*(\||$)/.test(l));
      return hasPipes && alignmentRow;
    },

    parseRow(line) {
      // Simple pipe-split; note: does not support escaped pipes
      const parts = line.split('|').map((s) => s.trim());
      // Remove leading/trailing empty segments caused by edge pipes
      if (parts[0] === '') parts.shift();
      if (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts;
    },

    parseMarkdown(str) {
      const lines = str.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('Markdown table must have at least a header and separator row');

      const headers = this.parseRow(lines[0]);
      const sep = this.parseRow(lines[1]);
      if (headers.length !== sep.length) throw new Error('Header and separator row must have the same number of columns');

      const alignments = sep.map((cell) => {
        const t = cell.trim();
        if (t.startsWith(':') && t.endsWith(':')) return ALIGN.CENTER;
        if (t.endsWith(':')) return ALIGN.RIGHT;
        return ALIGN.LEFT;
      });

      const rows = lines.slice(2).map((line) => {
        const row = this.parseRow(line);
        // Normalize row length
        if (row.length > headers.length) row.splice(headers.length);
        while (row.length < headers.length) row.push('');
        return row;
      });

      return {
        headers: headers.map(toCell),
        alignments,
        rows: rows.map((r) => r.map(toCell)),
      };
    },

    parseHTML(html) {
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const table = doc.querySelector('table');
        if (!table) throw new Error('No table element found in HTML input');

        // Find header row: prefer thead > tr, else first tr that has any th, else first tr
        let headRow =
          table.tHead?.querySelector('tr') ||
          [...table.querySelectorAll('tr')].find((tr) => tr.querySelector('th')) ||
          table.querySelector('tr');
        if (!headRow) throw new Error('No header row found in HTML table');

        const headerCells = [...headRow.querySelectorAll('th, td')];
        const headers = headerCells.map((c) => (c.textContent || c.innerText || '').trim());
        if (headers.length === 0) throw new Error('No headers found in HTML table');

        const alignments = headerCells.map((cell) => {
          const cls = cell.classList;
          const styleAlign = (cell.style?.textAlign || '').toLowerCase();
          const attrAlign = (cell.getAttribute('align') || '').toLowerCase();

          if (
            cls.contains('text-center') ||
            cls.contains('center') ||
            styleAlign === 'center' ||
            attrAlign === 'center'
          ) return ALIGN.CENTER;

          if (
            cls.contains('text-right') ||
            cls.contains('right') ||
            styleAlign === 'right' ||
            attrAlign === 'right'
          ) return ALIGN.RIGHT;

          return ALIGN.LEFT;
        });

        const body = table.tBodies?.[0];
        let bodyRows = [];
        if (body) {
          bodyRows = [...body.querySelectorAll('tr')];
        } else {
          const allTrs = [...table.querySelectorAll('tr')];
          const startIdx = allTrs.indexOf(headRow);
          bodyRows = allTrs.slice(startIdx + 1);
        }

        const rows = bodyRows.map((tr) => {
          const cells = [];
          [...tr.querySelectorAll('td, th')].forEach((cell) => {
            const colspan = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
            const text = (cell.textContent || cell.innerText || '').trim();
            cells.push(text);
            for (let i = 1; i < colspan; i++) cells.push('');
          });

          // Normalize row length to headers length
          while (cells.length < headers.length) cells.push('');
          if (cells.length > headers.length) cells.splice(headers.length);
          return cells;
        });

        return {
          headers: headers.map(toCell),
          alignments,
          rows: rows.map((r) => r.map(toCell)),
        };
      } catch (err) {
        throw new Error(`Error parsing HTML table: ${err.message}`);
      }
    },
  };

  // ========== Output Generators ==========
  const Output = {
    [FORMAT.MARKDOWN]() {
      if (!state.isValid()) return '';
      const header = `| ${state.headers.join(' | ')} |`;
      const sep = `| ${state.alignments.map((a) => MD_ALIGN[a]).join(' | ')} |`;
      const body = state.rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
      return [header, sep, body].filter(Boolean).join('\n');
    },

    [FORMAT.JSON]() {
      if (!state.isValid()) return '{}';
      const obj = {};
      state.rows.forEach((row) => {
        const key = (row[0] || '').toString().trim();
        if (!key) return;
        obj[key] = {};
        for (let i = 1; i < state.headers.length; i++) {
          const colName = state.headers[i];
          obj[key][colName] = isTruthyYes(row[i]) ? 'yes' : 'no';
        }
      });
      return JSON.stringify(obj, null, 2);
    },

    [FORMAT.HTML]() {
      if (!state.isValid()) return '';
      const alignClass = (a) => (a !== ALIGN.LEFT ? ` class="text-${a}"` : '');

      const thead =
        '<thead><tr>' +
        state.headers
          .map((h, i) => `<th${alignClass(state.alignments[i])}>${escapeHTML(h)}</th>`)
          .join('') +
        '</tr></thead>';

      const tbody =
        '<tbody>' +
        state.rows
          .map(
            (row) =>
              '<tr>' +
              row.map((cell, i) => `<td${alignClass(state.alignments[i])}>${escapeHTML(cell)}</td>`).join('') +
              '</tr>'
          )
          .join('') +
        '</tbody>';

      return `<table>${thead}${tbody}</table>`;
    },
  };

  const Result = {
    generate() {
      if (!state.isValid()) {
        if (ui.outputTextArea) ui.outputTextArea.value = '';
        return;
      }
      const fn = Output[state.outputFormat] || Output[FORMAT.MARKDOWN];
      if (ui.outputTextArea) ui.outputTextArea.value = fn();
    },

    setFormat(fmt) {
      if (!Object.values(FORMAT).includes(fmt)) return;
      state.outputFormat = fmt;
      this.generate();
    },
  };

  // ========== Renderer ==========
  const Renderer = {
    render() {
      if (!ui.tableContainer) return;
      if (!state.isValid()) {
        ui.tableContainer.innerHTML = '';
        if (ui.outputTextArea) ui.outputTextArea.value = '';
        return;
      }
      const table = this.createTable();
      ui.tableContainer.innerHTML = '';
      ui.tableContainer.appendChild(table);
      Result.generate();
    },

    createTable() {
      const table = document.createElement('table');
      table.appendChild(this.createHeader());
      table.appendChild(this.createBody());
      return table;
    },

    createHeader() {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      state.headers.forEach((txt, idx) => tr.appendChild(this.createHeaderCell(txt, idx)));
      thead.appendChild(tr);
      return thead;
    },

    createHeaderCell(text, index) {
      const th = document.createElement('th');
      th.textContent = text;
      th.draggable = state.isReorderMode;
      th.dataset.index = String(index);
      th.classList.toggle('dragging-allowed', state.isReorderMode);
      th.contentEditable = !state.isReorderMode;
      th.tabIndex = state.isReorderMode ? -1 : 0;

      if (state.isReorderMode) {
        th.addEventListener('dragstart', Drag.handleDragStart);
        th.addEventListener('dragover', Drag.handleDragOver); // allow drop
        th.addEventListener('drop', Drag.handleDrop);
      }

      th.addEventListener('blur', () => {
        if (state.isReorderMode) return;
        state.saveToHistory();
        state.headers[index] = toCell(th.textContent);
        Result.generate();
      });

      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !state.isReorderMode) {
          e.preventDefault();
          th.blur();
        }
      });

      return th;
    },

    createBody() {
      const tbody = document.createElement('tbody');
      state.rows.forEach((row, rIdx) => {
        tbody.appendChild(this.createRow(row, rIdx));
      });
      return tbody;
    },

    createRow(row, rowIndex) {
      const tr = document.createElement('tr');
      tr.draggable = state.isReorderMode;
      tr.dataset.index = String(rowIndex);
      tr.classList.toggle('dragging-allowed', state.isReorderMode);

      if (state.isReorderMode) {
        tr.addEventListener('dragstart', Drag.handleDragStart);
        tr.addEventListener('dragover', Drag.handleDragOver);
        tr.addEventListener('drop', Drag.handleDrop);
      }

      row.forEach((cell, colIndex) => {
        tr.appendChild(this.createCell(cell, rowIndex, colIndex));
      });
      return tr;
    },

    createCell(text, rowIndex, colIndex) {
      const td = document.createElement('td');
      td.contentEditable = !state.isReorderMode;
      td.tabIndex = state.isReorderMode ? -1 : 0;
      td.textContent = text;
      td.dataset.row = String(rowIndex);
      td.dataset.col = String(colIndex);

      td.addEventListener('blur', () => {
        if (state.isReorderMode) return;
        state.saveToHistory();
        state.rows[rowIndex][colIndex] = toCell(td.textContent);
        Result.generate();
      });

      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !state.isReorderMode) {
          e.preventDefault();
          td.blur();
        }
      });

      return td;
    },
  };

  // ========== Drag & Drop ==========
  const Drag = {
    handleDragStart(e) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      target.classList.add('dragging');
      const type = target.tagName.toLowerCase(); // 'th' or 'tr'
      const index = target.dataset.index ?? '';
      e.dataTransfer?.setData('text/plain', index);
      e.dataTransfer?.setData('type', type);
      // for Firefox
      if (e.dataTransfer && e.dataTransfer.setDragImage && type === 'tr') {
        e.dataTransfer.setDragImage(target, 10, 10);
      }
    },

    handleDragOver(e) {
      e.preventDefault();
      const dtType = e.dataTransfer?.getData('type');
      if (dtType === 'tr') {
        const tbody = ui.tableContainer?.querySelector('tbody');
        const dragging = document.querySelector('.dragging');
        if (!tbody || !dragging) return;

        const after = this.getDragAfterElement(tbody, e.clientY);
        if (after) tbody.insertBefore(dragging, after);
        else tbody.appendChild(dragging);
      }
      // For columns ('th'): we only calculate on drop (no live preview needed)
    },

    handleDrop(e) {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer?.getData('text/plain') || '-1', 10);
      const type = e.dataTransfer?.getData('type');

      // Find target index robustly
      let toIdx = -1;
      if (type === 'th') {
        const th = (e.target instanceof Element) ? e.target.closest('th') : null;
        toIdx = parseInt(th?.dataset.index || '-1', 10);
      } else if (type === 'tr') {
        const tbody = ui.tableContainer?.querySelector('tbody');
        const dragging = document.querySelector('tr.dragging');
        if (tbody && dragging) {
          toIdx = [...tbody.children].indexOf(dragging);
        }
      }

      if (Number.isInteger(fromIdx) && Number.isInteger(toIdx) && fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        state.saveToHistory();
        if (type === 'th') {
          Actions.reorderColumns(fromIdx, toIdx);
        } else if (type === 'tr') {
          Actions.reorderRows(fromIdx, toIdx);
        }
        Renderer.render();
      }

      document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    },

    getDragAfterElement(container, y) {
      const els = [...container.querySelectorAll('tr:not(.dragging)')];
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      for (const child of els) {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          closest = { offset, element: child };
        }
      }
      return closest.element;
    },
  };

  // ========== Actions ==========
  const Actions = {
    addColumn() {
      if (state.isReorderMode) return;
      state.saveToHistory();
      state.headers.push('New Column');
      state.alignments.push(ALIGN.LEFT);
      state.rows.forEach((row) => row.push(''));
      Renderer.render();
      Result.generate();
      notify('Column added');
    },

    addRow() {
      if (state.isReorderMode) return;
      if (state.headers.length === 0) {
        notify('Please add headers first', NOTICE.ERROR);
        return;
      }
      state.saveToHistory();
      state.rows.push(Array(state.headers.length).fill(''));
      Renderer.render();
      Result.generate();
      notify('Row added');
    },

    removeColumn() {
      if (state.isReorderMode) return;
      if (state.headers.length <= 1) {
        notify('Cannot remove the last column', NOTICE.ERROR);
        return;
      }
      state.saveToHistory();
      const last = state.headers.length - 1;
      state.headers.splice(last, 1);
      state.alignments.splice(last, 1);
      state.rows.forEach((row) => row.splice(last, 1));
      Renderer.render();
      Result.generate();
      Analysis.analyze();
      notify('Column removed');
    },

    removeColumnAt(index) {
      if (state.isReorderMode) return;
      if (state.headers.length <= 1) return notify('Cannot remove the last column', NOTICE.ERROR);
      if (index < 0 || index >= state.headers.length) return notify('Invalid column index', NOTICE.ERROR);

      state.saveToHistory();
      state.headers.splice(index, 1);
      state.alignments.splice(index, 1);
      state.rows.forEach((row) => row.splice(index, 1));
      Renderer.render();
      Result.generate();
      notify('Column removed');
    },

    removeRow() {
      if (state.isReorderMode) return;
      if (state.rows.length === 0) return notify('No rows to remove', NOTICE.ERROR);

      state.saveToHistory();
      state.rows.pop();
      Renderer.render();
      Result.generate();
      notify('Row removed');
    },

    removeRowAt(index) {
      if (state.isReorderMode) return;
      if (index < 0 || index >= state.rows.length) return notify('Invalid row index', NOTICE.ERROR);
      if (state.rows.length === 0) return notify('No rows to remove', NOTICE.ERROR);

      state.saveToHistory();
      state.rows.splice(index, 1);
      Renderer.render();
      Result.generate();
      notify('Row removed');
    },

    sortRows() {
      if (state.isReorderMode) return;
      if (state.rows.length <= 1) return notify('Need at least 2 rows to sort', NOTICE.ERROR);

      state.saveToHistory();
      state.rows.sort((a, b) => (a[0]?.toLowerCase() || '').localeCompare(b[0]?.toLowerCase() || ''));
      Renderer.render();
      Result.generate();
      notify('Rows sorted alphabetically');
    },

    reorderColumns(from, to) {
      moveInArray(state.headers, from, to);
      moveInArray(state.alignments, from, to);
      state.rows.forEach((row) => moveInArray(row, from, to));
    },

    reorderRows(from, to) {
      moveInArray(state.rows, from, to);
    },

    duplicateRow(index) {
      if (state.isReorderMode) return;
      if (index < 0 || index >= state.rows.length) return;
      state.saveToHistory();
      const clone = [...state.rows[index]];
      state.rows.splice(index + 1, 0, clone);
      Renderer.render();
      notify('Row duplicated');
    },

    insertRowAfter(index) {
      if (state.isReorderMode) return;
      if (index < 0 || index >= state.rows.length) return;
      state.saveToHistory();
      const empty = Array(state.headers.length).fill('');
      state.rows.splice(index + 1, 0, empty);
      Renderer.render();
      notify('Row inserted');
    },
  };

  // ========== Analysis ==========
  const Analysis = {
    analyze() {
      if (!ui.analysisMarkdownOutput) return;
      if (state.headers.length === 0 || state.rows.length === 0) {
        ui.analysisMarkdownOutput.textContent = '';
        return;
      }
      const total = state.rows.length;
      let line = `| **Total** = ${total} |`;
      for (let c = 1; c < state.headers.length; c++) {
        const count = state.rows.reduce((acc, row) => acc + (isTruthyYes(row[c]) ? 1 : 0), 0);
        line += ` ${count}/${total} |`;
      }
      ui.analysisMarkdownOutput.textContent = line;
      notify('Table analyzed!');
    },

    getColumnStats(index) {
      if (index >= state.headers.length) return null;
      const col = state.rows.map((r) => r[index] || '');
      const unique = new Set(col);
      const empty = col.filter((v) => !v.trim()).length;
      return {
        columnName: state.headers[index],
        totalCells: col.length,
        uniqueValues: unique.size,
        emptyCells: empty,
        mostCommon: this.getMostCommonValue(col),
      };
    },

    getMostCommonValue(values) {
      const freq = new Map();
      for (const v of values) freq.set(v, (freq.get(v) || 0) + 1);
      let top = '';
      let max = -1;
      for (const [val, count] of freq) {
        if (count > max) {
          max = count;
          top = val;
        }
      }
      return top;
    },
  };

  // ========== App ==========
  const App = {
    init() {
      Theme.init();
      this.bindEvents();
      this.initializeKeyboardShortcuts();
    },

    parseTable() {
      const input = ui.inputTextArea?.value?.trim();
      if (!input) {
        notify('Please enter a table to parse', NOTICE.ERROR);
        return;
      }
      try {
        const parsed = Parser.parse(input);
        state.saveToHistory();
        state.headers = parsed.headers;
        state.rows = parsed.rows;
        state.alignments = parsed.alignments;
        Renderer.render();
        if (ui.outputFormat && ui.outputFormat.value) {
          state.outputFormat = ui.outputFormat.value;
        }
        Result.generate();
        notify('Table parsed successfully!');
      } catch (err) {
        notify(`Error parsing table: ${err.message}`, NOTICE.ERROR);
      }
    },

    async copyToClipboard() {
      const text = ui.outputTextArea?.value || '';
      const success = await (async (t) => {
        try {
          await navigator.clipboard.writeText(t);
          return true;
        } catch (_) {
          const ta = document.createElement('textarea');
          ta.value = t;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try {
            ok = document.execCommand('copy');
          } catch (_) {}
          document.body.removeChild(ta);
          return ok;
        }
      })(text);

      notify(success ? 'Copied to clipboard!' : 'Failed to copy to clipboard', success ? NOTICE.SUCCESS : NOTICE.ERROR);
    },

    clearAll() {
      const hasAnything =
        (ui.inputTextArea?.value?.trim() || '') ||
        !state.isEmpty() ||
        (ui.outputTextArea?.value?.trim() || '');

      if (hasAnything && !window.confirm('Are you sure you want to clear everything?')) return;

      if (ui.inputTextArea) ui.inputTextArea.value = '';
      if (ui.outputTextArea) ui.outputTextArea.value = '';
      if (ui.tableContainer) ui.tableContainer.innerHTML = '';
      if (ui.analysisMarkdownOutput) ui.analysisMarkdownOutput.textContent = '';
      state.reset();
      notify('All cleared');
    },

    toggleReorderMode() {
      if (state.isEmpty()) return notify('Please create a table first', NOTICE.ERROR);
      state.isReorderMode = !state.isReorderMode;
      if (ui.reorderBtn) {
        ui.reorderBtn.textContent = state.isReorderMode ? 'Edit Table' : 'Re-order';
        ui.reorderBtn.classList.toggle('btn-secondary', state.isReorderMode);
      }
      Renderer.render();
      notify(state.isReorderMode ? 'Reorder mode enabled' : 'Edit mode enabled', NOTICE.INFO);
    },

    undo() {
      if (state.undo()) {
        Renderer.render();
        notify('Undone', NOTICE.INFO);
      } else {
        notify('Nothing to undo', NOTICE.WARNING);
      }
    },

    redo() {
      if (state.redo()) {
        Renderer.render();
        notify('Redone', NOTICE.INFO);
      } else {
        notify('Nothing to redo', NOTICE.WARNING);
      }
    },

    bindEvents() {
      ui.themeToggle?.addEventListener('click', () => Theme.toggle());

      ui.parseBtn?.addEventListener('click', () => this.parseTable());
      ui.analyzeBtn?.addEventListener('click', () => {
        Analysis.analyze();
        if (ui.analysisSection) ui.analysisSection.open = true;
      });
      ui.copyBtn?.addEventListener('click', () => this.copyToClipboard());
      ui.clearBtn?.addEventListener('click', () => this.clearAll());

      ui.addColumnBtn?.addEventListener('click', () => Actions.addColumn());
      ui.addRowBtn?.addEventListener('click', () => Actions.addRow());
      ui.sortRowsBtn?.addEventListener('click', () => Actions.sortRows());
      ui.removeColumnBtn?.addEventListener('click', () => Actions.removeColumn());
      ui.removeRowBtn?.addEventListener('click', () => Actions.removeRow());

      ui.reorderBtn?.addEventListener('click', () => this.toggleReorderMode());

      if (ui.inputTextArea) {
        ui.inputTextArea.addEventListener('input', debounce(() => this.parseTable(), 300));
      }

      ui.outputFormat?.addEventListener('change', (e) => {
        const value = e.target?.value;
        if (value) Result.setFormat(value);
      });

      // Redundant safety: if format select is replaced dynamically
      document.addEventListener('change', (e) => {
        if (e.target?.id === 'outputFormat') {
          Result.setFormat(e.target.value);
        }
      });

      window.addEventListener('DOMContentLoaded', () => Theme.init());

      window.addEventListener('beforeunload', (e) => {
        if (!state.isEmpty()) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    },

    initializeKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;

        // Undo
        if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          this.undo();
          return;
        }

        // Redo: Ctrl+Shift+Z or Ctrl+Y
        if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
          e.preventDefault();
          this.redo();
          return;
        }

        // Parse: Ctrl+Enter
        if (mod && e.key === 'Enter') {
          e.preventDefault();
          this.parseTable();
          return;
        }

        // Copy: Ctrl+Shift+C
        if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          this.copyToClipboard();
        }
      });
    },
  };

  App.init();
})();
