const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const merge = require('../sync-merge.js');
const root = path.resolve(__dirname, '..');
function client(saved) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { url: 'https://test.local', runScripts: 'outside-only' },
  );
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.confirm = () => true;
  if (saved) w.localStorage.setItem('waqti-v1', JSON.stringify(saved));
  w.eval(
    [
      'vendor/adhan.js',
      'calendar.js',
      'categories.js',
      'slots.js',
      'task-engine.js',
      'dashboard.js',
      'projects.js',
      'tafsir-default.js',
      'app.js',
    ]
      .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
      .join('\n') + '\nwindow.testRun = code => eval(code);',
  );
  return {
    w,
    run: w.testRun,
    $: (s) => w.document.querySelector(s),
    close: () => dom.window.close(),
  };
}
const c = client(),
  { w, run, $ } = c;
const json = (code) => JSON.parse(run('JSON.stringify(' + code + ')'));
const state = () => json('state');
const click = (s) => {
  assert.ok($(s), s);
  $(s).click();
};
const submit = (s) =>
  $(s).dispatchEvent(
    new w.Event('submit', { cancelable: true, bubbles: true }),
  );
run(`state.sunsetDays={};state.taskInbox=[];state.repeat=[];state.projects=[{id:'p1',name:'أ'},{id:'p2',name:'ب'}];date=activeDay();view='day';prayer=0;
window.d0=date;window.d1=addDate(date,1);window.d2=addDate(date,2);window.d3=addDate(date,3);
savePlannedTask(null,{id:'t',name:'حفظ صفحتين',date,prayer:0,priority:2,expectedSlots:6,projectIds:['p1','p2'],projectId:'p1',actionId:state.actions[0].id,subtaskPosition:4});
recordTaskProgress(findTask('t',date),2);save();render();`);
const baseline = state();
const percent = run("projectCompletion('p1')");
// The choice and cancellation never write a failure early, nor add permanent buttons.
assert.equal(
  $('#dailyTaskCards .task-row-primary').querySelectorAll('button').length,
  3,
);
click('#dailyTaskCards [data-outcome="failed"]');
assert.equal(run("outcome(findTask('t',d0))"), 'pending');
assert.equal($('[data-transfer-option]').textContent, 'نقل');
click('[data-transfer-option]');
assert.equal($('[data-transfer-form]').hidden, false);
click('[data-transfer-close]');
assert.deepEqual(state(), baseline);
click('#dailyTaskCards [data-outcome="failed"]');
click('[data-transfer-option]');
$('[name=transferDate]').value = run('d1');
$('[name=transferPrayer]').value = '2';
submit('[data-transfer-form]');
assert.equal(run("outcome(findTask('t',d0))"), 'failed');
assert.equal(run("findTask('t',d0).transferredTo"), run('d1'));
assert.equal(run("outcome(findTask('t',d1))"), 'pending');
assert.equal(run("completedSlots(findTask('t',d1))"), 2);
assert.equal(run("taskPeriods(findTask('t',d1))[0]"), 2);
assert.equal(run("projectCompletion('p1')"), percent);
assert.equal(run("projectCompletion('p2')"), percent);
assert.equal(run("progressEntries().filter(t=>t.id==='t').length"), 1);
assert.equal(run("taskEntries().filter(t=>t.id==='t').length"), 1);
assert.equal(
  run(
    "Object.values(state.sunsetDays).flatMap(d=>d.tasks).filter(t=>t.id==='t').length",
  ),
  1,
);
assert.equal(
  run("actualTasksForSlot(d0,periodSlots(d0,0)[0]).some(t=>t.id==='t')"),
  false,
);
assert.equal($('#dailyTaskCards [data-progress]'), null);
assert.equal($('#dailyTaskCards [data-outcome]'), null);
assert.throws(() => run("recordTaskProgress(findTask('t',d0),5)"));
click('#dailyTaskCards [data-task-history]');
assert.match($('#taskHistory').textContent, /لم تُنجز/);
click('[data-close-history]');
// Three transfers, cumulative progress, completion, and immutable daily failures.
run(
  "transferTask(findTask('t',d1),d2);recordTaskProgress(findTask('t',d2),3);save();transferTask(findTask('t',d2),d3);recordTaskProgress(findTask('t',d3),6);recordTaskOutcome(findTask('t',d3),'done');save();",
);
for (const d of ['d0', 'd1', 'd2'])
  assert.equal(run(`outcome(findTask('t',${d}))`), 'failed');
