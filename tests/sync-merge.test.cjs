const assert = require('node:assert/strict');
const Merge = require('../sync-merge.js');
const clone = structuredClone;
const base = {
  sunsetDays: {
    day: {
      slots: { 1: 'a' },
      actualNotes: { 1: 'old' },
      actualTasks: { 1: { id: 't', name: 'Task' } },
      planned: { 1: 'p' },
      done: { t: true },
      failed: {},
      taskProgress: { t: 1 },
    },
  },
  taskInbox: [
    { id: 't', name: 'Task', priority: 3, projectIds: ['a'], projectId: 'a' },
    { id: 'keep', name: 'Keep' },
  ],
  projects: [{ id: 'a', name: 'A' }],
};
const left = clone(base),
  right = clone(base);
left.sunsetDays.day.slots[2] = 'left';
left.sunsetDays.day.actualNotes[2] = 'left note';
right.sunsetDays.day.slots[3] = 'right';
right.sunsetDays.day.actualNotes[3] = 'right note';
left.taskInbox[0].priority = 1;
right.taskInbox[0].name = 'Renamed';
left.taskInbox.push({ id: 'new-l', name: 'Left' });
right.taskInbox.push({ id: 'new-r', name: 'Right' });
left.taskInbox[0].projectIds.push('b');
right.taskInbox[0].projectIds.push('c');
const combined = Merge.merge(base, left, right);
assert.equal(combined.conflicts.length, 0);
assert.equal(combined.state.sunsetDays.day.slots[2], 'left');
assert.equal(combined.state.sunsetDays.day.slots[3], 'right');
assert.equal(combined.state.sunsetDays.day.actualNotes[2], 'left note');
assert.equal(combined.state.sunsetDays.day.actualNotes[3], 'right note');
assert.equal(combined.state.taskInbox.find((t) => t.id === 't').priority, 1);
assert.equal(
  combined.state.taskInbox.find((t) => t.id === 't').name,
  'Renamed',
);
assert.deepEqual(combined.state.taskInbox[0].projectIds, ['a', 'b', 'c']);
assert.deepEqual(
  new Set(combined.state.taskInbox.map((t) => t.id)),
  new Set(['t', 'keep', 'new-l', 'new-r']),
);
// The note/task/action travel together; a conflict cannot create a mixed bundle.
const a = clone(base),
  b = clone(base);
a.sunsetDays.day.slots[1] = 'left';
a.sunsetDays.day.actualNotes[1] = 'left';
a.sunsetDays.day.actualTasks[1] = { id: 'left' };
b.sunsetDays.day.slots[1] = 'right';
b.sunsetDays.day.actualNotes[1] = 'right';
b.sunsetDays.day.actualTasks[1] = { id: 'right' };
b.sunsetDays.day.planned[1] = 'independent plan';
let result = Merge.merge(base, a, b);
assert.equal(result.conflicts.length, 1);
assert.deepEqual(result.conflicts[0].path, [
  'sunsetDays',
  'day',
  '$actual',
  '1',
]);
assert.equal(result.state.sunsetDays.day.slots[1], 'left');
assert.equal(result.state.sunsetDays.day.actualNotes[1], 'left');
assert.equal(result.state.sunsetDays.day.actualTasks[1].id, 'left');
assert.equal(result.state.sunsetDays.day.planned[1], 'independent plan');
result = Merge.merge(base, a, b, {
  choices: new Map([[result.conflicts[0].token, 'remote']]),
});
assert.equal(result.conflicts.length, 0);
assert.equal(result.state.sunsetDays.day.slots[1], 'right');
assert.equal(result.state.sunsetDays.day.actualTasks[1].id, 'right');
const pending = { sunsetDays: { day: { done: {}, failed: {} } } },
  done = clone(pending),
  failed = clone(pending);
done.sunsetDays.day.done.t = true;
failed.sunsetDays.day.failed.t = true;
result = Merge.merge(pending, done, failed);
assert.equal(result.conflicts.length, 1);
assert.equal(result.state.sunsetDays.day.failed.t, undefined);
// Deletes remain deletes; only an edit of the same deleted entity needs a choice.
const deleted = clone(base);
deleted.taskInbox = deleted.taskInbox.filter((t) => t.id !== 't');
assert.equal(
  Merge.merge(base, deleted, base).state.taskInbox.some((t) => t.id === 't'),
  false,
);
assert.equal(
  Merge.merge(base, deleted, right).conflicts.filter(
    (c) => c.path[0] === 'taskInbox',
  ).length,
  1,
);
// Different keyed entities may move/change on two devices without becoming copies.
const ordered = {
    tasks: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
  },
  reordered = clone(ordered),
  edited = clone(ordered);
reordered.tasks.reverse();
edited.tasks[0].name = 'Changed';
result = Merge.merge(ordered, reordered, edited);
assert.equal(result.conflicts.length, 0);
assert.deepEqual(
  result.state.tasks.map((t) => t.id),
  ['c', 'b', 'a'],
);
assert.equal(result.state.tasks[2].name, 'Changed');
const legacy = Merge.merge(
  null,
  { value: 1, onlyLocal: 1 },
  { value: 2, onlyRemote: 1 },
  { known: false },
);
assert.equal(
  legacy.conflicts.length,
  3,
  'unknown dirty legacy base never silently guesses a deletion',
);
// Exact, compact reverse bases survive append/delete/reorder and escaped keys.
for (const [source, target] of [
  [combined.state, base],
  [base, combined.state],
  [{ x: [1, 2, 3] }, { x: [1] }],
  [{ x: [1] }, { x: [4, 2, 3] }],
  [{}, JSON.parse('{"__proto__":{"x":1}}')],
]) {
  const patch = JSON.parse(JSON.stringify(Merge.diff(source, target)));
  assert.deepEqual(Merge.patch(source, patch), target);
}
assert.equal(Merge.same({ a: undefined }, {}), true);
assert.deepEqual(
  base.taskInbox.map((t) => t.id),
  ['t', 'keep'],
  'inputs untouched',
);
const start = performance.now(),
  large = {
    taskInbox: Array.from({ length: 240 }, (_, i) => ({
      id: 'task-' + i,
      name: 'Task ' + i,
      expectedSlots: 3,
      priority: 3,
    })),
  },
  l = clone(large),
  r = clone(large);
l.taskInbox[0].priority = 1;
r.taskInbox[239].name = 'Changed';
assert.equal(Merge.merge(large, l, r).conflicts.length, 0);
console.log('SYNC_MERGE_240_MS', Math.round(performance.now() - start));
console.log(
  'PASS: three-way independent edits, atomic time/outcome bundles, entity deletion/order, memberships, explicit field conflicts and compact offline bases',
);
