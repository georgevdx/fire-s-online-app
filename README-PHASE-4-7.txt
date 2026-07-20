Fire-S Phase 4.7 - Real Native File Controls

Changed files only:
- index.html
- app.js
- styles.css

The two visible photo controls are now the actual HTML file inputs.
No label forwarding, transparent overlay, showPicker(), or JavaScript click() is used.

Take Photo requests the rear camera with capture="environment".
Choose from Gallery uses a separate file input without capture.
Photo source metadata is saved on each new photo.
