Fire-S Sprint 109.2 - Inspection Comparison

Purpose
- Adds a comparison layer between the current inspection and a previous inspection for the same premises.
- Builds on Sprint 109.1 Inspection History.

Included
- sprint-109-2-comparison.js
- CSS appended to styles.css
- index.html script registration

Features
- Compliance comparison: previous % to current %
- Open Action comparison
- Answered checklist item comparison
- Photo count comparison
- New Action Items
- Repeated Action Items
- Closed / Improved Items
- Drop-down selector to compare against any previous inspection in history

Design Notes
- Premises and Building Passport information remain permanent.
- Previous inspections are read from inspectionHistory.
- The current inspection remains the active editable inspection unless it has been completed by the existing workflow.
- This sprint does not overwrite history records.

Testing
1. Open an existing premises with at least one archived inspection.
2. Confirm the Inspection History panel appears.
3. Confirm the Inspection Comparison panel appears below it.
4. Select another previous inspection from the comparison drop-down.
5. Confirm compliance, open actions, repeated actions and closed/improved items update.
