# Task transfers

The existing task engine remains the only task system. `allTasksOn` projects a
stored task into its current day and produces read-only historical rows. Project
and family calculations use only active task entries, excluding historical rows.

## Data and compatibility

Legacy tasks are unchanged until their first transfer. No destructive migration,
new database path, or Firebase rules change is required. The source task remains
in its original `sunsetDays[date].tasks` bucket with its ID, memberships, ordering,
subtasks, action, and settings intact. Current execution state is represented by:

- `executionBase`: original day, periods, outcome, cumulative slots and reservation.
- `executionEvents`: immutable records keyed by UUID. Each includes its previous
  event, timestamp, kind, and a complete execution state (`date`, `prayers`,
  `prayer`, `progress`, `status`, `startSlot`). Transfers also contain `from`.
- `executionHead`: the selected current event. Its entire execution state is
  selected together, so a destination cannot be paired with another event's
  outcome or progress during reconciliation.

A transferred recurring occurrence is detached once using the deterministic ID
`occurrence:<original day>:<series ID>`. Its original day is excluded from the
series; future native occurrences and the recurrence rule are untouched. Two
offline devices detaching the same occurrence consequently merge one entity.

Active task identity/order and dated parent references use the original storage
day. The execution day remains independent. Subtasks are never moved implicitly.
Ordinary manual date edits create a `manual` event after the first transfer and
do not create a new failure. Earlier transfers remain in history.

## Progress, history and undo

Progress is cumulative, not summed across historical cards. A historical card
uses the transfer's `from.progress`; the active card uses its current execution
state. New ordinary slot changes are dated in `taskProgressLog`/`slotProgressLog`;
after transfer they are immutable execution events. Old undated legacy progress
can only be shown as the opening balance at first transfer, not reconstructed
into invented work dates.

Undo adds an event rather than deleting history. It returns to the last uncanceled
transfer's source, preserving subsequent progress and explicit outcome changes.
It restores the old reservation when available; a collision rolls back the whole
undo. A later manual schedule change blocks undo so it cannot overwrite that
change. Canceled and unselected conflict branches remain visible in task history.

Transfer removes the old task-owned planned reservation without moving actual
time records or overwriting manual edits. The new day has no automatic time-slot
reservation: the chosen prayer is retained, and the existing editor can reserve
a suitable start time there.

## Sync and durability

Every operation mutates the existing snapshot and calls the existing synchronous
local/account queue save once. Firebase CAS transactions publish a complete
snapshot. Event maps merge by event ID; simultaneous execution heads require an
explicit choice using the destination, prayer, status and progress. Both branches
remain stored regardless of the chosen head. Stale execution dialogs are rejected.
Imports validate heads, snapshots, references, timestamps and acyclic event chains.

Update/reload all devices before using transfers; older application code does not
understand execution projections. Snapshot size retains the existing 4-million-
character cloud limit. There is no automatic pruning of performance history.

## UI and verification

The three existing primary buttons remain. Cross opens `لم أنجزها` / `نقل`;
transfer adds a date, Tomorrow and prayer selection in a compact dialog. The
deferred badge stays inline. Historical cards have no outcome/progress controls;
their details show the destination and complete transfer history. Undo lives in
the existing task editor.

`npm test` covers ordinary/repeated transfers, partial progress, shared projects,
independent children/parents, recurring occurrences, calendars, undo and rollback,
manual/bulk edits, ordering, local reload, import validation, stale editors and
concurrent branches. The two-window Firebase contract test also covers account
queue restoration before upload, delivery and explicit offline conflict choices.
It uses a mock, not a production account.

`npm run test:browser` includes desktop/phone transfer dialogs, date/prayer
selection, read-only historical cards, history navigation, undo, viewport fit and
an assertion that an active deferred row has the same height as an ordinary row.
