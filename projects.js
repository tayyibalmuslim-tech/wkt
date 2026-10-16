/* Projects live in the same snapshot as tasks, including account sync and backups. */
let selectedProject = '';
function projectName(t) {
  const ids = effectiveProjectIds(t);
  return (state.projects || [])
    .filter((p) => ids.includes(p.id))
    .map((p) => p.name)
    .join('، ');
}
function projectField(t) {
  const ids = effectiveProjectIds(t);
  const projects = state.projects || [];
  const selected = projects
    .filter((p) => ids.includes(p.id))
    .map((p) => p.name)
    .join('، ');
  return `<details class="task-project-details"><summary>المشاريع المرتبطة <small data-project-summary>${esc(selected || 'بدون مشروع')}</small></summary><fieldset class="task-project-picker"><legend class="sr-only">اختر مشروعًا أو عدة مشاريع</legend>${t.parentId ? `<label class="project-inherit-switch"><input type="checkbox" name="inheritProjects" ${t.projectOverride !== true ? 'checked' : ''}> نفس مشاريع الرئيسية</label>` : ''}<div class="task-project-options">${projects.map((p) => `<label><input type="checkbox" name="projectIds" value="${esc(p.id)}" ${ids.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('') || '<span class="hint">أنشئ مشروعًا من تبويب المشاريع أولًا.</span>'}</div></fieldset></details>`;
}
function attachTaskProjectSummary(form, task = null) {
  const details = form.querySelector('.task-project-details');
  if (!details) return;
  const update = () => {
    const ids = new Set(
      [...details.querySelectorAll('input[name="projectIds"]:checked')].map(
        (input) => input.value,
      ),
    );
    const names = (state.projects || [])
      .filter((p) => ids.has(p.id))
      .map((p) => p.name);
    details.querySelector('[data-project-summary]').textContent =
      names.join('، ') || 'بدون مشروع';
  };
  details.addEventListener('change', (event) => {
    const inherit = form.elements.inheritProjects;
    if (event.target.matches('input[name="projectIds"]')) {
      if (inherit) inherit.checked = false;
      update();
    }
    if (event.target === inherit && inherit.checked) {
      const parent = parentTask(task);
      const ids = parent
        ? effectiveProjectIds(parent)
        : effectiveProjectIds({ ...task, projectOverride: false });
      details
        .querySelectorAll('input[name="projectIds"]')
        .forEach((input) => (input.checked = ids.includes(input.value)));
      update();
    }
  });
  update();
}
function selectedProjectIds(form, t) {
  return [...form.querySelectorAll('input[name="projectIds"]:checked')].map(
    (input) => input.value,
  );
}
// Optional project-local deadlines; actual completion is still derived from tasks.
function validateProjectGoals(goals) {
  if (goals === undefined) return;
  if (!Array.isArray(goals) || goals.length > 100)
    throw Error('أهداف المشروع غير صالحة؛ الحد الأقصى 100 هدف.');
  const ids = new Set();
  for (const goal of goals) {
    if (
      !goal ||
      typeof goal.id !== 'string' ||
      !goal.id ||
      goal.id.length > 120 ||
      ids.has(goal.id) ||
      typeof goal.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(goal.date) ||
      !Number.isFinite(Date.parse(goal.date + 'T12:00:00Z')) ||
      new Date(goal.date + 'T12:00:00Z').toISOString().slice(0, 10) !==
        goal.date ||
      !Number.isInteger(goal.percent) ||
      goal.percent < 1 ||
      goal.percent > 100
    )
      throw Error('أدخل تاريخًا صحيحًا ونسبة صحيحة من 1 إلى 100.');
    ids.add(goal.id);
  }
}
function sortedProjectGoals(project) {
  return [...(project.goals || [])].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.percent - b.percent ||
      a.id.localeCompare(b.id),
  );
}
function projectGoalStatus(goal, percent, today = zonedDate()) {
  if (percent >= goal.percent) return 'متحقق حاليًا';
  return goal.date < today
    ? 'تجاوز الموعد'
    : goal.date === today
      ? 'موعده اليوم'
      : 'قادم';
}
function projectGoalLabel(goal, percent, today = zonedDate()) {
  return `${goal.percent}% في ${goal.date} — ${projectGoalStatus(goal, percent, today)}`;
}
function refreshProjectGoals() {
  const track = $('#projectGoalsTrack');
  if (!track) return;
  const project = state.projects?.find((p) => p.id === track.dataset.projectId);
  if (!project) return;
  const goals = sortedProjectGoals(project),
    percent = projectCompletion(project.id),
    today = zonedDate();
  const groups = new Map();
  goals.forEach((goal) => {
    const group = groups.get(goal.percent) || [];
    group.push(goal);
    groups.set(goal.percent, group);
  });
  track.querySelector('.project-goal-markers').innerHTML = [...groups.values()]
    .map((group) => {
      const goal = group[0],
        reached = percent >= goal.percent;
      const label = group
        .map((g) => projectGoalLabel(g, percent, today))
        .join('؛ ');
      return `<button type="button" class="project-goal-marker ${reached ? 'reached' : goal.date < today ? 'overdue' : ''}" style="--goal-percent:${goal.percent}" data-project-goal="${esc(goal.id)}" title="${esc(label)}" aria-label="${esc(label)}"><small aria-hidden="true">${goal.percent}%</small><span aria-hidden="true"></span></button>`;
    })
    .join('');
  const next = goals.find((goal) => percent < goal.percent);
  $('#projectGoalSummary').textContent = next
    ? `الهدف التالي: ${projectGoalLabel(next, percent, today)}`
    : goals.length
      ? `الأهداف متحققة حاليًا (${goals.length})`
      : '';
  $('#projectGoalSummary').title = $('#projectGoalSummary').textContent;
}
function openProjectGoals(project, goalId = '') {
  let dialog = $('#projectGoalsEditor');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'projectGoalsEditor';
    document.body.append(dialog);
  }
  const originalState = state,
    originalProject = project;
  dialog.setAttribute('aria-labelledby', 'projectGoalsTitle');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="projectGoalsTitle">أهداف ${esc(project.name)}</h2><button type="button" data-close-goals aria-label="إغلاق">×</button></div><form id="projectGoalForm"><input type="hidden" name="goalId"><label class="field">بحلول يوم<input type="date" name="goalDate" required value="${zonedDate()}"></label><label class="field">الإنجاز المستهدف %<input type="number" name="goalPercent" min="1" max="100" step="1" required value="50"></label><div class="project-goal-form-actions"><button class="primary" data-save-goal>إضافة هدف</button><button type="button" class="secondary" data-cancel-goal hidden>إلغاء التعديل</button></div><p id="projectGoalError" role="alert"></p></form><div id="projectGoalsList"></div>`;
  const form = dialog.querySelector('form'),
    fields = form.elements;
  const current = () => {
    const target = state.projects?.find((p) => p.id === project.id);
    if (state !== originalState || target !== originalProject)
      throw Error(
        'تغيرت البيانات أو حُذف المشروع. أغلق النافذة وافتحها مجددًا.',
      );
    return target;
  };
  const reset = () => {
    fields.goalId.value = '';
    fields.goalDate.value = zonedDate();
    fields.goalPercent.value = '50';
    dialog.querySelector('[data-save-goal]').textContent = 'إضافة هدف';
    dialog.querySelector('[data-cancel-goal]').hidden = true;
    $('#projectGoalError').textContent = '';
  };
  const edit = (id) => {
    const goal = current().goals?.find((g) => g.id === id);
    if (!goal) throw Error('الهدف لم يعد موجودًا.');
    fields.goalId.value = id;
    fields.goalDate.value = goal.date;
    fields.goalPercent.value = goal.percent;
    dialog.querySelector('[data-save-goal]').textContent = 'حفظ التعديل';
    dialog.querySelector('[data-cancel-goal]').hidden = false;
    $('#projectGoalError').textContent = '';
    fields.goalDate.focus({ preventScroll: true });
  };
  const refresh = () => {
    const goals = sortedProjectGoals(current()),
      percent = projectCompletion(project.id),
      today = zonedDate();
    $('#projectGoalsList').innerHTML =
      goals
        .map(
          (goal) =>
            `<div class="project-goal-item"><div><b>${goal.percent}%</b> <time datetime="${goal.date}">${goal.date}</time><small>${projectGoalStatus(goal, percent, today)}</small></div><button type="button" data-edit-goal="${esc(goal.id)}" aria-label="تعديل هدف ${goal.percent}% في ${goal.date}">تعديل</button><button type="button" data-delete-goal="${esc(goal.id)}" aria-label="حذف هدف ${goal.percent}% في ${goal.date}">حذف</button></div>`,
        )
        .join('') || '<p class="empty-note">لا توجد أهداف بعد.</p>';
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    try {
      const target = current(),
        id = fields.goalId.value;
      const goals = [...(target.goals || [])];
      if (id && !goals.some((g) => g.id === id))
        throw Error('الهدف لم يعد موجودًا.');
      const next = {
        id: id || uid(),
        date: fields.goalDate.value,
        percent: Number(fields.goalPercent.value),
      };
      if (!fields.goalPercent.value) throw Error('أدخل النسبة المستهدفة.');
      if (id) goals[goals.findIndex((g) => g.id === id)] = next;
      else goals.push(next);
      validateProjectGoals(goals);
      target.goals = goals;
      save();
      refreshProjectGoals();
      reset();
      refresh();
      fields.goalDate.focus({ preventScroll: true });
    } catch (error) {
      $('#projectGoalError').textContent = error.message;
    }
  };
  $('#projectGoalsList').onclick = (event) => {
    try {
      const editButton = event.target.closest('[data-edit-goal]');
      if (editButton) {
        edit(editButton.dataset.editGoal);
        return;
      }
      const remove = event.target.closest('[data-delete-goal]');
      if (!remove) return;
      const target = current(),
        id = remove.dataset.deleteGoal;
      target.goals = (target.goals || []).filter((g) => g.id !== id);
      save();
      refreshProjectGoals();
      if (fields.goalId.value === id) reset();
      refresh();
      fields.goalDate.focus({ preventScroll: true });
    } catch (error) {
      $('#projectGoalError').textContent = error.message;
    }
  };
  dialog.querySelector('[data-close-goals]').onclick = () => dialog.close();
  dialog.querySelector('[data-cancel-goal]').onclick = reset;
  refresh();
  dialog.showModal();
  if (goalId) edit(goalId);
}
function validateProjects(s) {
  if (
    s.tafsirDefaultInstalled !== undefined &&
    typeof s.tafsirDefaultInstalled !== 'boolean'
  )
    throw Error('حالة المشروع الافتراضي غير صالحة');
  if (s.projects === undefined) return;
  if (!Array.isArray(s.projects)) throw Error('قائمة مشاريع غير صالحة');
  const ids = new Set();
  for (const p of s.projects) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !p.id ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 100 ||
      (p.description !== undefined &&
        (typeof p.description !== 'string' || p.description.length > 1000))
    )
      throw Error('مشروع غير صالح');
    if (
      p.taskOrder !== undefined &&
      (!Array.isArray(p.taskOrder) ||
        p.taskOrder.some((key) => typeof key !== 'string') ||
        new Set(p.taskOrder).size !== p.taskOrder.length)
    )
      throw Error('ترتيب مهام المشروع غير صالح');
    validateProjectGoals(p.goals);
    ids.add(p.id);
  }
}
function projectTasks(id) {
  return cachedTaskRead('project-tasks:' + id, () => {
    const entries = progressEntries();
    return sortedTasks(entries.filter((t) => taskInProject(t, id, entries)));
  });
}
// Order belongs to the project; it never changes task priority, dates or parent links.
function orderedProjectTasks(id) {
  const list = taskGroups(projectTasks(id)),
    order = state.projects?.find((p) => p.id === id)?.taskOrder || [],
    ranks = new Map(order.map((key, i) => [key, i]));
  return list.sort(
    (a, b) =>
      (ranks.get(taskIdentity(a)) ?? Infinity) -
      (ranks.get(taskIdentity(b)) ?? Infinity),
  );
}
function moveProjectTask(projectId, key, position) {
  const project = state.projects?.find((p) => p.id === projectId);
  if (!project || !Number.isInteger(position)) return;
  const keys = orderedProjectTasks(projectId).map(taskIdentity),
    index = keys.indexOf(key),
    next = position - 1;
  if (index < 0 || next < 0 || next >= keys.length || index === next) return;
  keys.splice(index, 1);
  keys.splice(next, 0, key);
  // Keep saved ranks for recurring occurrences outside the currently selected day.
  const visible = new Set(keys);
  project.taskOrder = [
    ...keys,
    ...(project.taskOrder || []).filter((k) => !visible.has(k)),
  ];
  save();
  if (
    view === 'projects' &&
    $('#projectTaskList') &&
    selectedProject === projectId
  ) {
    taskReadScope(() => {
      const list = orderedProjectTasks(projectId),
        root = $('#projectTaskList');
      const cards = new Map(
        [...root.children]
          .filter((el) => el.matches('.task-row'))
          .map((card) => [taskIdentity(rowTask(card)), card]),
      );
      const scroll = $('#projectDetails').scrollTop,
        pageScroll = projectWindowScroll();
      for (const task of list) {
        const card = cards.get(taskIdentity(task));
        if (card) {
          if (root.moveBefore) root.moveBefore(card, null);
          else root.append(card);
        }
      }
      bindProjectTaskOrder(root, project, list, true);
      $('#projectDetails').scrollTop = scroll;
      projectWindowScroll(pageScroll);
    })();
  } else {
    taskReadScope(() =>
      refreshTaskOrderRows(
        orderedProjectTasks(projectId),
        '[data-project-order-key]',
      ),
    )();
  }
  [...document.querySelectorAll('[data-project-order-key]')]
    .find((input) => input.dataset.projectOrderKey === key)
    ?.focus({ preventScroll: true });
}
function bindProjectTaskOrder(root, project, list, updateInputs = false) {
  const ranks = new Map(list.map((t, i) => [taskIdentity(t), i + 1]));
  root.projectOrderContext = {
    projectId: project.id,
    total: list.length,
    ranks,
  };
  if (updateInputs)
    root.querySelectorAll('[data-project-order-key]').forEach((input) => {
      const rank = ranks.get(input.dataset.projectOrderKey);
      input.value = rank;
      input.dataset.projectOrderRank = rank;
      input.max = list.length;
    });
  if (root.projectOrderBound) return;
  root.projectOrderBound = true;
  const apply = (input) => {
    const current = root.projectOrderContext,
      position = Number(input.value);
    if (
      !input.value ||
      !Number.isInteger(position) ||
      position < 1 ||
      position > current.total
    ) {
      input.value = current.ranks.get(input.dataset.projectOrderKey);
      toast(`أدخل رقم ترتيب من 1 إلى ${current.total}`);
      return;
    }
    moveProjectTask(current.projectId, input.dataset.projectOrderKey, position);
  };
  root.addEventListener(
    'change',
    (e) => {
      if (!e.target.matches('[data-project-order-key]')) return;
      e.stopImmediatePropagation();
      apply(e.target);
    },
    true,
  );
  root.addEventListener(
    'keydown',
    (e) => {
      if (!e.target.matches('[data-project-order-key]')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        apply(e.target);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.target.value = root.projectOrderContext.ranks.get(
          e.target.dataset.projectOrderKey,
        );
      }
    },
    true,
  );
}
// Include stored series and historical occurrences, not generated future copies.
function projectTaskRecords(snapshot, projectId) {
  const records = [],
    add = (tasks, key = '', scheduled = false) => {
      for (const task of tasks || [])
        records.push({ task, key, scheduled, entry: { ...task, date: key } });
    };
  add(snapshot.taskInbox);
  add(snapshot.repeat);
  for (const [key, day] of Object.entries(snapshot.sunsetDays || {})) {
    add(day.tasks, key, true);
    add(day.repeatSnapshot, key);
  }
  for (const [key, day] of Object.entries(snapshot.days || {})) {
    add(day.tasks, key);
    add(day.repeatSnapshot, key);
  }
  const entries = records.map((r) => r.entry);
  return taskReadScope(() =>
    records.filter((r) => taskInProject(r.entry, projectId, entries)),
  )();
}
// Build an atomic edit of selected occurrences; never modify another day in a series.
function bulkUpdateSelectedTasks(snapshot, references, patch) {
  const fields = Object.keys(patch);
  if (
    !references.length ||
    !fields.length ||
    fields.some((key) => !['priority', 'projects'].includes(key))
  )
    throw Error('حدد مهام وحقلًا واحدًا على الأقل.');
  if (
    'priority' in patch &&
    (!Number.isInteger(patch.priority) ||
      patch.priority < 1 ||
      patch.priority > 5)
  )
    throw Error('الأولوية من 1 إلى 5.');
  if (
    'projects' in patch &&
    (!patch.projects ||
      !['add', 'remove', 'replace'].includes(patch.projects.mode) ||
      !Array.isArray(patch.projects.ids) ||
      patch.projects.ids.some(
        (id) => !snapshot.projects?.some((p) => p.id === id),
      ) ||
      (patch.projects.mode !== 'replace' && !patch.projects.ids.length))
  )
    throw Error('اختر المشاريع وطريقة التعديل.');
  const next = structuredClone(snapshot),
    previous = state;
  try {
    state = next;
    invalidateTaskReads();
    return taskReadScope(() => {
      const unique = new Map(references.map((ref) => [taskIdentity(ref), ref]));
      const selected = [...unique.values()].map((ref) =>
        findTask(ref.id, ref.date),
      );
      if (selected.some((t) => !t))
        throw Error('تغيرت بعض المهام أو حُذفت. أعد تحديدها.');
      const entries = [
        ...new Map(
          [
            ...progressEntries(),
            ...[
              ...new Set(references.map((ref) => ref.date).filter(Boolean)),
            ].flatMap(allTasksOn),
          ].map((task) => [taskIdentity(task), task]),
        ).values(),
      ];
      const record = (task) => {
        if (!task.date) return next.taskInbox.find((t) => t.id === task.id);
        const day = taskDay(task.date),
          stored = day.tasks.find((t) => t.id === task.id);
        if (stored) return stored;
        if (
          !task.recurrent &&
          !day.repeatSnapshot?.some((t) => t.id === task.id)
        )
          throw Error('المهمة لم تعد موجودة.');
        const occurrence = { ...structuredClone(task), detachedFrom: task.id };
        delete occurrence.recurrent;
        (day.excludedRepeat ??= {})[task.id] = true;
        day.tasks.push(occurrence);
        return occurrence;
      };
      if ('priority' in patch)
        selected.forEach((task) => {
          record(task).priority = patch.priority;
        });
      if (patch.projects) {
        for (const task of selected) {
          const target = record(task),
            current = effectiveProjectIds(task, entries),
            { mode, ids } = patch.projects;
          setTaskProjects(
            target,
            mode === 'replace'
              ? ids
              : mode === 'add'
                ? [...current, ...ids]
                : current.filter((id) => !ids.includes(id)),
          );
          if (task.parentId) target.projectOverride = true;
        }
      }
      invalidateTaskReads();
      validatePlanning(next);
      return next;
    })();
  } finally {
    state = previous;
    invalidateTaskReads();
  }
}
function openSelectedTaskEditor() {
  const references = [...selectedTaskRefs.values()],
    originalState = state;
  if (!references.length) return;
  let dialog = $('#selectedTasksEditor');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'selectedTasksEditor';
    document.body.append(dialog);
  }
  dialog.setAttribute('aria-labelledby', 'selectedTasksTitle');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="selectedTasksTitle">تعديل ${references.length} مهمة</h2><button type="button" data-close-selected aria-label="إغلاق">×</button></div><form id="selectedTasksForm"><section><label class="bulk-edit-switch"><input type="checkbox" data-edit-selected="priority">تعديل الأولوية</label><fieldset data-selected-value="priority" disabled>${priorityButtons(3)}</fieldset></section><section><label class="bulk-edit-switch"><input type="checkbox" data-edit-selected="projects">تعديل المشاريع المرتبطة</label><fieldset data-selected-value="projects" disabled><label class="field">الطريقة<select name="projectMode"><option value="add">إضافة للمشاريع المختارة</option><option value="remove">إزالة من المشاريع المختارة</option><option value="replace">استبدال جميع المشاريع</option></select></label><div class="task-project-options">${(state.projects || []).map((p) => `<label><input type="checkbox" name="projectIds" value="${esc(p.id)}"><span>${esc(p.name)}</span></label>`).join('')}</div><p class="hint">تغيير المشاريع يخص المحدد؛ الفرع لا يغيّر مشاريع أصله. استبدال المشاريع دون اختيار يزيل كل الروابط.</p></fieldset></section><p class="hint">الأولوية والمشاريع للمهام المحددة فقط. النسخة المتكررة تُعدّل في يومها وحده.</p><p id="selectedTasksError" role="alert"></p><div class="selected-tasks-actions"><button class="primary">تطبيق التعديل</button><button type="button" class="secondary" data-close-selected>إلغاء</button></div></form>`;
  dialog
    .querySelectorAll('[data-close-selected]')
    .forEach((button) => (button.onclick = () => dialog.close()));
  dialog.querySelectorAll('[data-edit-selected]').forEach(
    (input) =>
      (input.onchange = () => {
        dialog.querySelector(
          `[data-selected-value="${input.dataset.editSelected}"]`,
        ).disabled = !input.checked;
      }),
  );
  $('#selectedTasksForm').onsubmit = (event) => {
    event.preventDefault();
    try {
      if (state !== originalState)
        throw Error(
          'تغيرت البيانات أو الحساب. أغلق النافذة وأعد تحديد المهام.',
        );
      const patch = {},
        form = event.target;
      if (form.querySelector('[data-edit-selected="priority"]').checked)
        patch.priority = +form.elements.priority.value;
      if (form.querySelector('[data-edit-selected="projects"]').checked)
        patch.projects = {
          mode: form.elements.projectMode.value,
          ids: [...form.querySelectorAll('[name="projectIds"]:checked')].map(
            (input) => input.value,
          ),
        };
      const next = bulkUpdateSelectedTasks(state, references, patch);
      rememberDashboardPosition();
      rememberProjectView();
      state = next;
      taskSelectionState = state;
      selectedTaskRefs.clear();
      taskSelectionMode = false;
      save();
      dialog.close();
      render();
      $('#toggleTaskSelection')?.focus({ preventScroll: true });
      toast('تم تعديل المهام المحددة');
    } catch (error) {
      $('#selectedTasksError').textContent = error.message;
    }
  };
  dialog.showModal();
}
function bulkUpdateProjectTasks(snapshot, projectId, patch) {
  if (!snapshot.projects?.some((p) => p.id === projectId))
    throw Error('المشروع لم يعد موجودًا.');
  const fields = Object.keys(patch),
    allowed = [
      'priority',
      'showInMonthlyCalendar',
      'expectedSlots',
      'actionId',
    ];
  if (!fields.length) throw Error('اختر حقلًا واحدًا على الأقل لتعديله.');
  if (fields.some((key) => !allowed.includes(key)))
    throw Error('حقل غير مدعوم.');
  if (
    'priority' in patch &&
    (!Number.isInteger(patch.priority) ||
      patch.priority < 1 ||
      patch.priority > 5)
  )
    throw Error('الأهمية يجب أن تكون من 1 إلى 5.');
  if (
    'showInMonthlyCalendar' in patch &&
    typeof patch.showInMonthlyCalendar !== 'boolean'
  )
    throw Error('اختر إظهار المهام في التقويم أو إخفاءها.');
  if (
    'expectedSlots' in patch &&
    (!Number.isInteger(patch.expectedSlots) ||
      patch.expectedSlots < 0 ||
      patch.expectedSlots > 144)
  )
    throw Error('الخانات المتوقعة يجب أن تكون بين 0 و144.');
  if (
    'actionId' in patch &&
    (typeof patch.actionId !== 'string' ||
      (patch.actionId &&
        !snapshot.actions.some((a) => a.id === patch.actionId)))
  )
    throw Error('اختر فعلًا موجودًا أو بدون ربط.');
  const next = structuredClone(snapshot),
    records = projectTaskRecords(next, projectId);
  if (!records.length) throw Error('لا توجد مهام في هذا المشروع.');
  const reschedule = records.filter(
    (r) =>
      r.scheduled &&
      r.task.startSlot != null &&
      fields.some(
        (key) =>
          ['expectedSlots', 'actionId'].includes(key) &&
          patch[key] !== r.task[key],
      ),
  );
  for (const r of records) Object.assign(r.task, patch);
  // Rebuild all affected reservations together; a conflict discards the whole copy.
  const previous = state;
  try {
    state = next;
    invalidateTaskReads();
    for (const r of reschedule) removeTaskSchedule(r.key, r.task.id);
    for (const r of reschedule) {
      if (!r.task.actionId || !r.task.expectedSlots) r.task.startSlot = null;
      else scheduleTask({ ...r.task, date: r.key }, r.task.startSlot);
    }
    validatePlanning(next);
  } finally {
    state = previous;
    invalidateTaskReads();
  }
  return next;
}
function openProjectBulkEditor(project) {
  let dialog = $('#projectBulkEditor');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'projectBulkEditor';
    document.body.append(dialog);
  }
  const originalState = state;
  const row = (key, title, control) =>
    `<section class="bulk-project-field"><label><input type="checkbox" data-bulk-field="${key}"> تعديل ${title}</label><fieldset data-bulk-value="${key}" disabled>${control}</fieldset></section>`;
  dialog.setAttribute('aria-labelledby', 'projectBulkTitle');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="projectBulkTitle">تعديل جميع مهام ${esc(project.name)}</h2><button type="button" data-close-bulk aria-label="إغلاق">×</button></div><p class="hint">اختر الحقول التي تريد تطبيقها. يشمل التعديل المهام الرئيسية والفرعية، الموزعة وغير الموزعة، والسلاسل المتكررة ونسخ الأيام المحفوظة.</p><form id="projectBulkForm">
 ${row('priority', 'الأهمية', `${priorityButtons(3)}`)}
 ${row('showInMonthlyCalendar', 'الظهور في التقويم', `<label class="field">التقويم الشهري<select name="showInMonthlyCalendar"><option value="true">إظهار جميع مهام المشروع</option><option value="false">إخفاء جميع مهام المشروع</option></select></label>`)}
 ${row('expectedSlots', 'الخانات المتوقعة', '<label class="field">الخانات المتوقعة لكل مهمة<input name="expectedSlots" type="number" min="0" max="144" step="1" required value="0"></label>')}
 ${row('actionId', 'الفعل المرتبط', '<input type="hidden" name="actionId" value=""><button type="button" class="secondary task-action-trigger" data-task-action-trigger aria-haspopup="dialog" aria-controls="taskActionPicker"><span data-task-action-label>بدون ربط — اختر فعلًا</span></button>')}
 <p class="hint">عند تغيير الخانات أو الفعل تُحدّث الحجوزات المخططة. اختيار صفر خانات أو «بدون ربط» يلغي الحجز. إذا تعارضت الحجوزات فلن يُطبق أي تعديل.</p><p id="projectBulkError" role="alert"></p><button type="submit" class="primary">تطبيق على جميع مهام المشروع</button></form>`;
  dialog.querySelector('[data-close-bulk]').onclick = () => dialog.close();
  const form = $('#projectBulkForm');
  attachTaskActionPicker(form);
  form.querySelectorAll('[data-bulk-field]').forEach(
    (input) =>
      (input.onchange = () => {
        form.querySelector(
          `[data-bulk-value="${input.dataset.bulkField}"]`,
        ).disabled = !input.checked;
      }),
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      if (state !== originalState)
        throw Error('تغيرت البيانات. أغلق النافذة وافتحها مجددًا.');
      const f = form.elements,
        patch = {};
      for (const input of form.querySelectorAll('[data-bulk-field]:checked')) {
        const key = input.dataset.bulkField,
          value = f[key].value;
        if (key === 'expectedSlots' && value === '')
          throw Error('أدخل عدد الخانات المتوقعة.');
        patch[key] = ['priority', 'expectedSlots'].includes(key)
          ? Number(value)
          : key === 'showInMonthlyCalendar'
            ? value === 'true'
            : value;
      }
      state = bulkUpdateProjectTasks(state, project.id, patch);
      save();
      dialog.close();
      render();
      toast('تم تعديل مهام المشروع');
    } catch (err) {
      $('#projectBulkError').textContent = err.message;
    }
  };
  dialog.showModal();
}
function openProjectEditor(project = null) {
  let dialog = $('#projectEditor');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'projectEditor';
    document.body.append(dialog);
  }
  const originalState = state;
  dialog.innerHTML = `<div class="dialog-head"><h2 id="projectEditorTitle">${project ? 'تعديل المشروع' : 'مشروع جديد'}</h2><button type="button" data-close-project aria-label="إغلاق">×</button></div><form id="projectForm"><label class="field">اسم المشروع<input name="projectName" required maxlength="100" value="${esc(project?.name || '')}"></label><label class="field">وصف مختصر<textarea name="description" maxlength="1000">${esc(project?.description || '')}</textarea></label><p role="alert" id="projectError"></p><button class="primary">حفظ المشروع</button></form>`;
  dialog.setAttribute('aria-labelledby', 'projectEditorTitle');
  dialog.querySelector('[data-close-project]').onclick = () => dialog.close();
  $('#projectForm').onsubmit = (e) => {
    e.preventDefault();
    if (state !== originalState) {
      $('#projectError').textContent =
        'تغيرت البيانات. أغلق النافذة وافتحها مجددًا.';
      return;
    }
    const f = e.target.elements,
      name = f.projectName.value.trim();
    if (!name) return;
    state.projects ??= [];
    const target = project
      ? state.projects.find((p) => p.id === project.id)
      : null;
    if (project && !target) {
      $('#projectError').textContent = 'المشروع لم يعد موجودًا.';
      return;
    }
    const next = {
      id: project?.id || uid(),
      name,
      description: f.description.value.trim(),
    };
    if (target) Object.assign(target, next);
    else state.projects.push(next);
    selectedProject = next.id;
    save();
    dialog.close();
    render();
  };
  dialog.showModal();
}
function deleteProject(project) {
  if (!confirm('حذف المشروع وإلغاء ربط مهامه؟ ستبقى المهام ونتائجها محفوظة.'))
    return;
  state.projects = (state.projects || []).filter((p) => p.id !== project.id);
  const lists = [
    state.taskInbox || [],
    state.repeat || [],
    ...[
      ...Object.values(state.days || {}),
      ...Object.values(state.sunsetDays || {}),
    ].flatMap((d) => [d.tasks || [], d.repeatSnapshot || []]),
  ];
  for (const list of lists)
    for (const t of list)
      if (taskProjectIds(t).includes(project.id))
        setTaskProjects(
          t,
          taskProjectIds(t).filter((id) => id !== project.id),
        );
  selectedProject = '';
  save();
  render();
}

