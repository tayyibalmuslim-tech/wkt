/* Task planning shares the existing sunset-day storage and Firebase snapshot. */
const priorityNames = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' };
function taskDescription(t) {
  return t?.description
    ? `<small class="task-inline-description">${esc(t.description)}</small>`
    : '';
}
function taskPriority(t) {
  return { high: 1, medium: 3, low: 5 }[t.priority] || Number(t.priority) || 3;
}
function normalizeTaskPriorities() {
  let changed = false;
  const lists = [
    state.taskInbox || [],
    state.repeat || [],
    ...Object.values(state.sunsetDays || {}).flatMap((d) => [
      d.tasks || [],
      d.repeatSnapshot || [],
    ]),
  ];
  for (const list of lists)
    for (const t of list) {
      const value = taskPriority(t);
      if (t.priority !== value) {
        t.priority = value;
        changed = true;
      }
    }
  if (changed) save();
}
function actualTasksForSlot(key, n) {
  const p = prayerOrder.find((p) => periodSlots(key, p).includes(n)),
    entries = progressEntries();
  const available = allTasksOn(key).filter((t) => {
    if (t.historical) return false;
    if (!taskInPeriod(t, p) || taskCompletion(t, entries) >= 100) return false;
    // A completed ancestor also finishes its branches without changing their records.
    const seen = new Set([taskIdentity(t)]);
    let parent = parentTask(t, entries);
    while (parent && !seen.has(taskIdentity(parent))) {
      if (outcome(parent) === 'done') return false;
      seen.add(taskIdentity(parent));
      parent = parentTask(parent, entries);
    }
    return true;
  });
  return sortedTasks(available).map((t) => ({
    ...t,
    parentName: t.parentId ? mainTask(t, entries).name : '',
  }));
}

