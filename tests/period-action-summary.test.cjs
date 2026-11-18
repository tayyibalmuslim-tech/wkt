const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://test.local', runScripts: 'outside-only',
});
const w = dom.window;
w.structuredClone = structuredClone;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.eval([
  'vendor/adhan.js', 'calendar.js', 'categories.js', 'slots.js',
  'task-engine.js', 'dashboard.js', 'projects.js', 'tafsir-default.js', 'app.js',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') +
  '\nwindow.runSummaryTest = code => eval(code);');
const run = w.runSummaryTest;
const done = () => w.document.querySelector('#periodDoneActionSummary');
const remaining = () => w.document.querySelector('#periodRemainingActionSummary');
const extra = () => w.document.querySelector('#periodExtraActionSummary');
const durations = (row) => [...row.querySelectorAll('strong')].map(el => el.textContent);
const planned = () => w.document.querySelector('#periodPlannedActionSummary');
try {
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];state.prayerActionPlans={};
    view='day';prayer=4;render();`);
  assert.match(done().textContent, /لم يُسجّل شيء من الخطة/);
  assert.match(planned().textContent, /لا توجد أفعال مخططة/);
  assert.match(remaining().textContent, /لا توجد خطة/);
  assert.match(extra().textContent, /لا يوجد وقت مسجل زائد/);
  assert.deepEqual(
    [...w.document.querySelectorAll('.period-action-label')].map(el => el.textContent),
    ['المخطط', 'تم من الخطة', 'المتبقي', 'الزائد عن الخطة'],
  );
  // Isha crosses midnight: separated runs still count once per actual slot.
  run(`window.period = range(prayer);
    window.actionA = state.actions[0];window.actionB = state.actions[1];window.actionC = state.actions[2];
    state.prayerActionPlans = {
      0: [{ id: actionA.id, slots: 3 }],
      4: [{ id: actionB.id, slots: 7 }, { id: actionA.id, slots: 2 }, { id: 'deleted-action', slots: 6 }]
    };
    SlotTools.apply(day(),period[0],period[0]+3,'actual',actionA.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+4,period[0]+9,'actual',actionA.id,'',starts()[3]);
    SlotTools.apply(day(),period.at(-1),period.at(-1)+1,'actual',actionB.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+10,period[0]+12,'planned',actionB.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+13,period[0]+16,'actual',actionC.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+12,period[0]+13,'actual',null,'ملاحظة فقط',starts()[3]);
    render();`);
  assert.ok(run('period[0] < 144 && period.at(-1) >= 144'));
  assert.deepEqual(durations(done()), ['10 دقيقة', '20 دقيقة']);
  assert.deepEqual(durations(remaining()), ['ساعة']);
  assert.deepEqual(durations(extra()), ['ساعة', '30 دقيقة']);
  assert.ok(remaining().children[0].textContent.includes(run('actionB.name')));
  assert.ok(extra().children[0].textContent.includes(run('actionA.name')));
  assert.ok(extra().children[1].textContent.includes(run('actionC.name')));
  assert.equal(planned().children.length, 2);
  assert.ok(planned().children[0].textContent.includes(run('actionB.name')));
  assert.ok(planned().children[1].textContent.includes(run('actionA.name')));
  assert.deepEqual([...planned().querySelectorAll('strong')].map(el => el.textContent), ['ساعة و10 دقيقة', '20 دقيقة']);
  assert.equal(planned().previousElementSibling.textContent, 'المخطط · ساعة و30 دقيقة');
  const shell = w.document.querySelector('.day-workspace');
  run(`SlotTools.apply(day(),period[0],period.at(-1)+1,'actual',null,'',starts()[3]);
    refreshDailySlots(period[0],period.at(-1)+1);`);
  assert.match(done().textContent, /لم يُسجّل شيء من الخطة/);
  assert.equal(w.document.querySelector('.day-workspace'), shell);
  assert.deepEqual(durations(remaining()), durations(planned()));
  assert.deepEqual(durations(extra()), []);
  assert.equal(planned().previousElementSibling.textContent, 'المخطط · ساعة و30 دقيقة');
  run(`SlotTools.apply(day(),period[0],period[0]+12,'actual',actionA.id,'',starts()[3]);
    refreshDailySlots(period[0],period[0]+12);`);
  assert.deepEqual(durations(done()), ['20 دقيقة']);
  assert.deepEqual(durations(remaining()), ['ساعة و10 دقيقة']);
  assert.deepEqual(durations(extra()), ['ساعة و40 دقيقة']);
  run(`SlotTools.apply(day(),period[0]+12,period[0]+19,'actual',actionB.id,'',starts()[3]);
    refreshDailySlots(period[0]+12,period[0]+19);`);
  assert.deepEqual(durations(done()), durations(planned()));
  assert.match(remaining().textContent, /تم تنفيذ الخطة بالكامل/);
  assert.deepEqual(durations(extra()), ['ساعة و40 دقيقة']);
  // Actual entries depend on the date and prayer. The settings plan repeats by prayer.
  run('prayer=0;render()');
  assert.match(done().textContent, /لم يُسجّل شيء من الخطة/);
  assert.equal(planned().children.length, 1);
  assert.equal(planned().querySelector('strong').textContent, '30 دقيقة');
  run("date='2026-10-25';prayer=4;render()");
  assert.match(done().textContent, /لم يُسجّل شيء من الخطة/);
  assert.equal(planned().children.length, 2);
  assert.equal(planned().previousElementSibling.textContent, 'المخطط · ساعة و30 دقيقة');
  console.log('period action summaries: planned, completed, remaining and excess durations, live refresh and period/date isolation passed');
} finally {
  dom.window.close();
}
