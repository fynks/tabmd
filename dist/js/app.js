(() => {
  'use strict';

  // Constants
  const THEME = Object.freeze({ DARK: 'dark', LIGHT: 'light' });
  const FORMAT = Object.freeze({ MARKDOWN: 'markdown', JSON: 'json', HTML: 'html' });
  const ALIGN = Object.freeze({ CENTER: 'center', RIGHT: 'right', LEFT: 'left' });
  const ALIGN_MARKDOWN = Object.freeze({
    [ALIGN.CENTER]: ':---:',
    [ALIGN.RIGHT]: '---:',
    [ALIGN.LEFT]: ':---'
  });
  const NOTIFY_TYPE = Object.freeze({ SUCCESS: 'success', ERROR: 'error', WARNING: 'warning', INFO: 'info' });

  // DOM Elements - Direct references for reliability
  const elements = {
    get themeToggle() { return document.getElementById('themeToggle'); },
    get sunPath() { return this.themeToggle?.querySelector('.sun'); },
    get moonPath() { return this.themeToggle?.querySelector('.moon'); },
    get inputTextArea() { return document.getElementById('input'); },
    get outputTextArea() { return document.getElementById('output'); },
    get outputFormat() { return document.getElementById('outputFormat'); },
    get tableContainer() { return document.getElementById('tableContainer'); },
    get analysisSection() { return document.getElementById('analysisSection'); },
    get analysisMarkdownOutput() { return document.getElementById('analysisMarkdownOutput'); },
    get parseBtn() { return document.getElementById('parseBtn'); },
    get analyzeBtn() { return document.getElementById('analyzeBtn'); },
    get copyBtn() { return document.getElementById('copyBtn'); },
    get clearBtn() { return document.getElementById('clearBtn'); },
    get addColumnBtn() { return document.getElementById('addColumnBtn'); },
    get addRowBtn() { return document.getElementById('addRowBtn'); },
    get sortRowsBtn() { return document.getElementById('sortRowsBtn'); },
    get removeColumnBtn() { return document.getElementById('removeColumnBtn'); },
    get removeRowBtn() { return document.getElementById('removeRowBtn'); },
    get reorderBtn() { return document.getElementById('reorderBtn'); },
    get notificationDiv() { return document.getElementById('notification'); }
  };

  // State Management
  class TableState {
    constructor() {
      this.reset();
    }

    saveToHistory() {
      const snapshot = {
        headers: [...this.headers],
        rows: this.rows.map(row => [...row]),
        alignments: [...this.alignments]
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
        const snapshot = this.history[this.historyIndex];
        this.headers = [...snapshot.headers];
        this.rows = snapshot.rows.map(row => [...row]);
        this.alignments = [...snapshot.alignments];
        return true;
      }
      return false;
    }

    redo() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        const snapshot = this.history[this.historyIndex];
        this.headers = [...snapshot.headers];
        this.rows = snapshot.rows.map(row => [...row]);
        this.alignments = [...snapshot.alignments];
        return true;
      }
      return false;
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
  }

  const state = new TableState();

  // Utilities
  const escapeHtml = (str) => {
    if (typeof str !== 'string') str = String(str ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const showNotification = (message, type = NOTIFY_TYPE.SUCCESS, duration = 3000) => {
    const notif = elements.notificationDiv;
    if (!notif) return;

    const colors = {
      [NOTIFY_TYPE.SUCCESS]: '#4CAF50',
      [NOTIFY_TYPE.ERROR]: '#dc3545',
      [NOTIFY_TYPE.WARNING]: '#ff9800',
      [NOTIFY_TYPE.INFO]: '#2196F3'
    };

    notif.textContent = message;
    notif.style.backgroundColor = colors[type] || colors[NOTIFY_TYPE.SUCCESS];
    notif.style.display = 'block';
    notif.setAttribute('aria-live', 'polite');

    setTimeout(() => {
      notif.style.display = 'none';
    }, duration);
  };

  const isChecked = (value) => {
    const val = String(value ?? '').trim();
    const lower = val.toLowerCase();
    return ['yes', 'true', 'y'].includes(lower) || 
           ['✅', '✔️', '✔', '✓'].includes(val);
  };

  const isUnchecked = (value) => {
    const val = String(value ?? '').trim();
    const lower = val.toLowerCase();
    return ['no', 'false', 'n'].includes(lower) || 
           ['❌', '✖️', '✖', '✗', '×'].includes(val);
  };

  const normalizeCheckValue = (value) => {
    if (isChecked(value)) return '✅';
    if (isUnchecked(value)) return '❌';
    return value; // Return original value if it's neither checked nor unchecked
  };

  // Theme Manager
  const ThemeManager = {
    toggle() {
      const current = document.documentElement.getAttribute('data-theme');
      this.set(current === THEME.DARK ? THEME.LIGHT : THEME.DARK);
    },

    set(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      this.updateIcons(theme);
    },

    updateIcons(theme) {
      const sun = elements.sunPath;
      const moon = elements.moonPath;
      
      if (sun && moon) {
        sun.style.display = theme === THEME.DARK ? 'block' : 'none';
        moon.style.display = theme === THEME.DARK ? 'none' : 'block';
      }
    },

    init() {
      const saved = localStorage.getItem('theme');
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const theme = saved || (prefersDark ? THEME.DARK : THEME.LIGHT);
      this.set(theme);
    }
  };

  // Parser
  const Parser = {
    parse(input) {
      const trimmed = input?.trim();
      if (!trimmed) throw new Error('Please enter a markdown or HTML table');

      if (this.detectHTMLTable(trimmed)) return this.parseHTML(trimmed);
      if (this.detectMarkdownTable(trimmed)) return this.parseMarkdown(trimmed);
      
      throw new Error('Input does not appear to be a valid HTML or Markdown table');
    },

    detectHTMLTable: (input) => /<table[\s\S]*?<\/table>/i.test(input) || input.toLowerCase().includes('<table'),

    detectMarkdownTable(input) {
      const lines = input.split('\n').filter(line => line.trim());
      if (lines.length < 2) return false;
      
      const hasPipes = lines.some(line => line.includes('|'));
      const hasSeparator = lines.some(line => /^\s*\|?\s*:?-+:?\s*\|\s*/.test(line));
      
      return hasPipes && hasSeparator;
    },

    parseMarkdown(input) {
      const lines = input.trim().split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('Markdown table must have at least a header and separator row');
      }

      const headers = this.parseRow(lines[0]);
      const separators = this.parseRow(lines[1]);
      
      if (headers.length !== separators.length) {
        throw new Error('Header and separator row must have the same number of columns');
      }

      const alignments = separators.map(sep => {
        const trimmed = sep.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return ALIGN.CENTER;
        if (trimmed.endsWith(':')) return ALIGN.RIGHT;
        return ALIGN.LEFT;
      });

      const rows = lines.slice(2).map(line => {
        const row = this.parseRow(line);
        while (row.length < headers.length) row.push('');
        if (row.length > headers.length) row.length = headers.length;
        return row;
      });

      return {
        headers: headers.map(escapeHtml),
        alignments,
        rows: rows.map(row => row.map(cell => escapeHtml(normalizeCheckValue(cell))))
      };
    },

    parseHTML(input) {
      try {
        const div = document.createElement('div');
        div.innerHTML = input;
        const table = div.querySelector('table');
        
        if (!table) throw new Error('No table element found in HTML input');

        let headerRow = table.querySelector('thead tr') || 
                       table.querySelector('tr:has(th)') || 
                       table.querySelector('tr');
        
        if (!headerRow) throw new Error('No header row found in HTML table');

        const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
        const headers = headerCells.map(cell => cell.textContent?.trim() || '');
        
        if (!headers.length) throw new Error('No headers found in HTML table');

        const alignments = headerCells.map(cell => {
          const classList = cell.classList;
          const style = window.getComputedStyle(cell);
          const textAlign = cell.style.textAlign || style.textAlign;
          
          if (classList.contains('text-center') || textAlign === 'center') return ALIGN.CENTER;
          if (classList.contains('text-right') || textAlign === 'right') return ALIGN.RIGHT;
          return ALIGN.LEFT;
        });

        const tbody = table.querySelector('tbody');
        let dataRows = tbody ? 
          Array.from(tbody.querySelectorAll('tr')) : 
          Array.from(table.querySelectorAll('tr')).slice(1);

        const rows = dataRows.map(row => {
          const cells = [];
          Array.from(row.querySelectorAll('td, th')).forEach(cell => {
            const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
            const content = cell.textContent?.trim() || '';
            cells.push(content);
            for (let i = 1; i < colspan; i++) cells.push('');
          });
          
          while (cells.length < headers.length) cells.push('');
          if (cells.length > headers.length) cells.length = headers.length;
          return cells;
        });

        return {
          headers: headers.map(escapeHtml),
          alignments,
          rows: rows.map(row => row.map(cell => escapeHtml(normalizeCheckValue(cell))))
        };
      } catch (e) {
        throw new Error(`Error parsing HTML table: ${e.message}`);
      }
    },

    parseRow: (row) => {
      return row.split('|')
        .filter((cell, idx, arr) => {
          return !(idx === 0 && cell.trim() === '') && 
                 !(idx === arr.length - 1 && cell.trim() === '');
        })
        .map(cell => cell.trim());
    }
  };

  // Formatters
  const Formatters = {
    [FORMAT.MARKDOWN]: () => {
      const header = `| ${state.headers.join(' | ')} |`;
      const separator = `| ${state.alignments.map(align => ALIGN_MARKDOWN[align]).join(' | ')} |`;
      const rows = state.rows.map(row => {
        const normalizedRow = row.map(cell => normalizeCheckValue(cell));
        return `| ${normalizedRow.join(' | ')} |`;
      }).join('\n');
      
      return [header, separator, rows].filter(Boolean).join('\n');
    },

    [FORMAT.JSON]: () => {
      const result = {};
      
      state.rows.forEach(row => {
        const key = row[0]?.replace(/\*\*/g, '');
        if (!key) return;
        
        result[key] = {};
        for (let i = 1; i < state.headers.length; i++) {
          const header = state.headers[i].replace(/\*\*/g, '');
          result[key][header] = isChecked(row[i]) ? '✅' : (isUnchecked(row[i]) ? '❌' : row[i]);
        }
      });
      
      return JSON.stringify(result, null, 2);
    },

    [FORMAT.HTML]: () => {
      const alignClass = (align) => align !== ALIGN.LEFT ? ` class="text-${align}"` : '';
      
      const headerCells = state.headers
        .map((header, i) => `<th${alignClass(state.alignments[i])}>${header}</th>`)
        .join('');
      
      const bodyRows = state.rows
        .map(row => {
          const cells = row
            .map((cell, i) => `<td${alignClass(state.alignments[i])}>${normalizeCheckValue(cell)}</td>`)
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('\n');
      
      return `<table>
<thead>
<tr>${headerCells}</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
</table>`;
    }
  };

  // Table Renderer
  const TableRenderer = {
    render() {
      if (!state.isValid()) {
        if (elements.tableContainer) elements.tableContainer.innerHTML = '';
        if (elements.outputTextArea) elements.outputTextArea.value = '';
        return;
      }

      const table = this.createTable();
      if (elements.tableContainer) {
        elements.tableContainer.innerHTML = '';
        elements.tableContainer.appendChild(table);
      }
      OutputGenerator.generate();
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
      
      state.headers.forEach((header, index) => {
        tr.appendChild(this.createHeaderCell(header, index));
      });
      
      thead.appendChild(tr);
      return thead;
    },

    createHeaderCell(content, index) {
      const th = document.createElement('th');
      th.textContent = content;
      th.draggable = state.isReorderMode;
      th.dataset.index = index;
      th.classList.toggle('dragging-allowed', state.isReorderMode);
      th.contentEditable = !state.isReorderMode;
      th.tabIndex = state.isReorderMode ? -1 : 0;

      if (state.isReorderMode) {
        th.addEventListener('dragstart', DragHandlers.handleDragStart);
        th.addEventListener('dragover', DragHandlers.handleDragOver);
        th.addEventListener('drop', DragHandlers.handleDrop);
        th.addEventListener('dragend', (e) => {
          e.target.classList.remove('dragging');
          DragHandlers.draggedElement = null;
          DragHandlers.draggedType = null;
        });
      }

      th.addEventListener('blur', () => {
        if (!state.isReorderMode) {
          state.saveToHistory();
          state.headers[index] = escapeHtml(th.textContent);
          OutputGenerator.generate();
        }
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
      
      state.rows.forEach((row, index) => {
        tbody.appendChild(this.createRow(row, index));
      });
      
      return tbody;
    },

    createRow(rowData, rowIndex) {
      const tr = document.createElement('tr');
      tr.draggable = state.isReorderMode;
      tr.dataset.index = rowIndex;
      tr.classList.toggle('dragging-allowed', state.isReorderMode);

      if (state.isReorderMode) {
        tr.addEventListener('dragstart', DragHandlers.handleDragStart);
        tr.addEventListener('dragover', DragHandlers.handleDragOver);
        tr.addEventListener('drop', DragHandlers.handleDrop);
        tr.addEventListener('dragend', (e) => {
          e.target.classList.remove('dragging');
          DragHandlers.draggedElement = null;
          DragHandlers.draggedType = null;
        });
      }

      rowData.forEach((cellData, colIndex) => {
        tr.appendChild(this.createCell(cellData, rowIndex, colIndex));
      });

      return tr;
    },

    createCell(content, rowIndex, colIndex) {
      const td = document.createElement('td');
      td.contentEditable = !state.isReorderMode;
      td.tabIndex = state.isReorderMode ? -1 : 0;
      td.textContent = normalizeCheckValue(content);
      td.dataset.row = rowIndex;
      td.dataset.col = colIndex;

      td.addEventListener('blur', () => {
        if (!state.isReorderMode) {
          state.saveToHistory();
          state.rows[rowIndex][colIndex] = escapeHtml(normalizeCheckValue(td.textContent));
          OutputGenerator.generate();
          // Update the displayed value after normalization
          td.textContent = normalizeCheckValue(td.textContent);
        }
      });

      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !state.isReorderMode) {
          e.preventDefault();
          td.blur();
        }
      });

      return td;
    }
  };

  // Drag and Drop handlers
  const DragHandlers = {
    draggedElement: null,
    draggedType: null,
    
    handleDragStart(e) {
      DragHandlers.draggedElement = e.target;
      DragHandlers.draggedType = e.target.tagName.toLowerCase();
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.target.innerHTML);
    },

    handleDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragging = DragHandlers.draggedElement;
      if (!dragging) return;
      
      if (DragHandlers.draggedType === 'tr') {
        // Row dragging
        const tbody = elements.tableContainer?.querySelector('tbody');
        if (!tbody) return;
        
        const afterElement = DragHandlers.getDragAfterElement(tbody, e.clientY);
        
        if (afterElement) {
          tbody.insertBefore(dragging, afterElement);
        } else {
          tbody.appendChild(dragging);
        }
      } else if (DragHandlers.draggedType === 'th') {
        // Column dragging - visual feedback
        const target = e.target.closest('th');
        if (target && target !== dragging) {
          const rect = target.getBoundingClientRect();
          const midpoint = rect.left + rect.width / 2;
          
          if (e.clientX < midpoint) {
            target.parentNode.insertBefore(dragging, target);
          } else {
            target.parentNode.insertBefore(dragging, target.nextSibling);
          }
        }
      }
    },

    handleDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const dragging = DragHandlers.draggedElement;
      if (!dragging) return;
      
      const fromIndex = parseInt(dragging.dataset.index, 10);
      const type = DragHandlers.draggedType;
      
      let toIndex;
      
      if (type === 'th') {
        // For columns, calculate new position from DOM
        const allHeaders = Array.from(dragging.parentNode.children);
        toIndex = allHeaders.indexOf(dragging);
        
        if (fromIndex !== toIndex) {
          state.saveToHistory();
          TableOperations.reorderColumns(fromIndex, toIndex);
          TableRenderer.render();
        }
      } else if (type === 'tr') {
        // For rows, calculate new position from DOM
        const tbody = elements.tableContainer?.querySelector('tbody');
        if (tbody) {
          const allRows = Array.from(tbody.children);
          toIndex = allRows.indexOf(dragging);
          
          if (fromIndex !== toIndex) {
            state.saveToHistory();
            TableOperations.reorderRows(fromIndex, toIndex);
            TableRenderer.render();
          }
        }
      }
      
      // Clean up
      dragging.classList.remove('dragging');
      DragHandlers.draggedElement = null;
      DragHandlers.draggedType = null;
    },

    getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('tr:not(.dragging)')];
      
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        }
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
  };

  // Table Operations - Fixed version
  const TableOperations = {
    addColumn() {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      state.saveToHistory();
      state.headers.push('New Column');
      state.alignments.push(ALIGN.LEFT);
      state.rows.forEach(row => row.push(''));
      
      TableRenderer.render();
      OutputGenerator.generate();
      showNotification('Column added successfully');
    },

    addRow() {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      if (state.headers.length === 0) {
        showNotification('Please add headers first', NOTIFY_TYPE.ERROR);
        return;
      }
      
      state.saveToHistory();
      const newRow = new Array(state.headers.length).fill('');
      state.rows.push(newRow);
      
      TableRenderer.render();
      OutputGenerator.generate();
      showNotification('Row added successfully');
    },

    removeColumn() {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      if (state.headers.length <= 1) {
        showNotification('Cannot remove the last column', NOTIFY_TYPE.ERROR);
        return;
      }
      
      state.saveToHistory();
      const lastIndex = state.headers.length - 1;
      state.headers.splice(lastIndex, 1);
      state.alignments.splice(lastIndex, 1);
      state.rows.forEach(row => row.splice(lastIndex, 1));
      
      TableRenderer.render();
      OutputGenerator.generate();
      Analyzer.analyze();
      showNotification('Column removed');
    },

    removeColumnAt(index) {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      if (state.headers.length <= 1) {
        showNotification('Cannot remove the last column', NOTIFY_TYPE.ERROR);
        return;
      }
      
      if (index < 0 || index >= state.headers.length) {
        showNotification('Invalid column index', NOTIFY_TYPE.ERROR);
        return;
      }
      
      state.saveToHistory();
      state.headers.splice(index, 1);
      state.alignments.splice(index, 1);
      state.rows.forEach(row => row.splice(index, 1));
      
      TableRenderer.render();
      OutputGenerator.generate();
      showNotification('Column removed');
    },

    removeRow() {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      if (state.rows.length === 0) {
        showNotification('No rows to remove', NOTIFY_TYPE.ERROR);
        return;
      }
      
      state.saveToHistory();
      state.rows.pop();
      
      TableRenderer.render();
      OutputGenerator.generate();
      showNotification('Row removed');
    },

    removeRowAt(index) {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      if (index < 0 || index >= state.rows.length) {
        showNotification('Invalid row index', NOTIFY_TYPE.ERROR);
        return;
      }
      
      if (state.rows.length === 0) {
        showNotification('No rows to remove', NOTIFY_TYPE.ERROR);
        return;
      }
      
      state.saveToHistory();
      state.rows.splice(index, 1);
      
      TableRenderer.render();
      OutputGenerator.generate();
      showNotification('Row removed');
    },

    sortRows() {
      if (state.isReorderMode) {
        showNotification('Exit reorder mode first', NOTIFY_TYPE.WARNING);
        return;
      }
      
      if (state.rows.length <= 1) {
        showNotification('Need at least 2 rows to sort', NOTIFY_TYPE.WARNING);
        return;
      }
      
      state.saveToHistory();
      
      // Create a more robust sorting function
      state.rows.sort((a, b) => {
        // Get the first column values, handling null/undefined/empty cases
        const aVal = String(a[0] || '').trim().toLowerCase();
        const bVal = String(b[0] || '').trim().toLowerCase();
        
        // Handle empty values (put them at the end)
        if (aVal === '' && bVal !== '') return 1;
        if (bVal === '' && aVal !== '') return -1;
        if (aVal === '' && bVal === '') return 0;
        
        // Use locale-aware comparison
        return aVal.localeCompare(bVal, undefined, { 
          numeric: true, 
          sensitivity: 'base' 
        });
      });
      
      TableRenderer.render();
      OutputGenerator.generate();
      Analyzer.analyze();
      showNotification('Rows sorted alphabetically');
    },

    reorderColumns(fromIndex, toIndex) {
      const moveItem = (arr) => {
        const item = arr[fromIndex];
        arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, item);
      };
      
      moveItem(state.headers);
      moveItem(state.alignments);
      state.rows.forEach(row => moveItem(row));
    },

    reorderRows(fromIndex, toIndex) {
      const row = state.rows[fromIndex];
      state.rows.splice(fromIndex, 1);
      state.rows.splice(toIndex, 0, row);
    },

    duplicateRow(index) {
      if (state.isReorderMode) return;
      
      state.saveToHistory();
      const newRow = [...state.rows[index]];
      state.rows.splice(index + 1, 0, newRow);
      
      TableRenderer.render();
      showNotification('Row duplicated');
    },

    insertRowAfter(index) {
      if (state.isReorderMode) return;
      
      state.saveToHistory();
      const newRow = new Array(state.headers.length).fill('');
      state.rows.splice(index + 1, 0, newRow);
      
      TableRenderer.render();
      showNotification('Row inserted');
    }
  };

  // Analyzer
  const Analyzer = {
    analyze() {
      if (state.rows.length === 0 || state.headers.length === 0) {
        if (elements.analysisMarkdownOutput) {
          elements.analysisMarkdownOutput.textContent = '';
        }
        return;
      }

      const total = state.rows.length;
      let result = `| **Total** = ${total} |`;
      
      for (let i = 1; i < state.headers.length; i++) {
        const checked = state.rows.reduce((sum, row) => {
          return sum + (isChecked(row[i]) ? 1 : 0);
        }, 0);
        result += ` ${checked}/${total} |`;
      }
      
      if (elements.analysisMarkdownOutput) {
        elements.analysisMarkdownOutput.textContent = result;
      }
      showNotification('Table analyzed!');
    },

    getColumnStats(columnIndex) {
      if (columnIndex >= state.headers.length) return null;
      
      const values = state.rows.map(row => row[columnIndex] || '');
      const uniqueValues = [...new Set(values)];
      const emptyCells = values.filter(v => !v.trim()).length;
      
      return {
        columnName: state.headers[columnIndex],
        totalCells: values.length,
        uniqueValues: uniqueValues.length,
        emptyCells,
        mostCommon: this.getMostCommonValue(values)
      };
    },

    getMostCommonValue(values) {
      const counts = {};
      values.forEach(value => {
        counts[value] = (counts[value] || 0) + 1;
      });
      
      return Object.entries(counts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || '';
    }
  };

  // Output Generator
  const OutputGenerator = {
    generate() {
      if (!state.isValid()) {
        if (elements.outputTextArea) elements.outputTextArea.value = '';
        return;
      }
      
      const formatter = Formatters[state.outputFormat];
      if (elements.outputTextArea && formatter) {
        elements.outputTextArea.value = formatter();
      }
    },

    setFormat(format) {
      if (Object.values(FORMAT).includes(format)) {
        state.outputFormat = format;
        this.generate();
      }
    }
  };

  // Main App Controller - Fixed event binding
  const App = {
    init() {
      ThemeManager.init();
      this.bindEvents();
      this.initializeKeyboardShortcuts();
    },

    parseTable() {
      const input = elements.inputTextArea?.value?.trim();
      if (!input) {
        showNotification('Please enter a table to parse', NOTIFY_TYPE.WARNING);
        return;
      }

      const container = elements.tableContainer;
      const parseBtn = elements.parseBtn;
      
      // Add loading state
      if (container) container.classList.add('loading');
      if (parseBtn) {
        parseBtn.classList.add('loading');
        parseBtn.disabled = true;
      }

      // Use setTimeout to allow UI to update
      setTimeout(() => {
        try {
          const parsed = Parser.parse(input);
          state.saveToHistory();
          Object.assign(state, parsed);
          TableRenderer.render();
          OutputGenerator.generate();
          showNotification('✅ Table parsed successfully!');
        } catch (error) {
          showNotification(`❌ Error: ${error.message}`, NOTIFY_TYPE.ERROR);
        } finally {
          // Remove loading state
          if (container) container.classList.remove('loading');
          if (parseBtn) {
            parseBtn.classList.remove('loading');
            parseBtn.disabled = false;
          }
        }
      }, 50);
    },

    async copyToClipboard() {
      const text = elements.outputTextArea?.value;
      if (!text) {
        showNotification('Nothing to copy', NOTIFY_TYPE.WARNING);
        return;
      }

      const btn = elements.copyBtn;
      
      try {
        await navigator.clipboard.writeText(text);
        
        // Visual feedback on button
        if (btn) {
          btn.classList.add('success');
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.classList.remove('success');
            btn.textContent = originalText;
          }, 2000);
        }
        
        showNotification('Copied to clipboard!');
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (success && btn) {
          btn.classList.add('success');
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.classList.remove('success');
            btn.textContent = originalText;
          }, 2000);
        }
        
        showNotification(
          success ? 'Copied to clipboard!' : 'Failed to copy to clipboard',
          success ? NOTIFY_TYPE.SUCCESS : NOTIFY_TYPE.ERROR
        );
      }
    },

    clearAll() {
      const hasContent = elements.inputTextArea?.value?.trim() || 
                        !state.isEmpty() || 
                        elements.outputTextArea?.value?.trim();
      
      if (hasContent && !confirm('Are you sure you want to clear everything?')) {
        return;
      }

      if (elements.inputTextArea) elements.inputTextArea.value = '';
      if (elements.outputTextArea) elements.outputTextArea.value = '';
      if (elements.tableContainer) elements.tableContainer.innerHTML = '';
      if (elements.analysisMarkdownOutput) elements.analysisMarkdownOutput.textContent = '';
      
      state.reset();
      showNotification('All cleared');
    },

    toggleReorderMode() {
      if (state.isEmpty()) {
        showNotification('Please create a table first', NOTIFY_TYPE.ERROR);
        return;
      }

      state.isReorderMode = !state.isReorderMode;
      
      const btn = elements.reorderBtn;
      const container = elements.tableContainer;
      
      if (btn) {
        btn.textContent = state.isReorderMode ? 'Finish Reorder' : 'Re-order';
        btn.classList.toggle('active', state.isReorderMode);
      }
      
      if (container) {
        container.classList.toggle('reorder-mode', state.isReorderMode);
      }
      
      TableRenderer.render();
      showNotification(
        state.isReorderMode ? 'Drag rows or columns to reorder' : 'Edit mode enabled',
        NOTIFY_TYPE.INFO
      );
    },

    undo() {
      if (state.undo()) {
        TableRenderer.render();
        showNotification('Undone', NOTIFY_TYPE.INFO);
      } else {
        showNotification('Nothing to undo', NOTIFY_TYPE.WARNING);
      }
    },

    redo() {
      if (state.redo()) {
        TableRenderer.render();
        showNotification('Redone', NOTIFY_TYPE.INFO);
      } else {
        showNotification('Nothing to redo', NOTIFY_TYPE.WARNING);
      }
    },

    bindEvents() {
      // Direct event listeners for reliability
      elements.themeToggle?.addEventListener('click', () => ThemeManager.toggle());
      elements.parseBtn?.addEventListener('click', () => this.parseTable());
      elements.analyzeBtn?.addEventListener('click', () => {
        Analyzer.analyze();
        if (elements.analysisSection) elements.analysisSection.open = true;
      });
      elements.copyBtn?.addEventListener('click', () => this.copyToClipboard());
      elements.clearBtn?.addEventListener('click', () => this.clearAll());
      elements.addColumnBtn?.addEventListener('click', () => TableOperations.addColumn());
      elements.addRowBtn?.addEventListener('click', () => TableOperations.addRow());
      elements.sortRowsBtn?.addEventListener('click', () => TableOperations.sortRows());
      elements.removeColumnBtn?.addEventListener('click', () => TableOperations.removeColumn());
      elements.removeRowBtn?.addEventListener('click', () => TableOperations.removeRow());
      elements.reorderBtn?.addEventListener('click', () => this.toggleReorderMode());

      // Input parsing with debounce
      elements.inputTextArea?.addEventListener('input', debounce(() => this.parseTable(), 300));

      // Output format change
      elements.outputFormat?.addEventListener('change', (e) => {
        OutputGenerator.setFormat(e.target.value);
      });

      // Additional format change listener for reliability
      document.addEventListener('change', (e) => {
        if (e.target?.id === 'outputFormat') {
          OutputGenerator.setFormat(e.target.value);
        }
      });

      // Page lifecycle events
      window.addEventListener('DOMContentLoaded', () => ThemeManager.init());
      
      window.addEventListener('beforeunload', (e) => {
        if (!state.isEmpty()) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    },

    initializeKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
          } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
            e.preventDefault();
            this.redo();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            this.parseTable();
          } else if (e.shiftKey && e.key === 'C') {
            e.preventDefault();
            this.copyToClipboard();
          }
        }
      });
    }
  };

  // Initialize the application
  App.init();
})();