assert.equal(run("outcome(findTask('t',d3))"), 'done');
assert.equal(run("completedSlots(findTask('t',d0))"), 2);
assert.equal(run("completedSlots(findTask('t',d1))"), 2);
assert.equal(run("completedSlots(findTask('t',d2))"), 3);
assert.equal(run("projectCompletion('p1')"), 100);
assert.equal(run('monthlySummary(monthlyTasks(d0)).failed'), 1);
assert.equal(run('monthlySummary(monthlyTasks(d3)).done'), 1);
assert.equal(run('daySummary(d0).done'), 0);
assert.equal(
  run("executionChain(findTask('t',d3)).filter(e=>e.kind==='transfer').length"),
  3,
);
run('validate(state)');
// Undo preserves work logged after transfer and retains an auditable canceled event.
run("undoTaskTransfer(findTask('t',d3))");
assert.equal(run("completedSlots(findTask('t',d2))"), 6);
assert.equal(run("outcome(findTask('t',d2))"), 'done');
assert.equal(run("findTask('t',d3)"), undefined);
assert.equal(
  run("executionChain(findTask('t',d2)).filter(e=>e.kind==='undo').length"),
  1,
);
run("undoTaskTransfer(findTask('t',d2))");
assert.equal(run("completedSlots(findTask('t',d1))"), 6);
// Manual date edits preserve prior transfer history, without fabricating failures.
run("savePlannedTask(findTask('t',d1),{...findTask('t',d1),date:d3},null)");
assert.equal(run("findTask('t',d1)"), undefined);
assert.equal(run("findTask('t',d0).historical"), true);
assert.throws(() => run("undoTaskTransfer(findTask('t',d3))"));
// Editing progress in the ordinary editor also writes a dated event.
run("openPlannerEditor(findTask('t',d3))");
$('#plannerForm').elements.completedSlots.value = '5';
submit('#plannerForm');
assert.equal(run("completedSlots(findTask('t',d3))"), 5);
assert.match(run("taskTransferHistory(findTask('t',d3))"), /الإجمالي 5/);
// Subtasks keep their own project overrides, parent link and sibling schedules.
run(`savePlannedTask(null,{id:'parent',name:'أصل',date:d0,prayer:0,projectId:'p1',projectIds:['p1']});
savePlannedTask(null,{id:'child',name:'فرع',date:d0,prayer:0,parentId:'parent',parentDate:d0,expectedSlots:3,projectIds:['p2'],projectId:'p2',projectOverride:true});
savePlannedTask(null,{id:'sibling',name:'أخ',date:d0,prayer:1,parentId:'parent',parentDate:d0});
transferTask(findTask('child',d0),d1,[4]);`);
assert.equal(run("findTask('parent',d0).date"), run('d0'));
assert.equal(run("findTask('sibling',d0).date"), run('d0'));
assert.equal(run("parentTask(findTask('child',d1)).id"), 'parent');
assert.deepEqual(json("taskProjectIds(findTask('child',d1))"), ['p2']);
run("moveSubtask(findTask('child',d1),2)");
assert.equal(run("executionRecord(findTask('child',d1)).subtaskPosition"), 2);
// Moving a parent keeps its children's links but never moves their dates.
run("transferTask(findTask('parent',d0),d2)");
assert.equal(run("parentTask(findTask('child',d1)).date"), run('d2'));
assert.equal(run("childTasks(findTask('parent',d2)).length"), 2);
assert.equal(
  run("taskReadScope(()=>childTasks(findTask('parent',d2)).length)()"),
  2,
);
// Recurrence rule and the destination's native occurrence survive independently.
run(
  "state.repeat.push({id:'r',name:'يومية',days:[0,1,2,3,4,5,6],prayer:0,expectedSlots:4,projectId:'p1'});state.taskInbox.push({id:'legacy-r-child',name:'فرع قديم',parentId:'r'});save();window.recurringBefore=JSON.stringify(state.repeat);window.detached=transferTask(findTask('r',d0),d1);window.rid=detached.id;",
);
assert.equal(run('JSON.stringify(state.repeat)'), run('recurringBefore'));
assert.equal(run("parentTask(findTask('legacy-r-child','')).id"), run('rid'));
assert.equal(run("allTasksOn(d1).filter(t=>t.id===rid||t.id==='r').length"), 2);
assert.equal(run("allTasksOn(d0).filter(t=>t.detachedFrom==='r').length"), 1);
run("recordTaskOutcome(findTask(rid,d1),'done');save()");
assert.equal(run("outcome(findTask('r',d1))"), 'pending');
// Ordinary manual move never generates a history or a failure.
run(
  "savePlannedTask(null,{id:'manual',name:'عادية',date:d0,prayer:0});savePlannedTask(findTask('manual',d0),{...findTask('manual',d0),date:d1});",
);
assert.equal(run("findTask('manual',d0)"), undefined);
assert.equal(run("outcome(findTask('manual',d1))"), 'pending');
// A refresh before upload uses the synchronously saved complete event/head pair.
const saved = JSON.parse(w.localStorage.getItem('waqti-v1'));
const restored = client(saved);
assert.equal(
  restored.run("outcome(findTask('" + run('rid') + "','" + run('d1') + "'))"),
  'done',
);
restored.run('validate(state)');
restored.close();
// Same occurrence transferred offline on two devices: one identity, two retained
// branches, explicit head conflict, and an atomic schedule/outcome selection.
const left = client(baseline),
  right = client(baseline);
