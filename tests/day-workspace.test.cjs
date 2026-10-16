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
    .join('\n') + '\nwindow.dayRun=code=>eval(code)',
);
const run = w.dayRun,
  $ = (s) => w.document.querySelector(s),
  slot = (n, kind = 'actual') => $(`[data-slot="${n}"][data-kind="${kind}"]`),
  submit = () =>
    $('#slotForm').dispatchEvent(
      new w.Event('submit', { bubbles: true, cancelable: true }),
    );
try {
  run(
    `state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];view='day';prayer=3;render();window.dayRenderCount=0;const phase4Render=render;render=(...args)=>{window.dayRenderCount++;return phase4Render(...args)};`,
  );
  const first = run('range(prayer)[0]'),
    action = run('state.actions[0].id'),
    shell = $('.day-workspace'),
    grid = $('#dailySlots'),
    untouched = slot(first + 1);
  assert.equal(run('prayerOrder.flatMap(range).length'), 144);
  assert.equal($('#navigationMore').querySelectorAll('button').length, 3);
  assert.equal(
    $('.mobile-navigation [data-view="day"]').getAttribute('aria-current'),
    'page',
  );
  assert.ok($('#downloadBackup').closest('header'));
  run('app.scrollTop=230');
  slot(first).click();
  $('#slotNote').value = 'ملاحظة فعلية';
  $(`[data-action-choice="${action}"]`).click();
  assert.equal(run(`day().slots[${first}%144]`), action);
  assert.equal(run(`day().actualNotes[${first}%144]`), 'ملاحظة فعلية');
  assert.equal(
    slot(first).querySelector('.slot-note').textContent,
    'ملاحظة فعلية',
  );
  assert.equal($('#dayRecorded').textContent, '1');
  assert.equal($('#dayUnrecorded').textContent, '143');
  assert.equal(w.document.activeElement, slot(first));
  assert.equal(
    slot(first + 1),
    untouched,
    'unrelated slots retain their nodes',
  );
  assert.equal($('#dailySlots'), grid);
  assert.equal($('.day-workspace'), shell);
  assert.equal(run('window.dayRenderCount'), 0);
  assert.equal(run('app.scrollTop'), 230);
  slot(first, 'planned').click();
  $('#slotNote').value = 'ملاحظة مطلوبة';
  $(`[data-action-choice="${action}"]`).click();
  assert.equal(run(`day().plannedNotes[${first}%144]`), 'ملاحظة مطلوبة');
  assert.equal(run(`day().actualNotes[${first}%144]`), 'ملاحظة فعلية');
  assert.equal(
    $('#dayRecorded').textContent,
    '1',
    'planning does not count as actual recording',
  );
  slot(first, 'planned').click();
  $('#clearSlot').click();
  assert.equal(run(`day().planned[${first}%144]`), undefined);
  assert.equal(run(`day().actualNotes[${first}%144]`), 'ملاحظة فعلية');
  slot(first, 'planned').click();
  $('#picker').dispatchEvent(
    new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.equal($('#picker').open, false);
  assert.equal(w.document.activeElement, slot(first, 'planned'));
  $('#bulkSlots').click();
  $('#slotFrom').value = first;
  $('#slotTo').value = first + 12;
  $('#slotTo').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match($('#slotCount').textContent, /12 خانة · 120 دقيقة/);
  $('#slotNote').value = 'فترة ساعتين';
  $(`[data-action-choice="${action}"]`).click();
  assert.ok($('#picker').open, 'bulk selection waits for confirmation');
  submit();
  assert.equal(run('Object.keys(day().slots).length'), 12);
  for (let i = 0; i < 12; i++)
    assert.equal(run(`day().actualNotes[${first + i}%144]`), 'فترة ساعتين');
  assert.equal($('#dayRecorded').textContent, '12');
  assert.equal(run('window.dayRenderCount'), 0);
  // Linked tasks retain their action and parent identity without assigning an outcome.
  run(
    `taskDay(date).tasks=[{id:'slot-root',name:'أصل',prayer:3,actionId:state.actions[0].id},{id:'slot-child',name:'فرع',parentId:'slot-root',parentDate:date,prayer:3,actionId:state.actions[0].id}];save();`,
  );
  slot(first).click();
  $('[data-task-choice="slot-child"]').click();
  assert.equal(run(`day().actualTasks[${first}%144].id`), 'slot-child');
  assert.match(slot(first).textContent, /أصل/);
  assert.match(slot(first).textContent, /فرع/);
  assert.equal(run(`outcome(findTask('slot-child',date))`), 'pending');
  // Prayer outcomes update their own dialog, tab counters and day summary only.
  $('[data-prayer-tasks="3"]').click();
  $('[data-check-status="3-0"][data-value="done"]').click();
  assert.equal($('#dayPrayerChecks').textContent, '1');
  assert.equal($('#dailySlots'), grid);
  assert.equal(run('window.dayRenderCount'), 0);
  assert.equal($('[data-prayer="3"] .prayer-count').textContent, '1/5');
  $('[data-check-status="3-0"][data-value="failed"]').click();
  assert.equal($('#dayPrayerChecks').textContent, '0');
  assert.equal(run(`day().checkFailed['3-0']`), true);
  $('#closePrayer').click();
  $('#navigationMore').open = true;
  w.document.dispatchEvent(
    new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  assert.equal($('#navigationMore').open, false);
  $('#navigationMore').open = true;
  $('#app').click();
  assert.equal(
    $('#navigationMore').open,
    false,
    'outside click closes secondary navigation',
  );
  $('#navigationMore').open = true;
  $('.mobile-navigation [data-view="projects"]').click();
  assert.equal($('#navigationMore').open, false);
  assert.equal(
    $('.mobile-navigation [data-view="projects"]').getAttribute('aria-current'),
    'page',
  );
  $('#navigationMore').open = true;
  $('#navigationMore [data-view="settings"]').click();
  assert.ok($('#navigationMore').classList.contains('has-current'));
  assert.equal(
    $('#navigationMore [data-view="settings"]').getAttribute('aria-current'),
    'page',
  );
  assert.ok($('#downloadBackup').isConnected);
  // Planned slots offer the same period tasks, without changing actual records or progress.
  run(`state.sunsetDays={};state.repeat=[];view='day';prayer=3;day().tasks=[
    {id:'plan-root',name:'المهمة الرئيسية',prayer:3,actionId:state.actions[0].id},
    {id:'plan-child',name:'المهمة الفرعية',parentId:'plan-root',parentDate:date,prayer:3,actionId:state.actions[0].id},
    {id:'plan-other',name:'فترة أخرى',prayer:4,actionId:state.actions[0].id},
    {id:'plan-unlinked',name:'غير مرتبطة',prayer:3}
  ];SlotTools.apply(day(),${first},${first}+1,'actual',state.actions[1].id,'فعلت بالفعل',starts()[3]);save();render();`);
  const actualBeforePlanning = run('JSON.stringify({slots:day().slots,notes:day().actualNotes,tasks:day().actualTasks})');
  slot(first, 'planned').click();
  assert.equal($('#slotTasks').hidden, false);
  assert.ok($('[data-task-choice="plan-child"]'));
  assert.equal($('[data-task-choice="plan-other"]'), null);
  assert.equal($('[data-task-choice="plan-unlinked"]').disabled, true);
  $('#slotNote').value = 'خطتي';
  $('[data-task-choice="plan-child"]').click();
  assert.equal($('#picker').open, false, 'single planned task saves immediately');
  assert.equal(run(`day().planned[${first}%144]`), action);
  assert.equal(run(`day().taskSlotOwners[${first}%144]`), 'plan-child');
  assert.equal(run(`day().taskSlotNotes[${first}%144]`), 'خطتي');
  assert.match(slot(first, 'planned').textContent, /المهمة الرئيسية/);
  assert.match(slot(first, 'planned').textContent, /المهمة الفرعية/);
  assert.equal(run("outcome(findTask('plan-child',date))"), 'pending');
  assert.equal(run("completedSlots(findTask('plan-child',date))"), 0);
  assert.equal(run('JSON.stringify({slots:day().slots,notes:day().actualNotes,tasks:day().actualTasks})'), actualBeforePlanning);
  slot(first, 'planned').click();
  assert.equal($('[data-task-choice="plan-child"]').getAttribute('aria-pressed'), 'true');
  $('#slotNote').value = 'خطة معدلة';
  submit();
  assert.equal(run(`day().taskSlotOwners[${first}%144]`), 'plan-child');
  assert.equal(run(`day().plannedNotes[${first}%144]`), 'خطة معدلة');
  slot(first, 'planned').click();
  $(`[data-action-choice="${action}"]`).click();
  assert.equal(run(`day().taskSlotOwners[${first}%144]`), undefined, 'ordinary actions remove planned task association');
  assert.equal(slot(first, 'planned').querySelector('.slot-task-name'), null);
  run(`openPicker(${first},'planned',true)`);
  $('#slotTo').value = first + 3;
  $('#slotTo').dispatchEvent(new w.Event('change', { bubbles: true }));
  $('[data-task-choice="plan-child"]').click();
  assert.equal($('#picker').open, true, 'bulk planning waits for save');
  submit();
  for (let i = 0; i < 3; i++) {
    assert.equal(run(`day().taskSlotOwners[${first + i}%144]`), 'plan-child');
    assert.equal(run(`day().taskSlotValues[${first + i}%144]`), action);
  }
  // Changing between actual and planned reads each kind's task separately.
  slot(first, 'planned').click();
  $('#slotKind').value = 'actual';
  $('#slotKind').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal($('[data-task-choice="plan-child"]').getAttribute('aria-pressed'), 'false');
  $('#slotKind').value = 'planned';
  $('#slotKind').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal($('[data-task-choice="plan-child"]').getAttribute('aria-pressed'), 'true');
  $('#clearSlot').click();
  for (let i = 0; i < 3; i++) assert.equal(run(`day().taskSlotOwners[${first + i}%144]`), undefined);
  assert.equal(run('JSON.stringify({slots:day().slots,notes:day().actualNotes,tasks:day().actualTasks})'), actualBeforePlanning);
  // A task limited to one prayer cannot be planned across the next prayer boundary.
  const boundary = run('range(3).at(-1)+1');
  run(`openPicker(${boundary - 1},'planned',true)`);
  $('#slotTo').value = boundary + 1;
  $('#slotTo').dispatchEvent(new w.Event('change', { bubbles: true }));
  $('[data-task-choice="plan-child"]').click();
  const beforeRejectedPlan = run('JSON.stringify(state)');
  submit();
  assert.equal($('#picker').open, true);
  assert.match($('#slotError').textContent, /لا تخص جميع فترات/);
  assert.equal(run('JSON.stringify(state)'), beforeRejectedPlan);
  $('#close').click();
  run('validate(state)');
  // Completed tasks disappear from both pickers; previously registered slots stay editable.
  run(`state.sunsetDays={};state.repeat=[];prayer=3;view='day';day().tasks=[
    {id:'finished',name:'مهمة تمت',prayer:3,actionId:state.actions[0].id},
    {id:'all-slots',name:'خانات مكتملة',prayer:3,expectedSlots:2,actionId:state.actions[0].id},
    {id:'finished-parent',name:'أصل مكتمل',prayer:3,actionId:state.actions[0].id},
    {id:'unfinished-child',name:'فرع أصل مكتمل',parentId:'finished-parent',parentDate:date,prayer:3,actionId:state.actions[0].id},
    {id:'pending',name:'باقية',prayer:3,expectedSlots:3,actionId:state.actions[0].id},
    {id:'failed',name:'لم أفعلها',prayer:3,actionId:state.actions[0].id}
  ];state.repeat=[{id:'repeat-finished',name:'متكررة مكتملة',prayer:3,days:[0,1,2,3,4,5,6],actionId:state.actions[0].id}];day().done={'finished-parent':true,'repeat-finished':true};day().failed={failed:true};day().taskProgress={'all-slots':2,pending:1};save();render()`);
  for (const kind of ['actual', 'planned']) {
    run(`openPicker(${first},${JSON.stringify(kind)})`);
    $('[data-task-choice="finished"]').click();
  }
  run("day().done.finished=true;save();render()");
  for (const kind of ['actual', 'planned']) {
    run(`openPicker(${first},${JSON.stringify(kind)})`);
    for (const id of ['finished','all-slots','finished-parent','unfinished-child','repeat-finished'])
      assert.equal($(`[data-task-choice="${id}"]`), null, `${id} is omitted from ${kind} choices`);
    assert.ok($('[data-task-choice="pending"]'));
    assert.ok($('[data-task-choice="failed"]'));
    $('#slotNote').value = 'سجل محفوظ بعد الإنجاز';
    submit();
    assert.equal($('#picker').open, false);
  }
  assert.equal(run(`day().actualTasks[${first}%144].id`), 'finished');
  assert.equal(run(`day().taskSlotOwners[${first}%144]`), 'finished');
  assert.match(slot(first).textContent, /مهمة تمت/);
  assert.match(slot(first, 'planned').textContent, /مهمة تمت/);
  run("delete day().done.finished;save()");
  run(`openPicker(${first + 1},'planned')`);
  assert.ok($('[data-task-choice="finished"]'), 'undoing completion makes the task selectable again');
  $('#close').click();
  run('validate(state)');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: daily partial slot/range recording, independent notes, linked families, prayer outcomes, focus/scroll and responsive navigation destinations',
  );
} finally {
  dom.window.close();
}
