# Market Researcher — Frontend

Vite + React + Tailwind frontend for turning raw event data (XLSX / CSV / PDF) into a client-ready post-event report deck.

## Stack

| Layer            | Tool                                     |
| ---------------- | ---------------------------------------- |
| Frontend         | Vite + React 18 + TypeScript + Tailwind  |
| AI pipeline      | Anthropic Claude (`claude-sonnet-4-5`)   |
| Report gen       | `pptxgenjs` (client) or Genspark (proxy) |
| Deployment       | Vercel                                   |
| Data processing  | In-browser (XLSX, papaparse, pdfjs)      |

## Quick start

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev
```

## Deploy to Vercel

1. Push this folder to a Git repo.
2. Import into Vercel — framework preset: **Vite**.
3. Add `ANTHROPIC_API_KEY` (and optionally `GENSPARK_API_KEY`) in Project → Settings → Environment Variables.
4. Deploy. The `api/` folder is auto-detected as Edge Functions.

## Project layout

```
api/
  commentary.ts      Vercel Edge route → calls Claude
  export-deck.ts     Optional Vercel Edge route → calls Genspark
src/
  components/        DropZone, SlideCanvas, ThemePicker, DatasetSummary, ui/*
  lib/
    ai.ts            Calls /api/commentary
    parsers.ts       XLSX / CSV / PDF parsing + dataset detection
    metrics.ts       Cleans and aggregates parsed datasets
    pptxExport.ts    Builds PPTX with pptxgenjs (swap for Genspark if desired)
    themes.ts        Deck colour / type themes
  pages/Index.tsx    Main 4-step workflow (Ingest → Brief → Edit → Export)
  index.css          McKinsey-inspired design tokens
```

## Where to swap implementations

### Move heavy parsing to Python
`src/lib/parsers.ts` runs in the browser. For >20MB files or complex PDFs, replace `parseFile()` with a `fetch("/api/parse", { body: file })` call to a Python service (FastAPI on Fly/Modal, or Vercel Python runtime).

### Swap PPTX export for Genspark / Sparkpages
`src/lib/pptxExport.ts` builds the deck client-side. To use Genspark instead, replace `exportDeck()` body with:

```ts
const res = await fetch("/api/export-deck", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const { url } = await res.json();
window.open(url, "_blank");
```

Then wire `api/export-deck.ts` to the actual Genspark endpoint and payload shape.

### Swap Claude model
Edit `CLAUDE_MODEL` in `api/commentary.ts`.

## License

Private — adapt as needed.
