const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const dom = new JSDOM('<section id="app"></section>', {
    url: 'https://test.local',
    runScripts: 'outside-only',
  }),
  w = dom.window;
w.structuredClone = structuredClone;
w.confirm = () => true;
w.eval(
  fs.readFileSync('follow-up.js', 'utf8') +
    `\nwindow.FU=FollowUp;const $=s=>document.querySelector(s);const app=$('#app');const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let view='followUp';function render(){FollowUp.render()}function toast(t){window.lastToast=t}function downloadBackup(){}`,
);
const f = w.FU;
let who = 'guest';
w.WaqtiSync = { referenceOwner: () => who };
assert.equal(f.current(), null);
const r = f.empty();
r.days['2026-10-01'] = {
  id: '2026-10-01',
  updatedAt: r.updatedAt,
  status: 'partial',
  summary: '<script>unsafe</script>',
  positives: 'خطوة',
};
f.commit(r, null);
f.render();
assert.ok(w.document.querySelector('#fuDate'));
assert.equal(w.document.querySelector('script'), null);
assert.equal(f.validate(f.backup()).id, r.id);
const text = '# 2026-10-02\nتقييم تجريبي\nقسم آخر بلا تاريخ';
const parsed = f.parse(text, 'sample.md');
assert.equal(parsed.sections.original.summary, text);
assert.ok(parsed.days['2026-10-02']);
assert.throws(() => f.validate({ ...r, schemaVersion: 99 }));
assert.throws(() =>
  f.validate({ ...r, days: { '2026-02-30': r.days['2026-10-01'] } }),
);
who = 'another-account';
assert.equal(f.current(), null);
f.render();
assert.ok(w.document.querySelector('#fuCreate'));
who = 'guest';
assert.equal(f.current().id, r.id);
const updated = structuredClone(r);
updated.days['2026-10-02'] = parsed.days['2026-10-02'];
updated.revision = 2;
updated.baseRevision = 1;
f.preview(updated);
w.document.querySelector('#fuApply').click();
assert.ok(f.current().days['2026-10-02']);
assert.ok(f.current().periods['2026-10'].needsReview);
const revision = f.current().revision;
f.preview(updated);
w.document.querySelector('#fuStale').checked = true;
w.document.querySelector('#fuApply').click();
assert.equal(
  f.current().revision,
  revision,
  'same JSON does not duplicate or revise records',
);
const manual = f.current();
manual.days['2026-10-01'].manual = true;
manual.days['2026-10-01'].summary = 'تعديل يدوي';
f.commit(manual);
f.preview(r);
assert.ok(w.document.querySelector('[data-conflict]'));
w.document.querySelector('#fuStale').checked = true;
w.document.querySelector('#fuApply').click();
assert.equal(f.current().days['2026-10-01'].summary, 'تعديل يدوي');
f.preview(updated);
who = 'other';
w.document.querySelector('#fuApply').click();
assert.equal(f.current(), null);
assert.equal(w.lastToast, 'تغير الحساب؛ أعد الاستيراد');
who = 'guest';
const stale = f.current();
const newer = structuredClone(stale);
newer.revision++;
f.commit(newer, stale);
assert.throws(() => f.commit(stale, stale));
assert.equal(
  f.backup().updateInstructions,
  f.validate(f.backup()).updateInstructions,
);
assert.ok(
  JSON.parse(w.localStorage.getItem('waqti-follow-up-v1:guest')).history
    .length <= 8,
);
f.preview(r, true);
w.document.querySelector('#fuStale').checked = true;
w.document.querySelectorAll('[data-conflict]').forEach(input => input.checked = true);
w.document.querySelector('#fuApply').click();
assert.equal(f.current().days['2026-10-02'], undefined, 'restoring removes records added after the snapshot');
assert.equal(f.current().days['2026-10-01'].summary, r.days['2026-10-01'].summary);
console.log(
  'Follow-up privacy, validation, text preservation, preview, merge, concurrency and idempotency passed',
);
dom.window.close();
