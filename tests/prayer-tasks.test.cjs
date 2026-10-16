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
  run("state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];prayer=0;day().checks['0-0']=true;day().checks['0-2']=true;view='settings';render()");
  assert.equal(run('prayerCheckTotal()'), 25);
  const submitForm = (s) => $(s).dispatchEvent(new w.Event('submit', { cancelable: true }));
  $('[data-prayer-task="0"] input').value = 'الصف الأول المعدل';
  submitForm('[data-prayer-task="0"]');
  assert.equal(run('prayerCount(0)'), 2, 'renaming retains recorded outcomes');
  assert.equal(run('prayerCheckTasks(1)[0].name'), 'صف أول', 'other prayers remain independent');
  $('[data-prayer-task="0"] [data-delete-prayer-task]').click();
  assert.equal(run('prayerCount(0)'), 1);
  assert.equal(run('prayerCheckTotal()'), 24);
  assert.equal(run("day().checks['0-0']"), true, 'deletion preserves stored history');
  $('#addPrayerTask input').value = 'دعاء <جديد>';
  submitForm('#addPrayerTask');
  const id = run('prayerCheckTasks(0).at(-1).id');
  assert.notEqual(id, '0');
  assert.equal(run('prayerCount(0)'), 1, 'new tasks never inherit deleted outcomes');
  assert.equal(run('prayerCheckTotal()'), 25);
  run("view='day';render();openPrayer(0)");
  assert.equal($('#prayerProgress').textContent, '1/5');
  assert.ok($('#prayerChecks').textContent.includes('دعاء <جديد>'));
  assert.equal($('[data-check-status="0-0"]'), null);
  $(`[data-check-status="0-${id}"][data-value="done"]`).click();
  assert.equal($('#dayPrayerChecks').textContent, '2');
  $(`[data-edit-check="0-${id}"]`).click();
  assert.equal($('#taskEditName').value, 'دعاء <جديد>');
  $('#taskEditName').value = 'لهذا اليوم فقط';
  submitForm('#taskEditForm');
  assert.equal(run('prayerCheckTasks(0).at(-1).name'), 'دعاء <جديد>');
  run("$('#prayerDialog').close();view='settings';render()");
  for (const button of [...w.document.querySelectorAll('[data-delete-prayer-task]')]) {
    // The settings panel is refreshed after every mutation.
    $('[data-delete-prayer-task]').click();
  }
  assert.equal(run('prayerCheckTasks(0).length'), 0);
  assert.equal(run('prayerCheckTotal()'), 20);
  run("view='day';render();openPrayer(0)");
  assert.equal($('#prayerProgress').textContent, '0/0');
  assert.equal($('#dayPrayerChecks').textContent, '0');
  assert.equal($('[data-prayer="0"] .prayer-count').classList.contains('complete'), false);
  run("$('#prayerDialog').close();view='dashboard';plannerTab='day';render()");
  assert.match($('.dashboard-summary').textContent, /0\/20/);
  run("day().checks['1-0']=true;plannerMonth=date.slice(0,7);plannerTab='month';render()");
  assert.equal($(`[data-calendar-day="${run('date')}"]`).closest('.month-day').querySelector('.month-prayer-checks').textContent, 'الصلاة 1/20');
  const missing = [...w.document.querySelectorAll('.month-day')].find((el) => el.querySelector('.month-prayer-checks') && !run(`state.sunsetDays[${JSON.stringify(el.querySelector('[data-calendar-day]').dataset.calendarDay)}]`));
  assert.ok(missing);
  assert.equal(missing.querySelector('.month-prayer-checks').textContent, 'الصلاة 0/20');
  const saved = run('JSON.stringify(state)');
  run('state=JSON.parse('+JSON.stringify(saved)+');validate(state);render()');
  assert.equal(run('prayerCheckTasks(0).length'), 0, 'empty lists survive restore');
  assert.throws(() => run("validate({...state,prayerTasks:{0:[{id:'0',name:'a'},{id:'0',name:'b'}]}})"));
  assert.throws(() => run("validate({...state,prayerTasks:{5:[]}})"));
  assert.deepEqual(errors, []);
  console.log('Prayer task settings: CRUD, stable outcomes, daily overrides, counters and restore passed');
} finally {
  w.close();
}
