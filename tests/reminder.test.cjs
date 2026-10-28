const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const THREE_HOURS = 3 * 60 * 60 * 1000;
const source = ['vendor/adhan.js', 'calendar.js', 'categories.js', 'slots.js',
  'task-engine.js', 'dashboard.js', 'projects.js', 'tafsir-default.js',
  'follow-up.js', 'app.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
function boot(saved, time) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
    url: 'https://test.local', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.Date.now = () => time;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (saved) w.localStorage.setItem('waqti-v1', saved);
  w.eval(source + '\nwindow.run = code => eval(code);');
  w.document.querySelector('#ac-welcome')?.close();
  w.run('state.starterIntroPending=false');
  return { w, dom, run: w.run, at: t => { time = t; } };
}
let now = 1800000000000;
let b = boot(null, now);
const text = '<img src=x onerror=alert(1)>\nتذكر هدفك';
try {
  b.run("view='settings';render()");
  b.w.document.querySelector('#reminderText').value = text;
  b.w.document.querySelector('#reminderEnabled').checked = true;
  b.w.document.querySelector('#reminderForm').dispatchEvent(new b.w.Event('submit', { cancelable: true }));
  const deadline = b.run('state.reminder.nextAt');
  assert.equal(deadline, now + THREE_HOURS);
  b.at(deadline - 1);
  b.run('checkReminder()');
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  // Saving unchanged settings must not postpone the due time.
  b.w.document.querySelector('#reminderForm').dispatchEvent(new b.w.Event('submit', { cancelable: true }));
  assert.equal(b.run('state.reminder.nextAt'), deadline);
  const saved = b.w.localStorage.getItem('waqti-v1');
  b.dom.window.close();
  // Reopen after a long absence: one message, no backlog of missed reminders.
  now = deadline + THREE_HOURS * 5;
  b = boot(saved, now);
  const dialog = b.w.document.querySelector('#reminderDialog');
  assert.equal(dialog.open, true);
  assert.equal(b.w.document.querySelector('#reminderMessage').textContent, text);
  assert.equal(dialog.querySelector('img'), null);
  b.w.document.querySelector('#acknowledgeReminder').click();
  assert.equal(dialog.open, false);
  assert.equal(b.run('state.reminder.nextAt'), now + THREE_HOURS);
  const acknowledged = b.w.localStorage.getItem('waqti-v1');
  b.dom.window.close();
  b = boot(acknowledged, now + THREE_HOURS - 1);
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  b.at(now + THREE_HOURS);
  b.w.dispatchEvent(new b.w.Event('focus'));
  assert.equal(b.w.document.querySelector('#reminderDialog').open, true);
  b.run('acknowledgeReminder()');
  b.run("state.reminder.enabled=false;save()");
  b.at(now + THREE_HOURS * 10);
  b.run('checkReminder()');
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  // Other dialogs are allowed to finish without losing a due reminder.
  b.run('state.reminder.enabled=true');
  b.w.document.querySelector('#taskEditor').showModal();
  b.run('checkReminder()');
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  b.w.document.querySelector('#taskEditor').close();
  b.w.document.querySelector('#taskEditor').dispatchEvent(new b.w.Event('close'));
  assert.equal(b.w.document.querySelector('#reminderDialog').open, true);
  // Escape follows the same persistent acknowledgement path.
  b.w.document.querySelector('#reminderDialog').dispatchEvent(new b.w.Event('cancel', { cancelable: true }));
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  assert.equal(b.run('state.reminder.nextAt'), now + THREE_HOURS * 11);
  console.log('Reminder: persisted deadlines, reopening, recurrence, disabling, safe text, dialog deferral and Escape passed');
} finally { b.dom.window.close(); }
