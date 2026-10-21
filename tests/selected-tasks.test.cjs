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
    .join('\n') + '\nwindow.bulkRun=code=>eval(code)',
);
const run = w.bulkRun,
  $ = (s) => w.document.querySelector(s),
  row = (id) => $('#app [data-task-id="' + id + '"]'),
  own = (r, s) =>
    [...r.querySelectorAll(s)].find((e) => e.closest('.task-row') === r),
  change = (input, value, key = 'change') => {
    input.value = value;
    input.dispatchEvent(
      key === 'Enter'
        ? new w.KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
          })
        : new w.Event('change', { bubbles: true }),
    );
  };
try {
  // Opening Projects with no selected project must still expose bulk selection
  // after a project is picked (selectProject does not call render()).
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'a',name:'أ'}];state.taskInbox=[{id:'first',name:'المهمة الأولى',projectId:'a'}];view='projects';selectedProject='';render();`,
  );
  assert.equal($('#toggleTaskSelection').disabled, true);
  assert.equal($('#toggleTaskSelection').textContent, 'تحديد عدة مهام');
  $('#projectNavigation [data-project="a"]').click();
  assert.ok(
    $('#toggleTaskSelection'),
    'bulk-selection button appears when first choosing a populated project',
  );
  assert.equal($('#toggleTaskSelection').disabled, false);
  assert.equal(
    $('body > aside nav'),
    $('#toggleTaskSelection').parentElement,
  );
  $('#projectSearch').value = 'بحث لا يطابق أي مهمة';
  $('#projectSearch').dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal($('#toggleTaskSelection').disabled, true);
  $('#clearProjectSearch').click();
  assert.equal($('#toggleTaskSelection').disabled, false);
  $('#toggleTaskSelection').click();
  assert.equal(
    w.document.querySelectorAll('#projectTaskList [data-select-task]').length,
    1,
  );
  $('#toggleTaskSelection').click();
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'a',name:'أ'},{id:'b',name:'ب'},{id:'c',name:'ج'}];state.taskInbox=[{id:'parent',name:'الأصل',projectIds:['a','b'],priority:3},{id:'child',name:'الفرع',parentId:'parent',parentDate:'',priority:3,expectedSlots:10,completedSlotCount:4},{id:'free',name:'مستقلة',projectId:'a',priority:4,expectedSlots:2,inboxOutcome:'done'}];view='projects';selectedProject='a';render();`,
  );
  const before = run('JSON.stringify(state)');
  const next = run(
    `bulkUpdateSelectedTasks(state,[{id:'child',date:''},{id:'free',date:''},{id:'child',date:''}],{priority:1,projects:{mode:'add',ids:['c']}})`,
  );
  assert.equal(
    run('JSON.stringify(state)'),
    before,
    'model edits are atomic and do not write live state',
  );
  assert.deepEqual([...next.taskInbox[0].projectIds], ['a', 'b']);
  assert.deepEqual([...next.taskInbox[1].projectIds], ['a', 'b', 'c']);
  assert.equal(next.taskInbox[1].projectOverride, true);
  assert.equal(
    next.taskInbox[0].priority,
    3,
    'unselected parent priority stays unchanged',
  );
  assert.equal(next.taskInbox[1].priority, 1);
  assert.equal(next.taskInbox[1].completedSlotCount, 4);
  assert.equal(next.taskInbox[2].inboxOutcome, 'done');
  assert.deepEqual([...next.taskInbox[2].projectIds], ['a', 'c']);
  for (const code of [
    `bulkUpdateSelectedTasks(state,[{id:'missing',date:''}],{priority:1})`,
    `bulkUpdateSelectedTasks(state,[{id:'child',date:''}],{priority:6})`,
    `bulkUpdateSelectedTasks(state,[{id:'child',date:''}],{})`,
    `bulkUpdateSelectedTasks(state,[{id:'child',date:''}],{projects:null})`,
    `bulkUpdateSelectedTasks(state,[{id:'child',date:''}],{projects:{mode:'add',ids:[]}})`,
    `bulkUpdateSelectedTasks(state,[{id:'child',date:''}],{projects:{mode:'add',ids:['missing']}})`,
  ])
    assert.throws(() => run(code));
  assert.equal(run('JSON.stringify(state)'), before);
  run(
    `window.removed=bulkUpdateSelectedTasks(state,[{id:'child',date:''}],{projects:{mode:'remove',ids:['a']}})`,
  );
  assert.equal(run(`window.removed.taskInbox[0].projectId`), undefined);
  assert.equal(run(`window.removed.taskInbox[1].projectId`), 'b');
  assert.deepEqual(
    [...run(`window.removed.taskInbox[0].projectIds`)],
    ['a', 'b'],
  );
  assert.deepEqual([...run(`window.removed.taskInbox[1].projectIds`)], ['b']);
  run(
    `window.unlinked=bulkUpdateSelectedTasks(state,[{id:'parent',date:''}],{projects:{mode:'replace',ids:[]}})`,
  );
  assert.equal(run('window.unlinked.taskInbox[0].projectId'), '');
  assert.equal(run('window.unlinked.taskInbox[0].projectIds.length'), 0);
  // Selection does not expand parents or select children implicitly.
  $('#toggleTaskSelection').click();
  assert.equal(w.document.querySelectorAll('[data-select-task]').length, 2);
  $('#selectVisibleTasks').click();
  assert.equal(run('selectedTaskRefs.size'), 2);
  $('#clearSelectedTasks').click();
  const parent = $('#projectTaskList [data-task-id="parent"]');
  own(parent, '[data-task-toggle]').click();
  const child = $('#projectTaskList [data-task-id="child"]');
  own(child, '[data-select-task]').click();
  assert.equal(run('selectedTaskRefs.size'), 1);
  own(parent, '[data-task-toggle]').click();
  own(parent, '[data-task-toggle]').click();
  assert.equal(
    own($('#projectTaskList [data-task-id="child"]'), '[data-select-task]')
      .checked,
    true,
  );
  $('#editSelectedTasks').click();
  $('[data-edit-selected="priority"]').click();
  $('[name="priority"][value="2"]').checked = true;
  $('[data-edit-selected="projects"]').click();
  $('[name="projectIds"][value="c"]').checked = true;
  $('#projectDetails').scrollTop = 190;
  $('#selectedTasksForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.equal($('#selectedTasksEditor').open, false);
  assert.equal(run(`findTask('child','').priority`), 2);
  assert.equal(run(`findTask('parent','').priority`), 3);
  assert.deepEqual(
    [...run(`taskProjectIds(findTask('parent',''))`)],
    ['a', 'b'],
  );
  assert.equal(run('selectedTaskRefs.size'), 0);
  assert.equal($('#projectDetails').scrollTop, 190);
  assert.ok(
    $('#projectTaskList [data-task-id="child"]'),
    'expansion survives bulk save',
  );
  assert.equal(run(`completedSlots(findTask('child',''))`), 4);
  // A recurring occurrence keeps its identity, results, slots and children; the series is unchanged.
  run(
    `state.repeat=[{id:'repeat-bulk',name:'متكررة',days:[0,1,2,3,4,5,6],priority:4,projectId:'b',prayer:0,expectedSlots:2}];taskDay(date).done['repeat-bulk']=true;taskDay(date).taskProgress={'repeat-bulk':1};save();window.repeatEdit=bulkUpdateSelectedTasks(state,[{id:'repeat-bulk',date}],{priority:1,projects:{mode:'replace',ids:['c']}})`,
  );
  assert.equal(run(`window.repeatEdit.repeat[0].priority`), 4);
  assert.equal(run(`window.repeatEdit.repeat[0].projectId`), 'b');
  assert.equal(
    run(
      `window.repeatEdit.sunsetDays[date].tasks.find(t=>t.id==='repeat-bulk').priority`,
    ),
    1,
  );
  assert.equal(
    run(`window.repeatEdit.sunsetDays[date].done['repeat-bulk']`),
    true,
  );
  assert.equal(
    run(`window.repeatEdit.sunsetDays[date].taskProgress['repeat-bulk']`),
    1,
  );
  run(`state=window.repeatEdit;save();render();validate(state)`);
  assert.equal(run(`findTask('repeat-bulk',date).priority`), 1);
  assert.equal(run(`findTask('repeat-bulk',addDate(date,1)).priority`), 4);
  run(
    `window.legacyDay=addDate(activeDay(),-1);state.sunsetDays[window.legacyDay]={...emptyDay(),repeatSnapshot:[{id:'legacy-repeat',name:'تكرار قديم',priority:3,prayer:0}]};window.legacyBulk=bulkUpdateSelectedTasks(state,[{id:'legacy-repeat',date:window.legacyDay}],{priority:2})`,
  );
  assert.equal(
    run(`window.legacyBulk.sunsetDays[window.legacyDay].tasks[0].priority`),
    2,
    'historical snapshots without a recurrent flag remain editable',
  );
  const largeStart = w.performance.now();
  run(
    `window.largeBulkSource=structuredClone(state);window.largeBulkSource.taskInbox.push(...Array.from({length:240},(_,i)=>({id:'load-'+i,name:'مهمة '+i,priority:3,expectedSlots:2,projectId:'a'})));window.largeBulkResult=bulkUpdateSelectedTasks(window.largeBulkSource,window.largeBulkSource.taskInbox.filter(t=>t.id.startsWith('load-')).map(t=>({id:t.id,date:''})),{priority:1,projects:{mode:'add',ids:['c']}})`,
  );
  assert.equal(
    run(
      `window.largeBulkResult.taskInbox.filter(t=>t.id.startsWith('load-') && t.priority===1 && taskProjectIds(t).includes('c')).length`,
    ),
    240,
  );
  assert.equal(
    run(
      `window.largeBulkSource.taskInbox.filter(t=>t.id.startsWith('load-') && t.priority===3).length`,
    ),
    240,
  );
  console.log('BULK_240_MS', Math.round(w.performance.now() - largeStart));
  // Replaced account data invalidates the selection/editor.
  $('#toggleTaskSelection').click();
  $('#selectVisibleTasks').click();
  $('#editSelectedTasks').click();
  const snapshot = run('JSON.stringify(state)');
  run('state=structuredClone(state)');
  $('[data-edit-selected="priority"]').click();
  $('#selectedTasksForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.match($('#selectedTasksError').textContent, /تغيرت البيانات/);
  assert.equal(run('JSON.stringify(state)'), snapshot);
  run('render()');
  assert.equal(run('selectedTaskRefs.size'), 0);
  assert.equal($('#taskSelectionToolbar'), null);
  // Bulk deletion shares single-task semantics and commits once after confirmation.
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'a',name:'أ'},{id:'b',name:'ب'}];state.taskInbox=[{id:'remove-root',name:'مشتركة',projectIds:['a','b']},{id:'keep-child',name:'فرع غير محدد',parentId:'remove-root',parentDate:'',parentName:'مشتركة'},{id:'keep',name:'تبقى',projectId:'a'}];view='projects';selectedProject='a';render();`,
  );
  $('#toggleTaskSelection').click();
  assert.equal($('#deleteSelectedTasks').disabled, true);
  own(row('remove-root'), '[data-select-task]').click();
  assert.equal($('#deleteSelectedTasks').disabled, false);
  let confirmations = 0;
  w.confirm = (message) => {
    confirmations++;
    assert.match(message, /حذف 1 مهمة/);
    assert.match(message, /الفروع غير المحددة/);
    return false;
  };
  const beforeDelete = run('JSON.stringify(state)');
  $('#deleteSelectedTasks').click();
  assert.equal(run('JSON.stringify(state)'), beforeDelete);
  assert.equal(run('selectedTaskRefs.size'), 1);
  w.confirm = () => {
    confirmations++;
    return true;
  };
  const shell = $('#app > .project-workspace');
  $('#deleteSelectedTasks').click();
  assert.equal(confirmations, 2);
  assert.equal(run(`!!findTask('remove-root','')`), false);
  assert.equal(
    run(`!!findTask('keep-child','') && !!findTask('keep','')`),
    true,
  );
  assert.equal(run(`projectTasks('b').some(t=>t.id==='remove-root')`), false);
  assert.equal($('#app > .project-workspace'), shell, 'no full-page redraw');
  assert.equal(run('selectedTaskRefs.size'), 0);
  assert.equal($('#deleteSelectedTasks').disabled, true);
  run(
    `taskDay(date).tasks=[{id:'dated-delete',name:'موزعة',prayers:[0]}];taskDay(date).done['dated-delete']=true;taskDay(date).taskProgress={'dated-delete':2};taskDay(date).taskSlotOwners={'0':'dated-delete','1':'dated-delete'};taskDay(date).taskSlotValues={'0':'old','1':'old'};taskDay(date).planned={'0':'old','1':'manual'};taskDay(date).slots={'0':'actual'};taskDay(addDate(date,-1)).tasks=[{id:'dated-delete',name:'سجل سابق',prayers:[0]}];state.repeat=[{id:'repeat-delete',name:'تكرار',days:[0,1,2,3,4,5,6],prayer:0}];save();window.deleteSource=JSON.stringify(state);window.deleted=bulkDeleteSelectedTasks(state,[{id:'dated-delete',date},{id:'repeat-delete',date},{id:'dated-delete',date}])`,
  );
  assert.equal(
    run('JSON.stringify(state)'),
    run('window.deleteSource'),
    'atomic model',
  );
  assert.equal(run(`window.deleted.sunsetDays[date].tasks.length`), 0);
  assert.equal(
    run(`window.deleted.sunsetDays[date].done['dated-delete']`),
    undefined,
  );
  assert.equal(
    run(`window.deleted.sunsetDays[date].taskProgress['dated-delete']`),
    undefined,
  );
  assert.equal(run(`window.deleted.sunsetDays[date].planned[0]`), undefined);
  assert.equal(run(`window.deleted.sunsetDays[date].planned[1]`), 'manual');
  assert.equal(run(`window.deleted.sunsetDays[date].slots[0]`), 'actual');
  assert.equal(
    run(`window.deleted.sunsetDays[addDate(date,-1)].tasks.length`),
    1,
  );
  assert.equal(run(`window.deleted.repeat.length`), 1);
  assert.equal(
    run(`window.deleted.sunsetDays[date].excludedRepeat['repeat-delete']`),
    true,
  );
  assert.throws(
    () =>
      run(
        `bulkDeleteSelectedTasks(state,[{id:'keep',date:''},{id:'missing',date:''}])`,
      ),
    /تغيرت/,
  );
  assert.equal(run('JSON.stringify(state)'), run('window.deleteSource'));
  run(`state=window.deleted;save();validate(state);`);
  assert.equal(run(`!!findTask('repeat-delete',date)`), false);
  assert.equal(run(`!!findTask('repeat-delete',addDate(date,1))`), true);
  run(
    `state.sunsetDays[addDate(date,-2)]={...emptyDay(),repeatSnapshot:[{id:'snapshot-delete',name:'نسخة قديمة',prayer:0}]};window.snapshotDeleted=bulkDeleteSelectedTasks(state,[{id:'snapshot-delete',date:addDate(date,-2)}]);state=window.snapshotDeleted;save();`,
  );
  assert.equal(run(`!!findTask('snapshot-delete',addDate(date,-2))`), false);
  // A child can own project links without moving its parent or siblings.
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'a',name:'أ'},{id:'b',name:'ب'},{id:'c',name:'ج'}];state.taskInbox=[{id:'ind-parent',name:'أصل مستقل',projectId:'a',expectedSlots:99},{id:'ind-b',name:'فرع ب',parentId:'ind-parent',parentDate:'',expectedSlots:2},{id:'ind-deep',name:'عميقة',parentId:'ind-b',parentDate:'',expectedSlots:2,completedSlotCount:1},{id:'ind-c',name:'فرع ج',parentId:'ind-parent',parentDate:'',expectedSlots:6}];save();view='projects';selectedProject='a';render();openPlannerEditor(findTask('ind-b',''));`,
  );
  assert.equal(
    $('#plannerForm [name="projectIds"][value="b"]').disabled,
    false,
  );
  $('#plannerForm [name="projectIds"][value="a"]').click();
  $('#plannerForm [name="projectIds"][value="b"]').click();
  assert.equal($('#plannerForm [name="inheritProjects"]').checked, false);
  $('#plannerForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('ind-parent',''))`)],
    ['a'],
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('ind-b',''))`)],
    ['b'],
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('ind-deep',''))`)],
    ['b'],
  );
  run(
    `state=bulkUpdateSelectedTasks(state,[{id:'ind-c',date:''}],{projects:{mode:'replace',ids:['c']}});save();validate(state);`,
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('ind-c',''))`)],
    ['c'],
  );
  assert.equal(run(`taskExpectedSlots(findTask('ind-parent',''))`), 8);
  assert.equal(run(`taskCompletion(findTask('ind-parent',''))`), 25);
  assert.equal(run(`projectCompletion('b')`), 50);
  assert.equal(run(`projectCompletion('c')`), 0);
  assert.equal(
    run(`projectCompletion('a')`),
    0,
    'independently linked descendants do not contribute slots to their parent project',
  );
  run(`selectedProject='b';render();expandProjectTasks(true);`);
  assert.ok(row('ind-parent') && row('ind-b') && row('ind-deep'));
  assert.equal(row('ind-c'), null, 'other-project sibling is not shown');
  run(`window.purgeIndependent=removeProjectAndItsTasks(state,'a');`);
  assert.equal(
    run(`window.purgeIndependent.state.taskInbox.some(t=>t.id==='ind-parent')`),
    false,
  );
  assert.equal(
    run(
      `window.purgeIndependent.state.taskInbox.filter(t=>['ind-b','ind-c','ind-deep'].includes(t.id)).length`,
    ),
    3,
    'deleting parent project preserves independently linked descendants',
  );
  run(`openPlannerEditor(findTask('ind-b',''));`);
  $('#plannerForm [name="inheritProjects"]').click();
  $('#plannerForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('ind-b',''))`)],
    ['a'],
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('ind-c',''))`)],
    ['c'],
  );
  run(
    `state.taskInbox.push({id:'old-copied-link',name:'بيانات قديمة',parentId:'ind-parent',parentDate:'',projectIds:['c']});save();`,
  );
  assert.deepEqual(
    [...run(`effectiveProjectIds(findTask('old-copied-link',''))`)],
    ['a'],
    'legacy copied links keep inherited behavior',
  );
  assert.throws(
    () =>
      run(
        `validatePlanning({...state,taskInbox:[{id:'invalid',name:'غير صالح',projectOverride:'yes'}]})`,
      ),
    /وراثة/,
  );
  // Optional bulk fields: move complete families without losing results or actual logs.
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[
    {id:'move-root',name:'أصل',projectIds:['a','b'],expectedSlots:8,inboxOutcome:'done',completedSlotCount:3},
    {id:'move-child',name:'فرع',parentId:'move-root',parentDate:'',expectedSlots:2,completedSlotCount:1},
    {id:'stay',name:'لا يتغير',priority:5}];save();window.untouched=JSON.stringify(state.taskInbox[2]);window.bulkDate=addDate(activeDay(),2);
    window.patchBefore=JSON.stringify(state);
    window.movedBulk=bulkUpdateSelectedTasks(state,[{id:'move-root',date:''},{id:'move-child',date:''}],{date:window.bulkDate,prayers:[0,3],priority:2,actionId:state.actions[0].id,showInMonthlyCalendar:false});`);
  assert.equal(run('JSON.stringify(state)'), run('window.patchBefore'));
  run('state=window.movedBulk;invalidateTaskReads();validate(state);');
  assert.equal(run(`outcome(findTask('move-root',window.bulkDate))`), 'done');
  assert.equal(run(`completedSlots(findTask('move-root',window.bulkDate))`), 3);
  assert.equal(
    run(`completedSlots(findTask('move-child',window.bulkDate))`),
    1,
  );
  assert.equal(
    run(`findTask('move-child',window.bulkDate).parentDate`),
    run('window.bulkDate'),
  );
  assert.equal(
    run(`findTask('move-child',window.bulkDate).showInMonthlyCalendar`),
    false,
  );
  assert.deepEqual(
    [...run(`taskPeriods(findTask('move-child',window.bulkDate))`)],
    [0, 3],
  );
  assert.equal(
    run(`JSON.stringify(findTask('stay',''))`),
    run('window.untouched'),
  );
  run(
    `state=bulkUpdateSelectedTasks(state,[{id:'move-root',date:window.bulkDate}],{date:''});invalidateTaskReads();`,
  );
  assert.equal(run(`outcome(findTask('move-root',''))`), 'done');
  assert.equal(run(`completedSlots(findTask('move-root',''))`), 3);
  assert.equal(run(`findTask('move-child',window.bulkDate).parentDate`), '');
  // Period changes remove only task-owned planning; actual recording and manual edits survive.
  run(
    `window.slot=periodSlots(window.bulkDate,0)[0];window.scheduled=findTask('move-child',window.bulkDate);window.scheduled.startSlot=window.slot;Object.assign(taskDay(window.bulkDate).tasks.find(t=>t.id==='move-child'),window.scheduled);scheduleTask(window.scheduled,window.slot);taskDay(window.bulkDate).slots[window.slot%144]=state.actions[0].id;(taskDay(window.bulkDate).actualNotes??={})[window.slot%144]='تسجيل محفوظ';window.oldActual=JSON.stringify(taskDay(window.bulkDate).slots);state=bulkUpdateSelectedTasks(state,[{id:'move-child',date:window.bulkDate}],{prayers:[4]});invalidateTaskReads();`,
  );
  assert.equal(run(`findTask('move-child',window.bulkDate).startSlot`), null);
  assert.equal(
    run(`Object.keys(taskDay(window.bulkDate).taskSlotOwners).length`),
    0,
  );
  assert.equal(
    run(`JSON.stringify(taskDay(window.bulkDate).slots)`),
    run('window.oldActual'),
  );
  assert.equal(
    run(`taskDay(window.bulkDate).actualNotes[window.slot%144]`),
    'تسجيل محفوظ',
  );
  // Recurring moves isolate one occurrence and preserve the series and its destination occurrence.
  run(
    `date=activeDay();state.repeat=[{id:'dated-repeat',name:'سلسلة',days:[0,1,2,3,4,5,6],prayer:0,priority:4}];(taskDay(date).failed??={})['dated-repeat']=true;(taskDay(date).taskProgress??={})['dated-repeat']=2;state.taskInbox.push({id:'repeat-child',name:'فرع السلسلة',parentId:'dated-repeat',parentDate:date});save();state=bulkUpdateSelectedTasks(state,[{id:'dated-repeat',date}],{date:window.bulkDate,prayers:[3],showInMonthlyCalendar:false});invalidateTaskReads();window.detached=taskDay(window.bulkDate).tasks.find(t=>t.detachedFrom==='dated-repeat');validate(state);`,
  );
  assert.ok(run('window.detached.id !== "dated-repeat"'));
  assert.equal(
    run(`outcome({...window.detached,date:window.bulkDate})`),
    'failed',
  );
  assert.equal(
    run(`completedSlots({...window.detached,date:window.bulkDate})`),
    2,
  );
  assert.equal(
    run(`findTask('repeat-child','').parentId`),
    run('window.detached.id'),
  );
  assert.equal(
    run(`findTask('repeat-child','').parentDate`),
    run('window.bulkDate'),
  );
  assert.equal(run(`findTask('dated-repeat',window.bulkDate).priority`), 4);
  assert.equal(run(`findTask('dated-repeat',date)`), undefined);
  assert.equal(run(`state.repeat[0].showInMonthlyCalendar`), undefined);
  const stable = run('JSON.stringify(state)');
  for (const patch of [
    "{date:'2026-02-30'}",
    '{date:3}',
    '{prayers:[5]}',
    '{prayers:[1,1]}',
    "{actionId:'missing'}",
    "{showInMonthlyCalendar:'false'}",
  ])
    assert.throws(() =>
      run(`bulkUpdateSelectedTasks(state,[{id:'stay',date:''}],${patch})`),
    );
  assert.equal(run('JSON.stringify(state)'), stable);
  // The actual form commits the same opt-in fields and leaves unchecked fields untouched.
  run(
    `selectedTaskRefs.clear();selectedTaskRefs.set(taskIdentity({id:'stay',date:''}),{id:'stay',date:''});openSelectedTaskEditor();`,
  );
  for (const key of ['date', 'prayers', 'actionId', 'showInMonthlyCalendar'])
    $(`[data-edit-selected="${key}"]`).click();
  $('#selectedTasksForm [name="date"]').value = run('window.bulkDate');
  $('#selectedTasksForm [name="taskPeriods"][value="3"]').click();
  $('#selectedTasksForm [name="actionId"]').value = run('state.actions[0].id');
  $('#selectedTasksForm [name="showInMonthlyCalendar"]').value = 'false';
  $('#selectedTasksForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.equal($('#selectedTasksEditor').open, false);
  assert.equal(run(`findTask('stay',window.bulkDate).priority`), 5);
  assert.equal(
    run(`findTask('stay',window.bulkDate).actionId`),
    run('state.actions[0].id'),
  );
  assert.equal(
    run(`findTask('stay',window.bulkDate).showInMonthlyCalendar`),
    false,
  );
  assert.deepEqual(
    [...run(`taskPeriods(findTask('stay',window.bulkDate))`)],
    [3],
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: explicit lazy selection, atomic selected priority/project add/remove/replace, inherited/shared families, stable recurring occurrences, preserved progress/context and stale-account guard',
  );
} finally {
  w.close();
}


