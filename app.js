const $ = (s) => document.querySelector(s),
  names = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'],
  week = [
    'الأحد',
    'الاثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
  ],
  checks = ['صف أول', 'جماعة أولى', 'سنة', 'أذكار', 'ورد'];
const defaults = {
  times: ['05:00', '12:00', '15:15', '17:45', '19:00'],
  ...ActionCategories.starter(),
  repeat: [],
  days: {},
};
let state;
try {
  state =
    JSON.parse(localStorage.getItem('waqti-v1')) || structuredClone(defaults);
} catch {
  state = structuredClone(defaults);
}
if (installDefaultTafsir(state)) {
  try {
    localStorage.setItem('waqti-v1', JSON.stringify(state));
  } catch {}
}
setupCalendar();
let date = activeDay(),
  prayer = currentPrayer(),
  prayerDialogPrayer = prayer,
  view = 'day',
  slot = null,
  slotKind = 'actual',
  taskEditTarget = null,
  followToday = true,
  lastActiveDay = date,
  lastCivilDay = zonedDate();
const app = $('#app');
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
}
function uid() {
  return crypto.randomUUID();
}
function save() {
  installDefaultTafsir(state);
  invalidateTaskReads();
  if (window.WaqtiSync) {
    window.WaqtiSync.changed();
    return;
  }
  try {
    localStorage.setItem('waqti-v1', JSON.stringify(state));
  } catch {
    alert('تعذر الحفظ. صدّر نسخة احتياطية لتجنب فقد البيانات.');
  }
}
function toast(s) {
  $('#toast').textContent = s;
  $('#toast').style.display = 'block';
  setTimeout(() => ($('#toast').style.display = 'none'), 2300);
}

