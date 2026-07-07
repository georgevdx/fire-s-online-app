Fire-S RC 1.2.0G - Mission Control Refinement

Upload to GitHub:
- app.js
- styles.css
- README-RC-1-2-0G.txt

Changes:
1. Removed Executive Snapshot above Mission Control.
2. Removed the old More Filters bar above Mission Control.
3. Removed beta Field Ready / Ready for Site panels.
4. Renamed + New to clearly indicate a new inspection at a new site.
5. Strengthened role-based UI separation:
   - Inspector: search/open inspection and input workflow only.
   - Management/owner/admin: portfolio stats and management cards remain available.

Note:
This is a UI access refinement. Database-level access enforcement should still be handled through Supabase RLS / role policies in a later security sprint.
