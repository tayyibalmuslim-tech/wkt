/* Local reader only. Scheduling and persistence remain owned by app.js. */
window.HeartReminder = (() => {
  'use strict';
  let section = null, verseIndex = 0, hadithIndex = 0, collection = null;
  const $ = s => document.querySelector(s);
  const paths = {
    sunrise: 'M3 17h18M5 13l-2-2m16 2 2-2M12 3v3M7 8 5 6m12 2 2-2M7 17a5 5 0 0 1 10 0',
    clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6ZM8 12l3 3 5-6',
    leaf: 'M5 20C-1 8 10 3 21 3c0 11-5 22-16 17ZM5 20 16 9',
    mountain: 'm2 20 7-15 5 10 3-6 5 11ZM7 9l2 2 2-2',
    handshake: 'm2 9 5-4 5 2 5-2 5 4-4 9-4 3-8-5ZM7 5l5 2-4 5 3 2 5-4 4 3',
    heart: 'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 1 11 8 16 7-5 13-11 8-16Z',
    anchor: 'M12 7v14M8 7h8M3 14c0 9 18 9 18 0M9 4a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
    return: 'M4 10h11a6 6 0 0 1 0 12M4 10l6-6M4 10l6 6',
    cloud: 'M6 18a5 5 0 1 1 0-10 6 6 0 0 1 12-1 5.5 5.5 0 0 1 0 11ZM9 13l2 2 4-4',
    spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  };
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, cls = '') {
    const b = el('button', cls, text); b.type = 'button'; b.onclick = action; return b;
  }
  function sourceLink(text, url) {
    const a = el('a', 'heart-reference', text);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function verseReference(v) {
    return `${v.surah}: ${v.start}${v.end !== v.start ? '–' + v.end : ''}${v.kind === 'excerpt' ? ' — ' + (v.end !== v.start ? 'مقطع من الآيتين' : 'جزء من الآية') : ''}`;
  }
  function hadithReference(h) {
    return `${h.source} (${h.number})${h.kind === 'excerpt' ? ' — من الحديث' : ''} — ${h.grade}`;
  }
  function hadithText(h) {
    return `${h.intro || 'قال رسول الله ﷺ:'}\n` + h.segments.map((text, i) => `${i ? 'وقال ﷺ في الحديث نفسه:\n' : ''}«${text}»`).join('\n');
  }
  async function copy(text) {
    const status = $('#heartStatus');
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const previous = document.activeElement, box = el('textarea', 'heart-copy-buffer');
        box.value = text; $('#reminderDialog').append(box); box.select();
        let ok;
        try { ok = document.execCommand('copy'); } finally { box.remove(); previous?.focus({ preventScroll: true }); }
        if (!ok) throw Error('clipboard unavailable');
      }
      status.textContent = 'تم النسخ مع المرجع';
    } catch { status.textContent = 'تعذر النسخ؛ يمكنك تحديد النص ونسخه يدويًا'; }
  }
  function card(item, type, index, total, navigate) {
    const quran = type === 'verse', article = el('article', 'heart-text-card' + (quran ? ' heart-quran-card' : ''));
    const top = el('div', 'heart-card-top');
    top.append(el('span', '', quran ? 'من كتاب الله' : 'من السنة النبوية'), button('نسخ', () => copy(quran ? `﴿${item.text}﴾\n${verseReference(item)}` : `${hadithText(item)}\n${hadithReference(item)}${item.note ? '\nملاحظة: ' + item.note : ''}`), 'heart-copy'));
    article.append(top);
    if (quran) article.append(el('p', 'heart-verse', `﴿${item.text}﴾`));
    else {
      article.append(el('p', 'heart-intro', item.intro || 'قال رسول الله ﷺ:'));
      item.segments.forEach((text, i) => {
        if (i) article.append(el('p', 'heart-intro', 'وقال ﷺ في الحديث نفسه:'));
        article.append(el('blockquote', 'heart-hadith', `«${text}»`));
      });
    }
    article.append(sourceLink(quran ? verseReference(item) + ' · نص تنزيل' : hadithReference(item), item.sourceUrl));
    if (item.note) article.append(el('p', 'heart-note', item.note));
    if (navigate) {
      const nav = el('div', 'heart-text-nav'); nav.setAttribute('aria-label', quran ? 'التنقل بين الآيات' : 'التنقل بين الأحاديث');
      const prev = button('السابق', () => navigate(-1)), next = button('التالي', () => navigate(1));
      prev.setAttribute('aria-label', quran ? 'الآية السابقة' : 'الحديث السابق');
      next.setAttribute('aria-label', quran ? 'الآية التالية' : 'الحديث التالي');
      nav.append(prev, el('span', 'heart-position', `${index + 1} / ${total}`), next); article.append(nav);
    }
    return article;
  }
  function renderReader(focusHeading = false) {
    const body = $('#heartBody'), footer = $('#heartFooter');
    $('#heartTitle').textContent = collection ? (collection === 'verses' ? 'كل الآيات' : 'كل الأحاديث') : section.shortTitle;
    $('#heartTitle').title = section.title;
    $('#heartSubtitle').textContent = collection ? section.shortTitle : 'اقرأ على مهل، وخذ ما يعينك على العمل';
    $('#heartBack').hidden = false;
    body.replaceChildren(); footer.replaceChildren(); $('#heartStatus').textContent = '';
    if (collection) {
      const verses = collection === 'verses';
      (verses ? section.verses : section.hadiths).forEach((item, i) => body.append(card(item, verses ? 'verse' : 'hadith', i)));
      footer.append(button('العودة إلى القراءة', () => { collection = null; renderReader(true); }));
    } else {
      body.append(card(section.verses[verseIndex], 'verse', verseIndex, section.verses.length, delta => {
        verseIndex = (verseIndex + delta + section.verses.length) % section.verses.length;
        updateCard('verse', delta);
      }));
      body.append(card(section.hadiths[hadithIndex], 'hadith', hadithIndex, section.hadiths.length, delta => {
        hadithIndex = (hadithIndex + delta + section.hadiths.length) % section.hadiths.length;
        updateCard('hadith', delta);
      }));
      footer.append(button('كل الآيات', () => { collection = 'verses'; renderReader(true); }), button('كل الأحاديث', () => { collection = 'hadiths'; renderReader(true); }));
    }
    body.scrollTop = 0;
    if (focusHeading) $('#heartTitle').focus({ preventScroll: true });
  }
  // Replace one card to retain the other text, scroll position and keyboard focus.
  function updateCard(type, delta) {
    const verses = type === 'verse', list = verses ? section.verses : section.hadiths, index = verses ? verseIndex : hadithIndex;
    const current = $('#heartBody').children[verses ? 0 : 1];
    const replacement = card(list[index], type, index, list.length, step => {
      if (verses) verseIndex = (verseIndex + step + list.length) % list.length;
      else hadithIndex = (hadithIndex + step + list.length) % list.length;
      updateCard(type, step);
    });
    current.replaceWith(replacement);
    replacement.querySelectorAll('.heart-text-nav button')[delta < 0 ? 0 : 1].focus({ preventScroll: true });
    $('#heartStatus').textContent = verses ? `الآية ${index + 1} من ${list.length}` : `الحديث ${index + 1} من ${list.length}`;
  }
  function showSections(focusId) {
    section = null; collection = null;
    $('#heartTitle').textContent = 'ماذا يحتاج قلبك الآن؟';
    $('#heartTitle').removeAttribute('title');
    $('#heartSubtitle').textContent = 'اختر ما يعينك على ذكر الله والعمل بما يرضيه';
    $('#heartBack').hidden = true;
    const body = $('#heartBody'), grid = el('div', 'heart-sections');
    for (const item of window.HeartReminderData) {
      const b = button('', () => { section = item; verseIndex = 0; hadithIndex = 0; renderReader(true); }, 'heart-section');
      b.dataset.section = item.id;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[item.icon]); svg.append(path);
      b.append(svg, el('span', '', item.shortTitle)); grid.append(b);
    }
    body.replaceChildren(grid); body.scrollTop = 0;
    $('#heartStatus').textContent = '';
    $('#heartFooter').replaceChildren(el('span', 'heart-footer-note', 'لحظة لذكر الله، ثم عودة إلى يومك'));
    if (focusId) grid.querySelector(`[data-section="${focusId}"]`)?.focus({ preventScroll: true });
  }
  function mount() {
    $('#heartBack').onclick = () => {
      if (collection) { collection = null; renderReader(true); }
      else showSections(section?.id);
    };
  }
  return { mount, showSections };
})();
