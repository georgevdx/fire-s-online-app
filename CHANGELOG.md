# Fire-S v105.1 Action Sync Fix

- Fixes Action Register counters staying on 0.
- Backfills `project.actions` from existing NO checklist answers.
- Keeps one open action per NO answer and closes actions when answers change away from NO.
- Refreshes Action Register and Premises Workspace counters after answer/save/finish events.
- Keeps existing layout unchanged.
