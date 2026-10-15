/* Shared task-row interactions, lazy families and UI-only state. */
const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  assert = require('node:assert/strict'),
  path = require('node:path');
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
    .join('\n') + '\nwindow.uiRun=code=>eval(code)',
);
const run = w.uiRun,
  $ = (s) => w.document.querySelector(s),
  row = (id) => $('#projectDetails [data-task-id="' + id + '"]'),
  own = (r, s) =>
    [...r.querySelectorAll(s)].find((e) => e.closest('.task-row') === r);
try {
  const sheet = w.document.createElement('style');
  sheet.textContent = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  w.document.head.append(sheet);
  run(`state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[
 {id:'ui-root',name:'رئيسية',projectId:'ui-project'},
 {id:'ui-child',name:'فرعية',parentId:'ui-root',parentDate:''},
 {id:'ui-grand',name:'فرعية عميقة',parentId:'ui-child',parentDate:'',expectedSlots:4},
 {id:'ui-sibling',name:'فرع آخر',parentId:'ui-root',parentDate:'',expectedSlots:2},
 {id:'ui-simple',name:'مهمة بسيطة',projectId:'ui-project'},
 {id:'ui-long',name:'اسم طويل '.repeat(30)+' <script>not code</script>',description:'وصف طويل '.repeat(40),expectedSlots:4,projectId:'ui-project'},
 {id:'ui-done',name:'مكتملة',inboxOutcome:'done',projectId:'ui-project'},
 {id:'ui-failed',name:'لم أفعلها',inboxOutcome:'failed',projectId:'ui-project'}
 ];state.projects=[{id:'ui-project',name:'مشروع الصفوف'}];view='projects';selectedProject='ui-project';expandedTaskRows.clear();render();
 window.uiRenderCount=0;const uiRealRender=render;render=(...args)=>{window.uiRenderCount++;return uiRealRender(...args)};
 window.uiRenderedTasks=[];const uiRealRow=taskRow;taskRow=(t,...args)=>{window.uiRenderedTasks.push(t.id);return uiRealRow(t,...args)};`);
  const tokens = w.getComputedStyle(w.document.documentElement);
  const luminance = (hex) => {
    const channels = hex
      .trim()
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const surface = luminance(tokens.getPropertyValue('--color-surface'));
  for (const token of [
    '--color-text',
    '--color-secondary',
    '--color-brand',
    '--color-done',
    '--color-failed',
  ]) {
    const foreground = luminance(tokens.getPropertyValue(token));
    assert.ok(
      (Math.max(foreground, surface) + 0.05) /
        (Math.min(foreground, surface) + 0.05) >=
        4.5,
      token + ' text contrast',
    );
  }
  const snapshot = run('JSON.stringify(state)'),
    rootRow = row('ui-root'),
    select = own(rootRow, '[data-task-select]'),
    toggle = own(rootRow, '[data-task-toggle]');
  assert.equal(
    row('ui-child'),
    null,
    'closed descendants do not exist in the DOM',
  );
  assert.equal(row('ui-grand'), null);
  assert.equal(
    w.getComputedStyle(own(rootRow, '.task-row-actions')).display,
    'none',
  );
  assert.equal(
    w.getComputedStyle(own(rootRow, '.task-row-heading')).minHeight,
    '44px',
  );
  assert.equal(
    w.getComputedStyle(own(row('ui-long'), '.daily-task-name')).whiteSpace,
    'nowrap',
  );
  assert.ok(
    own(row('ui-long'), '[data-task-select]').title.includes(
      '<script>not code</script>',
    ),
  );
  assert.equal(
    row('ui-long').querySelector('script'),
    null,
    'long text is escaped',
  );
  assert.equal(
    own(row('ui-long'), '.task-row-actions').textContent.includes(
      'وصف طويل '.repeat(40),
    ),
    true,
  );
  assert.equal(row('ui-done').classList.contains('done'), true);
  assert.equal(row('ui-failed').classList.contains('failed'), true);
  assert.equal(row('ui-simple').classList.contains('pending'), true);
  assert.equal(
    own(row('ui-simple'), '.row-completion'),
    undefined,
    'no pointless zero-progress widget on simple tasks',
  );
  select.click();
  assert.equal(select.getAttribute('aria-expanded'), 'true');
  assert.equal(
    own(rootRow, '.task-row-primary').querySelectorAll('button').length,
    3,
  );
  assert.equal(own(rootRow, '.task-row-secondary').open, false);
  toggle.click();
  assert.ok(row('ui-child'));
  assert.ok(row('ui-sibling'));
  assert.equal(
    row('ui-grand'),
    null,
    'opening one level does not draw grandchildren',
  );
  assert.deepEqual(Array.from(run('window.uiRenderedTasks')).sort(), [
    'ui-child',
    'ui-sibling',
  ]);
  assert.equal(
    run('JSON.stringify(state)'),
    snapshot,
    'selection and expansion are UI-only',
  );
  own(row('ui-child'), '[data-task-toggle]').click();
  assert.ok(row('ui-grand'));
  const grand = row('ui-grand'),
    unrelated = row('ui-simple'),
    rootSelect = select;
  own(grand, '[data-task-select]').click();
  own(grand, '[data-outcome="done"]').click();
  assert.equal(
    row('ui-grand'),
    grand,
    'outcome updates preserve the mounted row',
  );
  assert.equal(row('ui-simple'), unrelated);
  assert.equal(own(rootRow, '[data-task-select]'), rootSelect);
  assert.equal(
    run('window.uiRenderCount'),
    0,
    'outcomes never redraw the page',
  );
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(
    own(row('ui-child'), '[data-task-toggle]').getAttribute('aria-expanded'),
    'true',
  );
  assert.equal(
    own(rootRow, '.task-progress-bar').value,
    run("taskCompletion(findTask('ui-root',''))"),
  );
  assert.equal(
    $('#projectDetails > progress').value,
    run("projectCompletion('ui-project')"),
  );
  assert.equal(
    JSON.parse(w.localStorage.getItem('waqti-v1')).taskInbox.find(
      (t) => t.id === 'ui-grand',
    ).inboxOutcome,
    'done',
  );
  own(grand, '[data-outcome="done"]').click();
  assert.equal(grand.classList.contains('pending'), true);
  own(grand, '.task-row-secondary').open = true;
  const input = own(grand, '[data-progress]');
  input.value = '2';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(run("completedSlots(findTask('ui-grand',''))"), 2);
  own(grand, '[data-outcome="failed"]').click();
  assert.equal(
    own(grand, '.task-progress-bar').value,
    50,
    'failed retains real effort progress',
  );
  assert.equal(own(rootRow, '.task-progress-bar').value, 25);
  input.value = '-1';
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(input.value, '2');
  assert.equal(
    run('window.uiRenderCount'),
    0,
    'effort changes never redraw the page',
  );
  toggle.click();
  assert.equal(row('ui-child'), null);
  assert.equal(row('ui-grand'), null, 'collapsing removes hidden descendants');
  select.dispatchEvent(
    new w.KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.ok(row('ui-grand'), 'opening restores already expanded nested levels');
  select.dispatchEvent(
    new w.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(row('ui-child'), null);
  select.click();
  select.dispatchEvent(
    new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.equal(own(rootRow, '.task-row-actions').hidden, true);
  assert.equal(w.document.activeElement, select);
  // The same occurrence in two daily lists updates in place, without replacing slot controls.
  run(
    `state.taskInbox=[];state.projects=[];state.sunsetDays={};taskDay(date).tasks=[{id:'ui-daily',name:'مهمة الفترة',prayer:0,expectedSlots:3}];view='day';prayer=0;render();window.uiRenderCount=0;`,
  );
  const slot = $('[data-slot]'),
    first = $('#dailyTaskCards [data-task-id="ui-daily"]'),
    second = $('#allDayTaskCards [data-task-id="ui-daily"]');
  own(first, '[data-task-select]').click();
  own(first, '[data-outcome="done"]').click();
  assert.equal(first.classList.contains('done'), true);
  assert.equal(second.classList.contains('done'), true);
  assert.equal($('[data-slot]'), slot);
  assert.equal(run('window.uiRenderCount'), 0);
  // Monthly outcome actions patch chips and summaries without replacing the calendar.
  run(
    `view='dashboard';plannerTab='month';plannerMonth=date.slice(0,7);Object.assign(monthFilters,{project:'all',category:'all',status:'all',priority:'all',period:'all',query:''});render();window.uiRenderCount=0;`,
  );
  const calendar = $('.task-month'),
    chip = $('[data-month-task="ui-daily"]');
  chip.click();
  $('[data-month-outcome="done"]').click();
  assert.equal($('.task-month'), calendar);
  assert.equal($('[data-month-task="ui-daily"]'), chip);
  assert.equal(chip.classList.contains('pending'), true);
  assert.equal(run('window.uiRenderCount'), 0);
  chip.click();
  $('[data-month-outcome="failed"]').click();
  assert.equal(chip.classList.contains('failed'), true);
  assert.equal($('.month-summary').textContent.includes('لم أفعلها: 1'), true);
  run(`monthFilters.status='failed';render();window.uiRenderCount=0;`);
  $('[data-month-task="ui-daily"]').click();
  $('[data-month-outcome="failed"]').click();
  assert.equal($('[data-month-task="ui-daily"]'), null);
  assert.equal(run('window.uiRenderCount'), 0);
  // Filter reconciliation preserves the expanded family, selection and focus.
  run(
    `state.sunsetDays={};state.projects=[];state.taskInbox=[{id:'filter-parent',name:'أصل'},{id:'filter-child',name:'فرع',parentId:'filter-parent',parentDate:''}];view='dashboard';plannerTab='inbox';plannerStatus='pending';plannerQuery='';plannerPriority='all';expandedTaskRows.clear();render();window.uiRenderCount=0;`,
  );
  const filteredRoot = $('#plannerResults [data-task-id="filter-parent"]');
  own(filteredRoot, '[data-task-toggle]').click();
  const filteredChild = $('#plannerResults [data-task-id="filter-child"]');
  own(filteredChild, '[data-task-select]').click();
  own(filteredChild, '[data-outcome="done"]').focus();
  own(filteredChild, '[data-outcome="done"]').click();
  const refreshedChild = $('#plannerResults [data-task-id="filter-child"]');
  assert.ok(refreshedChild);
  assert.equal(own(refreshedChild, '.task-row-actions').hidden, false);
  assert.equal(
    w.document.activeElement,
    own(refreshedChild, '[data-outcome="done"]'),
  );
  assert.equal(run('window.uiRenderCount'), 0);
  run(`plannerStatus='all'`);
  // The shared row also serves series management, without assigning occurrence outcomes.
  run(
    `state.repeat=[{id:'ui-series',name:'سلسلة',days:[0,1,2,3,4,5,6],prayer:0}];view='repeat';render();`,
  );
  const series = $('[data-row-mode="series"]');
  assert.ok(series);
  assert.equal(own(series, '.task-row-actions').hidden, true);
  assert.equal(own(series, '[data-outcome]'), undefined);
  own(series, '[data-task-select]').click();
  assert.equal(own(series, '.task-row-actions').hidden, false);
  own(series, '[data-edit]').click();
  assert.equal($('#repeatForm').elements.name.value, 'سلسلة');
  // Date-qualified identities never open a different occurrence of a repeated id.
  run(
    `state.sunsetDays={};state.taskInbox=[];state.projects=[{id:'dated',name:'تواريخ'}];for(const key of [date,addDate(date,-1)]){taskDay(key).tasks=[{id:'same-root',name:'أصل '+key,projectId:'dated'},{id:'same-child',name:'فرع '+key,parentId:'same-root',parentDate:key}];}view='projects';selectedProject='dated';expandedTaskRows.clear();render();`,
  );
  const dated = [...w.document.querySelectorAll('#projectTaskList > .task-row')];
  assert.equal(dated.length, 2);
  own(dated[0], '[data-task-toggle]').click();
  assert.equal(
    dated[0].querySelectorAll('.task-children > .task-row').length,
    1,
  );
  assert.equal(dated[1].querySelector('.task-children > .task-row'), null);
  assert.equal(
    dated[0].querySelector('.task-children > .task-row').dataset.taskDate,
    dated[0].dataset.taskDate,
  );
  // A shared family's live progress updates both project summaries immediately.
  run(
    `state.sunsetDays={};state.taskInbox=[{id:'ui-shared',name:'مشتركة',projectIds:['ui-a','ui-b']},{id:'ui-shared-child',name:'فرع مشترك',parentId:'ui-shared',parentDate:'',expectedSlots:2},{id:'ui-exclusive',name:'خاصة',projectId:'ui-b',expectedSlots:2}];state.projects=[{id:'ui-a',name:'أ'},{id:'ui-b',name:'ب'}];selectedProject='ui-a';view='projects';expandedTaskRows.clear();render();window.uiRenderCount=0;`,
  );
  own(row('ui-shared'), '[data-task-toggle]').click();
  own(row('ui-shared-child'), '[data-task-select]').click();
  own(row('ui-shared-child'), '[data-outcome="done"]').click();
  assert.equal(run("projectCompletion('ui-a')"), 100);
  assert.equal(run("projectCompletion('ui-b')"), 50);
  assert.ok($('[data-project-summary="ui-b"]').textContent.includes('50٪'));
  assert.equal($('#projectDetails > progress').value, 100);
  assert.equal(run('window.uiRenderCount'), 0);
  // Deep families cap visual indentation; persisted parent links remain unmodified.
  run(
    `state.taskInbox=Array.from({length:9},(_,i)=>({id:'deep-'+i,name:'مستوى '+i,projectId:'deep',...(i?{parentId:'deep-'+(i-1),parentDate:''}:{})}));state.sunsetDays={};state.projects=[{id:'deep',name:'مستويات'}];selectedProject='deep';expandedTaskRows.clear();render();`,
  );
  for (let i = 0; i < 8; i++)
    own(row('deep-' + i), '[data-task-toggle]').click();
  assert.equal(row('deep-8').style.getPropertyValue('--task-indent'), '3');
  assert.equal(run("findTask('deep-8','').parentId"), 'deep-7');
  // Reorder direct siblings through the real numeric control; deep children stay with their parent.
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[{id:'rank-root',name:'أصل'},{id:'rank-a',name:'أ',parentId:'rank-root',parentDate:''},{id:'rank-b',name:'ب',parentId:'rank-root',parentDate:''},{id:'rank-deep',name:'عميقة',parentId:'rank-a',parentDate:''}];openPlannerEditor(findTask('rank-root',''));`);
  const rankInput = $('#plannerEditor [data-task-id="rank-b"] [data-subtask-order]');
  assert.ok(rankInput);$('#plannerForm').elements.taskName.value='مسودة غير محفوظة';
  const draftForm = $('#plannerForm');rankInput.value='1';
  rankInput.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.equal(run("childTasks(findTask('rank-root','')).map(t=>t.id).join(',')"),'rank-b,rank-a');
  assert.equal($('#plannerForm'),draftForm);assert.equal(draftForm.elements.taskName.value,'مسودة غير محفوظة');
  assert.equal($('#plannerEditor .editor-subtasks > .task-row').dataset.taskId,'rank-b');
  assert.equal(run("childTasks(findTask('rank-a',''))[0].id"),'rank-deep');
  assert.equal(run("moveSubtask(findTask('rank-a',''),0)"),false);
  run('state=JSON.parse(JSON.stringify(state));validate(state);');
  assert.equal(run("childTasks(findTask('rank-root','')).map(t=>t.id).join(',')"),'rank-b,rank-a');
  assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'invalid-rank',name:'خطأ',subtaskPosition:0}]})"));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: shared task rows, lazy multi-level families, keyboard, escaped full text, outcomes/effort without page redraw, summaries, duplicate lists and dated identities',
  );
} finally {
  w.close();
}