function downloadBackup(includeReference = false) {
  if (window.WaqtiSync?.canExport && !window.WaqtiSync.canExport()) {
    toast('انتظر تحميل بيانات الحساب قبل تصديرها');
    return false;
  }
  let url = null;
  try {
    const exported = { ...state };
    delete exported.followUpReference;
    if (includeReference === true) exported.followUpReference = FollowUp.backup();
    const payload = JSON.stringify(exported, null, 2);
    if (!payload) throw Error('Empty backup');
    const now = new Date(),
      stamp =
        localDate(now) +
        '-' +
        [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map((n) => String(n).padStart(2, '0'))
          .join('');
    url = URL.createObjectURL(
      new Blob([payload], { type: 'application/json;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'waqti-backup-' + stamp + '.json';
    link.hidden = true;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
    toast('تم تجهيز النسخة الاحتياطية؛ راجع تنزيلات المتصفح');
    return true;
  } catch (e) {
    toast('تعذر تجهيز النسخة الاحتياطية؛ حاول مرة أخرى');
    return false;
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
function day() {
  return (state.sunsetDays[date] ??= {
    slots: {},
    checks: {},
    tasks: [],
    done: {},
  });
}
function minute(t) {
  let [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function starts() {
  let t = prayerTimes(),
    s = t.map(
      (v, i) => Math.floor(minute(v) / SlotTools.minutes) - (i === 3 ? 0 : 1),
    );
  return s.map((n, i) => (i < 3 ? n + 144 : n));
}
function time(n) {
  n = ((n % 144) + 144) % 144;
  return displayTime(`${Math.floor(n / 6)}:${(n % 6) * SlotTools.minutes}`);
}
function range(p) {
  let s = starts(),
    index = prayerOrder.indexOf(p),
    end = index === 4 ? s[3] + 144 : s[prayerOrder[index + 1]];
  return Array.from({ length: Math.max(0, end - s[p]) }, (_, i) => s[p] + i);
}
function tasks() {
  return allTasksOn(date).filter((t) => taskInPeriod(t, prayer));
}
function colorText(c) {
  let rgb = c.match(/\w\w/g).map((x) => parseInt(x, 16));
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150
    ? '#253c33'
    : '#ffffff';
}
function render() {
  rememberDashboardPosition();
  rememberProjectView();
  app.onclick = app.onchange = app.onkeydown = null;
  document.body.classList.toggle(
    'monthly-view',
    view === 'dashboard' && plannerTab === 'month',
  );
  closeMonthTaskMenu();
  ActionCategories.normalize(state);
  normalizeTaskPriorities();
  initializeTaskHistory();
  installQuickTask();
  document.querySelectorAll('nav button').forEach((b) => {
    const current = b.dataset.view === view;
    b.classList.toggle('active', current);
    if (current) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const more = $('#navigationMore');
  if (more)
    more.classList.toggle(
      'has-current',
      ['actions', 'repeat', 'settings', 'account', 'followUp'].includes(view),
    );
  ({
    day: renderDay,
    dashboard: renderDashboard,
    projects: renderProjects,
    followUp: () => FollowUp.render(),
    actions: renderActions,
    repeat: renderRepeat,
    settings: renderSettings,
    account: () => window.WaqtiSync?.renderAccount(),
  })[view]();
  installCompletedToggle();
  installTaskSelection();
  ActionCategories.showIntro(state, save);
}
let dailySlotsObserver;
function dailySlotPieces(indices, d, columns) {
  const pieces = [];
  for (const kind of ['actual', 'planned']) {
    for (const group of SlotTools.groups(d, indices, kind)) {
      for (let start = group.start; start < group.end; ) {
        const offset = start - indices[0];
        const end = Math.min(group.end, start + columns - (offset % columns));
        pieces.push({
          ...group,
          pieceStart: start,
          pieceEnd: end,
          column: (offset % columns) + 1,
          row: Math.floor(offset / columns) * 2 + (kind === 'actual' ? 1 : 2),
        });
        start = end;
      }
    }
  }
  return pieces.sort((a, b) => a.row - b.row || a.column - b.column);
}
function dailySlotMarkup(piece) {
  const { kind, start, end, pieceStart, pieceEnd, action, note } = piece;
  const a = state.actions.find((a) => a.id === action);
  const task = piece.task || (piece.owner ? findTask(piece.owner, date) : null);
  const parentName = task?.parentName || (task?.parentId ? mainTask(task).name : '');
  const continuation = pieceStart !== start;
  const caption = kind === 'actual' ? 'ما فعلته' : 'المطلوب';
  const label =
    a?.name ||
    (action
      ? 'فعل غير موجود'
      : kind === 'actual'
        ? '＋ ما فعلته'
        : '＋ الفعل المطلوب');
  const showTime =
    kind === 'actual' || action || note || task || end - start > 1;
  const detail = [parentName, task?.name, note]
    .filter(Boolean)
    .join(' — ');
  const title = `${caption} من ${time(start)} إلى ${time(end)} · ${end - start} خانات${detail ? ' — ' + detail : ''}`;
  return `<div class="slot slot-piece" data-piece-key="${kind}:${pieceStart}:${pieceEnd}" data-kind="${kind}" style="grid-column:${piece.column}/span ${pieceEnd - pieceStart};grid-row:${piece.row}"><button class="slot-${kind}" data-slot="${pieceStart}" data-piece-end="${pieceEnd}" data-kind="${kind}" data-range-start="${start}" data-range-end="${end}" title="${esc(title)}" aria-label="${esc(title)}" style="${a ? `background:${ActionCategories.color(state, a)};color:${colorText(ActionCategories.color(state, a))}` : ''}">${showTime ? `<span class="time"><bdi>${time(pieceStart)}</bdi> – <bdi>${time(pieceEnd)}</bdi>${continuation ? '<small class="slot-continuation">تابع الفترة</small>' : ''}</span>` : ''}<span class="label">${esc(label)}</span>${!continuation && parentName ? `<small class="slot-task-parent">${esc(parentName)}</small>` : ''}${!continuation && task ? `<small class="slot-task-name">${esc(task.name)}</small>` : ''}${!continuation && note ? `<small class="slot-note">${esc(note)}</small>` : ''}</button></div>`;
}
function slotButtonAt(n, kind) {
  return [
    ...($('#dailySlots')?.querySelectorAll(
      `[data-slot][data-kind="${kind}"]`,
    ) || []),
  ].find((button) => +button.dataset.slot <= n && n < +button.dataset.pieceEnd);
}
function renderDailySlotGrid() {
  const grid = $('#dailySlots');
  if (!grid) return;
  const columns = grid.clientWidth
    ? Math.max(2, Math.floor((grid.clientWidth + 8) / 168))
    : 4;
  grid.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`;
  const focused = document.activeElement;
  const focusSlot = focused?.closest('#dailySlots')
    ? { n: +focused.dataset.slot, kind: focused.dataset.kind }
    : null;
  const page = document.scrollingElement,
    pageScroll = page?.scrollTop || 0,
    appScroll = app.scrollTop;
  const pieces = dailySlotPieces(range(prayer), day(), columns);
  if (!grid.firstElementChild) {
    const markup = pieces.map(dailySlotMarkup);
    grid.innerHTML = markup.join('');
    [...grid.children].forEach((node, i) => {
      node.slotMarkup = markup[i];
    });
    grid.dataset.columns = columns;
    app.scrollTop = appScroll;
    if (page) page.scrollTop = pageScroll;
    return;
  }
  const existing = new Map(
    [...grid.children].map((node) => [node.dataset.pieceKey, node]),
  );
  const used = new Set();
  let cursor = grid.firstElementChild;
  const template = document.createElement('template');
  for (const piece of pieces) {
    const key = `${piece.kind}:${piece.pieceStart}:${piece.pieceEnd}`,
      markup = dailySlotMarkup(piece);
    let node = existing.get(key);
    if (!node || node.slotMarkup !== markup) {
      template.innerHTML = markup;
      const replacement = template.content.firstElementChild;
      replacement.slotMarkup = markup;
      if (node) {
        if (node === cursor) cursor = node.nextElementSibling;
        node.replaceWith(replacement);
      }
      node = replacement;
    }
    used.add(node);
    if (node === cursor) cursor = cursor.nextElementSibling;
    else grid.insertBefore(node, cursor);
  }
  [...grid.children].forEach((node) => {
    if (!used.has(node)) node.remove();
  });
  grid.dataset.columns = columns;
  if (focusSlot)
    slotButtonAt(focusSlot.n, focusSlot.kind)?.focus({ preventScroll: true });
  app.scrollTop = appScroll;
  if (page) page.scrollTop = pageScroll;
}
function observeDailySlotGrid() {
  dailySlotsObserver?.disconnect();
  renderDailySlotGrid();
  if (typeof ResizeObserver === 'undefined') return;
  const grid = $('#dailySlots');
  const observer = new ResizeObserver(() => {
    if (!grid.isConnected) {
      observer.disconnect();
      return;
    }
    const columns = grid.clientWidth
      ? Math.max(2, Math.floor((grid.clientWidth + 8) / 168))
      : 4;
    if (columns !== +grid.dataset.columns) taskReadScope(renderDailySlotGrid)();
  });
  dailySlotsObserver = observer;
  observer.observe(grid);
}
function renderDay() {
  let d = day(),
    filled = Array.from({ length: 144 }, (_, i) => starts()[3] + i).filter(
      (n) =>
        state.actions.some((a) => a.id === d.slots[n % 144]) ||
        !!d.actualNotes?.[n % 144],
    ).length,
    done = prayerDayCount(d);
  app.innerHTML = `<div class="day-workspace"><div class="top"><div><h1>يومك حول الصلاة</h1><p style="margin:0"><strong>${hijriLabel(date)}</strong><br><span class="hint">الميلادي الآن: <span id="civilToday">${gregorianLabel()}</span></span></p></div><div class="date"><button data-shift="-1" aria-label="اليوم السابق">→</button><input type="date" id="date" value="${date}" aria-label="اختيار اليوم الهجري بتاريخ نهاره الميلادي"><button data-shift="1" aria-label="اليوم التالي">←</button><button id="today">اليوم</button></div></div><div class="day-summary" aria-label="ملخص تسجيل اليوم"><span>${dayRangeLabel()}</span><span><strong id="dayRecorded">${filled}</strong> / 144 مسجلة فعليًا</span><span><strong id="dayUnrecorded">${144 - filled}</strong> لم تُسجل</span><span><strong id="dayPrayerChecks">${done}</strong> / ${prayerCheckTotal()} من مهام الصلاة</span></div><div class="tabs">${prayerOrder.map((i) => `<div class="tab prayer-tab ${i === prayer ? 'selected' : ''}" data-prayer="${i}"><button type="button" class="prayer-period" ${i === prayer ? 'aria-current="true"' : ''} aria-label="عرض فترة ${names[i]}"><strong>${names[i]}</strong><small>${displayTime(prayerTimes()[i])}</small><span class="prayer-count ${prayerCheckTasks(i).length > 0 && prayerCount(i) === prayerCheckTasks(i).length ? 'complete' : ''}" dir="ltr">${prayerCount(i)}/${prayerCheckTasks(i).length}</span><small>${capacity(date, i).free} خانة متاحة للتخطيط</small></button><button type="button" class="prayer-tasks-button" data-prayer-tasks="${i}" aria-label="عرض مهام صلاة ${names[i]}">${taskIcon('check')} مهام الصلاة</button></div>`).join('')}</div><section class="panel period-tasks"><div class="panel-title"><h2>مهام فترة ${names[prayer]}</h2><span class="badge">${tasks().length}</span></div><p class="capacity-note">${capacityText(date, prayer)}</p><div id="dailyTaskCards">${sortedTasks(tasks()).map(compactTaskCard).join('') || '<p class="empty-note">مساحة لأهم ما تريد إنجازه.</p>'}</div><button id="addDetailedTask" class="primary">${taskIcon('plus')} إضافة مهمة</button></section><div class="time-panel"><section class="panel"><div class="panel-title"><h2>وقت ${names[prayer]}</h2><span class="badge">${range(prayer).length} خانة · ١٠ دقائق</span></div><details class="day-slot-help"><summary>كيف أسجل وقتي؟</summary><p class="hint">اضغط الجزء الكبير لتسجيل ما فعلته، والشريط الصغير بالأسفل لاختيار المطلوب. الأوقات بنظام ١٢ ساعة: ص = صباحًا، م = مساءً. يبدأ اليوم عند أذان المغرب بالضبط؛ حدود الخانات مقربة لعشر دقائق للحفاظ على ١٤٤ خانة.</p></details><div class="slot-toolbar"><span><b>ما فعلته</b> في الأعلى · <b>المطلوب</b> في الأسفل</span><button id="bulkSlots" class="secondary bulk-slots">تسجيل فترة كاملة</button></div><div class="grid" id="dailySlots"></div><div class="legend">${state.categories.map((a) => `<span><i class="dot" style="background:${a.color}"></i>${esc(a.name)}</span>`).join('')}</div></section></div><section class="panel period-tasks" aria-labelledby="allDayTasksTitle"><div class="panel-title"><h2 id="allDayTasksTitle">كل مهام اليوم</h2><span class="badge">${allTasksOn(date).length}</span></div><div id="allDayTaskCards">${
    taskGroups(allTasksOn(date))
      .map((t) => compactTaskGroup(t))
      .join('') || '<p class="empty-note">لا توجد مهام لهذا اليوم.</p>'
  }</div></section></div>`;
  observeDailySlotGrid();
  $('#bulkSlots').onclick = () => openPicker(range(prayer)[0], 'actual', true);
  $('#date').onchange = (e) => {
    if (e.target.value) {
      goDay(e.target.value, false);
    }
  };
  $('#today').onclick = () => {
    goDay(activeDay(), true);
  };
  document.querySelectorAll('[data-shift]').forEach(
    (b) =>
      (b.onclick = () => {
        let dt = new Date(date + 'T12:00:00');
        dt.setDate(dt.getDate() + Number(b.dataset.shift));
        goDay(localDate(dt), false);
      }),
  );
  document.querySelectorAll('.prayer-tab').forEach(
    (b) =>
      (b.onclick = (e) => {
        if (e.target.closest('[data-prayer-tasks]')) return;
        prayer = +b.dataset.prayer;
        render();
      }),
  );
  document.querySelectorAll('[data-prayer-tasks]').forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        openPrayer(+b.dataset.prayerTasks);
      }),
  );
  $('#dailySlots').onclick = (e) => {
    const button = e.target.closest('[data-slot]');
    if (button) {
      const start = +button.dataset.rangeStart,
        end = +button.dataset.rangeEnd;
      openPicker(start, button.dataset.kind, end - start > 1, end);
    }
  };
  bindTaskCards($('#dailyTaskCards'));
  bindTaskCards($('#allDayTaskCards'));
  $('#addDetailedTask').onclick = () => openPlannerEditor();
}
// Keep legacy numeric IDs so existing prayer outcomes stay attached to their tasks.
function prayerCheckTasks(p) {
  return state.prayerTasks?.[p] ?? checks.map((name, i) => ({ id: String(i), name }));
}
function prayerCheckTotal() {
  return prayerOrder.reduce((n, p) => n + prayerCheckTasks(p).length, 0);
}
function prayerCount(p, d = day()) {
  return prayerCheckTasks(p).filter((t) => d?.checks?.[p + '-' + t.id]).length;
}
function prayerDayCount(d = day()) {
  return prayerOrder.reduce((n, p) => n + prayerCount(p, d), 0);
}
function refreshPrayerSummary() {
  $('#dayPrayerChecks').textContent = prayerDayCount();
  document.querySelectorAll('.prayer-tab').forEach((tab) => {
    const p = +tab.dataset.prayer,
      count = prayerCount(p),
      total = prayerCheckTasks(p).length,
      label = tab.querySelector('.prayer-count');
    label.textContent = count + '/' + total;
    label.classList.toggle('complete', total > 0 && count === total);
  });
}
function openPrayer(p = prayer) {
  prayerDialogPrayer = p;
  const modal = $('#prayerDialog');
  $('#prayerTitle').textContent = 'مهام صلاة ' + names[p];
  $('#prayerProgress').textContent = prayerCount(p) + '/' + prayerCheckTasks(p).length;
  $('#prayerChecks').innerHTML = prayerCheckTasks(p)
    .map(({ id, name: n }) => {
      let key = p + '-' + id,
        d = day();
      return `<div class="check ${d.checks[key] ? 'done' : d.checkFailed?.[key] ? 'missed' : ''}"><span class="grow">${esc(d.checkNames?.[key] || n)}</span><button class="status-button ${d.checks[key] ? 'yes' : ''}" data-check-status="${key}" data-value="done" aria-pressed="${!!d.checks[key]}" title="تمت">✓</button><button class="status-button ${d.checkFailed?.[key] ? 'no' : ''}" data-check-status="${key}" data-value="failed" aria-pressed="${!!d.checkFailed?.[key]}" title="لم أفعلها">✕</button><button data-edit-check="${key}" title="تعديل اسم المهمة لهذا اليوم">✎</button></div>`;
    })
    .join('') || '<p class="empty-note">لا توجد مهام لهذه الصلاة. أضف مهامًا من إعدادات الصلاة.</p>';
  modal.querySelectorAll('[data-check-status]').forEach(
    (b) =>
      (b.onclick = () => {
        let d = day(),
          key = b.dataset.checkStatus;
        d.checkFailed ??= {};
        if (b.dataset.value === 'done') {
          d.checks[key] = !d.checks[key];
          delete d.checkFailed[key];
        } else {
          d.checkFailed[key] = !d.checkFailed[key];
          delete d.checks[key];
        }
        save();
        if (view === 'day' && $('.day-workspace')) refreshPrayerSummary();
        else render();
        openPrayer(prayerDialogPrayer);
        modal
          .querySelector(
            `[data-check-status="${key}"][data-value="${b.dataset.value}"]`,
          )
          ?.focus({ preventScroll: true });
      }),
  );
  modal
    .querySelectorAll('[data-edit-check]')
    .forEach((b) => (b.onclick = () => openCheckEditor(b.dataset.editCheck)));
  if (!modal.open) modal.showModal();
}
$('#closePrayer').onclick = () => $('#prayerDialog').close();
$('#prayerDialog').addEventListener('close', () =>
  document
    .querySelector(`[data-prayer-tasks="${prayerDialogPrayer}"]`)
    ?.focus(),
);
function openPicker(n, kind = 'actual', bulk = false, end = n + 1) {
  slot = n;
  slotKind = kind;
  const captured = state,
    key = date,
    d = day(),
    first = starts()[3];
  const read = (n, k) => {
    const i = n % 144,
      plannedTask = k === 'planned' && d.taskSlotOwners?.[i]
        ? findTask(d.taskSlotOwners[i], key)
        : null;
    return {
      action: k === 'actual' ? d.slots[i] : d.planned?.[i],
      note: d[k + 'Notes']?.[i] || '',
      task: k === 'actual' ? d.actualTasks?.[i] : plannedTask ? {
        id: plannedTask.id,
        name: plannedTask.name,
        actionId: d.planned?.[i] || '',
        ...(plannedTask.parentId ? { parentName: mainTask(plannedTask).name } : {}),
      } : null,
    };
  };
  const initial = read(n, kind);
  SlotTools.open({
    root: $('#picker'),
    first,
    start: n,
    end,
    kind,
    bulk,
    immediate: end > n + 1,
    readOnKindChange: end > n + 1,
    ...initial,
    tasks: (n) => actualTasksForSlot(key, n),
    actions: state.actions.filter((a) => !a.archived),
    categories: state.categories,
    color: (a) => ActionCategories.color(state, a),
    time,
    category: (a) => ActionCategories.category(state, a)?.name || 'بدون قسم',
    read,
    show: () => $('#picker').showModal(),
    close: () => {
      $('#picker').close();
      slotButtonAt(n, kind)?.focus({ preventScroll: true });
    },
    commit: (from, to, k, a, note, task) => {
      if (state !== captured || date !== key)
        throw Error('تغير اليوم أو الحساب. افتح التسجيل مرة أخرى.');
      if (
        task &&
        !(
          from >= n &&
          to <= end &&
          JSON.stringify(task) === JSON.stringify(initial.task)
        )
      ) {
        const current = findTask(task.id, key);
        if (
          !current ||
          current.actionId !== a ||
          !state.actions.some((x) => x.id === a)
        )
          throw Error('تغيرت المهمة أو الفعل المرتبط. أعد فتح الخانة.');
        for (let i = from; i < to; i++)
          if (!actualTasksForSlot(key, i).some((t) => t.id === task.id))
            throw Error('المهمة لا تخص جميع فترات الخانات المختارة.');
      }
      SlotTools.apply(d, from, to, k, a, note, first, false, task);
      save();
      if (view === 'day' && $('#dailySlots')) refreshDailySlots(from, to);
      else render();
    },
  });
}
function refreshDailySlots(from, to) {
  const scroll = app.scrollTop,
    pageScroll = document.scrollingElement?.scrollTop || 0;
  const d = day();
  renderDailySlotGrid();
  const filled = Array.from({ length: 144 }, (_, i) => i).filter(
    (i) =>
      state.actions.some((a) => a.id === d.slots[i]) || !!d.actualNotes?.[i],
  ).length;
  $('#dayRecorded').textContent = filled;
  $('#dayUnrecorded').textContent = 144 - filled;
  const note = $('.day-workspace .capacity-note');
  if (note) note.textContent = capacityText(date, prayer);
  document.querySelectorAll('.prayer-tab').forEach((tab) => {
    const label = tab.querySelector('.prayer-period > small:last-child');
    if (label)
      label.textContent = `${capacity(date, +tab.dataset.prayer).free} خانة متاحة للتخطيط`;
  });
  app.scrollTop = scroll;
  if (document.scrollingElement)
    document.scrollingElement.scrollTop = pageScroll;
}

function renderActions() {
  ActionCategories.mount(
    app,
    state,
    () => {
      save();
    },
    (id) => {
      Object.values(state.sunsetDays).forEach((d) =>
        [d.slots, d.planned || {}].forEach((map) =>
          Object.keys(map).forEach((k) => {
            if (map[k] === id) delete map[k];
          }),
        ),
      );
    },
  );
}
function renderRepeatLegacy(edit = null) {
  app.innerHTML = `<h1>مهامي المتكررة</h1><p>التعديل هنا يحدّث مهام اليوم والأيام القادمة، والنسخ التي عدّلتها داخل الصلاة تبقى مستقلة. أيام التكرار تبدأ من المغرب: مهام الجمعة تبدأ من مغرب الخميس وتستمر حتى مغرب الجمعة.</p><section class="panel"><h2>${edit ? 'تعديل المهمة' : 'مهمة تتكرر معك'}</h2><form id="repeatForm"><div class="form"><label class="field">المهمة<input name="name" required maxlength="150" value="${esc(edit?.name || '')}" placeholder="مثلًا: مراجعة أنكي"></label><label class="field">الوصف (اختياري)<input name="taskDescription" maxlength="500" value="${esc(edit?.description || '')}"></label><label class="field">الصلاة<select name="prayer">${names.map((n, i) => `<option value="${i}" ${edit?.prayer === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div><p>أيام التكرار</p><div class="days">${week.map((n, i) => `<label><input name="days" type="checkbox" value="${i}" ${!edit || edit.days.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}</div><button class="primary">${edit ? 'حفظ التعديل' : 'إضافة المهمة المتكررة'}</button>${edit ? '<button type="button" id="cancel" class="secondary">إلغاء</button>' : ''}</form></section><section class="panel">${state.repeat.map((t) => taskRow(t, 'series')).join('') || '<p>لا توجد مهام متكررة بعد.</p>'}</section>`;
  $('#repeatForm').onsubmit = (e) => {
    e.preventDefault();
    let days = [...e.target.querySelectorAll('[name=days]:checked')].map(
        (x) => +x.value,
      ),
      name = e.target.elements.name.value.trim();
    if (!days.length) {
      toast('اختر يومًا واحدًا على الأقل');
      return;
    }
    if (!name) return;
    let t = {
      id: edit?.id || uid(),
      name,
      description: e.target.elements.taskDescription.value.trim(),
      prayers: selectedTaskPeriods(e.target),
      prayer: selectedTaskPeriods(e.target)[0] ?? null,
      days,
    };
    if (edit) state.repeat = state.repeat.map((x) => (x.id === t.id ? t : x));
    else state.repeat.push(t);
    save();
    render();
  };
  if ($('#cancel')) $('#cancel').onclick = () => render();
  document
    .querySelectorAll('[data-edit]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          renderRepeat(state.repeat.find((t) => t.id === b.dataset.edit))),
    );
  document.querySelectorAll('[data-del]').forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm('حذف المهمة المتكررة؟')) {
          state.repeat = state.repeat.filter((t) => t.id !== b.dataset.del);
          save();
          render();
        }
      }),
  );
}
function mountPrayerTaskSettings(p = prayer) {
  const panel = $('#prayerTaskSettings');
  panel.innerHTML = `<h2>مهام الصلاة</h2><p class="hint">اختر الصلاة لإضافة مهامها أو تعديلها أو حذفها. تُحفظ التغييرات لكل الأيام، وتبقى الأسماء التي خصصتها ليوم معين مستقلة. المهام المحذوفة لا تدخل في عدّاد الإنجاز.</p><label class="field">الصلاة<select id="prayerTaskPrayer">${prayerOrder.map((i) => `<option value="${i}" ${i === p ? 'selected' : ''}>${names[i]}</option>`).join('')}</select></label><div class="prayer-task-settings-list">${prayerCheckTasks(p).map((t) => `<form class="prayer-task-setting-row" data-prayer-task="${esc(t.id)}"><input name="taskName" aria-label="اسم مهمة صلاة ${names[p]}" maxlength="150" required value="${esc(t.name)}"><button class="secondary" type="submit" aria-label="حفظ تعديل ${esc(t.name)}" title="حفظ التعديل">✓</button><button class="secondary" type="button" data-delete-prayer-task aria-label="حذف ${esc(t.name)}" title="حذف المهمة">×</button></form>`).join('') || '<p class="empty-note">لا توجد مهام لهذه الصلاة.</p>'}</div><form id="addPrayerTask" class="prayer-task-setting-row"><input name="taskName" aria-label="مهمة صلاة جديدة" placeholder="اسم المهمة الجديدة" maxlength="150" required><button class="primary" type="submit">إضافة</button></form>`;
  $('#prayerTaskPrayer').onchange = (e) => mountPrayerTaskSettings(+e.target.value);
  function commit(list, message) {
    (state.prayerTasks ??= {})[p] = list;
    save();
    mountPrayerTaskSettings(p);
    toast(message);
  }
  panel.querySelectorAll('[data-prayer-task]').forEach((form) => {
    const id = form.dataset.prayerTask;
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = form.elements.taskName.value.trim();
      if (!name) return;
      commit(prayerCheckTasks(p).map((t) => t.id === id ? { ...t, name } : t), 'تم تعديل مهمة الصلاة');
    };
    form.querySelector('[data-delete-prayer-task]').onclick = () => {
      if (!confirm('حذف هذه المهمة من قائمة صلاة ' + names[p] + '؟')) return;
      // Retain stored outcomes; never reuse the deleted ID for a new task.
      commit(prayerCheckTasks(p).filter((t) => t.id !== id), 'تم حذف مهمة الصلاة');
    };
  });
  $('#addPrayerTask').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.elements.taskName.value.trim();
    if (!name) return;
    commit([...prayerCheckTasks(p), { id: uid(), name }], 'تمت إضافة مهمة الصلاة');
    $('#addPrayerTask input').focus();
  };
}
function renderSettings() {
  app.innerHTML = `<h1>المواقيت والتقويم</h1><p>مواقيت تلقائية كل يوم، ويوم جديد عند المغرب.</p><section id="prayerTaskSettings" class="panel"></section><section class="panel"><h2>الموقع والحساب</h2><p>الموقع الحالي: <strong>${esc(state.location.name)}</strong> · ${esc(state.location.zone)}</p><div class="form"><button class="secondary" id="locate">◎ استخدام موقعي الحالي</button><button class="secondary" id="cairo">القاهرة</button></div><p class="hint">الحساب يتم داخل جهازك. التوقيت الصيفي يُطبّق حسب المنطقة الزمنية المختارة.</p><form id="locationForm"><div class="form"><label class="field">اسم المكان<input name="place" required value="${esc(state.location.name)}"></label><label class="field">خط العرض<input name="lat" type="number" step="any" min="-60" max="60" required value="${state.location.lat}"></label><label class="field">خط الطول<input name="lon" type="number" step="any" min="-180" max="180" required value="${state.location.lon}"></label><label class="field">المنطقة الزمنية<input name="zone" required dir="ltr" value="${esc(state.location.zone)}" placeholder="Africa/Cairo"></label><label class="field">طريقة الحساب<select name="method"><option value="Egyptian" ${state.method === 'Egyptian' ? 'selected' : ''}>الهيئة المصرية للمساحة</option><option value="MuslimWorldLeague" ${state.method === 'MuslimWorldLeague' ? 'selected' : ''}>رابطة العالم الإسلامي</option><option value="Karachi" ${state.method === 'Karachi' ? 'selected' : ''}>جامعة كراتشي</option></select></label></div><button class="primary">حفظ الموقع</button></form><p class="hint">المناطق المدعومة بين خطي عرض ٦٠ جنوبًا و٦٠ شمالًا. راجع المواقيت المحسوبة مع مسجدك.</p></section><section class="panel"><h2>مواقيت اليوم المختار</h2><div class="settings-times">${prayerOrder.map((i) => `<div class="field">${names[i]}<strong>${displayTime(prayerTimes()[i])}</strong></div>`).join('')}</div><form id="offsetForm"><p>تعديل اختياري بالدقائق لمطابقة مسجدك (٠ = الوقت المحسوب)</p><div class="settings-times">${names.map((n, i) => `<label class="field">${n}<input name="o${i}" type="number" min="-30" max="30" value="${state.offsets[i]}" required></label>`).join('')}</div><label class="field">تصحيح التاريخ الهجري<select name="hijri">${[-2, -1, 0, 1, 2].map((n) => `<option value="${n}" ${state.hijriOffset === n ? 'selected' : ''}>${n === 0 ? 'بدون تعديل' : n + ' يوم'}</option>`).join('')}</select></label><p class="hint">التاريخ الهجري بحسب تقويم أم القرى الحسابي، وقد يختلف عن إعلان الرؤية المحلي. التصحيح يغيّر عرض التاريخ فقط.</p><button class="primary">حفظ التعديلات</button></form></section><section class="panel"><h2>كيف يبدأ يومك؟</h2><p>اليوم يبدأ مع المغرب وينتهي مع المغرب التالي. منتصف الليل يغيّر التاريخ الميلادي فقط؛ مهامك وعلامات إنجازك تظل في نفس اليوم. التاريخ في خانة الاختيار هو تاريخ نهار اليوم الإسلامي؛ مثلًا اختيار الجمعة يشمل مغرب الخميس.</p></section><section class="panel"><h2>نسختك الاحتياطية</h2><p>الحفظ على الجهاز دائمًا، والمزامنة تعمل بعد تسجيل الدخول. يحتوي الملف على بياناتك الحالية: المهام والمشاريع والخانات والإنجازات والإعدادات، ويمكن استعادتها لاحقًا.</p><div class="form"><button id="export" class="secondary">↓ تصدير البيانات</button><label class="secondary" style="cursor:pointer">↑ استيراد نسخة<input type="file" id="import" accept="application/json" hidden></label></div></section>`;
  mountPrayerTaskSettings();
  function applyLocation(loc, method = state.method) {
    let prev = state.location,
      oldMethod = state.method;
    try {
      new Intl.DateTimeFormat('en', { timeZone: loc.zone });
      if (
        !Number.isFinite(loc.lat) ||
        Math.abs(loc.lat) > 60 ||
        !Number.isFinite(loc.lon) ||
        Math.abs(loc.lon) > 180
      )
        throw Error();
      state.location = loc;
      state.method = method;
      prayerCache.clear();
      activeDay();
      date = activeDay();
      prayer = currentPrayer();
      followToday = true;
      lastActiveDay = date;
      lastCivilDay = zonedDate();
      save();
      render();
      toast('تم تحديث المواقيت تلقائيًا');
    } catch {
      state.location = prev;
      state.method = oldMethod;
      prayerCache.clear();
      toast('راجع الإحداثيات والمنطقة الزمنية');
    }
  }
  $('#locationForm').onsubmit = (e) => {
    e.preventDefault();
    let f = e.target.elements;
    applyLocation(
      {
        name: f.place.value.trim(),
        lat: +f.lat.value,
        lon: +f.lon.value,
        zone: f.zone.value.trim(),
      },
      f.method.value,
    );
  };
  $('#cairo').onclick = () => applyLocation({ ...cairoLocation }, 'Egyptian');
  $('#locate').onclick = () => {
    if (!navigator.geolocation) {
      toast('تحديد الموقع غير متاح؛ أدخل الموقع يدويًا');
      return;
    }
    toast('جاري تحديد الموقع…');
    navigator.geolocation.getCurrentPosition(
      (p) =>
        applyLocation({
          name: 'موقعي الحالي',
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      () => toast('تعذر تحديد الموقع؛ يمكنك استخدام القاهرة أو إدخاله يدويًا'),
      { timeout: 15000, maximumAge: 300000 },
    );
  };
  $('#offsetForm').onsubmit = (e) => {
    e.preventDefault();
    state.offsets = names.map((_, i) => +e.target.elements['o' + i].value);
    state.hijriOffset = +e.target.elements.hijri.value;
    prayerCache.clear();
    if (followToday) date = activeDay();
    lastActiveDay = activeDay();
    save();
    render();
    toast('تم حفظ التعديلات');
  };
  $('#export').onclick = downloadBackup;
  $('#import').onchange = async (e) => {
    let f = e.target.files[0];
    if (!f) return;
    try {
      let s = JSON.parse(await f.text());
      validate(s);
      const reference = s.followUpReference
        ? FollowUp.validate(s.followUpReference) : null;
      delete s.followUpReference;
      if (!confirm('استبدال البيانات الحالية بهذه النسخة؟')) return;
      state = s;
      prayerCache.clear();
      setupCalendar();
      date = activeDay();
      prayer = currentPrayer();
      followToday = true;
      lastActiveDay = date;
      lastCivilDay = zonedDate();
      save();
      render();
      toast('تم استيراد البيانات');
      if (reference) {
        view = 'followUp';
        FollowUp.preview(reference);
      }
    } catch {
      toast('ملف النسخة غير صالح');
    }
  };
}
function validate(s) {
  if (s?.slotMinutes !== undefined && ![10, 15].includes(s.slotMinutes))
    throw Error();
  validatePlanning(s);
  if (
    !s ||
    !Array.isArray(s.times) ||
    s.times.length !== 5 ||
    !s.times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) ||
    !Array.isArray(s.actions) ||
    !Array.isArray(s.repeat) ||
    !s.days ||
    typeof s.days !== 'object'
  )
    throw Error();
  if (s.location) {
    if (
      !Number.isFinite(s.location.lat) ||
      Math.abs(s.location.lat) > 60 ||
      !Number.isFinite(s.location.lon) ||
      Math.abs(s.location.lon) > 180 ||
      typeof s.location.name !== 'string'
    )
      throw Error();
    new Intl.DateTimeFormat('en', { timeZone: s.location.zone });
  }
  if (
    s.method &&
    !['Egyptian', 'MuslimWorldLeague', 'Karachi'].includes(s.method)
  )
    throw Error();
  if (
    s.offsets &&
    (!Array.isArray(s.offsets) ||
      s.offsets.length !== 5 ||
      !s.offsets.every((n) => Number.isInteger(n) && Math.abs(n) <= 30))
  )
    throw Error();
  if (
    s.hijriOffset !== undefined &&
    (!Number.isInteger(s.hijriOffset) || Math.abs(s.hijriOffset) > 2)
  )
    throw Error();
  if (s.prayerTasks !== undefined) {
    if (!s.prayerTasks || typeof s.prayerTasks !== 'object' || Array.isArray(s.prayerTasks)) throw Error();
    for (const [p, list] of Object.entries(s.prayerTasks)) {
      if (!/^[0-4]$/.test(p) || !Array.isArray(list) ||
          new Set(list.map((t) => t?.id)).size !== list.length ||
          list.some((t) => !t || typeof t.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(t.id) ||
            typeof t.name !== 'string' || !t.name.trim() || t.name.length > 150)) throw Error();
    }
  }
  let m = s.times.map(minute);
  if (
    m[0] < SlotTools.minutes ||
    m.some(
      (v, i) =>
        i &&
        Math.floor(v / SlotTools.minutes) <=
          Math.floor(m[i - 1] / SlotTools.minutes),
    )
  )
    throw Error();
  for (let a of s.actions)
    if (
      typeof a.id !== 'string' ||
      typeof a.name !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(a.color)
    )
      throw Error();
  for (let t of s.repeat)
    if (
      typeof t.id !== 'string' ||
      typeof t.name !== 'string' ||
      !validTaskPeriods(t) ||
      !Array.isArray(t.days) ||
      !t.days.length ||
      !t.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
      throw Error();
  for (let d of Object.values({ ...s.days, ...(s.sunsetDays || {}) })) {
    if (!d || !d.slots || !d.checks || !d.done || !Array.isArray(d.tasks))
      throw Error();
    for (let t of d.tasks)
      if (
        typeof t.name !== 'string' ||
        typeof t.id !== 'string' ||
        !validTaskPeriods(t)
      )
        throw Error();
  }
}
function setTaskOutcome(d, id, value) {
  d.failed ??= {};
  if (value === 'done') {
    d.done[id] = !d.done[id];
    delete d.failed[id];
  } else {
    d.failed[id] = !d.failed[id];
    delete d.done[id];
  }
}
function editOccurrence(d, t, name, nextPrayer) {
  if (name === t.name && nextPrayer === t.prayer) return false;
  if (t.recurrent) {
    d.excludedRepeat ??= {};
    d.excludedRepeat[t.id] = true;
    let copy = { id: uid(), name, prayer: nextPrayer, detachedFrom: t.id };
    d.tasks.push(copy);
    if (d.done[t.id]) d.done[copy.id] = true;
    if (d.failed?.[t.id]) d.failed[copy.id] = true;
    delete d.done[t.id];
    if (d.failed) delete d.failed[t.id];
  } else {
    let target = d.tasks.find((x) => x.id === t.id);
    if (target) {
      target.name = name;
      target.prayer = nextPrayer;
    }
  }
  return true;
}
function openTaskEditor(t) {
  if (t) openTaskManager({ ...t, date: t.date || date });
}
function openCheckEditor(key) {
  taskEditTarget = { date, check: key };
  $('#taskEditTitle').textContent = 'تعديل مهمة الصلاة';
  $('#taskEditName').value =
    day().checkNames?.[key] || prayerCheckTasks(+key[0]).find((t) => key === key[0] + '-' + t.id)?.name || '';
  $('#taskEditPrayerField').hidden = true;
  $('#taskEditHint').textContent = 'اسم مستقل لهذه المهمة في هذا اليوم فقط.';
  $('#taskEditor').showModal();
}
$('#cancelTaskEdit').onclick = () => $('#taskEditor').close();
$('#taskEditForm').onsubmit = (e) => {
  e.preventDefault();
  let name = $('#taskEditName').value.trim();
  if (!name || !taskEditTarget) return;
  let d = state.sunsetDays[taskEditTarget.date];
  if (taskEditTarget.check) (d.checkNames ??= {})[taskEditTarget.check] = name;
  else
    editOccurrence(d, taskEditTarget.task, name, +$('#taskEditPrayer').value);
  $('#taskEditor').close();
  save();
  render();
  if ($('#prayerDialog').open) openPrayer(prayerDialogPrayer);
};
// Direct month/week navigation and editor opening also get an isolated read scope.
render = taskReadScope(render);
renderDashboard = taskReadScope(renderDashboard);
renderTaskMonth = taskReadScope(renderTaskMonth);
renderTaskWeek = taskReadScope(renderTaskWeek);
openPlannerEditor = taskReadScope(openPlannerEditor);
openTaskManager = taskReadScope(openTaskManager);
renderRepeat = taskReadScope(renderRepeat);
openProjectTaskLink = taskReadScope(openProjectTaskLink);
actualTasksForSlot = taskReadScope(actualTasksForSlot);
refreshDailySlots = taskReadScope(refreshDailySlots);
document.addEventListener('click', (e) => {
  const more = $('#navigationMore');
  if (more?.open && !more.contains(e.target)) more.open = false;
});
document.addEventListener('keydown', (e) => {
  const more = $('#navigationMore');
  if (e.key === 'Escape' && more?.open) {
    more.open = false;
    more.querySelector('summary').focus({ preventScroll: true });
  }
});
$('#downloadBackup').onclick = downloadBackup;
document.querySelectorAll('nav button').forEach(
  (b) =>
    (b.onclick = () => {
      view = b.dataset.view;
      const more = $('#navigationMore');
      if (more) more.open = false;
      render();
    }),
);
render();

setInterval(tickCalendar, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tickCalendar();
});
window.addEventListener('focus', tickCalendar);