function removeProjectAndItsTasks(snapshot, projectId) {
  const next = structuredClone(snapshot);
  if (!(next.projects || []).some((p) => p.id === projectId))
    throw Error('لم يعد المشروع موجودًا.');
  const days = [
    ...Object.values(next.days || {}),
    ...Object.values(next.sunsetDays || {}),
  ];
  const records = [],
    add = (tasks, key = '') => {
      for (const task of tasks || [])
        records.push({ task, entry: { ...task, date: key } });
    };
  add(next.taskInbox);
  add(next.repeat);
  for (const [key, day] of Object.entries(next.sunsetDays || {})) {
    add(day.tasks, key);
    add(day.repeatSnapshot, key);
  }
  for (const [key, day] of Object.entries(next.days || {})) {
    add(day.tasks, key);
    add(day.repeatSnapshot, key);
  }
  const entries = records.map((r) => r.entry),
    deleteIds = new Set(),
    sharedIds = new Set();
  // The project owns exclusive tasks, but shared tasks must survive in other projects.
  for (const r of records) {
    const ids = effectiveProjectIds(r.entry, entries);
    if (!ids.includes(projectId)) continue;
    if (ids.some((id) => id !== projectId)) sharedIds.add(r.task.id);
    else deleteIds.add(r.task.id);
  }
  for (const id of sharedIds) deleteIds.delete(id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { task } of records)
      if (
        !deleteIds.has(task.id) &&
        !sharedIds.has(task.id) &&
        task.projectOverride !== true &&
        (deleteIds.has(task.parentId) || deleteIds.has(task.detachedFrom))
      ) {
        deleteIds.add(task.id);
        changed = true;
      }
  }
  const keep = (list) => list.filter((t) => !deleteIds.has(t.id));
  next.taskInbox = keep(next.taskInbox || []);
  next.repeat = keep(next.repeat || []);
  next.projects = next.projects.filter((p) => p.id !== projectId);
  for (const p of next.projects)
    if (p.taskOrder)
      p.taskOrder = p.taskOrder.filter((key) => {
        try {
          return !deleteIds.has(JSON.parse(key)[0]);
        } catch {
          return true;
        }
      });
  // Detach all surviving records from the deleted project without losing other memberships.
  for (const { task } of records)
    if (!deleteIds.has(task.id) && taskProjectIds(task).includes(projectId))
      setTaskProjects(
        task,
        taskProjectIds(task).filter((id) => id !== projectId),
      );
  for (const d of days) {
    if (Array.isArray(d.tasks)) d.tasks = keep(d.tasks);
    if (Array.isArray(d.repeatSnapshot))
      d.repeatSnapshot = keep(d.repeatSnapshot);
    for (const field of ['done', 'failed', 'taskProgress', 'excludedRepeat'])
      if (d[field]) for (const id of deleteIds) delete d[field][id];
    for (const [slot, owner] of Object.entries(d.taskSlotOwners || {}))
      if (deleteIds.has(owner)) {
        if (d.planned?.[slot] === d.taskSlotValues?.[slot])
          delete d.planned[slot];
        if (d.plannedNotes?.[slot] === d.taskSlotNotes?.[slot])
          delete d.plannedNotes[slot];
        delete d.taskSlotOwners[slot];
        if (d.taskSlotValues) delete d.taskSlotValues[slot];
        if (d.taskSlotNotes) delete d.taskSlotNotes[slot];
      }
    // Actual recorded work remains, but labels for physically removed tasks do not.
    for (const [slot, task] of Object.entries(d.actualTasks || {}))
      if (deleteIds.has(task?.id)) delete d.actualTasks[slot];
  }
  validatePlanning(next);
  return {
    state: next,
    deletedTasks: deleteIds.size,
    retainedShared: sharedIds.size,
  };
}
function deleteProjectWithTasks(project) {
  const result = removeProjectAndItsTasks(state, project.id);
  if (
    !confirm(
      'هل تريد حذف مشروع «' +
        project.name +
        '» نهائيًا وحذف ' +
        result.deletedTasks +
        ' مهمة خاصة به؟ ستبقى المهام المشتركة (' +
        result.retainedShared +
        ') في المشاريع الأخرى مع تقدمها. لا يمكن التراجع؛ يُنصح بتنزيل نسخة احتياطية أولًا.',
    )
  )
    return false;
  state = result.state;
  selectedProject = '';
  save();
  render();
  toast('حُذف المشروع وجميع مهامه المرتبطة');
  return true;
}

