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
  run(`state.sunsetDays={};state.repeat=[];state.projects=[];
    state.taskInbox=[{id:'root',name:'أصل خارج اليوم'}];
    view='day';prayer=3;hideCompletedWork=false;
    day().tasks=[{id:'a',name:'فرع مكتمل',prayer:3,parentId:'root',parentDate:'',actionId:state.actions[0].id},
      {id:'b',name:'مستقلة مكتملة',prayer:3,actionId:state.actions[0].id},
      {id:'c',name:'باقية',prayer:3,actionId:state.actions[1].id}];
    day().done={a:true,b:true};render();`);
  const groups=()=>[...w.document.querySelectorAll('#dailyTaskCards .period-action-group')];
  const family=()=>$('#dailyTaskCards .period-task-family');
  assert.equal($('#dailyTaskCards [data-task-id="a"]').closest('.period-action-group').querySelector('.period-action-count').textContent,'2');
  $('#toggleCompletedWork').click();
  assert.equal(family().hidden,true,'empty main-task heading disappears');
  assert.equal($('#allDayTaskCards [data-task-id="a"]').hidden,true,'ordered daily list hides completed rows too');
  assert.equal($('#dailyTaskCards [data-task-id="a"]').closest('.period-action-group').hidden,true,'empty action group disappears');
  assert.equal($('#dailyTaskCards [data-task-id="a"]').closest('.period-action-group').querySelector('.period-action-count').textContent,'0');
  assert.equal($('#dailyTaskCards [data-task-id="c"]').closest('.period-action-group').hidden,false);
  assert.equal($('#dailyTaskCards [data-task-id="c"]').closest('.period-action-group').querySelector('.period-action-count').textContent,'1');
  run(`delete day().done.a;save();applyCompletedVisibility();`);
  assert.equal(family().hidden,false,'reopened child restores its main heading');
  assert.equal($('#dailyTaskCards [data-task-id="a"]').closest('.period-action-group').hidden,false);
  assert.equal($('#dailyTaskCards [data-task-id="a"]').closest('.period-action-group').querySelector('.period-action-count').textContent,'1');
  $('#toggleCompletedWork').click();
  assert.equal($('#dailyTaskCards [data-task-id="a"]').closest('.period-action-group').querySelector('.period-action-count').textContent,'2');
  assert.equal($('#dailyTaskCards [data-task-id="b"]').hidden,false);
  assert.equal(family().hidden,false);
  assert.deepEqual(errors,[]);
  console.log('PASS: completed family/action groups, visible counts, reopening tasks and restoring completed rows');
} finally {dom.window.close();}

