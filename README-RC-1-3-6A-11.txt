RC 1.3.6A.11 - Project Compliant Flicker Fix

Upload:
- app.js
- styles.css

Fix:
- Projects/Mission Control filter cards now use the same strict production matcher as the Home KPI cards.
- Stops Compliant on Projects page repainting between old count and strict count.
- Pagination uses the same filtered dataset.
- Older fireSApplyMissionFilter functions are routed to the final A11 renderer.
