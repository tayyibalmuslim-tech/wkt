/* App shell: theme switching and the "day pulse" header.
   Presentation only — reads the shared state and never writes task data. */
(function () {
  'use strict';
  const doc = document;
  const THEME_KEY = 'waqti-theme';
  const themes = ['auto', 'light', 'dark'];
  const themeLabels = {
    auto: 'المظهر: تلقائي حسب الجهاز',
    light: 'المظهر: فاتح',
    dark: 'المظهر: ليلي',
  };
  const themeIcons = {
    auto: '<path d="M12 3a9 9 0 1 0 0 18z" fill="currentColor"/><circle cx="12" cy="12" r="9"/>',
    light:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  };
  // Short, well-known reminders. One per day keeps them meaningful, not noisy.
  const reminders = [
    '«نِعمتانِ مغبونٌ فيهما كثيرٌ من الناس: الصحةُ والفراغ»',
    '«اغتنم خمسًا قبل خمس… وفراغَك قبل شُغلِك، وحياتَك قبل موتِك»',
    '﴿وَالْعَصْرِ ۝ إِنَّ الْإِنسَانَ لَفِي خُسْرٍ﴾',
    '«أحبُّ الأعمالِ إلى الله أدومُها وإن قلّ»',
    '«كن في الدنيا كأنك غريبٌ أو عابرُ سبيل»',
    '﴿وَسَارِعُوا إِلَىٰ مَغْفِرَةٍ مِّن رَّبِّكُمْ﴾',
    '«يا ابن آدم، إنما أنت أيام، كلما ذهب يومٌ ذهب بعضُك» — الحسن البصري',
  ];

  function readTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return themes.includes(saved) ? saved : 'auto';
    } catch {
      return 'auto';
    }
  }
  function applyTheme(theme) {
    doc.documentElement.dataset.theme = theme;
    const button = doc.getElementById('themeToggle');
    if (!button) return;
    button.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${themeIcons[theme]}</svg>`;
    button.title = themeLabels[theme] + ' — اضغط للتبديل';
    button.setAttribute('aria-label', button.title);
  }
  function cycleTheme() {
    const next = themes[(themes.indexOf(readTheme()) + 1) % themes.length];
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
    if (typeof toast === 'function') toast(themeLabels[next]);
  }

  const pad = (n) => String(n).padStart(2, '0');
  function duration(ms) {
    const total = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(total / 60),
      m = total % 60;
    if (!h) return `<bdi>${m}</bdi> دقيقة`;
    return `<bdi dir="ltr">${h}:${pad(m)}</bdi> ${h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? 'ساعات' : 'ساعة'}`;
  }
  function nextPrayer(now) {
    const civil = zonedDate(now);
    let best = null;
    for (const day of [civil, addDate(civil, 1)]) {
      const times = solar(day);
      prayerFields.forEach((field, i) => {
        const at = +times[field];
        if (at > +now && (!best || at < best.at)) best = { at, index: i };
      });
    }
    return best;
  }
  function taskScore(key) {
    const list = allTasksOn(key);
    const groups = typeof taskGroups === 'function' ? taskGroups(list) : list;
    const done = groups.filter((t) => taskCompletion(t) === 100).length;
    const record = state.sunsetDays?.[key];
    const prayerDone = record ? prayerDayCount(record) : 0;
    return {
      tasksDone: done,
      tasksTotal: groups.length,
      prayerDone,
      prayerTotal: prayerCheckTotal(),
    };
  }
  function ring(percent) {
    const r = 15.5,
      c = 2 * Math.PI * r;
    return `<svg class="pulse-ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><circle class="pulse-ring-track" cx="18" cy="18" r="${r}"/><circle class="pulse-ring-fill" cx="18" cy="18" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - percent / 100)).toFixed(2)}"/></svg>`;
  }

  let lastMarkup = '';
  function celebrate(key, percent) {
    const memo = 'waqti-celebrated';
    let seen = '';
    try {
      seen = sessionStorage.getItem(memo) || '';
    } catch {}
    if (percent >= 100 && seen !== key) {
      try {
        sessionStorage.setItem(memo, key);
      } catch {}
      doc.getElementById('dayPulse')?.classList.add('celebrate');
      if (typeof toast === 'function')
        toast('ما شاء الله! أتممت كل ما خططت له اليوم');
    }
  }
  function updatePulse() {
    const host = doc.getElementById('dayPulse');
    if (!host || typeof state === 'undefined') return;
    try {
      const now = new Date(),
        key = activeDay(now),
        start = +solar(addDate(key, -1)).maghrib,
        end = +solar(key).maghrib,
        elapsed = Math.min(1, Math.max(0, (+now - start) / (end - start))),
        current = currentPrayer(now),
        next = nextPrayer(now),
        score = taskScore(key),
        total = score.tasksTotal + score.prayerTotal,
        done = score.tasksDone + score.prayerDone,
        percent = total ? Math.round((100 * done) / total) : 0,
        dayPercent = Math.round(elapsed * 100),
        reminder = reminders[Math.abs(Math.floor(start / 864e5)) % reminders.length];
      const markup = `
        <div class="pulse-item pulse-now">
          <span class="pulse-kicker">الآن</span>
          <strong>وقت ${names[current]}</strong>
          ${next ? `<span class="pulse-next">باقي <b>${duration(next.at - now)}</b> على ${names[next.index]}</span>` : ''}
        </div>
        <div class="pulse-item pulse-day">
          <div class="pulse-day-head"><span>مضى من يومك</span><b>${dayPercent}%</b></div>
          <div class="pulse-bar" role="progressbar" aria-label="ما مضى من اليوم حتى المغرب" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${dayPercent}"><span style="inline-size:${dayPercent}%"></span></div>
          <span class="pulse-left">باقي ${duration(end - now)} حتى المغرب</span>
        </div>
        <div class="pulse-item pulse-score" title="إنجاز اليوم: المهام ومهام الصلاة">
          <span class="pulse-ring-wrap">${ring(percent)}<b>${percent}%</b></span>
          <span class="pulse-score-text"><span>المهام <b>${score.tasksDone}/${score.tasksTotal}</b></span><span>الصلاة <b>${score.prayerDone}/${score.prayerTotal}</b></span></span>
        </div>
        <p class="pulse-reminder">${reminder}</p>`;
      if (markup !== lastMarkup) {
        host.innerHTML = markup;
        lastMarkup = markup;
      }
      host.dataset.complete = String(percent >= 100);
      celebrate(key, total ? percent : 0);
    } catch (e) {
      host.hidden = true;
    }
  }
  let scheduled = 0;
  function schedulePulse() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      updatePulse();
    });
  }

  applyTheme(readTheme());
  if (typeof view === 'string') doc.body.dataset.view = view;
  doc.getElementById('themeToggle')?.addEventListener('click', cycleTheme);
  if (typeof render === 'function') {
    const baseRender = render;
    render = function (...args) {
      const result = baseRender.apply(this, args);
      if (typeof view === 'string') doc.body.dataset.view = view;
      schedulePulse();
      return result;
    };
  }
  // Any saved change (task outcome, prayer check, slot) refreshes the pulse.
  doc.addEventListener('click', () => setTimeout(schedulePulse, 60), true);
  doc.addEventListener('change', () => setTimeout(schedulePulse, 60), true);
  setInterval(() => {
    if (!doc.hidden) updatePulse();
  }, 30000);
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden) updatePulse();
  });
  updatePulse();
  window.WaqtiShell = { updatePulse, applyTheme };
})();
