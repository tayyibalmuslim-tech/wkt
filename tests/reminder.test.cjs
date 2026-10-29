const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const THREE_HOURS = 3 * 60 * 60 * 1000;
const source = ['vendor/adhan.js', 'calendar.js', 'categories.js', 'slots.js',
  'task-engine.js', 'dashboard.js', 'projects.js', 'tafsir-default.js',
  'follow-up.js', 'heart-reminder-data.js', 'heart-reminder.js', 'app.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
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
  assert.equal(b.w.document.querySelector('#reminderText'), null);
  const beforePreview = b.run('JSON.stringify(state)');
  b.w.document.querySelector('#previewReminder').click();
  assert.equal(b.w.document.querySelector('#reminderDialog').open, true);
  assert.equal(b.w.document.querySelectorAll('.heart-section').length, 11);
  b.run('checkReminder()');
  assert.equal(b.w.document.querySelector('#reminderDialog').open, true);
  b.w.document.querySelector('#reminderDialog').dispatchEvent(new b.w.Event('cancel', {cancelable:true}));
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  assert.equal(b.run('JSON.stringify(state)'), beforePreview);
  b.w.document.querySelector('#reminderEnabled').checked = true;
  b.w.document.querySelector('#reminderForm').dispatchEvent(new b.w.Event('submit', { cancelable: true }));
  const deadline = b.run('state.reminder.nextAt');
  assert.equal(deadline, now + THREE_HOURS);
  const beforeEnabledPreview = b.run('JSON.stringify(state.reminder)');
  b.w.document.querySelector('#previewReminder').click();
  b.w.document.querySelector('.heart-section').click();
  const previewHeading=b.w.document.querySelector('#heartTitle').textContent;
  b.run('checkReminder();previewReminder()');
  assert.equal(b.w.document.querySelector('#heartTitle').textContent, previewHeading);
  b.w.document.querySelector('#acknowledgeReminder').click();
  assert.equal(b.run('JSON.stringify(state.reminder)'), beforeEnabledPreview);
  b.at(deadline - 1);
  b.run('checkReminder()');
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  // Saving unchanged settings must not postpone the due time.
  b.w.document.querySelector('#reminderForm').dispatchEvent(new b.w.Event('submit', { cancelable: true }));
  assert.equal(b.run('state.reminder.nextAt'), deadline);
  // Existing custom text remains in user data but is never rendered or required.
  b.run('state.reminder.text=' + JSON.stringify(text));
  b.run('save()');
  const saved = b.w.localStorage.getItem('waqti-v1');
  b.dom.window.close();
  // Reopen after a long absence: one message, no backlog of missed reminders.
  now = deadline + THREE_HOURS * 5;
  b = boot(saved, now);
  const dialog = b.w.document.querySelector('#reminderDialog');
  assert.equal(dialog.open, true);
  assert.equal(b.w.document.querySelectorAll('.heart-section').length, 11);
  assert.equal(b.w.document.querySelector('#heartTitle').textContent, 'ماذا يحتاج قلبك الآن؟');
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
  // Reminder records from old and new clients work with no text dependency.
  b.run("state.reminder={enabled:true,nextAt:Date.now()-1,text:''};checkReminder()");
  assert.equal(b.w.document.querySelector('#reminderDialog').open, true);
  b.run("state.reminder.enabled=false;checkReminder()");
  assert.equal(b.w.document.querySelector('#reminderDialog').open, false);
  // A deadline changed by sync must not be acknowledged by an older open dialog.
  b.run("state.reminder={enabled:true,nextAt:Date.now()-1};checkReminder()");
  b.run("state.reminder.nextAt=Date.now()+12345;acknowledgeReminder()");
  assert.equal(b.run('state.reminder.nextAt'), now + THREE_HOURS * 10 + 12345);
  // A hidden page defers the reminder until it becomes visible, without rescheduling.
  Object.defineProperty(b.w.document,'hidden',{value:true,configurable:true});
  b.run("state.reminder.nextAt=Date.now()-1;checkReminder()");
  assert.equal(b.w.document.querySelector('#reminderDialog').open,false);
  Object.defineProperty(b.w.document,'hidden',{value:false,configurable:true});
  b.w.document.dispatchEvent(new b.w.Event('visibilitychange'));
  assert.equal(b.w.document.querySelector('#reminderDialog').open,true);
  const category = b.w.document.querySelector('.heart-section'); category.click();
  const heading=b.w.document.querySelector('#heartTitle').textContent;
  b.run('checkReminder();checkReminder()');
  assert.equal(b.w.document.querySelector('#heartTitle').textContent,heading);
  assert.equal(b.w.document.querySelectorAll('dialog[open]').length,1);
  // A real reminder becoming due during preview is still due after preview closes.
  b.run('acknowledgeReminder();state.reminder.nextAt=Date.now()+1000;previewReminder()');
  const dueDuringPreview=b.run('state.reminder.nextAt');
  b.at(dueDuringPreview+1);
  b.run('checkReminder()');
  assert.equal(b.w.document.querySelector('#reminderDialog').dataset.preview,'true');
  b.run('acknowledgeReminder()');
  assert.equal(b.run('state.reminder.nextAt'),dueDuringPreview);
  b.w.document.querySelector('#reminderDialog').dispatchEvent(new b.w.Event('close'));
  assert.equal(b.w.document.querySelector('#reminderDialog').open,true);
  assert.notEqual(b.w.document.querySelector('#reminderDialog').dataset.preview,'true');
  console.log('Reminder: persisted deadlines, reopening, recurrence, disabling, safe text, dialog deferral and Escape passed');
} finally { b.dom.window.close(); }
