RC 1.2.0O - Mobile Stable Repair

Purpose:
- Restore from rollback stable baseline.
- Fix phone loading issue caused by stale mobile/PWA/browser cache.
- No UI/filter/business logic changes.

Upload these files:
- index.html
- app.js
- styles.css
- service-worker.js

Notes:
- If the phone still shows old behaviour, close browser/app fully and refresh once.
- This patch clears old service-worker caches and prevents stale mobile files.