left.run(
  "date=activeDay();transferTask(findTask('t',date),addDate(date,1),[1])",
);
right.run(
  "date=activeDay();transferTask(findTask('t',date),addDate(date,2),[4])",
);
const l = JSON.parse(left.run('JSON.stringify(state)')),
  r = JSON.parse(right.run('JSON.stringify(state)'));
const result = merge.merge(baseline, l, r);
assert.ok(result.conflicts.some((c) => c.path.at(-1) === 'executionHead'));
const task = result.state.sunsetDays[run('d0')].tasks.find((t) => t.id === 't');
assert.equal(Object.keys(task.executionEvents).length, 2);
const choices = new Map(result.conflicts.map((c) => [c.token, 'remote']));
const resolved = merge.merge(baseline, l, r, { choices });
assert.equal(resolved.conflicts.length, 0);
const selected = client(resolved.state);
assert.equal(
  selected.run("allTasksOn(addDate(activeDay(),2)).find(t=>t.id==='t').prayer"),
  4,
);
assert.equal(
  selected.run("allTasksOn(activeDay()).find(t=>t.id==='t').transferredTo"),
  run('d2'),
);
assert.equal(selected.run("taskEntries().filter(t=>t.id==='t').length"), 1);
selected.run('validate(state)');
selected.close();
left.close();
right.close();
// Preserve unrelated settings edits without a head conflict.
const unrelated = structuredClone(baseline);
unrelated.times[0] = '05:10';
const clean = merge.merge(baseline, l, unrelated);
assert.equal(clean.conflicts.length, 0);
assert.equal(clean.state.times[0], '05:10');
// Stale dialogs cannot overwrite a later execution event.
run(
  "window.stale=findTask('t',d3);recordTaskProgress(findTask('t',d3),4);save()",
);
assert.throws(() => run('transferTask(stale,addDate(d3,1))'));
// Selected and project-wide edits use the current execution, preserving identity.
run(
  "state=bulkUpdateSelectedTasks(state,[{id:'t',date:d3}],{date:addDate(d3,1),priority:1});save();window.d4=addDate(d3,1)",
);
assert.equal(run("findTask('t',d4).priority"), 1);
assert.equal(run("findTask('t',d3)"), undefined);
run("state=bulkUpdateProjectTasks(state,'p2',{expectedSlots:8});save()");
assert.equal(run("findTask('t',d4).expectedSlots"), 8);
assert.equal(run("completedSlots(findTask('t',d4))"), 4);
run("view='projects';selectedProject='p2';render()");
click('#toggleTaskSelection');
const selectedBox = $('#projectDetails [data-task-id="t"] [data-select-task]');
assert.ok(selectedBox);
selectedBox.click();
assert.equal(selectedBox.checked, true);
assert.equal(run('selectedTaskRefs.size'), 1);
// Calendar visibility applies to both the active and historical projection.
run(
  "savePlannedTask(findTask('t',d4),{...findTask('t',d4),showInMonthlyCalendar:false});",
);
assert.equal(run("monthlyTasks(d0).some(t=>t.id==='t')"), false);
assert.equal(run("monthlyTasks(d4).some(t=>t.id==='t')"), false);
// Undo restores a previously reserved plan, and collisions roll back the whole undo.
run(
  "savePlannedTask(null,{id:'reserved',name:'محجوزة',date:d0,prayer:0,expectedSlots:2,actionId:state.actions[0].id,startSlot:periodSlots(d0,0)[0]});transferTask(findTask('reserved',d0),d1);",
);
run(
  "taskDay(d0).planned[periodSlots(d0,0)[0]%144]='other';save();window.undoBefore=JSON.stringify(state)",
);
assert.throws(() => run("undoTaskTransfer(findTask('reserved',d1))"));
assert.equal(run('JSON.stringify(state)'), run('undoBefore'));
run(
  "delete taskDay(d0).planned[periodSlots(d0,0)[0]%144];undoTaskTransfer(findTask('reserved',d1))",
);
assert.equal(
  run("findTask('reserved',d0).startSlot"),
  run('periodSlots(d0,0)[0]'),
);
assert.equal(
  run(
    "Object.values(taskDay(d0).taskSlotOwners).filter(id=>id==='reserved').length",
  ),
  2,
);
// Invalid imported heads and cycles cannot silently discard the execution chain.
run(
  "window.malformed=structuredClone(state);window.bad=malformed.sunsetDays[d0].tasks.find(t=>t.id==='t');bad.executionHead='missing'",
);
assert.throws(() => run('validate(malformed)'));
run(
  'bad.executionHead=Object.keys(bad.executionEvents)[0];bad.executionEvents[bad.executionHead].previous=bad.executionHead',
);
assert.throws(() => run('validate(malformed)'));
// Concurrent detachment of a repeat occurrence is deterministic too.
const repeatSeed = structuredClone(baseline);
repeatSeed.repeat = [
  {
    id: 'repeat-offline',
    name: 'يومية',
    days: [0, 1, 2, 3, 4, 5, 6],
    prayer: 0,
    expectedSlots: 3,
  },
];
const ra = client(repeatSeed),
  rb = client(repeatSeed);
ra.run(
  "transferTask(findTask('repeat-offline',activeDay()),addDate(activeDay(),1))",
);
rb.run(
  "transferTask(findTask('repeat-offline',activeDay()),addDate(activeDay(),2))",
);
const rm = merge.merge(
  repeatSeed,
  JSON.parse(ra.run('JSON.stringify(state)')),
  JSON.parse(rb.run('JSON.stringify(state)')),
);
assert.equal(
  rm.state.sunsetDays[run('d0')].tasks.filter(
    (t) => t.detachedFrom === 'repeat-offline',
  ).length,
  1,
);
assert.ok(rm.conflicts.some((c) => c.path.at(-1) === 'executionHead'));
assert.equal(
  Object.keys(
    rm.state.sunsetDays[run('d0')].tasks.find(
      (t) => t.detachedFrom === 'repeat-offline',
    ).executionEvents,
  ).length,
  2,
);
ra.close();
rb.close();
console.log(
  'Task transfers: UI, history, slots, projects, subtasks, recurrence, undo, offline reload, concurrent merge passed',
);
c.close();
