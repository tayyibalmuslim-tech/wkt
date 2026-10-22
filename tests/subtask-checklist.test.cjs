const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const merge = require('../sync-merge.js');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://test.local', runScripts: 'outside-only',
});
const w = dom.window, errors = [];
w.structuredClone = structuredClone;
w.setInterval = () => 0;
w.confirm = () => true;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.addEventListener('error', (event) => errors.push(event.error));
w.eval(['vendor/adhan.js', 'calendar.js', 'categories.js', 'slots.js',
  'task-engine.js', 'dashboard.js', 'projects.js', 'tafsir-default.js', 'app.js']
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') +
  '\nwindow.run = source => eval(source);');
const run = w.run, $ = (s) => w.document.querySelector(s);
const click = (s) => $(s).click();
const submit = () => $('#plannerForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
const input = (el, value) => { el.value = value; el.dispatchEvent(new w.Event('input')); };
const checklist = () => JSON.parse(run("JSON.stringify(findTask('child','').checklist)"));
const open = () => run("openPlannerEditor(findTask('child',''))");
run(`state.taskInbox=[{id:'parent',name:'Parent',expectedSlots:4},
  {id:'child',name:'Child',parentId:'parent',parentDate:'',expectedSlots:4}];
  state.sunsetDays={};state.repeat=[];state.projects=[];state.starterIntroPending=false;
  view='dashboard';render();openPlannerEditor(findTask('parent',''));`);
assert.equal($('.task-checklist'), null, 'only subtask editors have checklists');
open();
assert.ok($('#plannerForm > .task-checklist'));
input($('[data-checklist-new]'), 'First item');
click('[data-checklist-add]');
input($('[data-checklist-new]'), 'Second item');
const enter = new w.KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
$('[data-checklist-new]').dispatchEvent(enter);
assert.equal(enter.defaultPrevented, true, 'Enter adds without submitting task');
click('.task-checklist-row input[type=checkbox]');
assert.equal($('[data-checklist-count]').textContent, '1 / 2');
assert.equal(run("findTask('child','').checklist"), undefined, 'editing stays in draft');
submit();
assert.deepEqual(checklist().map(({ text, done }) => ({ text, done })), [
  { text: 'First item', done: true }, { text: 'Second item', done: false },
]);
const firstId = checklist()[0].id;
assert.equal(run("outcome(findTask('child',''))"), 'pending');
assert.equal(run("completedSlots(findTask('child',''))"), 0);
open();
input($('.task-checklist-row input[type=text]'), 'Discard me');
click('.task-checklist-row button');
click('[data-editor-cancel]');
assert.equal(checklist()[0].text, 'First item', 'cancel preserves saved list');
open();
assert.equal($('.task-checklist-row input[type=checkbox]').checked, true);
input($('.task-checklist-row input[type=text]'), 'Edited item');
click('.task-checklist-row input[type=checkbox]');
input($('[data-checklist-new]'), 'Saved directly');
submit();
assert.equal(checklist()[0].id, firstId);
assert.equal(checklist()[0].text, 'Edited item');
assert.equal(checklist()[0].done, false);
assert.equal(checklist()[2].text, 'Saved directly');
open();
click('.task-checklist-row button');
submit();
assert.equal(checklist().length, 2);
open();
input($('.task-checklist-row input[type=text]'), '  ');
submit();
assert.equal($('#plannerEditor').open, true);
assert.match($('#plannerError').textContent, /قائمة التحقق/);
assert.equal(checklist()[0].text, 'Second item', 'invalid draft does not overwrite saved data');
click('#closePlanner');
// A serialized backup restores stable IDs and check marks.
const backup = run('JSON.stringify(state)');
run('state=JSON.parse(' + JSON.stringify(backup) + ');validate(state);render();');
const restored = checklist();
open();
assert.equal(w.document.querySelectorAll('.task-checklist-row').length, 2);
submit();
assert.deepEqual(checklist(), restored);
// Checklist-only changes on dated tasks bypass the progress-only shortcut.
run(`const original=findTask('child','');savePlannedTask(original,{...original,date,prayers:[]});
  openPlannerEditor(findTask('child',date));`);
click('.task-checklist-row input[type=checkbox]');
submit();
assert.equal(run("findTask('child',date).checklist[0].done"), true);
const datedChecklist = run("JSON.stringify(findTask('child',date).checklist)");
run("transferTask(findTask('child',date),addDate(date,1),[])");
assert.equal(run("JSON.stringify(findTask('child',addDate(date,1)).checklist)"), datedChecklist);
run('validate(state)');
// Reject malformed imported lists while allowing old tasks without the field.
const valid = { id: 'c', name: 'Child', parentId: 'p' };
const validate = (task) => run('validatePlanning({...state,taskInbox:[' + JSON.stringify(task) + ']})');
validate(valid);
for (const bad of [null, {}, [{ id: 'x', text: '', done: false }],
  [{ id: 'x', text: 'ok', done: 1 }], [{ text: 'missing id', done: false }],
  [{ id: 'x', text: 'x'.repeat(501), done: false }],
  [{ id: 'x', text: 'a', done: false }, { id: 'x', text: 'b', done: false }]]) {
  assert.throws(() => validate({ ...valid, checklist: bad }), /قائمة تحقق/);
}
// Distinct edits from two devices merge by item ID, including first additions.
const base = { taskInbox: [{ ...valid, checklist: restored }] };
const local = structuredClone(base), remote = structuredClone(base);
local.taskInbox[0].checklist[0].done = true;
remote.taskInbox[0].checklist[1].text = 'Remote edit';
const result = merge.merge(base, local, remote);
assert.equal(result.conflicts.length, 0);
assert.equal(result.state.taskInbox[0].checklist[0].done, true);
assert.equal(result.state.taskInbox[0].checklist[1].text, 'Remote edit');
validate(result.state.taskInbox[0]);
const initial = { taskInbox: [valid] };
const first = merge.merge(initial,
  { taskInbox: [{ ...valid, checklist: [{ id: 'a', text: 'A', done: false }] }] },
  { taskInbox: [{ ...valid, checklist: [{ id: 'b', text: 'B', done: false }] }] });
assert.equal(first.conflicts.length, 0);
assert.equal(first.state.taskInbox[0].checklist.length, 2);
assert.deepEqual(errors, []);
dom.window.close();
console.log('PASS: subtask checklist add/edit/check/delete/cancel, persistence, transfers and device merge');
