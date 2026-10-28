const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {url:'https://test.local',runScripts:'outside-only'});
const w = dom.window;
for (const file of ['heart-reminder-data.js','heart-reminder.js']) w.eval(fs.readFileSync(file,'utf8'));
const data = w.HeartReminderData;
const canonical = JSON.parse(fs.readFileSync('tests/fixtures/heart-quran-tanzil.json','utf8'));
assert.equal(data.length,11);
assert.equal(new Set(data.map(s=>s.id)).size,11);
assert.equal(data.reduce((n,s)=>n+s.verses.length,0),53);
assert.equal(data.reduce((n,s)=>n+s.hadiths.length,0),33);
const ids = new Set();
for (const s of data) {
  assert.ok(s.title && s.shortTitle && s.icon);
  for (const [i,v] of s.verses.entries()) {
    assert.ok(!ids.has(v.id)); ids.add(v.id); assert.equal(v.order,i+1);
    const complete = Array.from({length:v.end-v.start+1},(_,i)=>canonical[`${v.surahNumber}:${v.start+i}`]);
    assert.ok(complete.every(Boolean));
    const segments=v.text.split(' ۝ ');
    assert.equal(segments.length,complete.length);
    segments.forEach((text,i)=>v.kind==='excerpt' ? assert.ok(complete[i].includes(text)) : assert.equal(text,complete[i]));
    assert.ok(!v.text.includes('…'));
  }
  for (const [i,h] of s.hadiths.entries()) {
    assert.ok(!ids.has(h.id)); ids.add(h.id); assert.equal(h.order,i+1);
    assert.ok(h.source && h.number && h.grade && h.sourceUrl.startsWith('https://sunnah.com/'));
    assert.ok(h.segments.length && h.segments.every(t=>t && !t.includes('…')));
  }
}
const $=s=>w.document.querySelector(s), $$=s=>Array.from(w.document.querySelectorAll(s));
$('#reminderDialog').open=true;
w.HeartReminder.mount(); w.HeartReminder.showSections();
assert.equal($$('.heart-section').length,11);
try {
  for (const section of data) {
    $(`[data-section="${section.id}"]`).click();
    assert.equal($$('.heart-text-card').length,2);
    assert.equal($('.heart-verse').textContent,`﴿${section.verses[0].text}﴾`);
    assert.equal($('#heartTitle').textContent,section.shortTitle);
    // Independent loops reach every text exactly once, then wrap; previous wraps back.
    for (const type of ['verse','hadith']) {
      const quran=type==='verse', entries=quran?section.verses:section.hadiths;
      const content=()=>$(quran?'.heart-verse':'.heart-hadith').textContent;
      const next=()=>$(quran?'[aria-label="الآية التالية"]':'[aria-label="الحديث التالي"]').click();
      const prev=()=>$(quran?'[aria-label="الآية السابقة"]':'[aria-label="الحديث السابق"]').click();
      for (const entry of entries) {
        assert.ok(content().includes(quran?entry.text:entry.segments[0]));
        next();
      }
      assert.ok(content().includes(quran?entries[0].text:entries[0].segments[0]));
      prev(); assert.ok(content().includes(quran?entries.at(-1).text:entries.at(-1).segments[0]));
    }
    const footerButtons=$$('#heartFooter button'); footerButtons[0].click();
    assert.equal($$('.heart-verse').length,section.verses.length);
    assert.equal($$('.heart-hadith').length,0);
    $('#heartBack').click();
    $$('#heartFooter button')[1].click();
    assert.equal($$('.heart-text-card').length,section.hadiths.length);
    assert.equal($$('.heart-hadith').length,section.hadiths.reduce((n,h)=>n+h.segments.length,0));
    for (const h of section.hadiths) if(h.note) assert.ok(!$$('.heart-hadith').some(b=>b.textContent.includes(h.note)));
    $('#heartBack').click(); $('#heartBack').click();
    assert.equal($$('.heart-section').length,11);
    assert.equal(w.document.activeElement.dataset.section,section.id);
  }
  // Rendered religious text is treated as text, even if a future data edit contains markup.
  const v=data[0].verses[0], original=v.text; v.text='<img src=x onerror=alert(1)>';
  $('.heart-section').click(); assert.equal($('#heartBody img'),null); v.text=original;
  console.log('Heart reader: 11 sections, 53 canonical passages, 33 hadiths; all navigation, boundaries, notes and focus passed');
} finally { w.close(); }
