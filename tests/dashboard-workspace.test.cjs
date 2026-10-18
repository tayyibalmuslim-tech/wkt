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
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'a',name:'ألف'},{id:'b',name:'باء'}];state.taskInbox=Array.from({length:40},(_,i)=>({id:'task-'+i,name:'مهمة '+i,priority:i%5+1,projectId:i<15?'a':i<30?'b':''}));state.taskInbox.push({id:'root',name:'أصل',projectId:'a'},{id:'child',name:'فرع',parentId:'root',parentDate:''},{id:'deep',name:'عبارة فريدة',parentId:'child',parentDate:''});view='dashboard';plannerTab='inbox';plannerProject=plannerPriority=plannerStatus='all';plannerQuery='';expandedTaskRows.clear();render();`,
  );
  assert.equal(row('child'), null, 'closed descendants are not drawn');
  assert.equal(
    $('[data-planner-section="unassigned"]').querySelectorAll('.task-row')
      .length,
    10,
  );
  assert.equal(
    $('[data-planner-project="a"]').getAttribute('aria-pressed'),
    'true',
  );
  own(row('root'), '[data-task-toggle]').click();
  own(row('child'), '[data-task-toggle]').click();
  assert.equal(
    row('deep').parentElement.closest('.task-row').dataset.taskId,
    'child',
  );
  assert.equal(
    row('child').parentElement.closest('.task-row').dataset.taskId,
    'root',
  );
  const shell = $('.dashboard-workspace');
  run('app.scrollTop=350');
  own(row('task-0'), '[data-task-select]').click();
  own(row('task-0'), '[data-outcome="done"]').click();
  assert.equal($('.dashboard-workspace'), shell, 'outcome preserves shell');
  assert.equal(run('app.scrollTop'), 350);
  assert.ok(row('deep'), 'outcome keeps nested expansion');
  change('#plannerSearch', 'عبارة فريدة', 'input');
  assert.ok(row('deep'), 'search opens the matching descendant path');
  assert.equal(
    row('deep').parentElement.closest('.task-row').dataset.taskId,
    'child',
  );
  change('#plannerSearch', '', 'input');
  change('#plannerProject', 'none');
  assert.equal($('#plannerResults').querySelectorAll('.task-row').length, 10);
  change('#plannerProject', 'b');
  assert.equal($('#plannerResults').querySelectorAll('.task-row').length, 15);
  change('#plannerPriority', '5');
  assert.equal($('#plannerResults').querySelectorAll('.task-row').length, 3);
  change('#plannerProject', 'all');
  change('#plannerPriority', 'all');
  const before = run('state.taskInbox.length');
  change('#dashboardQuickName', 'التقاط جديد', 'input');
  $('#dashboardQuickTask').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.equal(run('state.taskInbox.length'), before + 1);
  assert.equal(run('state.taskInbox.at(-1).name'), 'التقاط جديد');
  assert.equal(w.document.activeElement, $('#dashboardQuickName'));
  assert.equal(run('app.scrollTop'), 350);
  // Exercise the actual editor save path; its render must retain the shell and position.
  $('[data-planner-project="a"]').click();
  assert.ok(row('deep'));
  const editingShell = $('.dashboard-workspace');
  run(`openPlannerEditor(findTask('task-1',''))`);
  const form = $('#plannerForm');
  assert.ok(form);
  form.elements.taskName.value = 'اسم معدل';
  form.dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.equal(run(`findTask('task-1','').name`), 'اسم معدل');
  assert.equal($('.dashboard-workspace'), editingShell);
  assert.equal(run('app.scrollTop'), 350);
  assert.ok(row('deep'), 'editor save keeps nested expansion');
  $('[data-planner-tab="future"]').click();
  run('app.scrollTop=90');
  $('[data-planner-tab="inbox"]').click();
  assert.equal(run('app.scrollTop'), 350, 'each list retains its position');
  run(
    `const old=addDate(activeDay(),-1),next=addDate(activeDay(),1);state.sunsetDays[old]=emptyDay();state.sunsetDays[old].tasks=[{id:'past-a',name:'فائتة مشروع',projectId:'a'},{id:'past-free',name:'فائتة مستقلة'}];state.sunsetDays[next]=emptyDay();state.sunsetDays[next].tasks=[{id:'future-a',name:'مستقبلية'}];save();plannerTab='missed';render();`,
  );
  assert.ok(row('past-a'));
  assert.ok(row('past-free'));
  assert.equal(
    $('[data-planner-section="projects"]').querySelectorAll(
      '[data-planner-project]',
    ).length,
    1,
  );
  own(row('past-a'), '[data-task-select]').click();
  own(row('past-a'), '[data-outcome="done"]').click();
  assert.equal(row('past-a'), null, 'resolved missed task leaves backlog');
  $('[data-planner-tab="future"]').click();
  assert.ok(row('future-a'));
  // Missed families show only overdue pending descendants and their ancestor path,
  // even with no search query, including lazy re-opening and result updates.
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[
    {id:'missed-root',name:'الأصل',projectId:'a'},
    {id:'missed-middle',name:'الفرع الوسيط',parentId:'missed-root',parentDate:''},
    {id:'undated-sibling',name:'غير موزعة',parentId:'missed-root',parentDate:''},
    {id:'free-root',name:'أصل مستقل'}
  ];const yesterday=addDate(activeDay(),-1),tomorrow=addDate(activeDay(),1);
  taskDay(yesterday).tasks=[
    {id:'overdue-child',name:'فرع فائت',parentId:'missed-root',parentDate:''},
    {id:'overdue-deep',name:'فائت عميق',parentId:'missed-middle',parentDate:''},
    {id:'done-sibling',name:'فرع منجز',parentId:'missed-root',parentDate:''},
    {id:'failed-sibling',name:'لم ينجز وسجل',parentId:'missed-root',parentDate:''},
    {id:'free-overdue',name:'فائت مستقل',parentId:'free-root',parentDate:''}
  ];taskDay(yesterday).done['done-sibling']=true;
  (taskDay(yesterday).failed??={})['failed-sibling']=true;
  taskDay(tomorrow).tasks=[
    {id:'future-sibling',name:'مستقبلية',parentId:'missed-root',parentDate:''},
    {id:'future-deep',name:'مستقبلية عميقة',parentId:'missed-middle',parentDate:''}
  ];plannerTab='missed';plannerQuery='';plannerPriority=plannerStatus=plannerProject='all';expandedTaskRows.clear();save();render();`);
  assert.ok(row('missed-root'));
  assert.ok(row('overdue-child'));
  assert.ok(row('missed-middle'));
  assert.ok(row('overdue-deep'));
  assert.ok(row('free-root'));
  assert.ok(row('free-overdue'));
  for (const id of ['undated-sibling','done-sibling','failed-sibling','future-sibling','future-deep'])
    assert.equal(row(id),null,'non-missed sibling hidden: '+id);
  own(row('missed-root'),'[data-task-toggle]').click();
  assert.equal(row('overdue-child'),null);
  own(row('missed-root'),'[data-task-toggle]').click();
  assert.ok(row('overdue-child'));
  assert.equal(row('future-sibling'),null,'lazy reopen retains missed filter');
  own(row('overdue-child'),'[data-outcome="done"]').click();
  assert.equal(row('overdue-child'),null,'completed child disappears immediately');
  assert.ok(row('overdue-deep'));
  own(row('overdue-deep'),'[data-outcome="done"]').click();
  assert.equal(row('missed-root'),null,'family disappears once no missed children remain');
  assert.ok(row('free-overdue'),'other missed families are preserved');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: dashboard mixed lists, lazy nested paths, project/priority/search filters, inline capture, real editor save and session scroll preservation',
  );
} finally {
  dom.window.close();
}

