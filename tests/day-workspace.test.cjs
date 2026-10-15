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
  assert.deepEqual(errors, []);
  console.log(
    'PASS: daily partial slot/range recording, independent notes, linked families, prayer outcomes, focus/scroll and responsive navigation destinations',
  );
} finally {
  dom.window.close();
}
