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
try {
  run(`state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];
    view='day';prayer=4;render();`);
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  // Isha crosses midnight: separated runs still count once per actual slot.
  run(`window.period = range(prayer);
    window.actionA = state.actions[0];window.actionB = state.actions[1];
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
  const shell = w.document.querySelector('.day-workspace');
  run(`SlotTools.apply(day(),period[0],period.at(-1)+1,'actual',null,'',starts()[3]);
    refreshDailySlots(period[0],period.at(-1)+1);`);
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  assert.equal(w.document.querySelector('.day-workspace'), shell);
  run(`SlotTools.apply(day(),period[0],period[0]+12,'actual',actionA.id,'',starts()[3]);
    refreshDailySlots(period[0],period[0]+12);`);
  assert.equal(summary().querySelector('strong').textContent, 'ساعتان');
  // Selecting a different prayer/date must exclude the previous period's data.
  run('prayer=0;render()');
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  run("date='2026-10-25';prayer=4;render()");
  assert.match(summary().textContent, /لم تُسجّل أفعال/);
  console.log('period action summary tests passed');
} finally {
  dom.window.close();
}
