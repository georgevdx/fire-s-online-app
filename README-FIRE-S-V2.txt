Fire-S v2 Architecture Foundation v1.0

This release introduces a modular structure:
- modules/dashboard.js
- modules/gateway.js
- modules/workspace.js
- modules/inspections.js
- modules/actions.js
- styles/dashboard.css
- styles/gateway.css
- styles/workspace.css

Existing behaviour is preserved. Future features can now be added in modules instead of repeatedly replacing large parts of app.js.
