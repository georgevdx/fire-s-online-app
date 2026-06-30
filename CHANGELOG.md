
## Sprint 110.1 - Dashboard Data Consolidation
- Added data-driven Executive Intelligence layer.
- Removed duplicate/generic AI recommendation cards from the dashboard.
- Priority Action Items now read from the Action Register first.
- Weakest Categories now group actual open actions and current answer data.
- Added deduplication to prevent repeated identical executive cards.

# Fire-S v105.3 Action Register Hard Fix

- Forces the Action Register to derive and save actions from checklist NO answers.
- Permanently writes generated actions to `project.actions`.
- Replaces the Action Register render source so counters no longer stay at 0.
- Keeps Update / Resolve buttons for saved actions.


## Sprint 109.0 - Multi-Inspection Core Fix
- Added Start New Inspection workflow for existing premises.
- Archives previous inspection cycle before resetting answers/photos.
- Keeps premises and Building Passport information intact.
- Clears stale checklist DOM fields before opening inspections.


## Sprint 110.0 - AI Assist Foundation

- Added offline AI Assist panel.
- Added draft executive summary generation.
- Added rule-based recommended next actions.
- Added priority guidance for open No-items.
- Added weakest category and trend signal support.
