# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
Fire-S is a static, framework-less, offline-first fire-safety inspection **PWA**. The entire product runs in the browser: `index.html` loads `app.js` plus many incremental patch modules (`sprint-*.js`, `fire-s-*.js`, `action-*.js`, etc.) and several runtime data files (`checklists.json`, `templates.json`, `occupancies.json`, `requirements.json`, `rules.json`). Inspection data is stored in the browser's `localStorage`.

There is **no package manager, no build step, no bundler, and no automated test or lint tooling** in this repo (no `package.json`, no lockfiles, no `Makefile`, no `.sh` scripts). Do not look for `npm`/`pnpm`/`pytest`/`eslint` — none are configured. "Build" is a no-op: deployment (Netlify, see `netlify.toml`) just publishes the repo root as static files.

### Running it (the only service)
Serve the repo root over HTTP — do **not** open `index.html` via `file://`, because the app `fetch()`es the JSON data files and that fails on the file protocol. `python3` (3.12) and `node` (22) are already installed in the base image; no install needed.

```
python3 -m http.server 8787
```

Then open `http://127.0.0.1:8787/`. This is documented in `README.md` (in Afrikaans). Any static file server works.

### Testing / demonstrating
There are no automated tests. Validate changes by manual/browser testing against the static server. The app is offline-first: after an initial company registration (stored locally), you can create inspections, work checklists, generate reports, and export JSON backups entirely from `localStorage` with no network. Core hello-world flow: home dashboard → Inspection Gateway → "+ New Inspection at New Site" → fill Site Information → Save Draft → the inspection appears in the Premises Overview list.

### Supabase (optional, external)
Cloud login/sync/team features use Supabase (`supabase-js-v2.js`, config hard-coded in `app.js`; schema in the `SUPABASE_*.sql` files applied manually in a Supabase project). This is **optional** and not required for local development or testing — the app runs fully without it. Do not attempt to stand up Supabase locally unless a task specifically requires cloud features.