function openProjectTaskLink(project) {
  let dialog = $('#projectTaskLink');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'projectTaskLink';
    document.body.append(dialog);
  }
  const originalState = state,
    entries = taskEntries().filter(
      (t) =>
        !t.parentId &&
        !t.recurrent &&
        !effectiveProjectIds(t).includes(project.id),
    ),
    series = state.repeat.filter(
      (t) => !effectiveProjectIds(t).includes(project.id),
    );
  const options = [
    ...entries.map((t) => ({ task: t, series: false })),
    ...series.map((t) => ({ task: t, series: true })),
  ];
  dialog.innerHTML = `<div class="dialog-head"><h2 id="projectLinkTitle">ربط مهمة موجودة</h2><button type="button" data-close-link aria-label="إغلاق">×</button></div><p class="hint">اختر مهمة لإضافتها إلى هذا المشروع مع الاحتفاظ بارتباطها بالمشاريع الأخرى، ثم احفظ.</p><label class="field">بحث<input type="search" id="projectLinkSearch" placeholder="اسم المهمة"></label><div class="project-link-list">${options.map(({ task: t, series }, i) => `<button type="button" class="secondary" data-link-task="${i}"><strong>${esc(t.name)}</strong><small>${series ? '↻ سلسلة متكررة' : t.date || 'تحتاج توزيعًا'}${projectName(t) ? ' · ' + esc(projectName(t)) : ''}</small></button>`).join('') || '<p class="empty-note">لا توجد مهام أخرى. يمكنك إضافة مهمة جديدة للمشروع.</p>'}</div>`;
  dialog.setAttribute('aria-labelledby', 'projectLinkTitle');
  dialog.querySelector('[data-close-link]').onclick = () => dialog.close();
  $('#projectLinkSearch').oninput = (e) =>
    dialog
      .querySelectorAll('[data-link-task]')
      .forEach(
        (b) =>
          (b.hidden = !options[+b.dataset.linkTask].task.name.includes(
            e.target.value.trim(),
          )),
      );
  dialog.querySelectorAll('[data-link-task]').forEach(
    (b) =>
      (b.onclick = () => {
        if (state !== originalState) return;
        const { task, series } = options[+b.dataset.linkTask];
        dialog.close();
        const projectIds = [
          ...new Set([...effectiveProjectIds(task), project.id]),
        ];
        const draft = { ...task, projectIds, projectId: projectIds[0] };
        if (series) {
          view = 'repeat';
          render();
          renderRepeat(draft);
        } else {
          // Keep the original identity/fields for change detection; preselect the added membership in the form only.
          openPlannerEditor(task);
          document
            .querySelectorAll('#plannerForm input[name="projectIds"]')
            .forEach((input) => {
              input.checked = projectIds.includes(input.value);
            });
          attachTaskProjectSummary(document.querySelector('#plannerForm'));
        }
      }),
  );
  dialog.showModal();
}

