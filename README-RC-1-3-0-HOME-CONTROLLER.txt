Fire-S RC 1.3.0 - Single Home Controller Refactor

Upload:
- app.js

Purpose:
- Removes stacked RC 1.2.0F / 1.2.1A-E / 1.2.1J home hotfix wrappers that caused Command Centre and Inspector Work Area to render against each other.
- Replaces them with one role-based Home Controller.
- Inspector sees only Inspection Gateway and Schedule / New Site.
- Management/Admin sees management dashboard cards.
- No MutationObserver / setTimeout render loops for Home.

Test:
1. Open app on laptop.
2. Open app on phone.
3. Click Back to Home several times.
4. Confirm only one home view renders and no Command Centre / Inspector flicker occurs.
