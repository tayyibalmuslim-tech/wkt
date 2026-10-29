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
const key = id => 'wkt-heart-cycle-v1:' + id;
const shown = () => $('.heart-text-card').dataset.contentId;
function assertSingle(section) {
  assert.equal($$('.heart-text-card').length,1);
  const quran=$('.heart-text-card').dataset.contentType==='verse';
  assert.equal($$('.heart-verse').length,quran?1:0);
  assert.equal($$('.heart-hadith').length,quran?0:section.hadiths.find(h=>h.id===shown()).segments.length);
  assert.equal($('#heartTitle').textContent,section.shortTitle);
  assert.ok($('#heartNext'));
}
$('#reminderDialog').open=true;
w.Math.random=()=>0.37;
w.HeartReminder.mount(); w.HeartReminder.showSections();
assert.equal($$('.heart-section').length,11);
try {
  for (const section of data) {
    $(`[data-section="${section.id}"]`).click();
    const expected=[...section.verses,...section.hadiths].map(x=>x.id).sort();
    let last;
    for(let cycle=0;cycle<2;cycle++) {
      const seen=[];
      for(let i=0;i<expected.length;i++) {
        assertSingle(section);
        const id=shown();
        assert.ok(!seen.includes(id),'No repeated text before the complete section has appeared');
        if(i===0 && last) assert.notEqual(id,last,'No immediate repeat across cycles');
        seen.push(id); last=id;
        if(i<expected.length-1) $('#heartNext').click();
      }
      if(cycle===0) assert.notDeepEqual(seen,[...section.verses,...section.hadiths].map(x=>x.id));
      assert.deepEqual(seen.sort(),expected);
      assert.equal(JSON.parse(w.localStorage.getItem(key(section.id))).remaining.length,0);
      if(cycle===0) $('#heartNext').click();
    }
    $('#heartBack').click();
    assert.equal($$('.heart-section').length,11);
    assert.equal(w.document.activeElement.dataset.section,section.id);
  }
  // Selecting sections consumes only the one selected; reopening advances rather than resets.
  const section=data[0], other=data[1];
  $(`[data-section="${section.id}"]`).click();
  const first=shown(), progress=JSON.parse(w.localStorage.getItem(key(section.id)));
  const otherBefore=w.localStorage.getItem(key(other.id));
  w.HeartReminder.showSections();
  assert.equal(w.localStorage.getItem(key(section.id)),JSON.stringify(progress));
  $(`[data-section="${section.id}"]`).click();
  assert.equal(shown(),progress.remaining[0]);assert.notEqual(shown(),first);
  assert.equal(w.localStorage.getItem(key(other.id)),otherBefore);
  const pending=JSON.parse(w.localStorage.getItem(key(section.id))).remaining[0];
  // Recreate the reader as a reload would do and resume the persisted bag.
  w.eval(fs.readFileSync('heart-reminder.js','utf8'));w.HeartReminder.mount();w.HeartReminder.showSections();
  $(`[data-section="${section.id}"]`).click();assert.equal(shown(),pending);
  assert.equal(w.document.activeElement.id,'heartTitle');
  $('#heartNext').click();assert.equal(w.document.activeElement.id,'heartNext');
  // A sequential second tab observes the same saved progress rather than a fresh bag.
  const second = new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://test.local',runScripts:'outside-only'});
  try {
    for (const file of ['heart-reminder-data.js','heart-reminder.js']) second.window.eval(fs.readFileSync(file,'utf8'));
    second.window.localStorage.setItem(key(section.id),w.localStorage.getItem(key(section.id)));
    const expectedNext=JSON.parse(w.localStorage.getItem(key(section.id))).remaining[0];
    second.window.document.querySelector('#reminderDialog').open=true;
    second.window.HeartReminder.mount();second.window.HeartReminder.showSections();
    second.window.document.querySelector(`[data-section="${section.id}"]`).click();
    assert.equal(second.window.document.querySelector('.heart-text-card').dataset.contentId,expectedNext);
  } finally { second.window.close(); }
  // Corrupt saved data cannot create missing/duplicate cards or crash reading.
  for(const value of ['{broken','null',JSON.stringify({ids:section.verses.map(v=>v.id),remaining:['missing'],last:'missing'})]) {
    w.localStorage.setItem(key(section.id),value);w.HeartReminder.showSections();
    $(`[data-section="${section.id}"]`).click();assertSingle(section);
  }
  // Plain text safety and editorial notes still hold for every shuffled item.
  const v=section.verses[0],original=v.text;v.text='<img src=x onerror=alert(1)>';
  w.HeartReminder.showSections();$(`[data-section="${section.id}"]`).click();
  for(let i=0;i<section.verses.length+section.hadiths.length;i++) {
    assert.equal($('#heartBody img'),null);
    if(shown()===v.id) assert.ok($('.heart-verse').textContent.includes('<img'));
    $('#heartNext').click();
  }
  v.text=original;
  for(const section of data) {
    w.HeartReminder.showSections();$(`[data-section="${section.id}"]`).click();
    for(let i=0;i<section.verses.length+section.hadiths.length;i++) {
      for(const h of section.hadiths) if(h.note) assert.ok(!$$('.heart-hadith').some(b=>b.textContent.includes(h.note)));
      $('#heartNext').click();
    }
  }
  // Storage failures degrade to a session bag with the same non-repetition rule.
  Object.defineProperty(w,'localStorage',{value:{getItem(){throw Error('blocked');},setItem(){throw Error('full');}},configurable:true});
  w.eval(fs.readFileSync('heart-reminder.js','utf8'));w.HeartReminder.mount();
  w.HeartReminder.showSections();$(`[data-section="${other.id}"]`).click();
  const count=other.verses.length+other.hadiths.length, seen=new Set();
  for(let i=0;i<count;i++) {assert.ok(!seen.has(shown()));seen.add(shown());$('#heartNext').click();}
  console.log('Heart reader: 11 sections / 53 canonical passages / 33 hadiths; one card, shuffled complete cycles, reload, section isolation, boundaries, storage recovery, notes and focus passed');
} finally { w.close(); }