function importProjectPackage(data) {
  if (
    !data ||
    data.format !== 'wkt-project-v1' ||
    data.version !== 1 ||
    !data.project ||
    !Array.isArray(data.tasks) ||
    !data.tasks.length ||
    data.tasks.length > 1000
  )
    throw Error('هذا ليس ملف مشروع wkt مدعومًا.');
  const p = data.project;
  if (
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 100 ||
    (p.description !== undefined &&
      (typeof p.description !== 'string' || p.description.length > 1000))
  )
    throw Error('اسم المشروع أو وصفه غير صالح.');
  const ids = new Map(),
    tasks = [],
    roots = [],
    projectId = uid();
  for (const t of data.tasks) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !t.id ||
      t.id.length > 120 ||
      ids.has(t.id) ||
      typeof t.name !== 'string' ||
      !t.name.trim() ||
      t.name.length > 150 ||
      (t.description !== undefined &&
        (typeof t.description !== 'string' || t.description.length > 500))
    )
      throw Error('يوجد اسم مهمة أو وصف أو معرف غير صالح في الملف.');
    if (
      t.parentId !== undefined &&
      (typeof t.parentId !== 'string' || !ids.has(t.parentId))
    )
      throw Error('المهام الفرعية يجب أن تأتي بعد مهامها الرئيسية.');
    if (
      t.priority !== undefined &&
      (!Number.isInteger(t.priority) || t.priority < 1 || t.priority > 5)
    )
      throw Error('أولوية غير صالحة.');
    if (
      t.expectedSlots !== undefined &&
      (!Number.isInteger(t.expectedSlots) ||
        t.expectedSlots < 0 ||
        t.expectedSlots > 144)
    )
      throw Error('عدد خانات غير صالح.');
    if (
      t.showInMonthlyCalendar !== undefined &&
      typeof t.showInMonthlyCalendar !== 'boolean'
    )
      throw Error('خيار التقويم غير صالح.');
    const newId = uid(),
      parent = t.parentId ? ids.get(t.parentId) : null;
    const item = {
      id: newId,
      name: t.name.trim(),
      description: t.description || '',
      projectIds: [projectId],
      projectId,
      priority: t.priority ?? 3,
      expectedSlots: t.expectedSlots ?? 0,
      completedSlotCount: 0,
      showInMonthlyCalendar: t.showInMonthlyCalendar !== false,
      prayers: [],
    };
    if (parent) {
      item.parentId = parent.id;
      item.parentDate = '';
      item.parentName = parent.name;
    } else roots.push(item);
    ids.set(t.id, item);
    tasks.push(item);
  }
  if (!roots.length) throw Error('الملف بلا مهام رئيسية.');
  const project = {
    id: projectId,
    name: p.name.trim(),
    description: p.description || '',
    taskOrder: roots.map((t) => taskIdentity(t)),
    ...(p.goals !== undefined ? { goals: structuredClone(p.goals) } : {}),
  };
  const candidate = {
    ...state,
    projects: [...(state.projects || []), project],
    taskInbox: [...(state.taskInbox || []), ...tasks],
  };
  validatePlanning(candidate);
  // Validate everything before changing the current snapshot.
  state.projects = candidate.projects;
  state.taskInbox = candidate.taskInbox;
  selectedProject = project.id;
  view = 'projects';
  save();
  render();
  toast(
    'تمت إضافة المشروع مع ' +
      roots.length +
      ' مهمة رئيسية و' +
      (tasks.length - roots.length) +
      ' فرعية',
  );
  return project;
}

