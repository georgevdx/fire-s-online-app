Fire-S Sprint 109.1 - Inspection History & Versioning

Purpose
- Stabilises the existing premises workflow after the Sprint 109.0 core fix.
- Keeps Premises and Building Passport information permanent.
- Saves the previous inspection into Inspection History when Start New Inspection is used.
- Starts the new inspection with blank answers, blank photos and blank comments.

Added
- sprint-109-1-history.js
- Inspection History & Versioning panel inside the inspection form.
- Current Inspection summary card.
- Previous inspection rows with View and Report actions.
- Completed inspection read-only banner.
- Styling appended to styles.css.

Important behaviour
- This is a safe add-on wrapper. It does not remove app.js, Action Register, Risk Engine or Building Passport logic.
- Existing archived inspections remain compatible with the older archive/report functions.
- Start New Inspection now uses the Sprint 109.1 versioning wrapper.

Test path
1. Open an existing premises with completed answers/photos.
2. Click Start New Inspection.
3. Confirm the prompt.
4. The form should reopen with premises data intact and checklist answers blank.
5. Open the Inspection History panel and confirm the previous inspection is listed.
