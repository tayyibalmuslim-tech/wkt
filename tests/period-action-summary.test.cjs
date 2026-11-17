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
const summary = () => w.document.querySelector('#periodActionSummary');
const planned = () => w.document.querySelector('#periodPlannedActionSummary');
try {
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];state.prayerActionPlans={};
    view='day';prayer=4;render();`);
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  assert.match(planned().textContent, /لا توجد أفعال مخططة/);
  assert.equal(summary().parentElement.nextElementSibling, planned().parentElement);
  // Isha crosses midnight: separated runs still count once per actual slot.
  run(`window.period = range(prayer);
    window.actionA = state.actions[0];window.actionB = state.actions[1];
    state.prayerActionPlans = {
      0: [{ id: actionA.id, slots: 3 }],
      4: [{ id: actionB.id, slots: 7 }, { id: actionA.id, slots: 2 }, { id: 'deleted-action', slots: 6 }]
    };
    SlotTools.apply(day(),period[0],period[0]+3,'actual',actionA.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+4,period[0]+9,'actual',actionA.id,'',starts()[3]);
    SlotTools.apply(day(),period.at(-1),period.at(-1)+1,'actual',actionB.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+10,period[0]+12,'planned',actionB.id,'',starts()[3]);
    SlotTools.apply(day(),period[0]+12,period[0]+13,'actual',null,'ملاحظة فقط',starts()[3]);
    render();`);
  assert.ok(run('period[0] < 144 && period.at(-1) >= 144'));
  assert.equal(summary().children.length, 2);
  assert.equal(summary().children[0].querySelector('strong').textContent, 'ساعة و20 دقيقة');
  assert.equal(summary().children[1].querySelector('strong').textContent, '10 دقيقة');
  assert.ok(summary().children[0].textContent.includes(run('actionA.name')));
  assert.ok(summary().children[1].textContent.includes(run('actionB.name')));
  assert.equal(planned().children.length, 2);
  assert.ok(planned().children[0].textContent.includes(run('actionB.name')));
  assert.ok(planned().children[1].textContent.includes(run('actionA.name')));
  assert.deepEqual([...planned().querySelectorAll('strong')].map(el => el.textContent), ['ساعة و10 دقيقة', '20 دقيقة']);
  assert.equal(planned().previousElementSibling.textContent, 'المخطط · ساعة و30 دقيقة');
  const plannedBeforeEdit = planned();
  const shell = w.document.querySelector('.day-workspace');
  run(`SlotTools.apply(day(),period[0],period.at(-1)+1,'actual',null,'',starts()[3]);
    refreshDailySlots(period[0],period.at(-1)+1);`);
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  assert.equal(w.document.querySelector('.day-workspace'), shell);
  assert.equal(planned(), plannedBeforeEdit);
  assert.equal(planned().previousElementSibling.textContent, 'المخطط · ساعة و30 دقيقة');
  run(`SlotTools.apply(day(),period[0],period[0]+12,'actual',actionA.id,'',starts()[3]);
    refreshDailySlots(period[0],period[0]+12);`);
  assert.equal(summary().querySelector('strong').textContent, 'ساعتان');
  // Actual entries depend on the date and prayer. The settings plan repeats by prayer.
  run('prayer=0;render()');
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  assert.equal(planned().children.length, 1);
  assert.equal(planned().querySelector('strong').textContent, '30 دقيقة');
  run("date='2026-10-25';prayer=4;render()");
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  assert.equal(planned().children.length, 2);
  assert.equal(planned().previousElementSibling.textContent, 'المخطط · ساعة و30 دقيقة');
  console.log('period action summaries: actual and planned duration, separation, prayer switching and date changes passed');
} finally {
  dom.window.close();
}
