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
  run(`state.sunsetDays={};state.repeat=[];
    state.projects=[{id:'a',name:'ألف'},{id:'b',name:'باء'}];
    state.taskInbox=[{id:'a1',name:'مهمة ألف',projectId:'a'},
      {id:'b1',name:'مهمة باء',projectId:'b'}, {id:'free',name:'بدون مشروع'}];
    view='dashboard';plannerTab='inbox';plannerQuery='';
    plannerProject=plannerPriority=plannerStatus='all';render();`);
  assert.ok(row('a1'));
  assert.equal(row('b1'),null);
  $('[data-planner-project="all"]').click();
  assert.equal($('[data-planner-project="all"]').getAttribute('aria-pressed'),'true');
  assert.ok(row('a1'));assert.ok(row('b1'));assert.ok(row('free'));
  assert.equal(w.document.querySelectorAll('.planner-project-group').length,2);
  assert.equal(row('free').closest('[data-planner-section]').dataset.plannerSection,'unassigned');
  own(row('a1'),'[data-outcome="done"]').click();
  assert.ok(row('b1'));
  assert.equal($('[data-planner-project="all"]').getAttribute('aria-pressed'),'true');
  $('[data-planner-project="b"]').click();
  assert.ok(row('b1'));assert.equal(row('a1'),null);
  run(`const old=addDate(activeDay(),-1);state.sunsetDays[old]=emptyDay();
    state.sunsetDays[old].tasks=[{id:'past-a',name:'فائتة ألف',projectId:'a'},
      {id:'past-b',name:'فائتة باء',projectId:'b'}];save();plannerTab='missed';render();`);
  $('[data-planner-project="all"]').click();
  assert.ok(row('past-a'));assert.ok(row('past-b'));
  assert.equal(w.document.querySelectorAll('.planner-project-group').length,2);
  assert.deepEqual(errors,[]);
  console.log('PASS: all-project tab, project groups, standalone tasks, outcome refresh, individual project navigation and missed tasks');
} finally { dom.window.close(); }
