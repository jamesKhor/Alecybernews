<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Context7 — Always use official docs

This project has **Context7 MCP** installed. Before writing any code that uses a library from the tech stack, you MUST use Context7 to fetch the latest official documentation for that library.

**Tech stack libraries requiring Context7 lookup:**
- `next` — Next.js 16 (breaking changes from 15, always check docs)
- `next-auth` — Auth.js v5 beta (API differs significantly from v4)
- `next-intl` — v4.x (locale routing, middleware integration)
- `ai` / `@ai-sdk/openai-compatible` — Vercel AI SDK v6
- `zod` — v4.x schema validation
- `pagefind` — static search indexing
- `rss-parser` — feed parsing

**Rule:** Do not rely on training data for any of the above. Call Context7 first, then write code.
