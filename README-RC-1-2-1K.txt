RC 1.2.1K - Single Home View CSS Guard

Upload:
- styles.css

Purpose:
- Emergency CSS-only guard where Command Centre and Inspector Work Area render together.
- Hides Command Centre when Inspector Work Area is present.
- Reduces startup repaint/hop by disabling transform movement on home cards.

Note:
- This is a safe visual guard. The proper long-term fix is in app.js: only one home renderer should run based on role.
