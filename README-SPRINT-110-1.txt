Fire-S Sprint 110.1 - Dashboard Data Consolidation

Purpose:
- Remove generic duplicate AI Assist cards.
- Make the Executive Dashboard use the Action Register as the source of truth.

What changed:
- Added sprint-110-1-dashboard-data-consolidation.js.
- Replaced placeholder headings such as "Inspection item" with the actual action/question/finding text.
- Replaced generic "General" categories with inferred or Action Register section categories.
- Limited the executive list to the Top 5 priority action items.
- Deduplicated actions before rendering.
- Weakest Categories now uses open actions and current inspection answer data.

Notes:
- This is still offline/rule-based. No external AI service is used.
- Action Register remains the master data source.
