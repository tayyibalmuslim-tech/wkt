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
const $ = (selector) => w.document.querySelector(selector);
const rows = () => [...w.document.querySelectorAll('#periodPlannedActionSummary .plan-row')];
const row = (i) => {
  const r = rows()[i];
  return {
    name: r.querySelector('.plan-name').textContent.trim(),
    done: r.querySelector('[data-done]').textContent,
    planned: r.querySelector('[data-planned]').textContent,
    status: r.querySelector('.plan-status').textContent,
  };
};
const extra = () => $('#periodExtraActionSummary');
const extraDurations = () => [...extra().querySelectorAll('.plan-chip strong')].map((el) => el.textContent);
const head = () => $('.plan-head-figures').textContent.replace(/\s+/g, ' ').trim();
const pct = () => $('.plan-percent')?.textContent;
try {
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];state.prayerActionPlans={};
    view='day';prayer=4;render();`);
  assert.equal(rows().length, 0);
  assert.match(head(), /لا توجد أفعال مخططة/);
  assert.match(extra().textContent, /لا يوجد وقت مسجل خارج الخطة/);
  assert.equal($('.plan-title').textContent, 'خطة العشاء');
  // The summary sits above the slots so it is visible without scrolling.
  assert.ok($('#periodActionTotals').compareDocumentPosition($('#dailySlots')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
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
  assert.equal(rows().length, 2, 'deleted actions are skipped');
  assert.deepEqual(row(0), { name: run('actionB.name'), done: '10 د', planned: '1 س 10 د', status: 'باقي 1 س' });
  assert.deepEqual(row(1), { name: run('actionA.name'), done: '20 د', planned: '20 د', status: '✓ اكتمل' });
  assert.ok(rows()[1].classList.contains('is-complete'));
  assert.ok(rows()[0].classList.contains('is-started'));
  assert.equal(head(), 'تم 30 د من 1 س 30 د');
  assert.equal(pct(), '33%');
  assert.equal($('.plan-meter').getAttribute('aria-valuenow'), '33');
  assert.deepEqual(extraDurations(), ['1 س', '30 د']);
  assert.ok(extra().children[0].textContent.includes(run('actionA.name')));
  assert.ok(extra().children[1].textContent.includes(run('actionC.name')));
  assert.match($('.plan-extra-title').textContent, /خارج الخطة · 1 س 30 د/);
  assert.equal(w.document.querySelector('[data-prayer="4"] .prayer-plan-meter small').textContent, '33%');
  // Wasted categories are flagged.
  run(`actionC.categoryId='cat-wasted';render();`);
  assert.ok(extra().children[1].classList.contains('is-wasted'));
  assert.match($('.plan-extra-title').textContent, /منها 30 د وقت ضائع/);
  const shell = w.document.querySelector('.day-workspace');
  run(`SlotTools.apply(day(),period[0],period.at(-1)+1,'actual',null,'',starts()[3]);
    refreshDailySlots(period[0],period.at(-1)+1);`);
  assert.equal(w.document.querySelector('.day-workspace'), shell);
  assert.deepEqual(rows().map((r) => r.querySelector('[data-done]').textContent), ['0 د', '0 د']);
  assert.deepEqual([row(0).status, row(1).status], ['باقي 1 س 10 د', 'باقي 20 د']);
  assert.deepEqual(extraDurations(), []);
  assert.equal(head(), 'تم 0 د من 1 س 30 د');
  run(`SlotTools.apply(day(),period[0],period[0]+12,'actual',actionA.id,'',starts()[3]);
    refreshDailySlots(period[0],period[0]+12);`);
  assert.equal(row(1).done, '20 د');
  assert.equal(row(0).status, 'باقي 1 س 10 د');
  assert.deepEqual(extraDurations(), ['1 س 40 د']);
  run(`SlotTools.apply(day(),period[0]+12,period[0]+19,'actual',actionB.id,'',starts()[3]);
    refreshDailySlots(period[0]+12,period[0]+19);`);
  assert.deepEqual(rows().map((r) => r.querySelector('.plan-status').textContent), ['✓ اكتمل', '✓ اكتمل']);
  assert.equal(pct(), '100%');
  assert.ok($('.plan-board').classList.contains('is-complete'));
  assert.ok(w.document.querySelector('[data-prayer="4"] .prayer-plan-meter').classList.contains('is-complete'));
  assert.deepEqual(extraDurations(), ['1 س 40 د']);
  // Actual entries depend on the date and prayer. The settings plan repeats by prayer.
  run('prayer=0;render()');
  assert.equal(rows().length, 1);
  assert.deepEqual(row(0), { name: run('actionA.name'), done: '0 د', planned: '30 د', status: 'باقي 30 د' });
  run("date='2026-10-25';prayer=4;render()");
  assert.equal(rows().length, 2);
  assert.equal(head(), 'تم 0 د من 1 س 30 د');
  console.log('period plan board: per-action progress, totals, extra/wasted time, live refresh and period/date isolation passed');
} finally {
  dom.window.close();
}
