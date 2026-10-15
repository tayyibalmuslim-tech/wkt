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
    .join('\n') + '\nwindow.projectRun=code=>eval(code)',
);
const run = w.projectRun,
  $ = (s) => w.document.querySelector(s),
  row = (id) => $('#projectTaskList [data-task-id="' + id + '"]'),
  own = (r, s) =>
    [...r.querySelectorAll(s)].find((e) => e.closest('.task-row') === r),
  click = (s) => $(s).click(),
  input = (s, text) => {
    $(s).value = text;
    $(s).dispatchEvent(new w.Event('input', { bubbles: true }));
  };
try {
  const sheet = w.document.createElement('style');
  sheet.textContent = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  w.document.head.append(sheet);
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'work-a',name:'المشروع الأول'},{id:'work-b',name:'المشروع الثاني'}];state.taskInbox=[{id:'work-root',name:'الجزء الأول',projectId:'work-a'},{id:'work-child',name:'فرعية',description:'فَقْرَة 123',parentId:'work-root',parentDate:'',expectedSlots:4},{id:'work-grand',name:'فرعية عميقة',parentId:'work-child',parentDate:'',expectedSlots:2},{id:'work-other',name:'مهمة أخرى',projectId:'work-a',expectedSlots:2},{id:'work-b-root',name:'مهمة المشروع الثاني',projectId:'work-b'}];expandedTaskRows.clear();projectViews.clear();view='projects';selectedProject='work-a';render();window.workspacePageRenders=0;const projectRealRender=render;render=(...args)=>{window.workspacePageRenders++;return projectRealRender(...args)};`,
  );
  const shell = $('.project-workspace'),
    navigation = $('#projectNavigation'),
    projectA = $('[data-project="work-a"]');
  assert.equal($('#projectSelect').value, 'work-a');
  assert.equal($('#projectNavigation').querySelectorAll('button').length, 2);
  assert.equal(
    row('work-child'),
    null,
    'project initially contains roots only',
  );
  assert.equal(
    own(row('work-root'), '[data-task-toggle]').getAttribute('aria-expanded'),
    'false',
  );
  assert.equal(
    $('#deleteProject').closest('details').open,
    false,
    'unlink/delete belongs to the closed menu',
  );
  assert.equal(
    $('#projectImport').closest('details').open,
    false,
    'import belongs to the page menu',
  );
  assert.equal(
    w.getComputedStyle($('.project-mobile-picker')).display,
    'none',
    'desktop uses the sidebar',
  );
  const originalData = run('JSON.stringify(state)');
  own(row('work-root'), '[data-task-toggle]').click();
  own(row('work-child'), '[data-task-toggle]').click();
  $('#projectDetails').scrollTop = 240;
  click('[data-project="work-b"]');
  assert.equal($('.project-workspace'), shell);
  assert.equal($('#projectNavigation'), navigation);
  assert.equal($('[data-project="work-a"]'), projectA);
  assert.equal(row('work-root'), null);
  click('[data-project="work-a"]');
  assert.ok(row('work-grand'));
  assert.equal($('#projectDetails').scrollTop, 240);
  assert.equal(
    run('window.workspacePageRenders'),
    0,
    'switching projects never invokes page render',
  );
  click('#collapseProjectTasks');
  assert.equal(row('work-child'), null);
  assert.equal($('#projectDetails').scrollTop, 240);
  click('#expandProjectTasks');
  assert.ok(row('work-grand'));
  assert.equal(
    run('JSON.stringify(state)'),
    originalData,
    'expand/collapse/navigation are UI-only',
  );
  click('#collapseProjectTasks');
  input('#projectSearch', 'فقرة ١٢٣');
  assert.ok(row('work-root'));
  assert.ok(row('work-child'));
  assert.ok(row('work-grand'), 'a matched parent exposes its descendants');
  assert.equal(row('work-other'), null);
  assert.equal(row('work-child').hasAttribute('data-project-match'), true);
  assert.match($('#projectSearchResults').textContent, /1 مطابقة/);
  click('[data-project="work-b"]');
  click('[data-project="work-a"]');
  assert.equal($('#projectSearch').value, 'فقرة ١٢٣');
  assert.ok(row('work-child'));
  click('#collapseProjectTasks');
  assert.equal(row('work-child'), null, 'collapse all works during search');
  input('#projectSearch', 'عميقة');
  assert.ok(row('work-grand'));
  assert.equal(row('work-other'), null);
  $('#projectSearch').dispatchEvent(
    new w.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(
    w.document.activeElement,
    own(row('work-grand'), '[data-task-select]'),
  );
  input('#projectSearch', '<script>');
  assert.equal(row('work-root'), null);
  assert.match($('#projectTaskList').textContent, /لا توجد/);
  assert.equal($('#projectTaskList script'), null);
  $('#projectSearch').dispatchEvent(
    new w.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal($('#projectSearch').value, '');
  assert.ok(row('work-root'));
  assert.equal(
    row('work-child'),
    null,
    'clearing search restores manual collapse',
  );
  assert.equal($('#projectDetails').scrollTop, 240);
  own(row('work-root'), '[data-task-toggle]').click();
  const rootRow = row('work-root'),
    childRow = row('work-child'),
    panel = $('#projectDetails');
  panel.scrollTop = 180;
  own(childRow, '[data-task-select]').click();
  own(childRow, '[data-outcome="done"]').click();
  assert.equal(row('work-child'), childRow);
  assert.equal(panel.scrollTop, 180);
  assert.equal($('#projectDetails > progress').value, 50);
  assert.equal($('.project-heading-count b').textContent, '1/2');
  assert.equal(run('window.workspacePageRenders'), 0);
  // The full-project rank is available from More without competing with the task title.
  const other = row('work-other'),
    order = own(other, '[data-project-order-key]');
  assert.ok(order.closest('.task-row-secondary'));
  assert.equal(order.closest('.task-row-heading'), null);
  order.value = '1';
  order.dispatchEvent(
    new w.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal($('#projectTaskList').firstElementChild, other);
  assert.equal(row('work-root'), rootRow);
  assert.equal(panel.scrollTop, 180);
  assert.equal(run('window.workspacePageRenders'), 0);
  assert.equal(own(other, '[data-project-order-key]').value, '1');
  assert.ok(row('work-child'));
  order.value = '2';
  order.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal($('#projectTaskList').firstElementChild, rootRow);
  assert.equal(panel.scrollTop, 180);
  input('#projectSearch', 'مهمة أخرى');
  assert.equal(own(row('work-other'), '[data-project-order-key]').max, '2');
  assert.equal(own(row('work-other'), '[data-project-order-key]').value, '2');
  click('#clearProjectSearch');
  // A structural save keeps the project shell, open branches and scroll position.
  own(row('work-root'), '[data-task-select]').click();
  own(row('work-root'), '[data-task-edit]').click();
  $('#plannerForm').elements.taskName.value = 'الجزء الأول المعدل';
  $('#plannerForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.equal($('.project-workspace'), shell);
  assert.equal($('#projectDetails'), panel);
  assert.ok(row('work-child'));
  assert.equal(panel.scrollTop, 180);
  assert.match(own(row('work-root'), '.daily-task-name').textContent, /المعدل/);
  click('#editProject');
  $('#projectForm').elements.projectName.value = 'عنوان معدّل';
  $('#projectForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.equal($('.project-heading h2').textContent, 'عنوان معدّل');
  assert.equal(panel.scrollTop, 180);
  // Import is additive and returning to the old project restores its browsing position.
  run(
    `window.importedWorkspace=importProjectPackage({format:'wkt-project-v1',version:1,project:{name:'مشروع مستورد'},tasks:[{id:'import-root',name:'مهمة مستوردة'},{id:'import-child',name:'فرع مستورد',parentId:'import-root'}]});`,
  );
  assert.equal($('.project-workspace'), shell);
  assert.equal($('#projectSelect').value, run('window.importedWorkspace.id'));
  assert.equal(
    $('#projectTaskList').querySelectorAll(':scope > .task-row').length,
    1,
  );
  assert.equal($('#projectTaskList .task-children > .task-row'), null);
  click('[data-project="work-a"]');
  assert.ok(row('work-child'));
  assert.equal(panel.scrollTop, 180);
  const taskData = run(
    `JSON.stringify({tasks:state.taskInbox.map(({projectId,projectIds,...t})=>t),days:state.sunsetDays,repeat:state.repeat})`,
  );
  click('#deleteProject');
  assert.equal(run("state.projects.some(p=>p.id==='work-a')"), false);
  assert.equal(
    run("taskEntries().some(t=>effectiveProjectIds(t).includes('work-a'))"),
    false,
  );
  assert.equal(
    run(
      `JSON.stringify({tasks:state.taskInbox.map(({projectId,projectIds,...t})=>t),days:state.sunsetDays,repeat:state.repeat})`,
    ),
    taskData,
    'normal deletion only removes project membership',
  );
  assert.equal(run("outcome(findTask('work-child',''))"), 'done');
  assert.equal($('#projectDetails'), panel);
  assert.equal($('.project-workspace'), shell);
  // Mobile selector performs the same local switch as the desktop navigation.
  $('#projectSelect').value = 'work-b';
  $('#projectSelect').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.ok(row('work-b-root'));
  assert.equal($('#projectSelect').value, 'work-b');
  // A deleted parent's preserved family remains searchable by its stored title.
  run(
    `state.taskInbox.push({id:'orphan-search',name:'فرع محفوظ',parentId:'removed-search',parentDate:'',parentName:'أصل محذوف قابل للبحث',projectId:'work-b'});render();`,
  );
  input('#projectSearch', 'أصل محذوف');
  assert.ok($('#projectTaskList > .task-family'));
  assert.ok(row('orphan-search'));
  // Hiding completed work changes visibility only, including nested rows and project navigation.
  run(`hideCompletedWork=false;state.sunsetDays={};state.repeat=[];state.projects=[{id:'hide-finished',name:'منتهٍ'},{id:'hide-active',name:'جارٍ'}];state.taskInbox=[{id:'hide-done',name:'منتهية',projectId:'hide-finished',inboxOutcome:'done',expectedSlots:2},{id:'hide-root',name:'رئيسية',projectId:'hide-active'},{id:'hide-child',name:'فرعية منتهية',parentId:'hide-root',parentDate:'',inboxOutcome:'done',expectedSlots:1},{id:'hide-pending',name:'فرعية باقية',parentId:'hide-root',parentDate:'',expectedSlots:3}];selectedProject='hide-active';view='projects';expandedTaskRows.clear();render();`);
  const hiddenBackup=run('JSON.stringify(state)'), hiddenProgress=run("projectCompletion('hide-active')");
  $('#toggleCompletedWork').click();
  assert.equal($('[data-project="hide-finished"]').hidden,true);
  own(row('hide-root'),'[data-task-toggle]').click();
  assert.equal(row('hide-child').hidden,true);assert.equal(row('hide-pending').hidden,false);
  assert.equal(run('JSON.stringify(state)'),hiddenBackup);
  assert.equal(run("projectCompletion('hide-active')"),hiddenProgress);
  $('#toggleCompletedWork').click();
  assert.equal(row('hide-child').hidden,false);assert.equal($('[data-project="hide-finished"]').hidden,false);
  run("view='dashboard';plannerTab='inbox';render()");
  $('#toggleCompletedWork').click();
  assert.equal($('#plannerResults [data-task-id="hide-done"]').hidden,true);
  $('#toggleCompletedWork').click();assert.equal($('#plannerResults [data-task-id="hide-done"]').hidden,false);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: project workspace navigation, searchable nested paths, session expansion/scroll, local reorder, CRUD/import preservation and safe unlink deletion',
  );
} finally {
  w.close();
}