// Cache derived reads only during one synchronous view/editor update. A save clears
// the scope, and finally releases it, so edits, imports and remote snapshots stay fresh.
let taskReadCache = null;
function taskReadScope(fn) {
  return function (...args) {
    if (taskReadCache) return fn.apply(this, args);
    taskReadCache = new Map();
    try {
      return fn.apply(this, args);
    } finally {
      taskReadCache = null;
    }
  };
}
function cachedTaskRead(key, read) {
  if (!taskReadCache) return read();
  if (!taskReadCache.has(key)) taskReadCache.set(key, read());
  return taskReadCache.get(key);
}
function invalidateTaskReads() {
  taskReadCache?.clear();
}
function taskEntryIndex(entries) {
  const indexes = cachedTaskRead('indexes', () => new WeakMap());
  if (indexes.has(entries)) return indexes.get(entries);
  const index = {
    byId: new Map(),
    byIdentity: new Map(),
    children: new Map(),
    datedChildren: new Map(),
    order: new WeakMap(),
    roots: new WeakMap(),
  };
  for (const [position, t] of entries.entries()) {
    index.order.set(t, position);
    if (!index.byId.has(t.id)) index.byId.set(t.id, t);
    const identity = taskIdentity(t);
    if (!index.byIdentity.has(identity)) index.byIdentity.set(identity, t);
    if (t.parentId) {
      const map =
        t.parentDate === undefined ? index.children : index.datedChildren;
      const key =
        t.parentDate === undefined
          ? t.parentId
          : taskIdentity({ id: t.parentId, date: t.parentDate });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
  }
  indexes.set(entries, index);
  return index;
}

// Each final subtask has equal weight; ancestors never count a second time.
function progressEntries() {
  return cachedTaskRead('progress:' + date, () => {
    const entries = [...taskEntries()],
      seen = new Set(entries.map(taskIdentity));
    for (const t of allTasksOn(date)) {
      if (t.historical) continue;
      const key = taskIdentity(t);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(t);
      }
    }
    return entries;
  });
}
function parentTask(t, entries = progressEntries()) {
  if (!t?.parentId) return null;
  if (taskReadCache) {
    const index = taskEntryIndex(entries);
    return t.parentDate === undefined
      ? index.byId.get(t.parentId)
      : index.byIdentity.get(
          taskIdentity({ id: t.parentId, date: t.parentDate }),
        );
  }
  return entries.find(
    (p) =>
      p.id === t.parentId &&
      (t.parentDate === undefined ||
        (p.executionBase?.date ?? p.date ?? '') === t.parentDate),
  );
}
function mainTask(t, entries) {
  if (!t?.parentId) return t;
  entries ??= progressEntries();
  const roots = taskReadCache ? taskEntryIndex(entries).roots : null;
  if (roots?.has(t)) return roots.get(t);
  const seen = new Set();
  let current = t;
  while (current?.parentId && !seen.has(taskIdentity(current))) {
    seen.add(taskIdentity(current));
    const parent = parentTask(current, entries);
    if (!parent) {
      current = {
        id: current.parentId,
        date: current.parentDate || '',
        name: current.parentName || 'مهمة رئيسية محذوفة',
        projectId: current.projectId,
        projectIds: current.projectIds,
        virtual: true,
      };
      break;
    }
    current = parent;
  }
  roots?.set(t, current);
  return current;
}
function taskGroups(list) {
  const entries = progressEntries(),
    groups = new Map();
  const historicalParents = new Set(
    list.filter((t) => t.historical).map((t) => t.id),
  );
  for (const t of list) {
    if (t.historical) {
      groups.set(taskIdentity(t), t);
      continue;
    }
    const main = mainTask(t, entries);
    if (main.executionBase && historicalParents.has(main.id)) {
      groups.set(taskIdentity(t), t);
      continue;
    }
    groups.set(taskIdentity(main), main);
  }
  return sortedTasks([...groups.values()]);
}
function openTaskManager(t) {
  if (!t) return;
  const main = mainTask(t);
  if (!main.virtual) {
    openPlannerEditor(main);
    return;
  }
  let dialog = $('#orphanTasks');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'orphanTasks';
    document.body.append(dialog);
  }
  dialog.innerHTML = `<div class="dialog-head"><h2>${esc(main.name)}</h2><button type="button" aria-label="إغلاق">×</button></div><p class="hint">المهمة الرئيسية حُذفت سابقًا؛ فروعها محفوظة هنا.</p>${childTasks(
    main,
  )
    .map((c) => taskCard(c))
    .join('')}`;
  dialog.querySelector('button').onclick = () => dialog.close();
  bindTaskCards(dialog, true);
  dialog.showModal();
}
// projectId remains the legacy primary link; projectIds contains all memberships.
function taskProjectIds(t) {
  return Array.isArray(t?.projectIds)
    ? t.projectIds
    : t?.projectId
      ? [t.projectId]
      : [];
}
function effectiveProjectIds(t, entries) {
  if (!t?.parentId || t.projectOverride === true) return taskProjectIds(t);
  entries ??= progressEntries();
  if (taskReadCache) {
    const overrides = cachedTaskRead('project-overrides', () => new WeakMap());
    if (!overrides.has(entries))
      overrides.set(
        entries,
        entries.some((entry) => entry.projectOverride === true),
      );
    if (!overrides.get(entries))
      return taskProjectIds(mainTask(t, entries) || t);
  }
  const seen = new Set();
  let current = t;
  while (current?.parentId && current.projectOverride !== true) {
    const key = taskIdentity(current);
    if (seen.has(key)) break;
    seen.add(key);
    const parent = parentTask(current, entries);
    if (!parent) break;
    current = parent;
  }
  return taskProjectIds(current);
}
function effectiveProjectId(t) {
  return effectiveProjectIds(t)[0] || '';
}
function taskInProject(t, id, entries = progressEntries()) {
  // effectiveProjectIds already handles inheritance. An explicit child override
  // must not be undone by also adding all of its ancestors' projects.
  return effectiveProjectIds(t, entries).includes(id);
}
function setTaskProjects(t, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  t.projectIds = unique;
  t.projectId = unique[0] || '';
  return t;
}
function taskIdentity(t) {
  if (t.historical)
    return JSON.stringify([t.id, t.date, 'history', t.historicalEvent]);
  return JSON.stringify([t.id, t.executionBase?.date ?? t.date ?? '']);
}
function childTasks(t, entries = progressEntries()) {
  if (t.historical) return [];
  let children;
  if (!taskReadCache)
    children = entries.filter(
      (c) =>
        c.parentId === t.id &&
        (c.parentDate === undefined ||
          c.parentDate === (t.executionBase?.date ?? t.date ?? '')),
    );
  else {
    const index = taskEntryIndex(entries),
      dated = index.datedChildren.get(taskIdentity(t)) || [],
      legacy = index.children.get(t.id) || [];
    children = [...dated, ...legacy].sort(
      (a, b) => index.order.get(a) - index.order.get(b),
    );
  }
  return children.sort(
    (a, b) => (a.subtaskPosition ?? Infinity) - (b.subtaskPosition ?? Infinity),
  );
}
function moveSubtask(t, position) {
  const parent = parentTask(t);
  if (!parent) return false;
  const siblings = childTasks(parent),
    index = siblings.findIndex((c) => taskIdentity(c) === taskIdentity(t));
  if (
    !Number.isInteger(position) ||
    position < 1 ||
    position > siblings.length ||
    index < 0
  )
    return false;
  siblings.splice(index, 1);
  siblings.splice(position - 1, 0, t);
  siblings.forEach((child, i) => {
    const sourceDate = child.executionBase?.date ?? child.date;
    const records = sourceDate
      ? [
          ...(state.sunsetDays[sourceDate]?.tasks || []),
          ...(state.sunsetDays[sourceDate]?.repeatSnapshot || []),
          ...(state.repeat || []),
        ]
      : state.taskInbox || [];
    const stored = records.find((record) => record.id === child.id);
    if (stored) stored.subtaskPosition = i + 1;
  });
  save();
  return true;
}
function progressLeaves(roots, entries = progressEntries(), projectId = null) {
  const leaves = new Map();
  function visit(t, path = new Set(), inheritedDone = false) {
    const key = taskIdentity(t);
    if (path.has(key)) return;
    const nextPath = new Set(path);
    nextPath.add(key);
    const done = inheritedDone || outcome(t) === 'done';
    const children = childTasks(t, entries);
    if (children.length) children.forEach((c) => visit(c, nextPath, done));
    else if (
      !projectId ||
      effectiveProjectIds(t, entries).includes(projectId)
    ) {
      const old = leaves.get(key);
      leaves.set(key, { ...t, rollupDone: done || old?.rollupDone || false });
    }
  }
  roots.forEach((t) => visit(t));
  return [...leaves.values()];
}
// Parent estimates are derived from final descendants; never count an ancestor twice.
function taskExpectedSlots(t) {
  if (!t?.id) return t?.expectedSlots || 0;
  return cachedTaskRead('taskExpectedSlots:' + taskIdentity(t), () =>
    progressLeaves([t]).reduce(
      (total, leaf) => total + (leaf.expectedSlots || 0),
      0,
    ),
  );
}
function leafCompletion(t) {
  return t.rollupDone || outcome(t) === 'done'
    ? 100
    : t.expectedSlots > 0
      ? Math.min(100, (completedSlots(t) / t.expectedSlots) * 100)
      : 0;
}
function averageCompletion(list) {
  return list.length
    ? list.reduce((sum, t) => sum + leafCompletion(t), 0) / list.length
    : 0;
}
function taskCompletion(t, entries) {
  return outcome(t) === 'done'
    ? 100
    : averageCompletion(progressLeaves([t], entries));
}
function projectSlotTotals(id) {
  return cachedTaskRead('projectSlotTotals:' + id, () => {
    const entries = progressEntries();
    const leaves = progressLeaves(
      entries.filter((t) => effectiveProjectIds(t, entries).includes(id)),
      entries,
      id,
    );
    let expected = 0,
      completed = 0;
    for (const task of leaves) {
      const slots = task.expectedSlots || 0;
      if (slots <= 0) continue;
      expected += slots;
      completed +=
        task.rollupDone || outcome(task) === 'done'
          ? slots
          : Math.min(slots, completedSlots(task));
    }
    return { expected, completed };
  });
}
function projectCompletion(id) {
  const { expected, completed } = projectSlotTotals(id);
  return expected ? (completed / expected) * 100 : 0;
}
function projectSlotsLabel(id) {
  const { expected, completed } = projectSlotTotals(id);
  return `${completed}/${expected} خانة`;
}
function percentLabel(value) {
  return Number(value.toFixed(1)) + '٪';
}
function taskProgressBar(t) {
  const value = taskCompletion(t);
  return `<progress class="task-progress-bar" data-completion-id="${esc(t.id || '')}" data-completion-date="${esc(t.date || '')}" value="${value}" max="100" aria-label="إنجاز ${esc(t.name)}: ${percentLabel(value)}"></progress>`;
}
function completionField(t) {
  return `<div class="field editor-completion">نسبة الإنجاز: <strong data-completion-label="${esc(t.id || '')}" data-completion-date="${esc(t.date || '')}">${percentLabel(taskCompletion(t))}</strong>${taskProgressBar(t)}<details class="editor-field-help"><summary>كيف تُحسب النسبة؟</summary><p class="hint">تُحسب من المهام الفرعية النهائية، أو من الخانات المنجزة ÷ المتوقعة عند عدم وجود فروع. علامة صح تجعل الإنجاز ١٠٠٪، وإلغاؤها يعيد النسبة المحسوبة.</p></details></div>`;
}
function taskPeriods(t) {
  return Array.isArray(t.prayers)
    ? t.prayers
    : Number.isInteger(t.prayer)
      ? [t.prayer]
      : [];
}
function taskInPeriod(t, p) {
  return taskPeriods(t).includes(p);
}
function taskPeriodLabel(t) {
  return (
    taskPeriods(t)
      .map((p) => names[p])
      .join('، ') || 'بدون فترة محددة'
  );
}
function validTaskPeriods(t) {
  if (
    !t ||
    typeof t !== 'object' ||
    (t.prayers !== undefined && !Array.isArray(t.prayers))
  )
    return false;
  return Array.isArray(t.prayers)
    ? t.prayers.every((p) => Number.isInteger(p) && p >= 0 && p < 5) &&
        new Set(t.prayers).size === t.prayers.length
    : t.prayer === null ||
        (Number.isInteger(t.prayer) && t.prayer >= 0 && t.prayer < 5);
}
function periodPicker(t) {
  return `<fieldset class="task-period-picker"><legend>فترات المهمة</legend><p class="hint">اختر فترة أو عدة فترات، أو اتركها بدون فترة محددة.</p><label><input type="checkbox" data-no-period ${taskPeriods(t).length ? '' : 'checked'}> بدون فترة محددة</label><div class="days">${prayerOrder.map((p) => `<label><input type="checkbox" name="taskPeriods" value="${p}" ${taskInPeriod(t, p) ? 'checked' : ''}> ${names[p]}</label>`).join('')}</div></fieldset>`;
}
function selectedTaskPeriods(form) {
  return [...form.querySelectorAll('[name=taskPeriods]:checked')].map(
    (x) => +x.value,
  );
}
function bindPeriodPicker(form, onchange = () => {}) {
  const none = form.querySelector('[data-no-period]'),
    boxes = [...form.querySelectorAll('[name=taskPeriods]')];
  none.onchange = () => {
    if (none.checked) boxes.forEach((b) => (b.checked = false));
    else none.checked = !boxes.some((b) => b.checked);
    onchange();
  };
  boxes.forEach(
    (b) =>
      (b.onchange = () => {
        none.checked = !boxes.some((b) => b.checked);
        onchange();
      }),
  );
}
function taskDay(key) {
  return (state.sunsetDays[key] ??= emptyDay());
}
function repeatFor(key) {
  const weekday = new Date(key + 'T12:00:00').getDay();
  return state.repeat
    .filter(
      (t) => t.days.includes(weekday) && (!t.startDate || t.startDate <= key),
    )
    .map((t) => ({ ...structuredClone(t), recurrent: true }));
}
function initializeTaskHistory() {
  state.taskInbox ??= [];
  const today = activeDay();
  let changed = false;
  if (!state.taskHistoryStart) {
    state.taskHistoryStart = today;
    state.taskHistoryThrough = addDate(today, -1);
    changed = true;
    // Only observed legacy occurrences can be reconstructed; do not invent missed days.
    for (const [key, d] of Object.entries(state.sunsetDays))
      if (key < today && !d.repeatSnapshot) {
        d.repeatSnapshot = repeatFor(key).filter(
          (t) => d.done?.[t.id] || d.failed?.[t.id] || d.excludedRepeat?.[t.id],
        );
      }
  }
  for (
    let key = addDate(
      state.taskHistoryThrough || addDate(state.taskHistoryStart, -1),
      1,
    );
    key < today;
    key = addDate(key, 1)
  ) {
    const d = taskDay(key);
    d.repeatSnapshot ??= repeatFor(key);
    state.taskHistoryThrough = key;
    changed = true;
  }
  if (changed) save();
}
// The task stays in its original storage bucket. Immutable execution events and
// one conflict-checked head determine its current schedule, progress and outcome.
// Historical cards are projections, never extra project tasks.
function executionRecord(t) {
  const key = t.executionBase?.date;
  return (key ? state.sunsetDays[key]?.tasks : state.taskInbox)?.find(
    (x) => x.id === t.id,
  );
}
function executionValue(t) {
  return t.executionEvents?.[t.executionHead]?.value || t.executionBase;
}
function executionChain(t) {
  const chain = [],
    seen = new Set();
  let id = t.executionHead;
  while (id && !seen.has(id)) {
    seen.add(id);
    const event = t.executionEvents?.[id];
    if (!event) break;
    chain.push(event);
    id = event.previous;
  }
  return chain.reverse();
}
function taskIsDeferred(t) {
  if (!t.executionBase) return false;
  const chain = executionChain(t);
  const canceled = new Set(
    chain.filter((e) => e.kind === 'undo').map((e) => e.undoes),
  );
  return chain.some((e) => e.kind === 'transfer' && !canceled.has(e.id));
}
function executionProjection(t, value = executionValue(t)) {
  return { ...t, ...value, recurrent: false };
}
function executionRows() {
  return cachedTaskRead('executions', () => {
    const byDate = new Map();
    const put = (t) => {
      if (!byDate.has(t.date)) byDate.set(t.date, []);
      byDate.get(t.date).push(t);
    };
    for (const t of [
      ...(state.taskInbox || []),
      ...Object.values(state.sunsetDays).flatMap((d) => d.tasks || []),
    ]) {
      if (!t.executionBase) continue;
      const current = executionProjection(t),
        chain = executionChain(t);
      put(current);
      const canceled = new Set(
        chain.filter((e) => e.kind === 'undo').map((e) => e.undoes),
      );
      const days = new Map();
      for (const event of chain)
        if (
          event.kind === 'transfer' &&
          !canceled.has(event.id) &&
          event.from.date !== current.date
        )
          days.set(event.from.date, {
            ...executionProjection(t, event.from),
            historical: true,
            historicalEvent: event.id,
            transferredTo: event.value.date,
            startSlot: null,
          });
      for (const row of days.values()) put(row);
    }
    return byDate;
  });
}
function assertCurrentExecution(t) {
  if (t.historical) throw Error('هذا سجل تاريخي؛ افتح المهمة الحالية للتعديل.');
  if (!t.executionBase) {
    const current = findTask(t.id, t.date);
    if (!current || current.executionBase)
      throw Error('تغيرت المهمة؛ أعد فتحها.');
    return current;
  }
  const record = executionRecord(t);
  if (!record || record.executionHead !== t.executionHead)
    throw Error('تغيرت المهمة على جهاز آخر؛ أعد فتحها قبل الحفظ.');
  return record;
}
function appendExecution(record, kind, value, extra = {}) {
  const event = {
    id: uid(),
    previous: record.executionHead || '',
    kind,
    at: new Date().toISOString(),
    value: structuredClone(value),
    ...extra,
  };
  (record.executionEvents ??= {})[event.id] = event;
  record.executionHead = event.id;
  if (value.date) taskDay(value.date);
  invalidateTaskReads();
  return executionProjection(record);
}
function transferTask(t, newDate, periods = taskPeriods(t)) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(newDate) ||
    Number.isNaN(Date.parse(newDate + 'T12:00:00Z')) ||
    new Date(newDate + 'T12:00:00Z').toISOString().slice(0, 10) !== newDate ||
    !t.date ||
    newDate <= t.date
  )
    throw Error('اختر يومًا لاحقًا ليوم المهمة.');
  if (
    !Array.isArray(periods) ||
    new Set(periods).size !== periods.length ||
    periods.some((p) => !Number.isInteger(p) || p < 0 || p > 4)
  )
    throw Error('فترة غير صالحة.');
  assertCurrentExecution(t);
  const snapshot = structuredClone(state);
  try {
    let record = t.executionBase
      ? executionRecord(t)
      : taskDay(t.date).tasks.find((x) => x.id === t.id);
    if (!record) {
      if (!t.recurrent) throw Error('لم تعد المهمة موجودة.');
      // Both offline devices detach the same occurrence to the same identity.
      record = {
        ...structuredClone(t),
        id: 'occurrence:' + t.date + ':' + t.id,
        detachedFrom: t.id,
        originalTaskId: t.id,
      };
      delete record.recurrent;
      const d = taskDay(t.date);
      d.tasks.push(record);
      (d.excludedRepeat ??= {})[t.id] = true;
      for (const child of [
        ...(state.taskInbox || []),
        ...Object.values(state.sunsetDays).flatMap((d) => d.tasks),
      ])
        if (
          child.parentId === t.id &&
          (child.parentDate === undefined || child.parentDate === t.date)
        ) {
          child.parentId = record.id;
          child.parentDate = t.date;
          child.parentName = record.name;
        }
      for (const project of state.projects || [])
        if (project.taskOrder)
          project.taskOrder = project.taskOrder.map((key) =>
            key === taskIdentity(t)
              ? taskIdentity({ ...record, date: t.date })
              : key,
          );
    }
    record.executionBase ??= {
      date: t.date,
      prayers: taskPeriods(t),
      prayer: taskPeriods(t)[0] ?? null,
      progress: completedSlots(t),
      status: outcome(t),
      startSlot: t.startSlot ?? null,
    };
    const from = structuredClone(executionValue(record));
    const next = appendExecution(
      record,
      'transfer',
      {
        ...from,
        date: newDate,
        prayers: [...periods],
        prayer: periods[0] ?? null,
        status: 'pending',
        startSlot: null,
      },
      { from },
    );
    removeTaskSchedule(t.date, t.id);
    save();
    return next;
  } catch (error) {
    state = snapshot;
    invalidateTaskReads();
    throw error;
  }
}
function undoTaskTransfer(t) {
  const record = assertCurrentExecution(t);
  if (!record.executionBase) throw Error('لا يوجد نقل للتراجع عنه.');
  const chain = executionChain(record),
    canceled = new Set(
      chain.filter((e) => e.kind === 'undo').map((e) => e.undoes),
    );
  const last = chain.findLast(
    (e) => e.kind === 'transfer' && !canceled.has(e.id),
  );
  if (
    !last ||
    chain.slice(chain.indexOf(last) + 1).some((e) => e.kind === 'manual')
  )
    throw Error('لا يمكن التراجع بعد تعديل الموعد؛ سجل النقل محفوظ.');
  const current = executionValue(record);
  const keepOutcome = chain
    .slice(chain.indexOf(last) + 1)
    .some((e) => e.kind === 'outcome');
  const snapshot = structuredClone(state);
  try {
    removeTaskSchedule(current.date, t.id);
    const next = appendExecution(
      record,
      'undo',
      {
        ...last.from,
        progress: current.progress,
        status: keepOutcome ? current.status : last.from.status,
      },
      { undoes: last.id },
    );
    if (next.date) scheduleTask(next, next.startSlot);
    save();
    return next;
  } catch (error) {
    state = snapshot;
    invalidateTaskReads();
    throw error;
  }
}
function recordTaskOutcome(t, value) {
  assertCurrentExecution(t);
  if (t.executionBase) {
    const record = executionRecord(t),
      current = executionValue(record);
    appendExecution(record, 'outcome', {
      ...current,
      status: current.status === value ? 'pending' : value,
    });
  } else if (t.date) setTaskOutcome(taskDay(t.date), t.id, value);
  else setInboxOutcome(t, value);
}
function recordTaskProgress(t, n) {
  assertCurrentExecution(t);
  if (!Number.isInteger(n) || n < 0 || n > 9999)
    throw Error('خانات غير صالحة.');
  if (t.executionBase) {
    const record = executionRecord(t);
    appendExecution(record, 'progress', {
      ...executionValue(record),
      progress: n,
    });
  } else {
    const old = completedSlots(t);
    if (t.date) {
      const d = taskDay(t.date);
      (d.taskProgress ??= {})[t.id] = n;
    } else {
      t.completedSlotCount = n;
    }
    logTaskProgress(t, n, old);
  }
}
function logTaskProgress(t, value, old) {
  if (value === old) return;
  const event = {
    id: uid(),
    date: t.date || '',
    at: new Date().toISOString(),
    value,
    delta: value - old,
  };
  const log = t.date
    ? ((taskDay(t.date).taskProgressLog ??= {})[t.id] ??= {})
    : (t.slotProgressLog ??= {});
  log[event.id] = event;
}
function saveExecutionTask(original, next, progress, persist) {
  const record = assertCurrentExecution(original),
    snapshot = structuredClone(state);
  try {
    const current = executionValue(record),
      previousName = record.name;
    const value = {
      ...current,
      date: next.date || '',
      prayers: taskPeriods(next),
      prayer: taskPeriods(next)[0] ?? null,
      startSlot: next.startSlot ?? null,
      progress: progress ?? current.progress,
    };
    const changedSchedule =
      current.date !== value.date ||
      JSON.stringify(current.prayers) !== JSON.stringify(value.prayers);
    removeTaskSchedule(current.date, original.id);
    for (const [key, val] of Object.entries(next))
      if (
        ![
          'id',
          'date',
          'prayer',
          'prayers',
          'startSlot',
          'executionBase',
          'executionEvents',
          'executionHead',
          'progress',
          'status',
          'historical',
          'transferredTo',
          'recurrent',
        ].includes(key)
      )
        record[key] = val;
    const item = appendExecution(
      record,
      changedSchedule ? 'manual' : 'edit',
      value,
    );
    if (item.date) scheduleTask(item, item.startSlot);
    if (record.name !== previousName)
      for (const child of [
        ...state.taskInbox,
        ...Object.values(state.sunsetDays).flatMap((d) => d.tasks),
      ])
        if (child.parentId === record.id) child.parentName = record.name;
    if (persist) save();
    return item;
  } catch (error) {
    state = snapshot;
    invalidateTaskReads();
    throw error;
  }
}
function taskTransferHistory(t) {
  if (!t.executionBase) return '';
  const record = executionRecord(t) || t;
  const chain = executionChain(record),
    active = new Set(chain.map((e) => e.id));
  const undone = new Set(
    chain.filter((e) => e.kind === 'undo').map((e) => e.undoes),
  );
  const events = Object.values(record.executionEvents || {})
    .filter((e) => e.kind === 'transfer')
    .sort((a, b) => a.at.localeCompare(b.at));
  const label = (v) => v.prayers.map((p) => names[p]).join('، ') || 'بدون فترة';
  const logs = Object.values({
    ...record.slotProgressLog,
    ...state.sunsetDays[record.executionBase.date]?.taskProgressLog?.[
      record.detachedFrom || record.id
    ],
  });
  return `<details class="task-transfer-history"><summary>سجل النقل (${events.length})</summary><ol>${events.map((e) => `<li>${esc(e.from.date)} ← ${esc(e.value.date)} · لم تُنجز${undone.has(e.id) ? ' · تم التراجع' : !active.has(e.id) ? ' · فرع محفوظ من تعارض مزامنة' : ''}<small>${esc(label(e.from))} ← ${esc(label(e.value))} · ${e.from.progress} / ${taskExpectedSlots(t)} خانة · <time>${esc(e.at)}</time></small></li>`).join('')}</ol><details><summary>سجل الخانات</summary><ul>${logs.map((e) => `<li>${esc(e.date)}: ${e.delta >= 0 ? '+' : ''}${e.delta}، الإجمالي ${e.value} · ${esc(e.at)}</li>`).join('')}<li>${esc(record.executionBase.date)}: الرصيد عند أول نقل ${record.executionBase.progress} خانة</li>${chain
    .filter((e) => ['progress', 'edit'].includes(e.kind))
    .map(
      (e) =>
        `<li>${esc(e.value.date || 'غير موزعة')}: الإجمالي ${e.value.progress} خانة · ${esc(e.at)}</li>`,
    )
    .join('')}</ul></details></details>`;
}
function openTaskHistory(t) {
  let dialog = $('#taskHistory');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'taskHistory';
    document.body.append(dialog);
  }
  dialog.innerHTML = `<div class="dialog-head"><h2>${esc(t.name)}</h2><button type="button" data-close-history aria-label="إغلاق">×</button></div>${t.historical ? `<p>لم تُنجز يوم ${esc(t.date)} · نُقلت إلى ${esc(t.transferredTo)}</p>` : ''}${taskTransferHistory(t)}<button type="button" data-current-task>المهمة الحالية</button>`;
  dialog.querySelector('[data-close-history]').onclick = () => dialog.close();
  dialog.querySelector('[data-current-task]').onclick = () => {
    const record = executionRecord(t);
    if (!record) {
      toast('حُذفت المهمة');
      dialog.close();
      return;
    }
    dialog.close();
    openPlannerEditor(executionProjection(record));
  };
  dialog.querySelector('details')?.setAttribute('open', '');
  dialog.showModal();
}
function openTaskFailure(t) {
  if (t.historical) {
    openTaskHistory(t);
    return;
  }
  // Undated inbox tasks have no original day to defer from.
  if (!t.date) {
    recordTaskOutcome(t, 'failed');
    save();
    taskRowChanged(t);
    return;
  }
  let dialog = $('#taskTransfer');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'taskTransfer';
    document.body.append(dialog);
  }
  const captured = state;
  dialog.innerHTML = `<div class="dialog-head"><h2>${esc(t.name)}</h2><button type="button" data-transfer-close aria-label="إغلاق">×</button></div><div class="task-failure-options"><button type="button" data-failure-only>لم أنجزها</button><button type="button" data-transfer-option>نقل</button></div><form data-transfer-form hidden><label class="field">اليوم الجديد<input type="date" name="transferDate" required min="${addDate(t.date, 1)}" value="${addDate(t.date > activeDay() ? t.date : activeDay(), 1)}"></label><button type="button" data-transfer-tomorrow>غدًا</button><label class="field">الفترة<select name="transferPrayer"><option value="keep">نفس الفترة</option><option value="none">بدون فترة</option>${names.map((name, p) => `<option value="${p}">${name}</option>`).join('')}</select></label><button class="primary" type="submit">نقل</button></form><p role="alert" data-transfer-error></p>`;
  const perform = (fn, refresh = true) => {
    try {
      if (state !== captured) throw Error('تغيرت البيانات؛ أعد فتح المهمة.');
      fn();
      dialog.close();
      if (refresh) {
        $('#plannerEditor')?.close();
        render();
      } else {
        taskRowChanged(findTask(t.id, t.date) || t);
        if (plannerTab === 'month') refreshMonthTaskValues();
      }
    } catch (error) {
      dialog.querySelector('[data-transfer-error]').textContent = error.message;
    }
  };
  dialog.querySelector('[data-transfer-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-failure-only]').onclick = () =>
    perform(() => {
      recordTaskOutcome(t, 'failed');
      save();
    }, false);
  dialog.querySelector('[data-transfer-option]').onclick = () => {
    dialog.querySelector('[data-transfer-form]').hidden = false;
    dialog.querySelector('.task-failure-options').hidden = true;
    dialog.querySelector('[name=transferDate]').focus();
  };
  dialog.querySelector('[data-transfer-tomorrow]').onclick = () => {
    dialog.querySelector('[name=transferDate]').value = addDate(activeDay(), 1);
  };
  dialog.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements,
      p = f.transferPrayer.value;
    perform(() => {
      transferTask(
        t,
        f.transferDate.value,
        p === 'keep' ? taskPeriods(t) : p === 'none' ? [] : [+p],
      );
      toast('تم النقل وحفظ عدم الإنجاز');
    });
  };
  dialog.showModal();
}
function allTasksOn(key) {
  return cachedTaskRead('day:' + key, () => {
    const d = state.sunsetDays[key] || emptyDay();
    const repeats =
      key < cachedTaskRead('today', () => activeDay())
        ? d.repeatSnapshot || []
        : repeatFor(key);
    return [
      ...d.tasks.filter((t) => !t.executionBase),
      ...repeats.filter((t) => !d.excludedRepeat?.[t.id]),
    ]
      .map((t) => ({ ...t, date: key }))
      .concat(executionRows().get(key) || []);
  });
}
function outcome(t) {
  if (t.historical) return 'failed';
  if (t.executionBase) return t.status || executionValue(t).status;
  if (!t.date) return t.inboxOutcome || 'pending';
  const d = state.sunsetDays[t.date];
  return d?.done?.[t.id] ? 'done' : d?.failed?.[t.id] ? 'failed' : 'pending';
}
function setInboxOutcome(t, value) {
  if (t.inboxOutcome === value) delete t.inboxOutcome;
  else t.inboxOutcome = value;
}
function completedSlots(t) {
  if (t.executionBase) return t.progress ?? executionValue(t).progress;
  return t.date
    ? state.sunsetDays[t.date]?.taskProgress?.[t.id] || 0
    : t.completedSlotCount || 0;
}
function taskEntries() {
  return cachedTaskRead('entries', () => [
    ...Object.keys(state.sunsetDays)
      .sort()
      .flatMap(allTasksOn)
      .filter((t) => !t.historical),
    ...(state.taskInbox || [])
      .filter((t) => !t.executionBase)
      .map((t) => ({ ...t, date: '' })),
    ...(executionRows().get('') || []),
  ]);
}
function findTask(id, key) {
  return key
    ? allTasksOn(key).find((t) => t.id === id)
    : (executionRows().get('') || []).find((t) => t.id === id) ||
        (state.taskInbox || []).find((t) => t.id === id && !t.executionBase);
}
function parentName(t) {
  if (!t.parentId) return '';
  if (t.parentName) return t.parentName;
  const entries = taskEntries(),
    parent = taskReadCache
      ? taskEntryIndex(entries).byId.get(t.parentId)
      : entries.find((x) => x.id === t.parentId);
  return parent?.name || 'مهمة رئيسية';
}
function periodSlots(key, p) {
  const previous = date;
  try {
    date = key;
    return range(p);
  } finally {
    date = previous;
  }
}
function capacity(key, p, ignoreId = '') {
  const d = state.sunsetDays[key] || emptyDay(),
    slots = periodSlots(key, p);
  const occupied = slots.filter(
    (n) =>
      (d.planned?.[n % 144] || d.plannedNotes?.[n % 144]) &&
      d.taskSlotOwners?.[n % 144] !== ignoreId,
  ).length;
  const actual = slots.filter(
    (n) => d.slots?.[n % 144] || d.actualNotes?.[n % 144],
  ).length;
  const estimates = allTasksOn(key)
    .filter((t) => taskInPeriod(t, p) && t.id !== ignoreId)
    .reduce((n, t) => n + (t.expectedSlots || 0), 0);
  return {
    total: slots.length,
    occupied,
    free: slots.length - occupied,
    actual,
    unrecorded: slots.length - actual,
    estimates,
  };
}
function capacityText(key, p, ignoreId = '') {
  const c = capacity(key, p, ignoreId);
  return `${c.total} خانة إجمالًا · ${c.occupied} مشغولة بالتخطيط · ${c.free} متاحة · ${c.actual} مسجلة فعليًا · ${c.unrecorded} لم تُسجل · تقديرات المهام: ${c.estimates} خانة`;
}
function removeTaskSchedule(key, id) {
  const d = state.sunsetDays[key];
  if (!d) return;
  for (const [slot, owner] of Object.entries(d.taskSlotOwners || {}))
    if (owner === id) {
      // Preserve later manual edits to either the action or its note.
      if (d.planned && d.planned[slot] === d.taskSlotValues?.[slot])
        delete d.planned[slot];
      if (d.plannedNotes && d.plannedNotes[slot] === d.taskSlotNotes?.[slot])
        delete d.plannedNotes[slot];
      delete d.taskSlotOwners[slot];
      if (d.taskSlotValues) delete d.taskSlotValues[slot];
      if (d.taskSlotNotes) delete d.taskSlotNotes[slot];
    }
}
function scheduleTask(t, start) {
  if (start === null) return;
  const p = taskPeriods(t).find((p) => periodSlots(t.date, p).includes(start));
  if (p === undefined) throw Error('اختر وقتًا ضمن إحدى فترات المهمة المحددة.');
  const slots = periodSlots(t.date, p),
    count = t.expectedSlots;
  if (!t.actionId || !state.actions.some((a) => a.id === t.actionId))
    throw Error('اختر فعلًا موجودًا لجدولة المهمة.');
  if (!Number.isInteger(count) || count < 1)
    throw Error('حدد عدد الخانات المتوقع أولًا.');
  const index = slots.indexOf(start);
  if (index < 0 || index + count > slots.length)
    throw Error('المدة تتجاوز نهاية فترة الصلاة.');
  const d = taskDay(t.date),
    selected = slots.slice(index, index + count);
  if (
    selected.some(
      (n) =>
        (d.planned?.[n % 144] || d.plannedNotes?.[n % 144]) &&
        d.taskSlotOwners?.[n % 144] !== t.id,
    )
  )
    throw Error(
      'بعض الخانات مشغولة بالفعل؛ اختر بداية أخرى أو أفرغها من صفحة يومي.',
    );
  for (const field of [
    'planned',
    'plannedNotes',
    'taskSlotOwners',
    'taskSlotValues',
    'taskSlotNotes',
  ])
    d[field] ??= {};
  for (const n of selected) {
    const slot = n % 144;
    d.planned[slot] = t.actionId;
    d.plannedNotes[slot] = 'مهمة: ' + t.name;
    d.taskSlotOwners[slot] = t.id;
    d.taskSlotValues[slot] = t.actionId;
    d.taskSlotNotes[slot] = d.plannedNotes[slot];
  }
}
function savePlannedTask(original, next, progress = null, persist = true) {
  if (original?.historical) throw Error('السجل التاريخي للعرض فقط.');
  if (
    next.completionPercent !== undefined &&
    (!Number.isFinite(next.completionPercent) ||
      next.completionPercent < 0 ||
      next.completionPercent > 100)
  )
    throw Error('نسبة الإنجاز يجب أن تكون بين ٠ و١٠٠.');
  if (
    progress !== null &&
    (!Number.isInteger(progress) || progress < 0 || progress > 9999)
  )
    throw Error('الخانات المنجزة يجب أن تكون بين ٠ و٩٩٩٩.');
  if (original?.executionBase)
    return saveExecutionTask(original, next, progress, persist);
  // Validate the schedule against a temporary copy before touching the real state.
  const snapshot = structuredClone(state);
  const previousOutcome = original ? outcome(original) : 'pending',
    previousSlots = original ? completedSlots(original) : 0;
  try {
    if (original?.date) removeTaskSchedule(original.date, original.id);
    const moved = original && original.date !== next.date;
    if (original) {
      if (original.date) {
        const d = taskDay(original.date);
        if (original.recurrent) (d.excludedRepeat ??= {})[original.id] = true;
        else d.tasks = d.tasks.filter((t) => t.id !== original.id);
      } else
        state.taskInbox = state.taskInbox.filter((t) => t.id !== original.id);
    }
    let item = { showInMonthlyCalendar: true, ...next };
    const previousLog = original?.date
      ? state.sunsetDays[original.date]?.taskProgressLog?.[original.id]
      : original?.slotProgressLog;
    if (previousLog)
      item.slotProgressLog = { ...item.slotProgressLog, ...previousLog };
    delete item.recurrent;
    if (original?.recurrent) {
      item.id = uid();
      item.detachedFrom = original.id;
    }
    if (item.date) {
      delete item.inboxOutcome;
      const d = taskDay(item.date);
      d.tasks.push(item);
      if (original && !original.date && previousOutcome !== 'pending')
        (d[previousOutcome] ??= {})[item.id] = true;
      if (original?.date && (moved || original.recurrent)) {
        const old = taskDay(original.date);
        for (const field of [
          'done',
          'failed',
          'taskProgress',
          'taskProgressLog',
        ]) {
          if (old[field]?.[original.id] !== undefined) {
            (d[field] ??= {})[item.id] = old[field][original.id];
            delete old[field][original.id];
          }
        }
      }
      if (progress !== null || (original && !original.date))
        (d.taskProgress ??= {})[item.id] = progress ?? previousSlots;
      delete item.completedSlotCount;
      scheduleTask(item, item.startSlot ?? null);
    } else {
      if (original?.date) {
        if (previousOutcome === 'pending') delete item.inboxOutcome;
        else item.inboxOutcome = previousOutcome;
        const old = taskDay(original.date);
        for (const field of ['done', 'failed', 'taskProgress'])
          if (old[field]) delete old[field][original.id];
      }
      item.completedSlotCount = progress ?? previousSlots;
      state.taskInbox.push(item);
    }
    if (progress !== null) logTaskProgress(item, progress, previousSlots);
    // Child names stay readable if the parent is subsequently removed.
    if (original)
      for (const child of [
        ...Object.values(state.sunsetDays).flatMap((d) => d.tasks),
        ...state.taskInbox,
      ])
        if (
          child.parentId === original.id &&
          (child.parentDate === undefined ||
            child.parentDate === (original.date || ''))
        ) {
          child.parentId = item.id;
          child.parentName = item.name;
          child.parentDate = item.date || '';
        }
    // Project ranks identify occurrences by both ID and date. Moving a task
    // (or detaching a recurring occurrence) must carry its saved rank with it.
    if (original) {
      const oldKey = taskIdentity(original),
        newKey = taskIdentity(item);
      if (oldKey !== newKey)
        for (const project of state.projects || [])
          if (project.taskOrder?.includes(oldKey))
            project.taskOrder = [
              ...new Set(
                project.taskOrder.map((key) => (key === oldKey ? newKey : key)),
              ),
            ];
    }
    if (persist) save();
    return item;
  } catch (error) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, snapshot);
    throw error;
  }
}
function removePlannedTaskRecord(t) {
  if (t.historical) throw Error('السجل التاريخي للعرض فقط.');
  if (t.executionBase) {
    removeTaskSchedule(t.date, t.id);
    const source = t.executionBase.date;
    const d = taskDay(source);
    d.tasks = d.tasks.filter((x) => x.id !== t.id);
    return;
  }
  if (!t.date) state.taskInbox = state.taskInbox.filter((x) => x.id !== t.id);
  else {
    const d = taskDay(t.date);
    removeTaskSchedule(t.date, t.id);
    if (t.recurrent || d.repeatSnapshot?.some((x) => x.id === t.id))
      (d.excludedRepeat ??= {})[t.id] = true;
    d.tasks = d.tasks.filter((x) => x.id !== t.id);
    for (const f of ['done', 'failed', 'taskProgress'])
      if (d[f]) delete d[f][t.id];
  }
}
function bulkDeleteSelectedTasks(snapshot, references) {
  if (!references.length) throw Error('حدد مهام لحذفها.');
  const next = structuredClone(snapshot),
    previous = state;
  try {
    state = next;
    invalidateTaskReads();
    const unique = new Map(references.map((ref) => [taskIdentity(ref), ref]));
    const tasks = [...unique.values()].map((ref) => findTask(ref.id, ref.date));
    if (tasks.some((t) => !t))
      throw Error('تغيرت بعض المهام أو حُذفت. أعد تحديدها.');
    tasks.forEach(removePlannedTaskRecord);
    return next;
  } finally {
    state = previous;
    invalidateTaskReads();
  }
}
function deletePlannedTask(t) {
  if (!confirm('حذف هذه المهمة فقط؟ ستبقى مهامها الفرعية وسجل الأيام الأخرى.'))
    return;
  removePlannedTaskRecord(t);
  save();
  render();
  return true;
}
function priorityButtons(value = 3) {
  return `<fieldset class="task-priority-field" title="1 الأعلى، 5 الأدنى"><legend>الأولوية</legend><div class="task-priority-options" role="radiogroup" aria-label="الأولوية">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="priority" value="${n}" ${n === +value ? 'checked' : ''} aria-label="الأولوية ${n}"><span>${n}</span></label>`).join('')}</div></fieldset>`;
}
function taskFields(t = {}, includeDate = true, includeProgress = false) {
  const hasChildren = !!t.id && childTasks(t).length > 0;
  return `
 ${projectField(t)}
 <label class="monthly-visibility"><input name="showInMonthlyCalendar" type="checkbox" ${t.showInMonthlyCalendar !== false ? 'checked' : ''}> إظهار في التقويم الشهري</label>
 ${priorityButtons(taskPriority(t))}
 <div class="task-effort-fields"><label class="field task-slot-field" title="الخانة ١٠ دقائق${hasChildren ? '؛ المجموع من الفروع، ويُعدّل من داخلها' : ''}">المتوقعة<input aria-label="الخانات المتوقعة" name="expectedSlots" type="number" min="0" ${hasChildren ? 'disabled' : 'max="144" required'} step="1" value="${taskExpectedSlots(t)}"></label>${includeProgress ? `<label class="field task-slot-field">المنجزة<input aria-label="الخانات المنجزة" name="completedSlots" type="number" min="0" max="9999" step="1" required value="${completedSlots(t)}"></label>` : ''}<span class="task-slot-unit">خانات · ١٠ دقائق${hasChildren ? '<small>المتوقعة من الفروع</small>' : ''}</span></div>

 ${includeDate ? `<label class="field">اليوم<input title="اتركه فارغًا لتبقى المهمة في تحتاج توزيعًا" name="taskDate" type="date" value="${t.date || ''}"></label>` : ''}
 <div class="field task-action-field"><input type="hidden" name="actionId" value="${esc(t.actionId || '')}"><button type="button" class="secondary task-action-trigger" data-task-action-trigger aria-haspopup="dialog" aria-controls="taskActionPicker"><span class="task-action-caption">الفعل المرتبط</span><span class="task-action-selected" data-task-action-label>بدون ربط — اختر فعلًا</span><span class="task-action-arrow" aria-hidden="true">▾</span></button></div>

 ${includeDate ? completionField(t) + periodPicker(t) : ''}`;
}
function attachTaskActionPicker(form) {
  const trigger = form.querySelector('[data-task-action-trigger]');
  if (!trigger) return;
  const input = form.elements.actionId;
  const updateLabel = () => {
    const action = state.actions.find((a) => a.id === input.value);
    trigger.querySelector('[data-task-action-label]').textContent =
      action?.name || 'بدون ربط — اختر فعلًا';
    trigger.setAttribute(
      'aria-label',
      'الفعل المرتبط: ' + (action?.name || 'بدون ربط'),
    );
  };
  trigger.onclick = () => {
    let dialog = document.querySelector('#taskActionPicker');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'taskActionPicker';
      dialog.setAttribute('aria-labelledby', 'taskActionPickerTitle');
      document.body.append(dialog);
    }
    const actions = state.actions.filter(
      (a) => !a.archived || a.id === input.value,
    );
    dialog.innerHTML = `<div class="slot-editor"><div class="dialog-head"><h2 id="taskActionPickerTitle">اختيار الفعل المرتبط</h2><button type="button" id="closeTaskActionPicker" aria-label="إغلاق">×</button></div>${SlotTools.actionChoices({ action: input.value, actions, categories: state.categories, color: (a) => ActionCategories.color(state, a), category: (a) => ActionCategories.category(state, a)?.name || 'بدون قسم' })}</div>`;
    dialog.querySelector('#closeTaskActionPicker').onclick = () =>
      dialog.close();
    dialog.querySelectorAll('[data-action-choice]').forEach(
      (b) =>
        (b.onclick = () => {
          input.value = b.dataset.actionChoice;
          updateLabel();
          dialog.close();
          trigger.focus();
        }),
    );
    dialog.showModal();
  };
  updateLabel();
}
function formProjectField(dialog, t) {
  // Subtasks can keep inherited memberships or override them in their own picker.
}
function openPlannerEditor(
  t = null,
  parent = null,
  projectId = '',
  options = {},
) {
  if (t?.historical) {
    openTaskHistory(t);
    return;
  }
  let dialog = $('#plannerEditor');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'plannerEditor';
    dialog.setAttribute('aria-labelledby', 'plannerTitle');
    document.body.append(dialog);
  }
  const editorState = state;
  const draft = t || {
    id: uid(),
    name: '',
    date: parent ? '' : date,
    prayer,
    priority: 3,
    expectedSlots: 0,
    parentId: parent?.id,
    parentName: parent?.name,
    parentDate: parent?.executionBase?.date ?? parent?.date ?? '',
    projectId: parent?.projectId || projectId,
    projectIds: parent
      ? effectiveProjectIds(parent)
      : projectId
        ? [projectId]
        : [],
  };
  dialog.innerHTML = `<div class="dialog-head"><h2 id="plannerTitle">${t ? 'تعديل المهمة' : parent ? 'إضافة مهمة فرعية' : 'إضافة مهمة'}</h2><button type="button" id="closePlanner" aria-label="إغلاق">×</button></div><form id="plannerForm"><div class="planner-main-fields"><label class="field">المهمة<input name="taskName" maxlength="150" required value="${esc(draft.name)}"></label><label class="field">الوصف<input name="taskDescription" maxlength="500" value="${esc(draft.description || '')}" placeholder="مثل: من 1 إلى 21"></label></div>${draft.parentId ? `<p>ضمن: ${esc(parentName(draft))}</p>` : ''}<div class="planner-fields">${taskFields(draft, true, !!t)}</div><details class="planner-schedule-details" ${draft.startSlot != null ? 'open' : ''}><summary>حجز وقت في المطلوب</summary><label class="field">البداية<select name="startSlot"></select></label><details class="planner-capacity-details"><summary>الخانات المتاحة</summary><p id="plannerCapacity" class="capacity-note"></p></details><p class="hint">يحجز الخانات المتوقعة بالفعل المرتبط، دون تغيير التسجيل الفعلي أو الإنجاز.</p></details>${t?.recurrent ? '<p class="hint">تعديل هذه النسخة يفصلها عن السلسلة لهذا اليوم فقط.</p>' : ''}<p id="plannerError" role="alert"></p><div class="planner-form-actions"><button class="primary">حفظ المهمة</button><button type="button" class="secondary" data-editor-cancel>إلغاء</button></div></form>${t ? '<div class="planner-edit-actions"><button type="button" id="editorAddChild" class="secondary">＋ إضافة مهمة فرعية</button><button type="button" id="editorDeleteTask" class="danger">حذف المهمة</button></div>' : ''}`;
  if (t) {
    if (t.executionBase) {
      const history = document.createElement('section');
      history.innerHTML =
        taskTransferHistory(t) +
        '<button type="button" data-undo-transfer>تراجع عن آخر نقل</button><p role="alert" data-undo-error></p>';
      dialog.append(history);
      history.querySelector('[data-undo-transfer]').onclick = () => {
        try {
          const current = undoTaskTransfer(t);
          dialog.close();
          render();
          openPlannerEditor(current);
        } catch (error) {
          history.querySelector('[data-undo-error]').textContent =
            error.message;
        }
      };
    }
    const children = childTasks(t);
    if (children.length) {
      const section = document.createElement('details');
      section.className = 'editor-subtasks';
      section.open = children.length <= 3;
      section.innerHTML =
        '<summary>المهام الفرعية (' +
        children.length +
        ')</summary>' +
        children.map((c) => taskCard(c)).join('');
      dialog.append(section);
      bindTaskCards(section, true);
    }
  }
  const back = options.returnToList ? null : parentTask(t || draft);
  if (draft.parentId) formProjectField(dialog, draft);
  if (back) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary';
    b.textContent = '↳ العودة إلى المهمة الرئيسية: ' + back.name;
    b.onclick = () => {
      dialog.close();
      openPlannerEditor(back);
    };
    dialog.prepend(b);
  }
  const form = $('#plannerForm'),
    f = form.elements;
  attachTaskActionPicker(form);
  attachTaskProjectSummary(form, draft);
  const refresh = () => {
    const key = f.taskDate.value,
      periods = selectedTaskPeriods(form),
      old = f.startSlot.value;
    $('#plannerCapacity').textContent = !key
      ? 'ستظهر المهمة في «تحتاج توزيعًا» حتى تختار يومًا.'
      : periods.length
        ? periods
            .map(
              (p) =>
                names[p] +
                ': ' +
                capacityText(key, p, t?.date === key ? t.id : ''),
            )
            .join(' | ')
        : 'مهمة لليوم بدون فترة محددة. اختر فترة إذا أردت حجز خانات لها.';
    f.startSlot.innerHTML =
      '<option value="">بدون حجز وقت محدد</option>' +
      (key
        ? periods
            .map(
              (p) =>
                `<optgroup label="${names[p]}">${periodSlots(key, p)
                  .map((n) => `<option value="${n}">${time(n)}</option>`)
                  .join('')}</optgroup>`,
            )
            .join('')
        : '');
    if ([...f.startSlot.options].some((o) => o.value === old))
      f.startSlot.value = old;
    f.startSlot.disabled = !key || !periods.length;
  };
  f.taskDate.onchange = refresh;
  bindPeriodPicker(form, refresh);
  refresh();
  if (draft.startSlot != null) f.startSlot.value = String(draft.startSlot);
  $('#closePlanner').onclick = () => dialog.close();
  form.querySelector('[data-editor-cancel]').onclick = () => dialog.close();
  if (t) {
    $('#editorAddChild').onclick = () => {
      dialog.close();
      openPlannerEditor(null, t);
    };
    $('#editorDeleteTask').onclick = () => {
      if (deletePlannedTask(t)) {
        dialog.close();
        if (back) openPlannerEditor(back);
      }
    };
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = f.taskName.value.trim();
    if (!name) return;
    try {
      if (state !== editorState)
        throw Error(
          'تغيرت البيانات أو الحساب. أغلق النافذة وافتح المهمة مجددًا.',
        );
      const count = f.expectedSlots.disabled
        ? draft.expectedSlots || 0
        : +f.expectedSlots.value;
      if (!Number.isInteger(count) || count < 0 || count > 144)
        throw Error('عدد الخانات يجب أن يكون عددًا صحيحًا بين ٠ و١٤٤.');
      const selectedProjects = selectedProjectIds(form, draft);
      const next = {
          ...draft,
          name,
          description: f.taskDescription.value.trim(),
          showInMonthlyCalendar: f.showInMonthlyCalendar.checked,
          projectIds: selectedProjects,
          projectId: selectedProjects[0] || '',
          ...(draft.parentId
            ? { projectOverride: !f.inheritProjects.checked }
            : {}),
          priority: +f.priority.value,
          expectedSlots: count,
          actionId: f.actionId.value,
          date: f.taskDate.value,
          prayers: selectedTaskPeriods(form),
          prayer: selectedTaskPeriods(form)[0] ?? null,
          startSlot:
            f.taskDate.value && f.startSlot.value !== ''
              ? +f.startSlot.value
              : null,
        },
        progress = f.completedSlots ? +f.completedSlots.value : null;
      if (
        progress !== null &&
        (!Number.isInteger(progress) || progress < 0 || progress > 9999)
      )
        throw Error('الخانات المنجزة يجب أن تكون بين ٠ و٩٩٩٩.');
      const progressOnly =
        t?.date &&
        next.showInMonthlyCalendar === (t.showInMonthlyCalendar !== false) &&
        next.name === t.name &&
        next.description === (t.description || '') &&
        next.date === t.date &&
        JSON.stringify(taskPeriods(next)) === JSON.stringify(taskPeriods(t)) &&
        next.priority === taskPriority(t) &&
        next.expectedSlots === (t.expectedSlots || 0) &&
        next.actionId === (t.actionId || '') &&
        next.startSlot === (t.startSlot ?? null) &&
        next.projectOverride === t.projectOverride &&
        JSON.stringify(next.projectIds) === JSON.stringify(taskProjectIds(t));
      let savedTask = t;
      if (progressOnly) {
        recordTaskProgress(t, progress);
        save();
      } else savedTask = savePlannedTask(t, next, progress);
      dialog.close();
      render();
      if (back) openPlannerEditor(findTask(back.id, back.date) || back);
      else if (options.returnToList && t) {
        const card = [...app.querySelectorAll('.task-row')].find(
          (card) =>
            card.dataset.taskId === savedTask.id &&
            card.dataset.taskDate === (next.date || ''),
        );
        rowOwn(
          card || document.createElement('div'),
          '[data-task-edit]',
        )[0]?.focus({ preventScroll: true });
      }
      toast('تم حفظ المهمة');
    } catch (err) {
      $('#plannerError').textContent = err.message;
    }
  };
  dialog.showModal();
}
function quickTask() {
  let dialog = $('#quickTaskDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'quickTaskDialog';
    document.body.append(dialog);
  }
  dialog.innerHTML =
    '<h2>التقط المهمة الآن</h2><form id="quickTaskForm"><label class="field">المهمة<input name="taskName" maxlength="150" required autofocus placeholder="اكتب المهمة فقط…"></label><label class="field">الوصف (اختياري)<input name="taskDescription" maxlength="500" placeholder="تفصيل قصير بجوار الاسم"></label><p>ستجدها في قائمة «تحتاج توزيعًا».</p><button class="primary">إضافة</button><button type="button" class="secondary" id="closeQuickTask">إلغاء</button></form>';
  $('#closeQuickTask').onclick = () => dialog.close();
  $('#quickTaskForm').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.elements.taskName.value.trim();
    if (!name) return;
    (state.taskInbox ??= []).push({
      id: uid(),
      name,
      description: e.target.elements.taskDescription.value.trim(),
      priority: 3,
      expectedSlots: 0,
      showInMonthlyCalendar: true,
    });
    save();
    dialog.close();
    render();
    toast('أضيفت إلى المهام التي تحتاج توزيعًا');
  };
  dialog.showModal();
}
function installQuickTask() {
  if ($('#quickTaskButton')) return;
  const b = document.createElement('button');
  b.id = 'quickTaskButton';
  b.className = 'quick-task';
  b.innerHTML = taskIcon('plus') + ' مهمة سريعة';
  b.onclick = () => {
    if (app.inert) {
      toast('انتظر تحميل بيانات الحساب');
      return;
    }
    quickTask();
  };
  document.body.append(b);
}
function renderRepeat(edit = null) {
  renderRepeatLegacy(edit);
  const form = $('#repeatForm');
  const extra = document.createElement('div');
  extra.className = 'planner-fields';
  extra.innerHTML = taskFields(edit || {}, false);
  form.insertBefore(extra, form.querySelector('.primary'));
  attachTaskActionPicker(form);
  attachTaskProjectSummary(form);
  const legacyPeriod = form.querySelector('[name=prayer]').closest('label');
  legacyPeriod.outerHTML = periodPicker(edit || { prayer: prayer });
  bindPeriodPicker(form);
  const submit = form.onsubmit;
  form.onsubmit = (e) => {
    const f = form.elements,
      count = f.expectedSlots.disabled
        ? edit?.expectedSlots || 0
        : +f.expectedSlots.value;
    if (!Number.isInteger(count) || count < 0 || count > 144) {
      e.preventDefault();
      toast('الخانات المتوقعة بين ٠ و١٤٤');
      return;
    }
    if (!f.name.value.trim() || !form.querySelector('[name=days]:checked')) {
      submit(e);
      return;
    }
    initializeTaskHistory();
    const periods = selectedTaskPeriods(form);
    const ids = selectedProjectIds(form);
    const fields = {
      description: f.taskDescription.value.trim(),
      showInMonthlyCalendar: f.showInMonthlyCalendar.checked,
      projectIds: ids,
      projectId: ids[0] || '',
      prayers: periods,
      prayer: periods[0] ?? null,
      priority: +f.priority.value,
      expectedSlots: count,
      actionId: f.actionId.value,
      startDate: edit?.startDate || activeDay(),
    };
    const before = new Set(state.repeat.map((t) => t.id));
    submit(e);
    const target = edit
      ? state.repeat.find((t) => t.id === edit.id)
      : state.repeat.find((t) => !before.has(t.id));
    if (target) {
      Object.assign(target, fields);
      save();
      render();
    }
  };
  // Capture days elapsed while this screen was left open before mutating a series.
  app.querySelectorAll('[data-del]').forEach((b) => {
    const remove = b.onclick;
    b.onclick = () => {
      initializeTaskHistory();
      remove();
    };
  });
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent =
    'تعديل السلسلة يغيّر اليوم والأيام القادمة فقط. سجلات الأيام السابقة محفوظة منذ تفعيل سجل المهام.';
  form.before(note);
  bindTaskCards();
  compactRepeatWorkspace(form, edit, note);
}
function compactRepeatWorkspace(form, edit, note) {
  const workspace = document.createElement('div');
  workspace.className = 'repeat-workspace';
  workspace.append(...app.childNodes);
  app.append(workspace);
  const heading = document.createElement('div');
  heading.className = 'repeat-heading';
  const help = document.createElement('details');
  help.className = 'repeat-help';
  help.innerHTML = '<summary>عن التكرار</summary>';
  help.append(workspace.querySelector(':scope > p'), note);
  heading.append(workspace.querySelector('h1'), help);
  workspace.prepend(heading);
  const panel = form.closest('.panel'),
    editor = document.createElement('details');
  editor.className = 'repeat-editor-panel';
  editor.open = !!edit || !state.repeat.length;
  const summary = document.createElement('summary');
  summary.textContent = edit ? 'تعديل المهمة المتكررة' : '＋ مهمة متكررة';
  panel.replaceWith(editor);
  editor.append(summary, form);
  const main = form.querySelector('.form');
  main.className = 'planner-main-fields';
  const extra = form.querySelector('.planner-fields');
  extra.append(main.querySelector('.task-period-picker'));
  const days = form.querySelector(':scope > .days'),
    daysLabel = days.previousElementSibling;
  const daysField = document.createElement('fieldset');
  daysField.className = 'repeat-days';
  daysField.innerHTML = '<legend>أيام التكرار</legend>';
  daysLabel.replaceWith(daysField);
  daysField.append(days);
  const actions = document.createElement('div');
  actions.className = 'planner-form-actions';
  actions.append(form.querySelector(':scope > .primary'));
  if (form.querySelector('#cancel'))
    actions.append(form.querySelector('#cancel'));
  form.append(actions);
  const list = workspace.querySelector(':scope > .panel');
  list.classList.add('repeat-list-panel');
  list.setAttribute('aria-label', 'قائمة المهام المتكررة');
  list.querySelectorAll('.task-row').forEach((card) => {
    const select = card.querySelector('[data-task-select]'),
      schedule = document.createElement('small');
    schedule.className = 'repeat-row-schedule';
    schedule.textContent = select.dataset.taskContext;
    select.append(schedule);
  });
  if (edit) form.elements.name.focus({ preventScroll: true });
}
function validatePlanning(s) {
  if (!s || typeof s !== 'object') throw Error('بيانات غير صالحة');
  validateProjects(s);
  const validDate = (v) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v + 'T12:00:00Z')) &&
    new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
  for (const f of ['taskHistoryStart', 'taskHistoryThrough'])
    if (s[f] !== undefined && !validDate(s[f]))
      throw Error('تاريخ سجل غير صالح');
  if (s.taskInbox !== undefined && !Array.isArray(s.taskInbox))
    throw Error('قائمة مهام غير صالحة');
  const checkTask = (t) => {
    if (
      t?.executionBase !== undefined ||
      t?.executionEvents !== undefined ||
      t?.executionHead !== undefined
    ) {
      const valueOK = (v) =>
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        (v.date === '' || validDate(v.date)) &&
        validTaskPeriods(v) &&
        Number.isInteger(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 9999 &&
        ['pending', 'failed', 'done'].includes(v.status) &&
        (v.startSlot === null ||
          (Number.isInteger(v.startSlot) &&
            v.startSlot >= 0 &&
            v.startSlot <= 288));
      const events = t.executionEvents;
      if (
        !valueOK(t.executionBase) ||
        !validDate(t.executionBase.date) ||
        !events ||
        typeof events !== 'object' ||
        Array.isArray(events) ||
        typeof t.executionHead !== 'string' ||
        !Object.hasOwn(events, t.executionHead)
      )
        throw Error('سجل نقل غير صالح.');
      const valid = new Set();
      for (const [id, e] of Object.entries(events)) {
        if (
          !e ||
          e.id !== id ||
          typeof e.previous !== 'string' ||
          (e.previous && !Object.hasOwn(events, e.previous)) ||
          ![
            'transfer',
            'undo',
            'manual',
            'progress',
            'outcome',
            'edit',
          ].includes(e.kind) ||
          typeof e.at !== 'string' ||
          Number.isNaN(Date.parse(e.at)) ||
          !valueOK(e.value) ||
          (e.kind === 'transfer' &&
            (!valueOK(e.from) ||
              !e.from.date ||
              !e.value.date ||
              e.value.date <= e.from.date)) ||
          (e.kind === 'undo' && events[e.undoes]?.kind !== 'transfer')
        )
          throw Error('عملية نقل غير صالحة.');
        const seen = new Set();
        let cursor = id;
        while (cursor && !valid.has(cursor)) {
          if (seen.has(cursor)) throw Error('دورة غير صالحة في سجل النقل.');
          seen.add(cursor);
          cursor = events[cursor]?.previous;
        }
        for (const key of seen) valid.add(key);
      }
    }
    if (
      !validTaskPeriods(t) &&
      !(t && t.prayer === undefined && t.prayers === undefined)
    )
      throw Error('فترات غير صالحة');
    if (!t || typeof t.id !== 'string' || typeof t.name !== 'string')
      throw Error('مهمة غير صالحة');
    if (
      t.description !== undefined &&
      (typeof t.description !== 'string' || t.description.length > 500)
    )
      throw Error('وصف مهمة غير صالح');
    if (
      t.showInMonthlyCalendar !== undefined &&
      typeof t.showInMonthlyCalendar !== 'boolean'
    )
      throw Error('خيار ظهور التقويم غير صالح');
    if (
      t.completedSlotCount !== undefined &&
      (!Number.isInteger(t.completedSlotCount) ||
        t.completedSlotCount < 0 ||
        t.completedSlotCount > 9999)
    )
      throw Error('خانات منجزة غير صالحة');
    if (
      t.completionPercent !== undefined &&
      (!Number.isFinite(t.completionPercent) ||
        t.completionPercent < 0 ||
        t.completionPercent > 100)
    )
      throw Error('نسبة إنجاز غير صالحة');
    if (
      t.priority !== undefined &&
      !(
        [1, 2, 3, 4, 5].includes(t.priority) ||
        ['high', 'medium', 'low'].includes(t.priority)
      )
    )
      throw Error('أولوية غير صالحة');
    if (
      t.inboxOutcome !== undefined &&
      !['done', 'failed'].includes(t.inboxOutcome)
    )
      throw Error('حالة مهمة غير موزعة غير صالحة');
    // Accept the legacy optional field in old backups; general lists no longer use or write it.
    if (
      t.listPosition !== undefined &&
      (!Number.isInteger(t.listPosition) || t.listPosition < 1)
    )
      throw Error('ترتيب مهمة غير صالح');
    if (
      t.subtaskPosition !== undefined &&
      (!Number.isInteger(t.subtaskPosition) || t.subtaskPosition < 1)
    )
      throw Error('ترتيب مهمة فرعية غير صالح');
    if (
      t.expectedSlots !== undefined &&
      (!Number.isInteger(t.expectedSlots) ||
        t.expectedSlots < 0 ||
        t.expectedSlots > 144)
    )
      throw Error('عدد خانات غير صالح');
    if (
      (t.date && !validDate(t.date)) ||
      (t.startDate && !validDate(t.startDate)) ||
      (t.parentDate && !validDate(t.parentDate))
    )
      throw Error('تاريخ مهمة غير صالح');
    if (
      t.startSlot != null &&
      (!Number.isInteger(t.startSlot) || t.startSlot < 0 || t.startSlot > 288)
    )
      throw Error('وقت غير صالح');
    for (const key of ['actionId', 'parentId', 'parentName', 'projectId'])
      if (t[key] !== undefined && typeof t[key] !== 'string')
        throw Error('بيانات مهمة غير صالحة');
    if (
      t.projectOverride !== undefined &&
      typeof t.projectOverride !== 'boolean'
    )
      throw Error('اختيار وراثة المشاريع غير صالح');
    if (
      t.projectIds !== undefined &&
      (!Array.isArray(t.projectIds) ||
        t.projectIds.length > 100 ||
        t.projectIds.some((id) => typeof id !== 'string' || !id) ||
        new Set(t.projectIds).size !== t.projectIds.length)
    )
      throw Error('روابط المشاريع غير صالحة');
  };
  for (const t of [
    ...(s.taskInbox || []),
    ...(Array.isArray(s.repeat) ? s.repeat : []),
  ])
    checkTask(t);
  for (const [key, d] of Object.entries(s.sunsetDays || {})) {
    if (!validDate(key)) throw Error('تاريخ يوم غير صالح');
    for (const t of Array.isArray(d?.tasks) ? d.tasks : []) checkTask(t);
    if (d?.repeatSnapshot !== undefined) {
      if (!Array.isArray(d.repeatSnapshot)) throw Error('سجل غير صالح');
      for (const t of d.repeatSnapshot) {
        checkTask(t);
        if (!validTaskPeriods(t)) throw Error('فترة غير صالحة');
      }
    }
    if (d?.actualTasks !== undefined) {
      if (
        !d.actualTasks ||
        typeof d.actualTasks !== 'object' ||
        Array.isArray(d.actualTasks)
      )
        throw Error('سجل مهام الخانات غير صالح');
      for (const [slot, t] of Object.entries(d.actualTasks))
        if (
          (t?.parentName !== undefined && typeof t.parentName !== 'string') ||
          !/^(0|[1-9]\d*)$/.test(slot) ||
          +slot >= (s.slotMinutes === 10 ? 144 : 96) ||
          !t ||
          typeof t.id !== 'string' ||
          typeof t.name !== 'string' ||
          typeof t.actionId !== 'string' ||
          d.slots?.[slot] !== t.actionId
        )
          throw Error('مهمة خانة غير صالحة');
    }
    if (
      d?.taskProgress &&
      Object.values(d.taskProgress).some(
        (n) => !Number.isInteger(n) || n < 0 || n > 9999,
      )
    )
      throw Error('تقدم غير صالح');
  }
}
