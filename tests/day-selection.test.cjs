const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://test.local',
    runScripts: 'outside-only',
  }),
  w = dom.window;
w.structuredClone = structuredClone;
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.confirm = () => true;
const errors = [];
dom.virtualConsole.on('jsdomError', (e) => errors.push(e.message));
w.addEventListener('error', (e) => errors.push(e.error));
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
    .join('\n') + '\nwindow.dashboardRun=code=>eval(code)',
);
const run = w.dashboardRun,
  $ = (s) => w.document.querySelector(s),
  row = (id) => $('#plannerResults [data-task-id="' + id + '"]'),
  own = (r, selector) =>
    [...r.querySelectorAll(selector)].find((e) => e.closest('.task-row') === r),
  change = (selector, value, type = 'change') => {
    $(selector).value = value;
    $(selector).dispatchEvent(new w.Event(type, { bubbles: true }));
  };
try {
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];
    view='day';prayer=3;render();`);
  assert.ok($('.top #toggleTaskSelection'));
  assert.equal($('#toggleTaskSelection').disabled,true);
  run(`day().tasks=[{id:'a',name:'ألف',prayer:3},{id:'b',name:'باء',prayer:4}];render();`);
  $('#toggleTaskSelection').click();
  assert.ok($('#taskSelectionToolbar'));
  const aInputs=()=>[...w.document.querySelectorAll('[data-task-id="a"] [data-select-task]')];
  assert.equal(aInputs().length,2,'same task can appear in period and all-day lists');
  aInputs()[0].click();
  assert.ok(aInputs().every(input=>input.checked),'duplicate rows share selection');
  assert.equal($('#selectedTaskCount').textContent,'1 محددة');
  $('#selectVisibleTasks').click();
  assert.equal($('#selectedTaskCount').textContent,'2 محددة','visible tasks are deduplicated');
  assert.equal($('#editSelectedTasks').disabled,false);
  assert.equal($('#transferSelectedTasks').disabled,false);
  assert.equal($('#deleteSelectedTasks').disabled,false);
  $('#editSelectedTasks').click();
  assert.ok($('#selectedTasksEditor').open);
  $('#selectedTasksEditor').close();
  run('prayer=4;render()');
  assert.equal($('#toggleTaskSelection').getAttribute('aria-pressed'),'true');
  assert.equal($('#selectedTaskCount').textContent,'2 محددة');
  $('#clearSelectedTasks').click();
  assert.equal($('#selectedTaskCount').textContent,'0 محددة');
  $('#toggleTaskSelection').click();
  assert.equal($('#taskSelectionToolbar'),null);
  assert.equal($('[data-select-task]'),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: daily top selection button, empty day, duplicate rows, select visible, bulk actions and prayer navigation');
} finally {dom.window.close();}
