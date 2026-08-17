# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
Fire-S is a static, framework-less, offline-first fire-safety inspection **PWA**. The entire product runs in the browser: `index.html` loads `app.js` plus patch modules and JSON data files. Inspection data is stored in the browser's `localStorage`.

There is **no package manager, no build step, and no automated test or lint tooling** in this repo.

### Running it (the only service)
Serve the repo root over HTTP — do **not** open `index.html` via `file://`.

```
python3 -m http.server 8787
```

Then open `http://127.0.0.1:8787/`. The Cloud environment starts this automatically via the `static-server` terminal.

### Testing
Validate via browser testing. Core hello-world: home → Inspection Gateway or INSPECT workspace → create/open an inspection.

### Supabase (optional)
Cloud login/sync uses Supabase configured in `app.js`. Optional for local dev — the app runs fully without it. Schema SQL files (`SUPABASE_*.sql`) are applied manually in Supabase.
