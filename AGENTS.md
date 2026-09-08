# Fire-S agent rules

## Toetsblad first, live only when asked

Put every forward change on the **toets-blad** (`staging/`) first.

Do **not** sit live until the user says so (`sit live`, `sit dit live`, or equivalent). Sitting live means changing root live files (`app.js`, `index.html`, `service-worker.js`, live `fire-s-*.js`) and publishing them.

After a sit-live, copy the same workflow onto the toets-blad so the two apps do not drift. The user must not get a different Inspection Gateway, Premises Command Centre, Home count, or report path on toets versus live.

## Keep toets extras

Do not wipe toets-only files or behaviour to match live:

- `staging/fire-s-payfast.js` and `staging/fire-s-md5.js`
- Create password when the typed email has no password yet
- New-inspection stay-on-form (not sat live yet)
- Displayed version **1.3.64-toets**

Do not run `scripts/sync-toets-blad.sh` as a blanket copy. That overwrites toets extras.

## Never copy live inspections onto the toets-blad

Do not import, dump, migrate, or upload live production inspections, premises, or photos into the toets-blad or Fire-S Test Supabase.

Matching **code/workflow** between live and toets is required. Matching **live inspection data** is not.

Live and toets share the GitHub Pages origin, so they share the browser `localStorage`. The toets-blad must keep its own keys (`fireyeProjectsStaging` and related staging keys). Never copy `fireyeProjects` into those keys. Toets starts empty on the device and may pull only from Fire-S Test.

## Live constraints

- Displayed live version stays **1.3.58** unless the user asks to bump it.
- Do not delete inspections.
- `createNewProject` stays a blank form.
