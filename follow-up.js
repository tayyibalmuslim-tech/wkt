/* Private, account-scoped, local-only reference. Never added to synchronized state. */
const FollowUp = (() => {
  'use strict';
  const version = 1;
  const instructions = `عند قول «مرجع المتابعة»: اقرأ المرجع الموجود وبيانات التطبيق وحدّث المرجع بدل إعادة إنشائه. أعد ملف JSON كاملًا بنفس schemaVersion وid وbaseRevision مساويًا revision الحالي، وزد revision. احتفظ بمعرفات السجلات وتاريخها ومصادرها. لا تحذف التاريخ ولا تكرر الأيام أو المهام. حدث الأيام الجديدة أو المتغيرة والملخصات التابعة لها فقط. غياب التسجيل ليس إخفاقًا. احفظ الإنجاز الجزئي وسجل عدم الإنجاز عند تأجيل المهمة. لا تحتسب المهمة وخاناتها أو الرئيسية والفرعية مرتين. راع مدة الخانة التاريخية (10 أو 15 دقيقة)، وتحقق من دلالة الأولوية من قواعد المرجع وإعدادات التطبيق، واليوم من مغرب اليوم السابق إلى المغرب وتاريخه تاريخ نهاره. افصل الملاحظة عن الاستنتاج، ولا تخترع بيانات أو تقيّم المستقبل. لا تعتمد تجربة تحسين لمجرد اقتراحها. التزم بقواعد المستخدم داخل sections.rules وبالنصوص الأصلية. صحح الملخصات العليا عند تغير يوم قديم، مع الاستشهاد بالمصادر وحدود التغطية. لا تغير بيانات التطبيق الأصلية. بنية السجل: id, updatedAt, summary, positives, improvements, advice, patterns, coverage, metrics, exceptions, limitations, sources, status. حقول النصوص نصوص عادية. days مفاتيحها YYYY-MM-DD، periods مفاتيحها YYYY أو YYYY-Q1 أو YYYY-MM أو YYYY-MM-S1 (ستة أقسام 1–5،6–10،11–15،16–20،21–25،26–نهاية الشهر)، sections تشمل goals, deferred, patterns, experiments, questions, rules وأي أقسام إضافية. لا تنشئ تقييمات آليًا دون أدلة.`;
  const labels = {
    summary: 'الملخص',
    positives: 'الأشياء الجيدة',
    improvements: 'ما يحتاج إلى إصلاح',
    advice: 'النصائح العملية',
    patterns: 'الأنماط المتكررة',
    coverage: 'التغطية والموثوقية',
    metrics: 'مؤشرات الوقت والمهام',
    exceptions: 'الظروف الاستثنائية',
    limitations: 'حدود الاستنتاج',
    sources: 'مصادر المعلومات',
  };
  const sectionLabels = {
    goals: 'الأهداف والمشاريع',
    deferred: 'سجل المؤجلات',
    patterns: 'الأنماط المرصودة',
    experiments: 'تجارب التحسين',
    questions: 'الأسئلة المعلقة',
    rules: 'قواعد التقييم والتحديث',
    original: 'النص الأصلي',
  };
  let cursor = {
      date: new Date().toISOString().slice(0, 10),
      level: 'month',
      section: '',
      search: '',
      filter: '',
    },
    pending = null;
  const now = () => new Date().toISOString();
  const owner = () =>
    window.WaqtiSync ? window.WaqtiSync.referenceOwner() : 'guest';
  function key() {
    const o = owner();
    if (!o) throw Error('انتظر تهيئة الحساب');
    return 'waqti-follow-up-v1:' + o;
  }
  function read() {
    const data = localStorage.getItem(key());
    return data ? JSON.parse(data) : { current: null, history: [] };
  }
  function current() {
    return read().current;
  }
  function empty() {
    return {
      schemaVersion: version,
      id: crypto.randomUUID(),
      revision: 1,
      baseRevision: 0,
      updatedAt: now(),
      updateInstructions: instructions,
      days: {},
      periods: {},
      sections: {},
    };
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function dateOK(s) {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s
    );
  }
  function validate(input) {
    const r = structuredClone(input?.followUpReference || input);
    if (
      !r ||
      r.schemaVersion !== version ||
      typeof r.id !== 'string' ||
      !r.id ||
      !Number.isInteger(r.revision) ||
      r.revision < 1 ||
      !Number.isFinite(Date.parse(r.updatedAt))
    )
      throw Error('ملف أو إصدار المرجع غير مدعوم');
    for (const group of ['days', 'periods', 'sections']) {
      if (!r[group] || Array.isArray(r[group]) || typeof r[group] !== 'object')
        throw Error('بنية السجلات غير صالحة');
      for (const [id, record] of Object.entries(r[group])) {
        if (
          ['__proto__', 'constructor', 'prototype'].includes(id) ||
          (group === 'days' && !dateOK(id)) ||
          (group === 'periods' &&
            !/^\d{4}(?:-Q[1-4]|-(?:0[1-9]|1[0-2])(?:-S[1-6])?)?$/.test(id))
        )
          throw Error('معرف سجل غير صالح');
        if (
          !record ||
          typeof record !== 'object' ||
          Array.isArray(record) ||
          typeof record.id !== 'string' ||
          !Number.isFinite(Date.parse(record.updatedAt))
        )
          throw Error('سجل بلا معرف أو تاريخ تحديث صالح');
        for (const field of Object.keys(labels))
          if (record[field] !== undefined && typeof record[field] !== 'string')
            throw Error('حقول التقييم يجب أن تكون نصوصًا');
        if (
          record.experimentState &&
          !['proposed', 'approved', 'running', 'completed', 'stopped'].includes(
            record.experimentState,
          )
        )
          throw Error('حالة تجربة غير صالحة');
        if (
          record.status &&
          !['complete', 'partial', 'temporary', 'none'].includes(record.status)
        )
          throw Error('حالة بيانات غير صالحة');
      }
    }
    return r;
  }
  function record(id, text = '') {
    return { id, updatedAt: now(), summary: text, status: 'temporary' };
  }
  function parse(text, filename) {
    if (/\.json$/i.test(filename) || text.trim().startsWith('{'))
      return validate(JSON.parse(text));
    const r = empty();
    r.sections.original = record('original', text);
    r.sections.original.sources = filename;
    // Conservative parsing: only unambiguous full dates; preserve every original byte above.
    const normalized = text.replace(/[٠-٩]/g, (c) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)),
    );
    const lines = normalized.split(/\r?\n/),
      originals = text.split(/\r?\n/);
    let target = null;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(
        /^\s*(?:#{1,6}\s*)?(?:اليوم\s*[:：-]?\s*)?(\d{4}-\d{2}-\d{2})(?:\s|$|[:：])/,
      );
      if (match && dateOK(match[1])) {
        target = match[1];
        r.days[target] ||= record(target);
        r.days[target].sources = filename;
      } else if (target)
        r.days[target].summary +=
          (r.days[target].summary ? '\n' : '') + originals[i];
    }
    return r;
  }
  function diff(old, incoming) {
    const changes = [];
    for (const group of ['days', 'periods', 'sections'])
      for (const [id, value] of Object.entries(incoming[group])) {
        const before = old?.[group]?.[id];
        if (!same(before, value))
          changes.push({
            group,
            id,
            before,
            value,
            conflict:
              !!before &&
              (before.manual ||
                Date.parse(before.updatedAt) > Date.parse(value.updatedAt)),
          });
      }
    return changes;
  }
  function commit(next, expected) {
    const k = key(),
      data = read();
    if (expected !== undefined && !same(data.current, expected))
      throw Error('تغير المرجع أثناء المعاينة؛ أعد فتح الملف');
    const history = data.current
      ? [{ savedAt: now(), reference: data.current }, ...data.history].slice(
          0,
          8,
        )
      : data.history;
    localStorage.setItem(k, JSON.stringify({ current: next, history }));
  }
  function exportFile(payload, name) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function backup() {
    const r = current();
    return r
      ? {
          ...r,
          baseRevision: r.revision,
          updateInstructions: (r.updateInstructions || '').includes(
            instructions,
          )
            ? r.updateInstructions
            : instructions + '\n' + (r.updateInstructions || ''),
        }
      : null;
  }
  function preview(incoming, restore = false) {
    const old = current();
    const changes = diff(old, incoming);
    if (restore && old) {
      for (const group of ['days', 'periods', 'sections'])
        for (const [id, before] of Object.entries(old[group]))
          if (!Object.hasOwn(incoming[group], id))
            changes.push({
              group,
              id,
              before,
              value: null,
              conflict: !!before.manual,
            });
    }
    pending = { owner: owner(), old, incoming, changes, restore };
    renderPreview();
  }
  function renderPreview() {
    const { old, incoming, changes } = pending;
    const stale =
      old &&
      (incoming.id !== old.id ||
        incoming.revision <= old.revision ||
        incoming.baseRevision !== old.revision);
    app.innerHTML = `<div class="fu"><h1>معاينة تحديث المرجع</h1><p>لن تتغير المهام أو الخانات.</p>${pending.restore ? '<p>استرجاع نسخة سابقة: السجلات التي أُضيفت بعدها ستُحذف من المرجع. تُحفظ النسخة الحالية قبل الاسترجاع.</p>' : ''}<p>${changes.filter((c) => c.group === 'days' && !c.before).length} يوم مضاف · ${changes.filter((c) => c.group === 'days' && c.before).length} يوم معدل · ${changes.filter((c) => c.group !== 'days').length} قسم أو ملخص معدل</p>${stale ? '<p>الملف أقدم، أو من مرجع آخر، أو لم يُبنَ على النسخة الحالية. راجع التعارضات قبل الدمج.</p><label><input id="fuStale" type="checkbox"> أفهم اختلاف الإصدار وأريد دمج التغييرات المختارة</label>' : ''}<div class="fu-preview">${changes.map((c, i) => `<details><summary>${esc(c.group + ' / ' + c.id)} — ${c.before ? 'تعديل' : 'إضافة'} ${c.conflict ? '· تعارض مع تعديل محفوظ' : ''}</summary><div class="fu-columns"><pre>${esc(JSON.stringify(c.before || {}, null, 2))}</pre><pre>${esc(JSON.stringify(c.value, null, 2))}</pre></div>${c.conflict ? `<label><input type="checkbox" data-conflict="${i}"> استبدال تعديلي بهذه النسخة</label>` : ''}</details>`).join('')}</div><p class="hint">${pending.restore ? 'السجلات الغائبة عن النسخة ستُحذف بعد مراجعتك.' : 'السجلات الغائبة عن الملف ستبقى.'} النص المستورد محفوظ كاملًا في «النص الأصلي»؛ تقسيمه التلقائي يحتاج مراجعة.</p><button id="fuApply" class="primary">اعتماد التحديث</button> <button id="fuCancel" class="secondary">إلغاء</button></div>`;
    $('#fuCancel').onclick = () => {
      pending = null;
      render();
    };
    $('#fuApply').onclick = () => {
      try {
        if (owner() !== pending.owner)
          throw Error('تغير الحساب؛ أعد الاستيراد');
        if (stale && !$('#fuStale').checked)
          throw Error('راجع اختلاف الإصدار أولًا');
        const selected = changes.filter(
          (c, i) =>
            !c.conflict || app.querySelector(`[data-conflict="${i}"]`).checked,
        );
        if (!selected.length) {
          pending = null;
          render();
          return;
        }
        const next = structuredClone(old || incoming);
        for (const c of selected) {
          if (c.value === null) delete next[c.group][c.id];
          else next[c.group][c.id] = c.value;
        }
        next.revision = old
          ? Math.max(old.revision, incoming.revision) + 1
          : incoming.revision;
        next.baseRevision = old?.revision || 0;
        next.updatedAt = now();
        if (old && incoming.updateInstructions)
          next.updateInstructions = [
            old.updateInstructions,
            incoming.updateInstructions,
          ]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join('\n');
        if (!pending.restore)
          markSummaries(
            next,
            selected.filter((c) => c.group === 'days').map((c) => c.id),
            selected.filter((c) => c.group === 'periods').map((c) => c.id),
          );
        commit(next, old);
        pending = null;
        render();
        toast('تم تحديث المرجع');
      } catch (e) {
        toast(e.message);
      }
    };
  }
  function markSummaries(r, dates, refreshed = []) {
    for (const d of dates) {
      const y = d.slice(0, 4),
        m = d.slice(0, 7),
        q = y + '-Q' + Math.ceil(Number(d.slice(5, 7)) / 3),
        s = m + '-S' + Math.min(6, Math.ceil(Number(d.slice(8)) / 5));
      for (const id of [y, q, m, s])
        if (!refreshed.includes(id)) {
          r.periods[id] ||= record(id);
          r.periods[id].needsReview = true;
        }
    }
  }
  function edit(group, id) {
    const old = current(),
      previous = old?.[group]?.[id] || record(id);
    const dialog = document.createElement('dialog');
    dialog.className = 'fu-editor';
    dialog.innerHTML = `<form><h2>تعديل ${esc(id)}</h2><label class="field">حالة البيانات<select name="status">${Object.entries(
      {
        none: 'لا توجد بيانات',
        temporary: 'مؤقتة',
        partial: 'جزئية',
        complete: 'مكتملة',
      },
    )
      .map(
        ([v, t]) =>
          `<option value="${v}" ${previous.status === v ? 'selected' : ''}>${t}</option>`,
      )
      .join('')}</select></label>${
      group === 'sections'
        ? `<label class="field">حالة تجربة التحسين<select name="experimentState"><option value="">لا ينطبق</option>${Object.entries(
            {
              proposed: 'مقترحة',
              approved: 'معتمدة',
              running: 'جارية',
              completed: 'مكتملة',
              stopped: 'متوقفة',
            },
          )
            .map(
              ([v, t]) =>
                `<option value="${v}" ${previous.experimentState === v ? 'selected' : ''}>${t}</option>`,
            )
            .join('')}</select></label>`
        : ''
    }${Object.entries(labels)
      .map(
        ([field, label]) =>
          `<label class="field">${label}<textarea name="${field}" rows="${field === 'summary' ? 4 : 2}">${esc(previous[field] || '')}</textarea></label>`,
      )
      .join(
        '',
      )}<button class="primary">حفظ</button> <button type="button" id="fuClose">إلغاء</button></form>`;
    document.body.append(dialog);
    const scope = owner();
    dialog.showModal();
    dialog.querySelector('#fuClose').onclick = () => dialog.close();
    dialog.onclose = () => dialog.remove();
    dialog.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      try {
        if (scope !== owner()) throw Error('تغير الحساب');
        const next = structuredClone(old || empty()),
          value = {
            ...previous,
            ...Object.fromEntries(new FormData(e.target)),
            updatedAt: now(),
            manual: true,
            needsReview: false,
          };
        next[group][id] = value;
        next.baseRevision = old?.revision || 0;
        next.revision = (old?.revision || 0) + 1;
        next.updatedAt = now();
        if (group === 'days') markSummaries(next, [id]);
        commit(next, old);
        dialog.close();
        render();
      } catch (error) {
        toast(error.message);
      }
    };
  }
  function details(value) {
    if (!value)
      return '<p class="hint">لا يوجد تقييم. غياب البيانات لا يعني عدم الإنجاز.</p>';
    return `<p class="fu-summary">${esc(value.summary || 'لا يوجد ملخص')}</p>${['positives', 'improvements', 'advice'].map((f) => `<section class="fu-note"><h3>${labels[f]}</h3><p>${esc(value[f] || '—')}</p></section>`).join('')}<details><summary>التفاصيل والمصادر ${value.needsReview ? '· يحتاج إلى مراجعة' : ''}</summary>${Object.entries(
      value,
    )
      .filter(
        ([f]) =>
          !['summary', 'positives', 'improvements', 'advice'].includes(f),
      )
      .map(
        ([f, v]) =>
          `<p><b>${esc(labels[f] || f)}</b>: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</p>`,
      )
      .join('')}</details>`;
  }
  function renderView() {
    try {
      const r = current(),
        d = cursor.date,
        y = d.slice(0, 4),
        m = d.slice(0, 7),
        q = Math.ceil(Number(d.slice(5, 7)) / 3),
        segment = Math.min(6, Math.ceil(Number(d.slice(8)) / 5));
      const period =
        cursor.level === 'year'
          ? y
          : cursor.level === 'quarter'
            ? y + '-Q' + q
            : cursor.level === 'segment'
              ? m + '-S' + segment
              : m;
      app.innerHTML = `<div class="fu"><div class="fu-toolbar"><h1>مرجع المتابعة</h1><label class="secondary">استيراد مرجع / تحديث المرجع<input id="fuImport" type="file" accept=".txt,.md,.json" hidden></label><button id="fuExport" class="secondary">تصدير المرجع وحده</button><button id="fuBackup" class="secondary">تصدير التطبيق مع المرجع</button></div><p class="hint">خاص بهذا الحساب على هذا المتصفح فقط؛ لا يُزامن ولا يُرسل إلى ذكاء اصطناعي. احفظ نسخة عند الانتقال إلى جهاز آخر.</p>${
        !r
          ? '<section class="panel"><h2>ابدأ بمرجعك الخاص</h2><p>استورد ملفًا نصيًا أو JSON، أو ابدأ بكتابة تقييمك.</p><button id="fuCreate" class="primary">إنشاء مرجع فارغ</button></section>'
          : `<p>آخر تحديث: ${esc(r.updatedAt)} · ${Object.keys(r.days).length} يومًا مسجلًا · ${Object.values(r.days).filter((v) => v.status === 'complete').length} مكتملًا</p>${r.sections.experiments?.experimentState === 'running' ? `<p>تجربة جارية: ${esc((r.sections.experiments.summary || '').slice(0, 180))}</p>` : ''}<div class="fu-toolbar"><label>التاريخ <input id="fuDate" type="date" value="${d}"></label><input id="fuSearch" type="search" placeholder="بحث في المرجع" value="${esc(cursor.search)}"><select id="fuFilter"><option value="">كل الأيام</option><option value="missing" ${cursor.filter === 'missing' ? 'selected' : ''}>بيانات ناقصة</option><option value="review" ${cursor.filter === 'review' ? 'selected' : ''}>تحتاج مراجعة</option></select></div><div class="fu-toolbar">${[
              ['year', 'السنة'],
              ['quarter', 'الربع'],
              ['month', 'الشهر'],
              ['segment', 'القسم'],
              ['day', 'اليوم'],
            ]
              .map(
                ([id, label]) =>
                  `<button data-level="${id}" class="${cursor.level === id ? 'primary' : 'secondary'}">${label}</button>`,
              )
              .join(
                '',
              )}</div><div class="fu-choices">${Array.from({ length: 4 }, (_, i) => `<button data-quarter="${i + 1}" class="secondary">الربع ${i + 1}</button>`).join('')}</div><div class="fu-choices">${Array.from(
              { length: 3 },
              (_, i) => {
                const n = (q - 1) * 3 + i + 1;
                return `<button data-month="${n}" class="secondary">${new Intl.DateTimeFormat('ar', { month: 'long' }).format(new Date(Number(y), n - 1, 1))}</button>`;
              },
            ).join(
              '',
            )}</div><div class="fu-choices">${Array.from({ length: 6 }, (_, i) => `<button data-segment="${i + 1}" class="secondary">${i * 5 + 1}–${i === 5 ? 'نهاية الشهر' : i * 5 + 5}</button>`).join('')}</div><section class="panel"><h2>${esc(cursor.section ? sectionLabels[cursor.section] || cursor.section : cursor.level === 'day' ? d : period)}</h2>${details(cursor.section ? r.sections[cursor.section] : cursor.level === 'day' ? r.days[d] : r.periods[period])}<button id="fuEdit" class="secondary">تعديل التقييم</button></section>${cursor.search ? searchResults(r) : calendar(r, m, segment)}<div class="fu-toolbar"><button id="fuPrev" class="secondary">اليوم السابق</button><button id="fuNext" class="secondary">اليوم التالي</button></div><details><summary>أقسام المرجع</summary><div class="fu-toolbar">${[...new Set([...Object.keys(sectionLabels), ...Object.keys(r.sections)])].map((id) => `<button data-section="${esc(id)}" class="secondary">${esc(sectionLabels[id] || id)}</button>`).join('')}</div></details><details><summary>النسخ السابقة والحذف</summary><div class="fu-toolbar">${read()
              .history.map(
                (v, i) =>
                  `<button data-restore="${i}" class="secondary">استرجاع ${esc(v.savedAt)}</button>`,
              )
              .join(
                '',
              )}<button id="fuDelete" class="secondary">حذف المرجع ونسخه السابقة</button></div></details>`
      }</div>`;
      $('#fuImport').onchange = async (e) => {
        const f = e.target.files[0],
          scope = owner();
        if (!f) return;
        try {
          if (f.size > 8e6) throw Error('الملف كبير جدًا');
          const text = await f.text();
          if (scope !== owner() || view !== 'followUp') return;
          preview(parse(text, f.name));
        } catch (error) {
          toast(error.message);
        }
      };
      $('#fuExport').onclick = () => {
        try {
          const value = backup();
          if (value) exportFile(value, 'follow-up-reference.json');
          else toast('لا يوجد مرجع بعد');
        } catch (e) {
          toast(e.message);
        }
      };
      $('#fuBackup').onclick = () => downloadBackup(true);
      if (!r) {
        $('#fuCreate').onclick = () => {
          try {
            commit(empty(), null);
            render();
          } catch (e) {
            toast(e.message);
          }
        };
        return;
      }
      $('#fuDate').onchange = (e) => {
        if (dateOK(e.target.value)) {
          cursor.date = e.target.value;
          cursor.section = '';
          render();
        }
      };
      $('#fuSearch').onchange = (e) => {
        cursor.search = e.target.value;
        render();
      };
      $('#fuFilter').onchange = (e) => {
        cursor.filter = e.target.value;
        render();
      };
      app.querySelectorAll('[data-level]').forEach(
        (b) =>
          (b.onclick = () => {
            cursor.level = b.dataset.level;
            cursor.section = '';
            render();
          }),
      );
      for (const type of ['quarter', 'month', 'segment'])
        app.querySelectorAll(`[data-${type}]`).forEach(
          (b) =>
            (b.onclick = () => {
              const n = Number(b.dataset[type]);
              cursor.date =
                type === 'quarter'
                  ? `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`
                  : type === 'month'
                    ? `${y}-${String(n).padStart(2, '0')}-01`
                    : `${m}-${String((n - 1) * 5 + 1).padStart(2, '0')}`;
              cursor.level = type;
              cursor.section = '';
              render();
            }),
        );
      app.querySelectorAll('[data-date]').forEach(
        (b) =>
          (b.onclick = () => {
            cursor.date = b.dataset.date;
            cursor.level = 'day';
            cursor.section = '';
            render();
          }),
      );
      app.querySelectorAll('[data-section]').forEach(
        (b) =>
          (b.onclick = () => {
            cursor.section = b.dataset.section;
            render();
          }),
      );
      app.querySelectorAll('[data-period]').forEach(
        (b) =>
          (b.onclick = () => {
            const id = b.dataset.period;
            cursor.date = id.slice(0, 4) + '-01-01';
            if (id.includes('-Q')) {
              cursor.date =
                id.slice(0, 4) +
                '-' +
                String((Number(id.at(-1)) - 1) * 3 + 1).padStart(2, '0') +
                '-01';
              cursor.level = 'quarter';
            } else if (id.length >= 7) {
              cursor.date =
                id.slice(0, 7) +
                '-' +
                String(
                  id.includes('-S') ? (Number(id.at(-1)) - 1) * 5 + 1 : 1,
                ).padStart(2, '0');
              cursor.level = id.includes('-S') ? 'segment' : 'month';
            } else cursor.level = 'year';
            cursor.section = '';
            render();
          }),
      );
      $('#fuEdit').onclick = () =>
        edit(
          cursor.section
            ? 'sections'
            : cursor.level === 'day'
              ? 'days'
              : 'periods',
          cursor.section || (cursor.level === 'day' ? d : period),
        );
      for (const [selector, delta] of [
        ['#fuPrev', -1],
        ['#fuNext', 1],
      ])
        $(selector).onclick = () => {
          const day = new Date(d + 'T12:00:00Z');
          day.setUTCDate(day.getUTCDate() + delta);
          cursor.date = day.toISOString().slice(0, 10);
          cursor.level = 'day';
          cursor.section = '';
          render();
        };
      app.querySelectorAll('[data-restore]').forEach(
        (b) =>
          (b.onclick = () => {
            const saved = read().history[Number(b.dataset.restore)].reference;
            preview(saved, true);
          }),
      );
      $('#fuDelete').onclick = () => {
        if (
          confirm(
            'حذف المرجع وكل النسخ السابقة من هذا الحساب على هذا الجهاز؟ لا يمكن التراجع.',
          )
        ) {
          localStorage.removeItem(key());
          render();
        }
      };
    } catch (e) {
      app.innerHTML = `<h1>مرجع المتابعة</h1><p>${esc(e.message)}</p>`;
    }
  }
  function calendar(r, m, segment) {
    const [y, month] = m.split('-').map(Number),
      count = new Date(y, month, 0).getDate(),
      offset = new Date(y, month - 1, 1).getDay();
    return `<div class="fu-calendar">${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((v) => `<span>${v}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from(
      { length: count },
      (_, i) => {
        const d = m + '-' + String(i + 1).padStart(2, '0'),
          v = r.days[d],
          show =
            (!cursor.filter ||
              (cursor.filter === 'review'
                ? v?.needsReview
                : !v || v.status !== 'complete')) &&
            (cursor.level !== 'segment' ||
              Math.min(6, Math.ceil((i + 1) / 5)) === segment);
        return `<button data-date="${d}" ${show ? '' : 'disabled'} class="secondary ${d === cursor.date ? 'fu-selected' : ''}" aria-label="${d}: ${v ? 'يوجد تقييم' : 'لا يوجد تقييم'}">${i + 1}<small>${v ? (v.status === 'complete' ? '● مكتمل' : '◐ جزئي / مؤقت') : 'غير مقيّم'}</small></button>`;
      },
    ).join('')}</div>`;
  }
  function searchResults(r) {
    return `<div class="fu-results">${
      ['days', 'periods', 'sections']
        .flatMap((group) =>
          Object.entries(r[group])
            .filter(([id, v]) =>
              (id + ' ' + JSON.stringify(v))
                .toLowerCase()
                .includes(cursor.search.toLowerCase()),
            )
            .map(
              ([id, v]) =>
                `<button class="secondary" data-${group === 'days' ? 'date' : group === 'sections' ? 'section' : 'period'}="${esc(id)}">${esc(sectionLabels[id] || id)} — ${esc((v.summary || '').slice(0, 100))}</button>`,
            ),
        )
        .join('') || 'لا توجد نتائج'
    }</div>`;
  }
  return {
    render: renderView,
    backup,
    validate,
    parse,
    preview,
    current,
    empty,
    diff,
    commit,
    markSummaries,
  };
})();
