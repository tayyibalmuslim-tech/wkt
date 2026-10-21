/* Firebase Authentication + per-account Realtime Database snapshots.
   Account-scoped local queues survive offline reloads. Transactions compare
   revisions and merge independent edits; choices concern overlapping fields only. */
(() => {
  const config = {
    apiKey: 'AIzaSyD8jxpVrvicStETloL8tk5s865dmNatIqE',
    authDomain: 'mazen-productivity-bab1c.firebaseapp.com',
    databaseURL: 'https://mazen-productivity-bab1c-default-rtdb.firebaseio.com',
    projectId: 'mazen-productivity-bab1c',
    storageBucket: 'mazen-productivity-bab1c.firebasestorage.app',
    messagingSenderId: '388570583199',
    appId: '1:388570583199:web:d62a7ad37c9330e22252aa',
  };
  let auth,
    db,
    user = null,
    recordRef = null,
    unsubscribe = null,
    connectionRef = null,
    connectionHandler = null;
  let baseRevision = 0,
    dirty = false,
    ready = false,
    online = false,
    writing = false,
    applying = false,
    remote = null,
    timer = null,
    epoch = 0,
    authReady = false;
  let status = 'جاري تهيئة الحساب…',
    error = '',
    mode = 'login',
    busy = false,
    editSequence = 0,
    conflict = false,
    hasCachedData = false;
  let baseState = null,
    baseKnown = false,
    deferred = false,
    retryDelay = 500,
    conflicts = [];
  const mergeChoices = new Map();
  const cacheKey = (id) => 'waqti-account-' + id;
  function fresh() {
    return {
      ...structuredClone(defaults),
      location: { ...cairoLocation },
      method: 'Egyptian',
      offsets: [0, 0, 0, 0, 0],
      hijriOffset: 0,
      sunsetDays: {},
    };
  }
  function readGuest() {
    try {
      let s = JSON.parse(localStorage.getItem('waqti-v1'));
      validate(s);
      return s;
    } catch {
      return fresh();
    }
  }
  function persist() {
    try {
      if (user) {
        const cached = { state, baseRevision, dirty };
        if (dirty && baseKnown)
          cached.basePatch = WaqtiSyncMerge.diff(state, baseState);
        try {
          localStorage.setItem(cacheKey(user.uid), JSON.stringify(cached));
        } catch (error) {
          // Keep the current edits even when there is no space for a reverse base.
          delete cached.basePatch;
          localStorage.setItem(cacheKey(user.uid), JSON.stringify(cached));
        }
      } else localStorage.setItem('waqti-v1', JSON.stringify(state));
      return true;
    } catch {
      error = 'تعذر الحفظ على الجهاز. صدّر نسخة احتياطية الآن.';
      badge();
      return false;
    }
  }
  function apply(s) {
    validate(s);
    applying = true;
    try {
      state = structuredClone(s);
      const migrated = SlotTools.migrate(state),
        seeded = installDefaultTafsir(state);
      prayerCache.clear();
      setupCalendar();
      if (followToday) {
        date = activeDay();
        prayer = currentPrayer();
      }
      lastActiveDay = activeDay();
      lastCivilDay = zonedDate();
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      render();
      return seeded || migrated;
    } finally {
      applying = false;
    }
  }
  function badge() {
    const el = $('#syncStatus');
    if (el) {
      el.textContent = error ? '⚠ ' + error : status;
      el.title = el.textContent;
    }
    const b = $('#accountButton');
    if (b) b.textContent = user ? 'الحساب والمزامنة' : 'دخول / إنشاء حساب';
  }
  function report(message) {
    status = message;
    badge();
    if (view === 'account') renderAccount();
  }
  function message(e) {
    const c = e?.code || '';
    if (/permission.denied|PERMISSION_DENIED/i.test(c + ' ' + e?.message))
      return 'المزامنة ممنوعة: انشر قواعد Realtime Database الصحيحة.';
    return (
      {
        'auth/operation-not-allowed':
          'فعّل Email/Password من Authentication في Firebase.',
        'auth/email-already-in-use':
          'هذا الإيميل مسجل بالفعل. استخدم تسجيل الدخول.',
        'auth/invalid-email': 'اكتب إيميلًا صحيحًا.',
        'auth/weak-password': 'كلمة المرور ضعيفة؛ استخدم ٨ أحرف أو أكثر.',
        'auth/password-does-not-meet-requirements':
          'كلمة المرور لا توافق سياسة المشروع. استخدم أحرفًا كبيرة وصغيرة وأرقامًا ورمزًا.',
        'auth/invalid-credential': 'الإيميل أو كلمة المرور غير صحيحين.',
        'auth/wrong-password': 'الإيميل أو كلمة المرور غير صحيحين.',
        'auth/user-not-found': 'الإيميل أو كلمة المرور غير صحيحين.',
        'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
        'auth/network-request-failed':
          'تعذر الاتصال. راجع الإنترنت وحاول مجددًا.',
        'auth/unauthorized-domain':
          'أضف نطاق التطبيق إلى Authorized domains في Firebase.',
        'auth/invalid-api-key': 'راجع إعدادات Firebase ومفتاح التطبيق.',
        'auth/user-disabled': 'هذا الحساب معطّل.',
      }[c] || 'تعذر إكمال العملية. راجع الاتصال وإعدادات Firebase.'
    );
  }
  function decode(r) {
    if (!r) return null;
    if (
      !Number.isInteger(r.revision) ||
      r.revision < 1 ||
      typeof r.payload !== 'string'
    )
      throw Error('bad record');
    let s = JSON.parse(r.payload);
    validate(s);
    return s;
  }
  function normalized(s) {
    const next = structuredClone(s);
    SlotTools.migrate(next);
    // Empty plans on old clients are a known base, so first additions merge by
    // prayer and action ID rather than replacing another device's whole plan.
    next.prayerActionPlans = Object.fromEntries(
      [0, 1, 2, 3, 4].map((p) => [p, next.prayerActionPlans?.[p] || []]),
    );
    return next;
  }
  function reconciliation(
    cloud,
    local = state,
    base = baseState,
    known = baseKnown,
  ) {
    const result = WaqtiSyncMerge.merge(
      known ? normalized(base) : null,
      normalized(local),
      normalized(cloud),
      { known, choices: mergeChoices },
    );
    validate(result.state);
    return result;
  }
  function editing() {
    return (
      !!document.querySelector('dialog[open]') ||
      !!document.activeElement?.matches(
        'textarea, input:not([type=search]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), select:not(#projectSelect)',
      )
    );
  }
  function acknowledge(cloud, revision, next) {
    baseState = structuredClone(cloud);
    baseKnown = true;
    baseRevision = revision;
    conflict = false;
    conflicts = [];
    mergeChoices.clear();
    error = '';
    deferred = false;
    if (!WaqtiSyncMerge.same(state, next)) apply(next);
    // Migrated slot indices/markers must still be published to the server.
    dirty = !WaqtiSyncMerge.same(state, cloud);
    persist();
    report(
      dirty
        ? 'جاري مزامنة التغييرات…'
        : online
          ? '● تمت المزامنة'
          : 'نسخة الحساب محفوظة على الجهاز',
    );
    schedule();
  }
  function receive(r) {
    if ((r?.revision || 0) < Math.max(baseRevision, remote?.revision || 0))
      return;
    const initialLoad = !ready && !hasCachedData;
    remote = r;
    ready = true;
    $('#app').inert = false;
    let rev = r?.revision || 0;
    if (writing) return;
    try {
      const cloud = decode(r) || fresh();
      if (WaqtiSyncMerge.same(state, cloud)) {
        acknowledge(cloud, rev, cloud);
        return;
      }
      if (editing() && !initialLoad) {
        deferred = true;
        report(
          dirty
            ? 'جاري إرسال تغييراتك؛ ستظهر التحديثات بعد إنهاء التعديل المفتوح'
            : 'تغييراتك محفوظة؛ ستظهر التحديثات بعد إنهاء التعديل المفتوح',
        );
        return;
      }
      if (!dirty) {
        acknowledge(cloud, rev, cloud);
        return;
      }
      // Old dirty caches have no base. The matching revision recovers it safely;
      // otherwise only explicit per-field choices can reconcile unknown edits.
      if (!baseKnown && rev === baseRevision) {
        baseState = structuredClone(cloud);
        baseKnown = true;
      }
      const merged = reconciliation(cloud);
      if (merged.conflicts.length) {
        conflicts = merged.conflicts;
        conflict = true;
        deferred = false;
        persist();
        report(
          `تعديلان على ${conflicts.length} بند؛ اختر لكل بند من الحساب والمزامنة.`,
        );
        return;
      }
      acknowledge(cloud, rev, merged.state);
    } catch {
      error =
        'تعذر قراءة نسخة الحساب. احتفظ بنسختك المحلية وراجع ملف البيانات.';
      badge();
      if (view === 'account') renderAccount();
    }
  }
  function schedule(delay = 180) {
    clearTimeout(timer);
    if (user && ready && dirty && !conflict && online && !writing)
      timer = setTimeout(flush, delay);
  }
  async function flush() {
    if (!user || !ready || !dirty || conflict || !online || writing)
      return false;
    const ticket = epoch,
      uid = user.uid,
      ref = recordRef,
      expected = baseRevision,
      local = structuredClone(state),
      base = baseState,
      known = baseKnown;
    const payload = JSON.stringify(local);
    if (payload.length > 4000000) {
      error = 'البيانات تجاوزت حد المزامنة (٤ ملايين حرف). صدّر نسخة احتياطية.';
      badge();
      return false;
    }
    writing = true;
    error = '';
    report('جاري المزامنة…');
    try {
      const result = await ref.transaction(
        (current) => {
          if (!current && expected > 0) return;
          const revision = current?.revision || 0;
          const cloud = decode(current) || fresh();
          const merged =
            !known && revision === expected
              ? { state: local, conflicts: [] }
              : reconciliation(cloud, local, base, known);
          if (merged.conflicts.length) return;
          const mergedPayload = JSON.stringify(merged.state);
          if (mergedPayload.length > 4000000) throw Error('sync-payload-limit');
          return {
            payload: mergedPayload,
            revision: revision + 1,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
          };
        },
        undefined,
        false,
      );
      if (ticket !== epoch || user?.uid !== uid) return false;
      writing = false;
      if (!result.committed) {
        const current = result.snapshot.val();
        if (!current && expected > 0) {
          refreshRemote();
          return false;
        }
        receive(current);
        return false;
      }
      const committed = result.snapshot.val();
      // Rebase edits made while the transaction was in flight onto its exact
      // submitted local state, not onto an older server snapshot.
      baseState = local;
      baseKnown = true;
      baseRevision = committed.revision;
      // Every edit in local is now acknowledged, even if remote-only changes
      // cannot be rendered yet because an editor or focused field is still open.
      // Only edits made after this submitted snapshot need another upload.
      dirty = !WaqtiSyncMerge.same(state, local);
      retryDelay = 500;
      persist();
      let latest = remote;
      if (latest && (latest.revision || 0) > baseRevision) {
        // Integrate our commit first, then a newer event; this preserves the tail.
        receive(committed);
        receive(latest);
      } else {
        receive(committed);
      }
      // receive may defer rendering an editor's incoming changes; it must not
      // strand edits saved while this write was in flight.
      schedule();
      return true;
    } catch (e) {
      if (ticket === epoch) {
        writing = false;
        error = message(e);
        persist();
        badge();
        if (view === 'account') renderAccount();
        schedule(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
      return false;
    }
  }
  function changed() {
    if (applying) return;
    if (user) {
      dirty = !baseKnown || !WaqtiSyncMerge.same(state, baseState);
      editSequence++;
      persist();
      report(
        !dirty
          ? online
            ? '● تمت المزامنة'
            : 'نسخة الحساب محفوظة على الجهاز'
          : conflict
            ? 'يوجد تعارض؛ اختر نسخة من الحساب والمزامنة'
            : online
              ? 'جاري المزامنة…'
              : 'محفوظ محليًا؛ في انتظار الاتصال',
      );
      schedule();
      if (conflict) setTimeout(drain, 0);
    } else {
      persist();
      report('● محفوظ على هذا الجهاز — دون حساب');
    }
  }
  function attach(u) {
    hasCachedData = false;
    epoch++;
    clearTimeout(timer);
    if (unsubscribe) unsubscribe();
    if (connectionRef && connectionHandler)
      connectionRef.off('value', connectionHandler);
    unsubscribe = null;
    recordRef = null;
    connectionRef = null;
    connectionHandler = null;
    user = u;
    baseRevision = 0;
    baseState = null;
    baseKnown = false;
    deferred = false;
    conflicts = [];
    mergeChoices.clear();
    dirty = false;
    ready = false;
    writing = false;
    online = false;
    conflict = false;
    remote = null;
    error = '';
    authReady = true;
    if (view === 'followUp') FollowUp.render();
    editSequence = 0;
    if (!u) {
      if (apply(readGuest())) persist();
      $('#app').inert = false;
      report('● محفوظ على هذا الجهاز — دون حساب');
      return;
    }
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey(u.uid)));
      if (cached) {
        validate(cached.state);
        if (!Number.isInteger(cached.baseRevision) || cached.baseRevision < 0)
          throw Error();
        baseRevision = cached.baseRevision;
        dirty = !!cached.dirty;
        if (!dirty) {
          baseState = structuredClone(cached.state);
          baseKnown = true;
        } else if (Array.isArray(cached.basePatch)) {
          try {
            baseState = WaqtiSyncMerge.patch(cached.state, cached.basePatch);
            validate(baseState);
            baseKnown = true;
          } catch {
            baseState = null;
            baseKnown = false;
          }
        }
      }
    } catch {
      cached = null;
      baseRevision = 0;
      dirty = false;
      baseState = null;
      baseKnown = false;
    }
    apply(cached?.state || fresh());
    hasCachedData = !!cached;
    report('جاري تحميل بيانات الحساب…');
    const ticket = epoch;
    recordRef = db.ref('waqti/users/' + u.uid);
    let handler = (snap) => {
      if (ticket === epoch) receive(snap.val());
    };
    recordRef.on('value', handler, (e) => {
      if (ticket !== epoch) return;
      $('#app').inert = false;
      error = message(e);
      badge();
      if (view === 'account') renderAccount();
    });
    const attached = recordRef;
    unsubscribe = () => attached.off('value', handler);
    connectionRef = db.ref('.info/connected');
    connectionHandler = (snap) => {
      if (ticket !== epoch) return;
      online = snap.val() === true;
      if (online) {
        if (ready) {
          if (!dirty && !conflict) report('● تمت المزامنة');
          schedule();
        }
      } else {
        report(
          dirty
            ? 'محفوظ محليًا؛ في انتظار الاتصال'
            : 'غير متصل — نسخة الحساب على الجهاز',
        );
      }
    };
    connectionRef.on('value', connectionHandler);
  }
  async function refreshRemote() {
    if (!user || !recordRef) return;
    const ticket = epoch,
      ref = recordRef;
    try {
      const snapshot = await (ref.get ? ref.get() : ref.once('value'));
      if (ticket === epoch) receive(snapshot.val());
    } catch (e) {
      if (ticket === epoch) {
        error = message(e);
        badge();
        schedule(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    }
  }
  function drain() {
    if (!user || writing || editing()) return;
    if (deferred || conflict) receive(remote);
    schedule();
  }
  function conflictPanel() {
    const names = new Map(
      [
        ...(state.projects || []),
        ...(state.actions || []),
        ...(state.repeat || []),
        ...(state.taskInbox || []),
        ...Object.values(state.sunsetDays || {}).flatMap((day) => [
          ...(day.tasks || []),
          ...(day.repeatSnapshot || []),
        ]),
      ].map((item) => [item.id, item.name]),
    );
    const labels = {
      taskInbox: 'مهمة',
      repeat: 'مهمة متكررة',
      projects: 'مشروع',
      actions: 'فعل',
      name: 'الاسم',
      description: 'الوصف',
      priority: 'الأولوية',
      expectedSlots: 'الخانات المتوقعة',
      completedSlotCount: 'الخانات المنجزة',
      taskProgress: 'الخانات المنجزة',
      executionHead:
        'تعارض نقل أو تسجيل المهمة — اختر التنفيذ الحالي؛ السجلان محفوظان',
      executionEvents: 'سجل التنفيذ والنقل',
      executionBase: 'التقدم والموعد قبل أول نقل',
      projectIds: 'المشاريع',
      taskOrder: 'الترتيب',
      subtaskPosition: 'الترتيب',
      days: 'أيام التكرار',
      prayers: 'الفترات',
      checks: 'تسجيل الصلاة',
      prayerTasks: 'مهام الصلاة',
      prayerActionPlans: 'الأفعال المخططة للصلوات',
      offsets: 'تعديل المواقيت',
      times: 'المواقيت',
      sunsetDays: 'اليوم',
      tasks: 'المهمة',
    };
    const label = (entry) =>
      entry.path
        .map((part) => {
          if (typeof part === 'object') return names.get(part.id) || 'مهمة';
          if (part === '$actual') return 'ما فعلته';
          if (part === '$planned') return 'الفعل المطلوب';
          if (part === '$outcome') return 'نتيجة المهمة';
          if (part === '$order') return 'ترتيب المهام';
          const index = entry.path.indexOf(part);
          if (['$actual', '$planned'].includes(entry.path[index - 1]))
            return time(+part);
          return (
            names.get(part) ||
            labels[part] ||
            (/^\d{4}-\d{2}-\d{2}$/.test(part) ? part : '')
          );
        })
        .filter(Boolean)
        .join(' · ');
    const value = (entry) => {
      if (!entry.exists) return 'محذوف / غير مسجل';
      const v = entry.value;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('done' in v || 'failed' in v)
          return v.done ? 'فعلتها' : v.failed ? 'لم أفعلها' : 'غير مسجلة';
        if (
          'slots' in v ||
          'planned' in v ||
          'actualNotes' in v ||
          'plannedNotes' in v
        )
          return (
            [
              names.get(v.slots || v.planned) || '',
              v.actualNotes || v.plannedNotes || '',
              v.actualTasks?.name || '',
            ]
              .filter(Boolean)
              .join(' · ') || 'بدون فعل'
          );
        return v.name || 'تعديل مختلف';
      }
      if (Array.isArray(v))
        return (
          v
            .map((item) => names.get(item) || item?.name || String(item))
            .join('، ') || 'بدون اختيار'
        );
      return typeof v === 'boolean' ? (v ? 'نعم' : 'لا') : String(v);
    };
    const executionChoice = (entry, side) => {
      if (entry.path.at(-1) !== 'executionHead' || !side.exists)
        return value(side);
      const record = (snapshot) =>
        entry.path
          .slice(0, -1)
          .reduce(
            (current, part) =>
              typeof part === 'object'
                ? current?.find?.((t) => t.id === part.id)
                : current?.[part],
            snapshot,
          );
      let cloud;
      try {
        cloud = JSON.parse(remote?.payload || '{}');
      } catch {
        cloud = {};
      }
      const execution = [record(state), record(cloud)]
        .map((t) => t?.executionEvents?.[side.value]?.value)
        .find(Boolean);
      if (!execution) return 'تنفيذ غير متاح — احتفظ بنسخة احتياطية';
      const prayerLabels = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
      return `${execution.date || 'تحتاج توزيعًا'} · ${execution.prayers.map((p) => prayerLabels[p]).join('، ') || 'بدون فترة'} · ${execution.progress} خانة · ${{ pending: 'قيد التنفيذ', failed: 'لم تُنجز', done: 'أُنجزت' }[execution.status]}`;
    };
    return `<div class="conflict-box"><h2>تعديلان على نفس البند</h2><p>اختر لكل بند ما تريد الاحتفاظ به. بقية تسجيلات الجهازين تُدمج تلقائيًا.</p><button id="backupConflict" class="secondary">تنزيل نسختي الحالية</button><div class="sync-conflicts">${conflicts.map((entry, index) => `<section><h3>${esc(label(entry) || 'بيانات الحساب')}</h3><button type="button" class="secondary" data-sync-choice="local" data-sync-index="${index}">هذا الجهاز: ${esc(executionChoice(entry, entry.local).slice(0, 200))}</button><button type="button" class="secondary" data-sync-choice="remote" data-sync-index="${index}">الحساب: ${esc(executionChoice(entry, entry.remote).slice(0, 200))}</button></section>`).join('')}</div><details><summary>استبدال نسخة كاملة (خيارات متقدمة)</summary><button id="useCloud" class="secondary">استخدام نسخة الحساب بالكامل</button><button id="useLocal" class="secondary">اعتماد نسختي الحالية بالكامل</button></details></div>`;
  }
  function backupCurrent() {
    let a = document.createElement('a'),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(state, null, 2)], {
          type: 'application/json',
        }),
      );
    a.href = url;
    a.download = 'waqti-before-conflict-' + date + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderAccount() {
    app.innerHTML = `<h1>الحساب والمزامنة</h1><p>نفس يومك ومهامك على أجهزتك، بإيميل وباسورد.</p><section class="panel"><p class="sync-message" role="status">${esc(error || status)}</p>${!user ? `<div class="auth-tabs"><button id="loginMode" class="${mode === 'login' ? 'primary' : 'secondary'}">تسجيل الدخول</button><button id="registerMode" class="${mode === 'register' ? 'primary' : 'secondary'}">إنشاء حساب</button></div><form id="authForm" class="auth-form"><label class="field">الإيميل<input name="email" type="email" autocomplete="email" dir="ltr" required placeholder="name@example.com"></label><label class="field">كلمة المرور<input name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" ${mode === 'register' ? 'minlength="8"' : ''} required dir="ltr"></label>${mode === 'register' ? '<label class="field">تأكيد كلمة المرور<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required dir="ltr"></label>' : ''}<button class="primary" ${busy || !authReady ? 'disabled' : ''}>${busy ? 'جاري التنفيذ…' : mode === 'register' ? 'إنشاء الحساب' : 'دخول'}</button><button type="button" id="resetPassword" class="secondary" ${busy || !authReady ? 'disabled' : ''}>نسيت كلمة المرور</button><p id="authFeedback" role="status"></p></form><p class="hint">بياناتك الحالية تظل على الجهاز. بعد الدخول يمكنك نقلها إلى حسابك من هنا.</p>` : `<h2 dir="ltr" style="overflow-wrap:anywhere">${esc(user.email || '')}</h2><p>تسجيل الدخول محفوظ على هذا المتصفح. كلمة المرور تُدار بواسطة Firebase Authentication ولا تُحفظ داخل بياناتك.</p>${conflict ? conflictPanel() : ''}<div class="form"><button id="retrySync" class="primary">إعادة الاتصال والمزامنة</button><button id="importGuest" class="secondary" ${!ready || writing ? 'disabled' : ''}>نقل بيانات الجهاز السابقة للحساب</button><button id="logout" class="secondary" ${writing ? 'disabled' : ''}>تسجيل الخروج</button></div><p class="hint">نقل بيانات الجهاز يستبدل محتوى الحساب بعد تأكيدك. التعديلات غير المرسلة تبقى محفوظة لهذا الحساب على هذا الجهاز.</p>`}</section><section class="panel"><h2>تشغيل المزامنة لأول مرة</h2><p>فعّل Email/Password في Firebase Authentication، وانشر قواعد Realtime Database المرفقة. كل حساب يصل إلى بياناته فقط.</p></section>`;
    if (!user) {
      $('#loginMode').onclick = () => {
        mode = 'login';
        renderAccount();
      };
      $('#registerMode').onclick = () => {
        mode = 'register';
        renderAccount();
      };
      $('#authForm').onsubmit = async (e) => {
        e.preventDefault();
        if (busy || !authReady) return;
        let f = e.target.elements,
          email = f.email.value.trim(),
          password = f.password.value;
        if (mode === 'register' && password !== f.confirmPassword.value) {
          $('#authFeedback').textContent = 'كلمتا المرور غير متطابقتين';
          return;
        }
        busy = true;
        error = '';
        const buttons = e.target.querySelectorAll('button');
        buttons.forEach((b) => (b.disabled = true));
        try {
          await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          if (mode === 'register')
            await auth.createUserWithEmailAndPassword(email, password);
          else await auth.signInWithEmailAndPassword(email, password);
          toast('تم تسجيل الدخول');
        } catch (e) {
          error = message(e);
          badge();
          const feedback = $('#authFeedback');
          if (feedback) feedback.textContent = error;
        } finally {
          busy = false;
          buttons.forEach((b) => (b.disabled = false));
        }
      };
      $('#resetPassword').onclick = async () => {
        const email = $('#authForm').elements.email.value.trim();
        if (!email) {
          $('#authFeedback').textContent = 'اكتب الإيميل أولًا';
          return;
        }
        if (busy) return;
        busy = true;
        $('#resetPassword').disabled = true;
        try {
          await auth.sendPasswordResetEmail(email);
          $('#authFeedback').textContent =
            'إذا كان الإيميل مسجلًا، ستصلك رسالة لإعادة تعيين كلمة المرور.';
        } catch (e) {
          $('#authFeedback').textContent = message(e);
        } finally {
          busy = false;
          const b = $('#resetPassword');
          if (b) b.disabled = false;
        }
      };
    } else {
      $('#logout').onclick = async () => {
        if (writing) return;
        if (
          dirty &&
          !confirm(
            'توجد تعديلات لم تُزامن. ستظل محفوظة لهذا الحساب على الجهاز لتُرسل عند الدخول مجددًا. تسجيل الخروج؟',
          )
        )
          return;
        try {
          await auth.signOut();
        } catch (e) {
          error = message(e);
          badge();
        }
      };
      $('#retrySync').onclick = () => {
        if (writing) return;
        persist();
        attach(auth.currentUser);
      };
      $('#importGuest').onclick = () => {
        if (!ready || writing) return;
        if (
          !confirm(
            'نقل بيانات الجهاز السابقة واستبدال بيانات هذا الحساب بها؟ يمكنك تصدير نسخة من الإعدادات أولًا.',
          )
        )
          return;
        const guest = readGuest();
        apply(guest);
        changed();
        renderAccount();
      };
      if (conflict) {
        $('#backupConflict').onclick = backupCurrent;
        app.querySelectorAll('[data-sync-choice]').forEach(
          (button) =>
            (button.onclick = () => {
              const item = conflicts[+button.dataset.syncIndex];
              if (!item) return;
              mergeChoices.set(item.token, button.dataset.syncChoice);
              receive(remote);
            }),
        );
        $('#useCloud').onclick = () => {
          if (!confirm('استخدام نسخة الحساب بدل تعديلات هذا الجهاز؟')) return;
          try {
            const s = decode(remote) || fresh();
            acknowledge(s, remote?.revision || 0, s);
          } catch {
            error = 'نسخة الحساب غير صالحة';
            badge();
          }
        };
        $('#useLocal').onclick = () => {
          if (!confirm('اعتماد نسخة هذا الجهاز بدل نسخة الحساب؟')) return;
          baseRevision = remote?.revision || 0;
          baseState = decode(remote) || fresh();
          baseKnown = true;
          conflict = false;
          conflicts = [];
          mergeChoices.clear();
          deferred = false;
          dirty = true;
          persist();
          report('جاري المزامنة…');
          schedule();
        };
      }
    }
  }
  window.WaqtiSync = {
    changed,
    referenceOwner: () => authReady ? (user?.uid || 'guest') : null,
    renderAccount,
    canExport: () => authReady && (!user || ready || hasCachedData),
  };
  $('#accountButton').onclick = () => {
    view = 'account';
    render();
  };
  try {
    firebase.initializeApp(config);
    auth = firebase.auth();
    auth.languageCode = 'ar';
    db = firebase.database();
    auth.onAuthStateChanged(attach, (e) => {
      error = message(e);
      badge();
    });
  } catch (e) {
    error = 'تعذر تشغيل Firebase. حدّث الصفحة وحاول مجددًا.';
    badge();
  }
  const resume = () => {
    if (!document.hidden) {
      refreshRemote();
      drain();
    }
  };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persist();
      flush();
    } else resume();
  });
  document.addEventListener('close', () => setTimeout(drain, 0), true);
  document.addEventListener('focusout', () => {
    if (deferred) setTimeout(drain, 0);
  });
  window.addEventListener('pagehide', () => {
    persist();
    flush();
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      persist();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  badge();
})();

