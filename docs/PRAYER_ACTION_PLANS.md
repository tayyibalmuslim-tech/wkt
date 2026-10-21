# Prayer action plans — validation report

Implemented in existing prayer settings, daily prayer cards, and snapshot sync. No runtime dependencies were added. Slot counts are saved without replacing the settings DOM. Canonical action IDs/category colors are resolved at render time; deleted actions are hidden on cards and removable in settings.

## Passed

- Feature tests: add one/multiple actions, reuse across prayers, edit counts, reject invalid counts, reorder, remove, preserve source action, canonical name/color updates, missing references, persisted JSON restore, schema validation and unchanged recording/task/project/prayer-task data.
- Firebase contract test with two independent windows: first additions on legacy snapshots, same-prayer add/count edits, simultaneous reorder/count edit and deletion delivery. Existing offline/reload/conflict/account regression scenarios also pass. This is a deterministic mock, not a live two-device account test.
- 22 of 25 test files pass when run independently, including all new feature coverage and existing sync tests.
- JavaScript syntax and git diff whitespace checks pass.

## Existing failures reproduced before changes

The baseline is upstream commit `5d5aa99a752b10252202b69b08bf521dab6c1113`.

- `tests/planner.test.cjs:200`: direct child selector for `child-family` does not match the current grouped DOM.
- `tests/dashboard-workspace.test.cjs:174`: `row('missed-root')` is absent.
- `tests/day-workspace.test.cjs:54`: expects 3, receives 4.

`npm test` stops at the planner failure; running every test file independently finds the same three failures as the untouched baseline. These existing behaviors were not changed by this feature.

## Browser validation pending

`npm run test:prayer-plans:browser` adds actual Chromium coverage at 390px and 1280px for wrapping/overflow, existing prayer information, settings editing and page reload persistence. It could not run in this environment: Chromium is absent and Playwright download returned invalid/truncated archives. No visual or live Firebase validation is claimed. Keep this PR unmerged pending these checks and review of existing suite failures.
