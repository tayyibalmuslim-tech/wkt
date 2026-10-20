/* Period tasks are arranged by linked action, then parent identity. */
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://test.local',
  runScripts: 'outside-only',
});
const w = dom.window;
w.structuredClone = structuredClone;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.confirm = () => true;
const errors = [];
dom.virtualConsole.on('jsdomError', (error) => errors.push(error.message));
w.addEventListener('error', (error) => errors.push(error.error));
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
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') +
    '\nwindow.groupRun=code=>eval(code)',
);
const run = w.groupRun;
const $ = (selector) => w.document.querySelector(selector);
const rows = (selector) => [...w.document.querySelectorAll('#dailyTaskCards ' + selector)];
try {
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];
    view='day';prayer=3;
    day().tasks=[
      {id:'root',name:'مهمة رئيسية <img src=x>',date:date,prayer:3,actionId:state.actions[0].id},
      {id:'child-same',name:'فرع نفس الفعل',parentId:'root',parentDate:date,date:date,prayer:3,actionId:state.actions[0].id},
      {id:'child-other',name:'فرع بفعل مختلف',parentId:'root',parentDate:date,date:date,prayer:3,actionId:state.actions[1].id},
      {id:'independent',name:'مهمة مستقلة',date:date,prayer:3,actionId:state.actions[0].id},
      {id:'no-action',name:'بدون فعل',date:date,prayer:3},
      {id:'orphan',name:'فرع أصله محذوف',date:date,prayer:3,parentId:'deleted',parentDate:date,parentName:'أصل محذوف',actionId:state.actions[0].id},
      {id:'different-period',name:'ليست في الفترة',date:date,prayer:4,actionId:state.actions[0].id}
    ];render();`);
  const actionA = run('state.actions[0].id');
  const actionB = run('state.actions[1].id');
  const sections = rows('.period-action-group');
  assert.equal(sections.length, 3, 'two linked actions plus unlinked tasks');
  const groupA = sections.find((section) => section.querySelector('.period-action-heading').textContent.includes(run('state.actions[0].name')));
  const groupB = sections.find((section) => section.querySelector('.period-action-heading').textContent.includes(run('state.actions[1].name')));
  const unlinked = sections.find((section) => section.querySelector('.period-action-heading').textContent.includes('بدون فعل مرتبط'));
  assert.ok(groupA && groupB && unlinked);
  const inGroup = (group, id) => group.querySelector('[data-task-id="' + id + '"]');
  assert.ok(inGroup(groupA, 'root'));
  assert.ok(inGroup(groupA, 'child-same'));
  assert.ok(inGroup(groupA, 'independent'));
  assert.ok(inGroup(groupA, 'orphan'));
  assert.ok(inGroup(groupB, 'child-other'));
  assert.equal(inGroup(groupB, 'root'), null, 'parent outside this action is only a heading');
  assert.ok(inGroup(unlinked, 'no-action'));
  assert.equal(rows('[data-task-id="different-period"]').length, 0);
  assert.equal(rows('.task-row').length, 6, 'each period task appears exactly once');
  assert.equal(groupA.querySelector('.period-family-root [data-task-id="root"]') !== null, true);
  assert.ok(inGroup(groupA, 'child-same').closest('.period-task-family'));
  assert.match(groupB.querySelector('.period-family-heading').textContent, /مهمة رئيسية/);
  assert.match(groupA.querySelector('.period-family-heading').textContent, /أصل محذوف/);
  assert.equal(groupB.querySelector('img'), null, 'parent names are escaped');

  // The all-day list must use the same two-level grouping, including other prayers.
  const dayRows = (selector) => [
    ...w.document.querySelectorAll('#allDayTaskCards ' + selector),
  ];
  const allDayGroups = dayRows('.period-action-group');
  assert.equal(allDayGroups.length, 3, 'all-day groups by linked action too');
  const allDayA = allDayGroups.find((section) =>
    section.querySelector('.period-action-heading').textContent.includes(run('state.actions[0].name')));
  const allDayB = allDayGroups.find((section) =>
    section.querySelector('.period-action-heading').textContent.includes(run('state.actions[1].name')));
  const allDayUnlinked = allDayGroups.find((section) =>
    section.querySelector('.period-action-heading').textContent.includes('بدون فعل مرتبط'));
  assert.ok(allDayA && allDayB && allDayUnlinked);
  assert.deepEqual(
    dayRows('.task-row').map((row) => row.dataset.taskId).sort(),
    ['root', 'child-same', 'child-other', 'independent', 'no-action', 'orphan', 'different-period'].sort(),
    'every task appears exactly once in the all-day list',
  );
  assert.ok(inGroup(allDayA, 'different-period'), 'all-day section includes tasks from other prayers');
  assert.ok(inGroup(allDayA, 'child-same').closest('.period-task-family'));
  assert.ok(allDayA.querySelector('.period-family-root [data-task-id="root"]'));
  assert.ok(inGroup(allDayB, 'child-other').closest('.period-task-family'));
  assert.equal(inGroup(allDayB, 'root'), null, 'parent is a heading rather than a duplicated actionable task');
  assert.match(allDayB.querySelector('.period-family-heading').textContent, /مهمة رئيسية/);
  assert.ok(inGroup(allDayUnlinked, 'no-action'));
  assert.equal(allDayB.querySelector('img'), null, 'all-day parent labels are escaped');
  assert.ok(inGroup(allDayB, 'child-other').querySelector('[data-progress]'));
  assert.ok(inGroup(allDayB, 'child-other').querySelector('[data-task-edit]'));
  assert.ok(inGroup(allDayB, 'child-other').querySelector('[data-outcome="failed"]'));
  inGroup(allDayA, 'different-period').querySelector('[data-outcome="done"]').click();
  assert.equal(run("outcome(findTask('different-period',date))"), 'done');
  assert.ok(inGroup(groupB, 'child-other').querySelector('[data-outcome="done"]'));
  inGroup(groupB, 'child-other').querySelector('[data-outcome="done"]').click();
  assert.equal(run("outcome(findTask('child-other',date))"), 'done');
  // Daily ordering is saved per date and must never reorder period/project data.
  run(`day().tasks = ['a','b','c'].map(id => ({id,name:id,date,prayer:3}));
    invalidateTaskReads();render();`);
  const ids = (root) => [...w.document.querySelectorAll(root + ' .task-row')].map(r => r.dataset.taskId);
  const before = ids('#dailyTaskCards');
  const input = $('#allDayTaskCards [data-task-id="c"] [data-day-task-order]');
  assert.ok(input);
  input.value = '1';
  input.dispatchEvent(new w.Event('change', {bubbles:true}));
  assert.deepEqual(ids('#allDayTaskCards'), ['c','a','b']);
  assert.deepEqual(ids('#dailyTaskCards'), before);
  assert.deepEqual(JSON.parse(run('JSON.stringify(day().tasks.map(t=>t.id))')), ['a','b','c']);
  assert.ok(JSON.parse(w.localStorage.getItem('waqti-v1')).sunsetDays[run('date')].taskOrder);
  run('render()');
  assert.deepEqual(ids('#allDayTaskCards'), ['c','a','b']);
  assert.equal($('#dailyTaskCards [data-day-task-order]'), null);
  const invalid = $('#allDayTaskCards [data-day-task-order]');
  invalid.value = '99';
  invalid.dispatchEvent(new w.Event('change', {bubbles:true}));
  assert.equal(invalid.value, '1');
  run(`date='2099-01-02';day().tasks=['a','b','c'].map(id=>({id,name:id,date,prayer:3}));render();`);
  assert.deepEqual(ids('#allDayTaskCards'), ['a','b','c']);
  assert.deepEqual(errors, []);
  console.log('Period task grouping checks passed.');
} finally {
  dom.window.close();
}

