# Fire-S RC 1.1.16A - Photo Sync Phase 1

Stability hotfix for Smart Photo Centre.

## Fixed
- Smart Photo Centre now reads from the same `currentPhotos` / `project.photos[]` source as the existing Photo Evidence counter.
- Prevents creation of a separate `window.currentPhotos` array that caused `Photos: 1/10` but `Smart Photo Centre: 0 photos`.
- Keeps category, area, linked item and notes on the actual photo object.
- Updates cache/version strings to RC 1.1.16A.

## Modified files
- index.html
- app.js
- styles.css
- service-worker.js
- CHANGELOG.md
