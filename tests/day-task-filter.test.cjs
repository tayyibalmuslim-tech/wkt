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
    const tomorrow=addDate(date,1),yesterday=addDate(date,-1);
    state.sunsetDays[date]=emptyDay();state.sunsetDays[tomorrow]=emptyDay();state.sunsetDays[yesterday]=emptyDay();
    day().tasks=[{id:'root',name:'أصل اليوم',prayer:3},
      {id:'today-child',name:'فرع اليوم',prayer:3,parentId:'root',parentDate:date},
      {id:'nested-today',name:'فرع متداخل اليوم',prayer:3,parentId:'middle',parentDate:''}];
    state.sunsetDays[tomorrow].tasks=[{id:'future-child',name:'فرع غد',prayer:3,parentId:'root',parentDate:date}];
    state.sunsetDays[yesterday].tasks=[{id:'past-child',name:'فرع أمس',prayer:3,parentId:'root',parentDate:date}];
    state.taskInbox=[{id:'unscheduled-child',name:'فرع غير موزع',parentId:'root',parentDate:date},
      {id:'ancestor',name:'أصل سياقي'},
      {id:'middle',name:'فرع وسيط',parentId:'ancestor',parentDate:''},
      {id:'unrelated',name:'فرع آخر',parentId:'ancestor',parentDate:''}];
    view='dashboard';plannerTab='day';plannerQuery='';
    plannerProject=plannerPriority=plannerStatus='all';expandedTaskRows.clear();render();`);
  const check=()=>{
    assert.ok(row('root'));assert.ok(row('today-child'));assert.ok(row('nested-today'));
    for(const id of ['future-child','past-child','unscheduled-child','unrelated']) assert.equal(row(id),null,id);
  };
  check();
  own(row('root'),'[data-task-toggle]').click();
  assert.equal(row('today-child'),null);
  own(row('root'),'[data-task-toggle]').click();
  check();
  $('#toggleTaskSelection').click();$('#selectVisibleTasks').click();
  assert.equal(run('selectedTaskRefs.size'),5,'only current-day tasks and their ancestor path selectable');
  change('#plannerSearch','فرع اليوم','input');
  assert.ok(row('today-child'));assert.equal(row('nested-today'),null);
  change('#plannerSearch','','input');check();
  run(`date=addDate(date,1);render();`);
  assert.ok(row('future-child'));
  assert.equal(row('today-child'),null);
  assert.equal(row('past-child'),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: day-only children, ancestor path, lazy reopen, search, bulk selection and day navigation');
} finally {dom.window.close();}
