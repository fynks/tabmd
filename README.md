# TabMD

TabMD is a vanilla HTML, CSS, and JavaScript table editor built with native ES modules and Vite. It imports Markdown, HTML, and JSON tables, supports inline editing and analysis, and exports Markdown, JSON, or HTML.

## Import formats

- Markdown tables keep their column alignments and read escaped pipes. Legacy `yes`/`no` and symbol values are normalized to check marks.
- HTML tables keep alignment and colspan cells.
- JSON tables accept an array of row objects, a flat key/value object, or the nested record shape produced by the JSON output, for example `{"Service A": {"Provider One": "✅"}}`. Nested records import with a `Service Name` label column.

## Check columns

**Add column** opens a builder for matrix-style tables. Name the column and list the rows that should be marked, separated by commas, semicolons, or new lines. Listed rows get the marked value (a check mark by default) and the remaining rows get the unmarked value (a cross mark by default). An empty list adds a plain empty column.

Row names are matched against the first column of the table, ignoring case, surrounding whitespace, and `**` emphasis markers. Names without a matching row are reported, and the builder can also append them as fully unmarked rows. The column, its values, and any created rows are applied as one undoable step.

## Development

Install Bun, then run:

```bash
bun install
bun run dev
bun run build
bun run preview
```

`bun run build` creates the Vite production output in `dist/` and generates the Workbox service worker as the final build step. Run the focused logic tests with `bun test`.
