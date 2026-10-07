import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  ALIGNMENT,
  JSON_LABEL_HEADER,
  OUTPUT_FORMAT,
  TableHistory,
  TableMD,
  analyzeTable,
  analyzeTableData,
  buildCheckColumn,
  formatHTML,
  formatJSON,
  formatMarkdown,
  formatTable,
  isChecked,
  isUnchecked,
  normalizeCheckValue,
  parseJSONTable,
  parseMarkdownTable,
  parseTable,
  splitMemberList,
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
    expect(() => parseTable('  ')).toThrow('Please enter a Markdown, HTML, or JSON table');
    expect(() => parseTable('| A | B |\n| --- |')).toThrow('same number of columns');
  });
});

describe('JSON parsing', () => {
  test('parses the legacy nested record used by md-table-to-json', () => {
    const table = parseJSONTable(JSON.stringify({
      'Service A': { 'Provider One': '✅', 'Provider Two': '❌' },
      'Service B': { 'Provider One': '❌', 'Provider Two': '✅' },
    }));
    expect(table).toEqual({
      headers: [JSON_LABEL_HEADER, 'Provider One', 'Provider Two'],
      alignments: [ALIGNMENT.LEFT, ALIGNMENT.LEFT, ALIGNMENT.LEFT],
      rows: [
        ['Service A', '✅', '❌'],
        ['Service B', '❌', '✅'],
      ],
    });
  });

  test('round-trips the JSON export back into a table', () => {
    const table = {
      headers: ['Name', 'Done', 'Notes'],
      alignments: [ALIGNMENT.LEFT, ALIGNMENT.CENTER, ALIGNMENT.RIGHT],
      rows: [['Ada', '✅', 'ready'], ['Lin', '❌', 'later']],
    };
    const restored = parseJSONTable(formatJSON(table));
    expect(restored.headers).toEqual([JSON_LABEL_HEADER, 'Done', 'Notes']);
    expect(restored.rows).toEqual([['Ada', '✅', 'ready'], ['Lin', '❌', 'later']]);
  });

  test('parses an array of row objects with a union of keys', () => {
    const table = parseJSONTable('[{"name":"Ada","done":true},{"name":"Lin","notes":"later"}]');
    expect(table.headers).toEqual(['name', 'done', 'notes']);
    expect(table.rows).toEqual([['Ada', '✅', ''], ['Lin', '', 'later']]);
  });

  test('parses flat objects as key/value rows and normalizes legacy values', () => {
    const table = parseJSONTable('{"Ada": "yes", "Lin": "no", "Max": null}');
    expect(table).toEqual({
      headers: ['Key', 'Value'],
      alignments: [ALIGNMENT.LEFT, ALIGNMENT.LEFT],
      rows: [['Ada', '✅'], ['Lin', '❌'], ['Max', '']],
    });
  });

  test('keeps nested row-object values addressable instead of dropping them', () => {
    const table = parseJSONTable('[{"name":"Ada","meta":{"tags":["a","b"]}}]');
    expect(table.headers).toEqual(['name', 'meta']);
    expect(table.rows).toEqual([['Ada', '{"tags":["a","b"]}']]);
    expect(parseJSONTable('{"Ada": {"tags": ["a","b"]}}').rows).toEqual([['Ada', '["a","b"]']]);
  });

  test('detects JSON inside parseTable and reports malformed JSON', () => {
    expect(parseTable('{"Ada": {"Done": "✅"}}').headers).toEqual([JSON_LABEL_HEADER, 'Done']);
    expect(() => parseTable('{"Ada": }')).toThrow('Invalid JSON');
    expect(() => parseTable('{}')).toThrow('at least one entry');
    expect(() => parseTable('[]')).toThrow('at least one row object');
    expect(() => parseTable('[{}]')).toThrow('no keys to use as headers');
    expect(() => parseTable('[1, 2]')).toThrow('must be an object');
    expect(() => parseTable('"Ada"')).toThrow('valid HTML, JSON, or Markdown table');
  });
});

