# Market Researcher — Frontend Export

Clean React + Vite + Tailwind frontend for the Market Researcher post-event report generator. Stripped of Lovable Cloud / Supabase wiring so you can plug in your own stack:

- **Frontend**: React 18 + Vite + Tailwind (this bundle). Easy to port to Next.js — components are framework-agnostic.
- **AI pipeline**: Claude (claude-sonnet-4-5) — replace the `generateCommentary()` stub in `src/lib/ai.ts`.
- **Report generation**: Genspark / Sparkpages — replace `exportDeck()` in `src/lib/pptxExport.ts` or call your Sparkpages endpoint instead.
- **Data processing**: Python via Claude Code — the in-browser parsers in `src/lib/parsers.ts` and `src/lib/metrics.ts` are kept as a fast client-side preview; swap to a Python backend by POSTing files to your endpoint and feeding the response into `setDatasets` / `setMetrics`.
- **Deployment**: Vercel — `vite build` outputs to `dist/`. Zero config needed.

## Run locally
```bash
npm install
npm run dev
```

## What was removed
- `src/integrations/supabase/*` (Lovable Cloud client + types)
- `supabase/` edge function for AI commentary
- Direct `supabase.functions.invoke` call in `src/pages/Index.tsx` — replaced with a `generateCommentary()` stub in `src/lib/ai.ts` you wire to Claude.

## Wiring Claude
Edit `src/lib/ai.ts` — point it at your serverless route (e.g. `/api/commentary` on Vercel) that proxies to Anthropic. Keep the API key server-side.

## Wiring Genspark / Sparkpages
Edit `src/lib/pptxExport.ts` — either keep the local `pptxgenjs` export or replace the body with a `fetch()` to your Sparkpages render endpoint and trigger a download from the response.
