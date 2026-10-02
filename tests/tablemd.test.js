import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  ALIGNMENT,
  OUTPUT_FORMAT,
  TableHistory,
  TableMD,
  analyzeTable,
  formatHTML,
  formatJSON,
  formatMarkdown,
  formatTable,
  isChecked,
  isUnchecked,
  normalizeCheckValue,
  parseMarkdownTable,
  parseTable,
} from '../src/tablemd.js';

const htmlWindow = new Window();
const parseHtml = (input) => parseTable(input, { DOMParser: htmlWindow.DOMParser });

describe('Markdown and HTML parsing', () => {
  test('parses a basic Markdown table and pads short rows', () => {
    expect(parseMarkdownTable('| Name | Done |\n| --- | --- |\n| Ada | yes |\n| Lin |')[0]).toBeUndefined();
    const table = parseMarkdownTable('| Name | Done |\n| --- | --- |\n| Ada | yes |\n| Lin |');
    expect(table).toEqual({
      headers: ['Name', 'Done'],
      alignments: [ALIGNMENT.LEFT, ALIGNMENT.LEFT],
      rows: [['Ada', '✅'], ['Lin', '']],
    });
  });

  test('preserves Markdown left, center, and right alignment', () => {
    const table = parseMarkdownTable('| Left | Middle | Right |\n| :--- | :---: | ---: |\n| a | b | c |');
    expect(table.alignments).toEqual([ALIGNMENT.LEFT, ALIGNMENT.CENTER, ALIGNMENT.RIGHT]);
  });

  test('parses HTML as text, preserves alignment, and expands body and header colspan', () => {
    const table = parseHtml(`
      <table>
        <thead><tr><th colspan="2" style="text-align: center">People</th><th class="text-right">Score</th></tr></thead>
        <tbody><tr><td colspan="2">&lt;value&gt;</td><td>9</td></tr></tbody>
      </table>
    `);
    expect(table).toEqual({
      headers: ['People', '', 'Score'],
      alignments: [ALIGNMENT.CENTER, ALIGNMENT.CENTER, ALIGNMENT.RIGHT],
      rows: [['<value>', '', '9']],
    });
  });

  test('preserves empty HTML cells and normalizes legacy boolean values and symbols', () => {
    const table = parseHtml('<table><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr><tr><td></td><td>false</td><td>✔️</td><td>✗</td></tr></table>');
    expect(table.rows).toEqual([['', '❌', '✅', '❌']]);
    for (const value of ['yes', 'true', 'y', '✅', '✔️', '✔', '✓']) expect(isChecked(value)).toBe(true);
    for (const value of ['no', 'false', 'n', '❌', '✖️', '✖', '✗', '×']) expect(isUnchecked(value)).toBe(true);
    expect(normalizeCheckValue('Y')).toBe('✅');
    expect(normalizeCheckValue('N')).toBe('❌');
  });

  test('rejects empty and malformed source with a useful message', () => {
    expect(() => parseTable('  ')).toThrow('Please enter a Markdown or HTML table');
    expect(() => parseTable('| A | B |\n| --- |')).toThrow('same number of columns');
  });
});

describe('formatting and analysis', () => {
  const table = {
    headers: ['Name', 'Done', 'Notes'],
    alignments: [ALIGNMENT.LEFT, ALIGNMENT.CENTER, ALIGNMENT.RIGHT],
    rows: [['Ada', 'yes', 'ready'], ['Lin', 'no', 'later']],
  };

  test('formats Markdown headers, rows, and alignments', () => {
    expect(formatMarkdown(table)).toBe([
      '| Name | Done | Notes |',
      '| :--- | :---: | ---: |',
      '| Ada | ✅ | ready |',
      '| Lin | ❌ | later |',
    ].join('\n'));
  });

  test('retains the legacy key/value JSON export', () => {
    expect(formatJSON(table)).toBe(JSON.stringify({
      Ada: { Done: '✅', Notes: 'ready' },
      Lin: { Done: '❌', Notes: 'later' },
    }, null, 2));
    expect(formatTable(table, OUTPUT_FORMAT.JSON)).toBe(formatJSON(table));
  });

  test('escapes HTML content only at serialization time', () => {
    const raw = { headers: ['<Name>', 'Status'], alignments: ['left', 'right'], rows: [['<img src=x onerror="x"> &', 'yes']] };
    const html = formatHTML(raw);
    expect(html).toContain('&lt;Name&gt;');
    expect(html).toContain('&lt;img src=x onerror=&quot;x&quot;&gt; &amp;');
    expect(html).toContain('<td class="text-right">✅</td>');
    expect(raw.headers[0]).toBe('<Name>');
    expect(raw.rows[0][0]).toBe('<img src=x onerror="x"> &');
  });

  test('analysis remains derived from the current state', () => {
    expect(analyzeTable(table)).toBe('| **Total** = 2 | **1/2** | **0/2** |');
  });
});