// Project navigation state lives only in this tab's JS session, outside the data snapshot.
const projectViews = new Map();
let mountedProject = null,
  activeProjectContext = null,
  projectMenusInstalled = false;
function projectView(id) {
  if (!projectViews.has(id))
    projectViews.set(id, {
      query: '',
      expanded: new Set(),
      scroll: 0,
      browseScroll: 0,
      windowScroll: 0,
    });
  return projectViews.get(id);
}
function projectWindowScroll(top) {
  const page = document.scrollingElement || document.documentElement;
  if (top !== undefined) page.scrollTop = top;
  return page.scrollTop;
}
function rememberProjectView() {
  const panel = $('#projectDetails');
  if (
    !panel ||
    !mountedProject ||
    panel.dataset.projectId !== mountedProject.id
  )
    return;
  const ui = projectView(mountedProject.id);
  ui.scroll = panel.scrollTop;
  ui.windowScroll = projectWindowScroll();
  if (!ui.query)
    ui.expanded = new Set(
      [...expandedTaskRows].filter((key) => mountedProject.keys.has(key)),
    );
}
function projectModel(id) {
  return cachedTaskRead('project-model:' + id, () => {
    const entries = projectTasks(id),
      roots = orderedProjectTasks(id),
      membership = projectMemberKeys(entries);
    return {
      entries,
      roots,
      keys: membership,
      order: new Map(
        roots.map((t, i) => [
          taskIdentity(t),
          { position: i + 1, total: roots.length, name: t.name },
        ]),
      ),
      percent: projectCompletion(id),
      done: roots.filter((t) => taskCompletion(t) === 100).length,
      membership,
    };
  });
}
function projectMemberKeys(entries) {
  const membership = new Set(entries.map(taskIdentity));
  for (const entry of entries) {
    let current = entry;
    const seen = new Set();
    while (current.parentId && !seen.has(taskIdentity(current))) {
      seen.add(taskIdentity(current));
      current = parentTask(current) || mainTask(current);
      const key = taskIdentity(current);
      if (membership.has(key)) break;
      membership.add(key);
      if (current.virtual) break;
    }
  }
  return membership;
}
function normalizeProjectSearch(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .toLocaleLowerCase()
    .trim();
}
function projectSearchContext(model, query) {
  query = normalizeProjectSearch(query);
  if (!query) return null;
  const matches = new Set(),
    visible = new Set(),
    forced = new Set(),
    visited = new Set();
  const candidates = [
    ...model.entries,
    ...model.roots.filter((t) => t.virtual),
  ];
  for (const t of candidates)
    if (
      normalizeProjectSearch(t.name + ' ' + (t.description || '')).includes(
        query,
      )
    )
      matches.add(taskIdentity(t));
  const visit = (t) => {
    const key = taskIdentity(t);
    if (!model.membership.has(key)) return;
    if (visited.has(key)) return;
    visited.add(key);
    visible.add(key);
    childTasks(t).forEach(visit);
  };
  for (const t of candidates)
    if (matches.has(taskIdentity(t))) {
      visit(t);
      if (childTasks(t).length) forced.add(taskIdentity(t));
      let current = t;
      const seen = new Set();
      while (current.parentId && !seen.has(taskIdentity(current))) {
        seen.add(taskIdentity(current));
        current = parentTask(current) || mainTask(current);
        const key = taskIdentity(current);
        visible.add(key);
        forced.add(key);
        if (current.virtual) break;
      }
    }
  return { visible, forced, matches };
}
function projectRowContext(card) {
  return card.closest('#projectTaskList') ? activeProjectContext : null;
}
function applyProjectExpansion(model, ui) {
  for (const key of model.keys) expandedTaskRows.delete(key);
  for (const key of ui.expanded)
    if (model.keys.has(key)) expandedTaskRows.add(key);
}
function renderProjectTaskList(context = undefined) {
  return taskReadScope(() => {
    const project = state.projects?.find((p) => p.id === selectedProject),
      root = $('#projectTaskList');
    if (!project || !root) return;
    const model = projectModel(project.id),
      ui = projectView(project.id);
    applyProjectExpansion(model, ui);
    const searchContext =
      context === undefined ? projectSearchContext(model, ui.query) : context;
    activeProjectContext = {
      ...(searchContext || {
        visible: model.membership,
        forced: new Set(),
        matches: new Set(),
      }),
      order: model.order,
      projectId: project.id,
    };
    const roots = model.roots.filter(
      (t) =>
        !activeProjectContext?.visible ||
        activeProjectContext.visible.has(taskIdentity(t)),
    );
    root.innerHTML =
      roots.map((t) => taskCard(t, activeProjectContext)).join('') ||
      `<p class="empty-note">${ui.query ? 'لا توجد مهام تطابق البحث في هذا المشروع.' : 'لا توجد مهام مرتبطة بهذا المشروع بعد.'}</p>`;
    $('#projectSearchResults').textContent = ui.query
      ? `${activeProjectContext?.matches.size || 0} مطابقة · ${roots.length} مهام رئيسية`
      : `${model.roots.length} مهام رئيسية`;
    $('#clearProjectSearch').hidden = !ui.query;
    bindTaskCards(root);
    bindProjectTaskOrder(root, project, model.roots);
    installTaskSelection();
  })();
}
function expandProjectTasks(open) {
  taskReadScope(() => {
    rememberProjectView();
    const ui = projectView(selectedProject),
      model = projectModel(selectedProject),
      root = $('#projectTaskList');
    const scroll = $('#projectDetails').scrollTop,
      pageScroll = projectWindowScroll();
    ui.expanded = open
      ? new Set(
          [...model.entries, ...model.roots]
            .filter((t) => childTasks(t).length)
            .map(taskIdentity),
        )
      : new Set();
    applyProjectExpansion(model, ui);
    if (activeProjectContext)
      activeProjectContext = { ...activeProjectContext, forced: new Set() };
    if (open) {
      let buttons = [
        ...root.querySelectorAll('[data-task-toggle][aria-expanded="false"]'),
      ];
      while (buttons.length) {
        buttons.forEach((button) => toggleTaskRow(button.closest('.task-row')));
        buttons = [
          ...root.querySelectorAll('[data-task-toggle][aria-expanded="false"]'),
        ];
      }
    } else {
      [...root.children]
        .filter((card) => card.matches('.task-row'))
        .forEach((card) => {
          if (
            rowOwn(card, '[data-task-toggle]')[0]?.getAttribute(
              'aria-expanded',
            ) === 'true'
          )
            toggleTaskRow(card);
        });
    }
    $('#projectDetails').scrollTop = scroll;
    projectWindowScroll(pageScroll);
    rememberProjectView();
  })();
}
function selectProject(id) {
  if (!state.projects?.some((p) => p.id === id)) return;
  taskReadScope(() => {
    rememberProjectView();
    selectedProject = id;
    updateProjectNavigation();
    renderProjectDetails();
  })();
}
function updateProjectNavigation() {
  const projects = state.projects || [],
    nav = $('#projectNavigation'),
    select = $('#projectSelect');
  const signature = JSON.stringify(projects.map((p) => [p.id, p.name]));
  if (nav.dataset.signature !== signature) {
    nav.innerHTML =
      projects
        .map(
          (p) =>
            `<button type="button" class="project-nav-item" data-project="${esc(p.id)}"><span>${esc(p.name)}</span><small data-project-summary="${esc(p.id)}"></small></button>`,
        )
        .join('') || '<p class="empty-note">أضف أول مشروع.</p>';
    select.innerHTML =
      '<option value="">اختر مشروعًا</option>' +
      projects
        .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
        .join('');
    nav.dataset.signature = signature;
  }
  nav.querySelectorAll('[data-project]').forEach((button) => {
    const id = button.dataset.project,
      model = projectModel(id),
      current = id === selectedProject;
    button.classList.toggle('chosen', current);
    button.setAttribute('aria-pressed', String(current));
    button.querySelector('small').textContent =
      `${percentLabel(model.percent)} إنجاز · ${model.done} / ${model.roots.length} مهام مكتملة`;
    button.onclick = () => selectProject(id);
  });
  select.value = selectedProject;
  select.onchange = () => selectProject(select.value);
  applyCompletedVisibility();
}
function renderProjectDetails() {
  const details = $('#projectDetails'),
    project = state.projects?.find((p) => p.id === selectedProject);
  activeProjectContext = null;
  if (!project) {
    mountedProject = null;
    details.removeAttribute('data-project-id');
    details.innerHTML =
      '<p class="empty-note">اختر مشروعًا لعرض مهامه أو أنشئ مشروعًا جديدًا.</p>';
    return;
  }
  const model = projectModel(project.id),
    ui = projectView(project.id);
  // Preserve expansion from phase 1 the first time this project is opened.
  if (!ui.initialized) {
    ui.expanded = new Set(
      [...expandedTaskRows].filter((key) => model.keys.has(key)),
    );
    ui.initialized = true;
  }
  mountedProject = { id: project.id, keys: model.keys };
  details.dataset.projectId = project.id;
  details.innerHTML = `<div class="project-heading"><div><h2>${esc(project.name)}</h2><span class="project-heading-count"><b data-project-summary="${esc(project.id)}" data-summary-kind="count">${model.done}/${model.roots.length}</b> مهام رئيسية مكتملة</span></div><strong class="project-heading-percent" data-project-summary="${esc(project.id)}" data-summary-kind="percent">${percentLabel(model.percent)}</strong><button type="button" id="projectGoals" class="project-goals-trigger" aria-label="أهداف المشروع">＋ هدف</button><details class="project-menu"><summary aria-label="إجراءات مشروع ${esc(project.name)}">${taskIcon('more')}</summary><div><button type="button" id="editProject">تعديل المشروع</button><button type="button" id="linkProjectTask">ربط مهمة موجودة</button><button type="button" id="bulkProjectTasks">تعديل جميع مهام المشروع</button><button type="button" id="deleteProject">حذف المشروع (الاحتفاظ بالمهام)</button><details><summary>خيارات إضافية</summary><button type="button" id="deleteProjectWithTasks">حذف المشروع ومهامه الحصرية نهائيًا</button></details><details class="project-info"><summary>تفاصيل المشروع والتقدم</summary>${project.description ? `<p>${esc(project.description)}</p>` : ''}<p data-project-summary="${esc(project.id)}" data-summary-kind="outcomes">${model.done} مكتملة · ${model.roots.filter((t) => outcome(t) === 'failed').length} لم تُفعل · ${model.roots.filter((t) => outcome(t) === 'pending').length} بانتظار التسجيل</p><p class="hint">نسبة المشروع = الخانات المنجزة ÷ الخانات المتوقعة للمهام النهائية. المهام بلا تقدير لا تدخل في النسبة، وعلامة صح تحتسب كامل خانات المهمة. المهام المشتركة تحتسب في كل مشروع مرتبط وتتشارك التقدم والنتائج. الأصل ذو الفروع يُحسب من فروعه دون احتسابه مرتين. المهام تشمل صندوق الوارد والنسخ الموزعة والمتكررة المسجلة ونسخ اليوم (${date}). الترتيب بالأرقام في «المزيد» لكل مهمة رئيسية.</p></details></div></details></div>
    <div class="project-progress-track" id="projectGoalsTrack" data-project-id="${esc(project.id)}"><progress class="project-heading-progress" data-project-summary="${esc(project.id)}" value="${model.percent}" max="100" aria-label="إنجاز ${esc(project.name)}"></progress><div class="project-goal-markers"></div></div><p class="project-goal-summary" id="projectGoalSummary" aria-live="polite"></p>
    <div class="project-list-toolbar"><label class="project-search"><span class="sr-only">بحث داخل المشروع</span><input type="search" id="projectSearch" placeholder="ابحث عن مهمة أو جزء أو صفحات…" value="${esc(ui.query)}" aria-controls="projectTaskList"></label><button type="button" id="clearProjectSearch" class="secondary" ${ui.query ? '' : 'hidden'}>مسح</button><button type="button" id="newProjectTask" class="primary">${taskIcon('plus')} مهمة</button><div class="project-expansion"><button type="button" id="expandProjectTasks">فتح الكل</button><button type="button" id="collapseProjectTasks">طي الكل</button></div><span id="projectSearchResults" role="status" aria-live="polite"></span></div><section id="projectTaskList" aria-label="مهام ${esc(project.name)}"></section>`;
  $('#projectGoals').onclick = () => openProjectGoals(project);
  $('#projectGoalsTrack').onclick = (event) => {
    const marker = event.target.closest('[data-project-goal]');
    if (marker) openProjectGoals(project, marker.dataset.projectGoal);
  };
  refreshProjectGoals();
  $('#editProject').onclick = () => openProjectEditor(project);
  $('#bulkProjectTasks').onclick = () => openProjectBulkEditor(project);
  $('#deleteProject').onclick = () => deleteProject(project);
  $('#deleteProjectWithTasks').onclick = () => deleteProjectWithTasks(project);
  $('#newProjectTask').onclick = () =>
    openPlannerEditor(null, null, project.id);
  $('#linkProjectTask').onclick = () => openProjectTaskLink(project);
  $('#expandProjectTasks').onclick = () => expandProjectTasks(true);
  $('#collapseProjectTasks').onclick = () => expandProjectTasks(false);
  const search = $('#projectSearch');
  const changeSearch = () => {
    rememberProjectView();
    const old = ui.query;
    if (!old) ui.browseScroll = projectWindowScroll();
    ui.query = search.value;
    renderProjectTaskList();
    projectWindowScroll(
      ui.query
        ? Math.max(
            0,
            projectWindowScroll() + details.getBoundingClientRect().top - 72,
          )
        : ui.browseScroll,
    );
    ui.windowScroll = projectWindowScroll();
  };
  search.oninput = changeSearch;
  search.onkeydown = (e) => {
    if (e.key === 'Escape' && search.value) {
      e.preventDefault();
      search.value = '';
      changeSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = details.querySelector(
        '[data-project-match] [data-task-select]',
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'nearest' });
    }
  };
  $('#clearProjectSearch').onclick = () => {
    search.value = '';
    changeSearch();
    search.focus({ preventScroll: true });
  };
  details.onkeydown = (e) => {
    if (e.key === 'Escape' && e.target.closest('.project-menu')) {
      const menu = details.querySelector('.project-menu');
      menu.open = false;
      menu.querySelector('summary').focus({ preventScroll: true });
    }
  };
  renderProjectTaskList();
  details.scrollTop = ui.scroll;
  projectWindowScroll(ui.windowScroll);
}
function renderProjects() {
  if (!projectMenusInstalled) {
    document.addEventListener('pointerdown', (e) =>
      document.querySelectorAll('.project-menu[open]').forEach((menu) => {
        if (!menu.contains(e.target)) menu.open = false;
      }),
    );
    projectMenusInstalled = true;
  }
  rememberProjectView();
  const projects = state.projects || [];
  if (selectedProject && !projects.some((p) => p.id === selectedProject))
    selectedProject = '';
  if (!app.querySelector('.project-workspace')) {
    app.innerHTML = `<div class="project-workspace"><div class="top project-page-heading"><div><h1>المشاريع</h1><p>هدف واضح، وخطوة صغيرة كل يوم.</p></div><div class="project-page-actions"><button type="button" class="primary" id="newProject">${taskIcon('plus')} مشروع جديد</button><details class="project-menu project-page-menu"><summary aria-label="إجراءات المشاريع">${taskIcon('more')}</summary><div><label class="project-import-label" role="button" tabindex="0">↑ استيراد مشروع<input type="file" id="projectImport" accept=".json,application/json" hidden></label></div></details></div></div><label class="project-mobile-picker">المشروع<select id="projectSelect" aria-label="اختيار المشروع"></select></label><div class="project-layout"><section class="project-sidebar" aria-label="قائمة المشاريع"><h2>مشاريعي</h2><div class="project-list" id="projectNavigation"></div></section><section class="panel" id="projectDetails" tabindex="-1" aria-label="المشروع المختار"></section></div></div>`;
  }
  $('#newProject').onclick = () => openProjectEditor();
  const input = $('#projectImport');
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1000000)
        throw Error('ملف المشروع أكبر من الحد المسموح (1 ميجابايت).');
      const data = JSON.parse(await file.text());
      if (
        state.projects?.some((p) => p.name === data?.project?.name) &&
        !confirm('هناك مشروع بهذا الاسم؛ هل تريد إضافة نسخة جديدة مستقلة؟')
      )
        return;
      input.closest('details').open = false;
      importProjectPackage(data);
    } catch (err) {
      toast(
        err instanceof SyntaxError
          ? 'ملف JSON غير صالح'
          : err.message || 'تعذر استيراد المشروع',
      );
    }
  };
  input.closest('label').onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  };
  updateProjectNavigation();
  renderProjectDetails();
}
