# TabMD

TabMD is a vanilla HTML, CSS, and JavaScript table editor built with native ES modules and Vite. It imports Markdown and HTML tables, supports inline editing and analysis, and exports Markdown, JSON, or HTML.

## Development

Install Bun, then run:

```bash
bun install
bun run dev
bun run build
bun run preview
```

`bun run build` creates the Vite production output in `dist/` and generates the Workbox service worker as the final build step. Run the focused logic tests with `bun test`.