describe('history and table operations', () => {
  test('undoes, redoes, and discards redo states after a new edit', () => {
    const editor = new TableMD({ headers: ['Name'], alignments: ['left'], rows: [['A']] });
    expect(editor.editCell(0, 0, 'B')).toBe(true);
    expect(editor.editHeader(0, 'Person')).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.state.headers).toEqual(['Name']);
    expect(editor.state.rows).toEqual([['B']]);
    expect(editor.editCell(0, 0, 'C')).toBe(true);
    expect(editor.canRedo).toBe(false);
    expect(editor.redo()).toBe(false);
  });

  test('records multiple consecutive mutations once each', () => {
    const history = new TableHistory({ headers: ['A'], alignments: ['left'], rows: [] }, 10);
    expect(history.commit({ headers: ['A'], alignments: ['left'], rows: [['1']] })).toBe(true);
    expect(history.commit({ headers: ['A'], alignments: ['left'], rows: [['1']] })).toBe(false);
    expect(history.commit({ headers: ['A'], alignments: ['left'], rows: [['2']] })).toBe(true);
    expect(history.undo().rows).toEqual([['1']]);
    expect(history.undo().rows).toEqual([]);
    expect(history.redo().rows).toEqual([['1']]);
  });

  test('adds and removes rows and columns while keeping the table rectangular', () => {
    const editor = new TableMD({ headers: ['Name'], alignments: ['left'], rows: [['Ada']] });
    expect(editor.addRow()).toBe(true);
    expect(editor.state.rows[1]).toEqual(['']);
    expect(editor.addColumn('Done')).toBe(true);
    expect(editor.state.rows).toEqual([['Ada', ''], ['', '']]);
    expect(editor.removeRow(1)).toBe(true);
    expect(editor.removeColumn(1)).toBe(true);
    expect(editor.state).toEqual({ headers: ['Name'], alignments: ['left'], rows: [['Ada']] });
  });

  test('sorts rows and moves rows and columns without losing cell values or alignments', () => {
    const editor = new TableMD({
      headers: ['Name', 'Score'],
      alignments: ['left', 'right'],
      rows: [['row 10', 'ten'], ['row 2', 'two'], ['row 1', 'one']],
    });
    expect(editor.sortRows()).toBe(true);
    expect(editor.state.rows.map((row) => row[0])).toEqual(['row 1', 'row 2', 'row 10']);
    expect(editor.moveRow(0, 2)).toBe(true);
    expect(editor.state.rows.map((row) => row[0])).toEqual(['row 2', 'row 10', 'row 1']);
    expect(editor.moveColumn(1, 0)).toBe(true);
    expect(editor.state).toEqual({
      headers: ['Score', 'Name'],
      alignments: ['right', 'left'],
      rows: [['two', 'row 2'], ['ten', 'row 10'], ['one', 'row 1']],
    });
    expect(editor.undo()).toBe(true);
    expect(editor.state.headers).toEqual(['Name', 'Score']);
  });

  test('uses the same history for edits and structural operations', () => {
    const editor = new TableMD({ headers: ['A'], alignments: ['left'], rows: [['one']] });
    editor.editCell(0, 0, 'two');
    editor.addRow();
    editor.removeRow();
    expect(editor.undo()).toBe(true);
    expect(editor.state.rows).toEqual([['two'], ['']]);
    expect(editor.undo()).toBe(true);
    expect(editor.state.rows).toEqual([['two']]);
  });
});