describe('check columns', () => {
  const table = {
    headers: ['Service Name', 'Provider'],
    alignments: [ALIGNMENT.LEFT, ALIGNMENT.LEFT],
    rows: [['Real-Debrid', '✅'], ['AllDebrid', '✅'], ['**TorBox**', '❌']],
  };

  test('splits member lists on commas, semicolons, and new lines', () => {
    expect(splitMemberList('a, b\nc;d ,\n')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitMemberList('')).toEqual([]);
  });

  test('marks listed rows and crosses the rest, ignoring case and emphasis', () => {
    const { table: next, created, unmatched } = buildCheckColumn(table, {
      header: 'Premiumize',
      members: 'real-debrid, torbox',
    });
    expect(next.headers).toEqual(['Service Name', 'Provider', 'Premiumize']);
    expect(next.alignments).toEqual([ALIGNMENT.LEFT, ALIGNMENT.LEFT, ALIGNMENT.LEFT]);
    expect(next.rows).toEqual([
      ['Real-Debrid', '✅', '✅'],
      ['AllDebrid', '✅', '❌'],
      ['**TorBox**', '❌', '✅'],
    ]);
    expect(created).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  test('reports listed names without a row and only adds them on request', () => {
    const options = { header: 'Premiumize', members: 'Real-Debrid, Newcomer' };
    const reported = buildCheckColumn(table, options);
    expect(reported.unmatched).toEqual(['Newcomer']);
    expect(reported.created).toEqual([]);
    expect(reported.table.rows.map((row) => row[0])).toEqual(['Real-Debrid', 'AllDebrid', '**TorBox**']);

    const added = buildCheckColumn(table, { ...options, addMissingRows: true });
    expect(added.created).toEqual(['Newcomer']);
    expect(added.table.rows).toEqual([
      ['Real-Debrid', '✅', '✅'],
      ['AllDebrid', '✅', '❌'],
      ['**TorBox**', '❌', '❌'],
      ['Newcomer', '❌', '✅'],
    ]);
  });

  test('accepts custom marks and keeps an empty member list as a plain column', () => {
    expect(buildCheckColumn(table, { header: 'Notes' }).table.rows.map((row) => row[2])).toEqual(['', '', '']);
    expect(buildCheckColumn(table, { header: 'Mirror' }).unmatched).toEqual([]);
    const custom = buildCheckColumn(table, {
      header: 'Mirror',
      members: 'AllDebrid',
      marked: 'supported',
      unmarked: 'unsupported',
    });
    expect(custom.table.rows.map((row) => row[2])).toEqual(['unsupported', 'supported', 'unsupported']);
  });

  test('adds the column and any created rows as one history entry', () => {
    const editor = new TableMD(table);
    const result = editor.addCheckColumn('Premiumize', {
      members: 'Real-Debrid, Newcomer',
      addMissingRows: true,
    });
    expect(result.created).toEqual(['Newcomer']);
    expect(result.unmatched).toEqual(['Newcomer']);
    expect(editor.state.headers).toEqual(['Service Name', 'Provider', 'Premiumize']);
    expect(editor.state.rows).toEqual([
      ['Real-Debrid', '✅', '✅'],
      ['AllDebrid', '✅', '❌'],
      ['**TorBox**', '❌', '❌'],
      ['Newcomer', '❌', '✅'],
    ]);

    expect(editor.undo()).toBe(true);
    expect(editor.state.headers).toEqual(['Service Name', 'Provider']);
    expect(editor.state.rows.map((row) => row[0])).toEqual(['Real-Debrid', 'AllDebrid', '**TorBox**']);
  });

  test('keeps the plain empty column behaviour of the original addColumn', () => {
    const editor = new TableMD(table);
    expect(editor.addColumn('Notes')).toBe(true);
    expect(editor.state.rows.map((row) => row[2])).toEqual(['', '', '']);
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
    expect(analyzeTableData(table)).toEqual({
      total: 2,
      columns: [
        { name: 'Done', checked: 1, total: 2, percent: 50 },
        { name: 'Notes', checked: 0, total: 2, percent: 0 },
      ],
    });
  });

  test('analysis counts only columns after the row label column', () => {
    const single = { headers: ['Name'], alignments: [ALIGNMENT.LEFT], rows: [['Ada']] };
    expect(analyzeTableData(single)).toEqual({ total: 1, columns: [] });
    expect(analyzeTable(single)).toBe('| **Total** = 1 |');
    expect(analyzeTable({ headers: ['Name'], alignments: [ALIGNMENT.LEFT], rows: [] })).toBe('');
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
