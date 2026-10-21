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
  assert.ok($('body > aside nav #toggleTaskSelection'));
  assert.equal($('#toggleTaskSelection').disabled,true);
  run(`day().tasks=[{id:'a',name:'ألف',prayer:3},{id:'b',name:'باء',prayer:4}];render();`);
  $('#toggleTaskSelection').click();
  assert.ok($('#taskSelectionToolbar'));
  const style=w.document.createElement('style');
  style.textContent=fs.readFileSync(path.join(root,'style.css'),'utf8');w.document.head.append(style);
  assert.equal(w.getComputedStyle($('#taskSelectionToolbar')).position,'fixed');
  const sameButton=$('#toggleTaskSelection');
  w.innerWidth=390;w.dispatchEvent(new w.Event('resize'));
  assert.equal($('.mobile-navigation #toggleTaskSelection'),sameButton);
  sameButton.click();sameButton.click();
  assert.equal(run('view'),'day','navigation toggle never changes view');
  w.innerWidth=1200;w.dispatchEvent(new w.Event('resize'));
  assert.equal($('body > aside nav #toggleTaskSelection'),sameButton);

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
  run("view='settings';render()");
  assert.equal($('#toggleTaskSelection'),null,'button removed outside task views');
  run("view='day';render()");
  assert.ok($('body > aside nav #toggleTaskSelection'));
  assert.equal(w.document.querySelectorAll('#toggleTaskSelection').length,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: daily top selection button, empty day, duplicate rows, select visible, bulk actions and prayer navigation');
} finally {dom.window.close();}


