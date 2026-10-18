/* Unified daily, backlog, future, inbox, monthly and weekly planning. */
let plannerTab = 'day',
  plannerQuery = '',
  plannerPriority = 'all',
  plannerStatus = 'all',
  plannerProject = 'all',
  plannerMonth = '',
  plannerWeek = '';
// Presentation preference only: outcomes, estimates and project totals stay intact.
let hideCompletedWork = false;
let taskSelectionMode = false,
  taskSelectionState = null;
const selectedTaskRefs = new Map();
function refreshTaskSelection() {
  app.classList.toggle('task-selection-mode', taskSelectionMode);
  if (!taskSelectionMode) {
    app.querySelectorAll('.task-bulk-check').forEach((label) => label.remove());
    return;
  }
  app
    .querySelectorAll('.task-row:not([data-virtual]):not(.task-historical)')
    .forEach((card) => {
      if (card.dataset.rowMode === 'series') return;
      const task = rowTask(card);
      if (!task) return;
      const heading = card.querySelector(':scope > .task-row-heading');
      let label = heading.querySelector(':scope > .task-bulk-check');
      if (!label) {
        label = document.createElement('label');
        label.className = 'task-bulk-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.selectTask = '';
        input.setAttribute(
          'aria-label',
          'تحديد ' + heading.querySelector('.daily-task-name').textContent,
        );
        label.append(input);
        heading.insertBefore(
          label,
          heading.querySelector('[data-task-select]'),
        );
      }
      label.querySelector('input').checked = selectedTaskRefs.has(
        taskIdentity(task),
      );
    });
  const count = $('#selectedTaskCount');
  if (count) count.textContent = `${selectedTaskRefs.size} محددة`;
  const edit = $('#editSelectedTasks');
  if (edit) edit.disabled = !selectedTaskRefs.size;
  const remove = $('#deleteSelectedTasks');
  if (remove) remove.disabled = !selectedTaskRefs.size;
  const transfer = $('#transferSelectedTasks');
  if (transfer) transfer.disabled = !selectedTaskRefs.size;
}
function installTaskSelection() {
  if (
    taskSelectionState !== state ||
    !['projects', 'dashboard'].includes(view)
  ) {
    selectedTaskRefs.clear();
    taskSelectionMode = false;
    taskSelectionState = state;
  }
  if (
    !['projects', 'dashboard'].includes(view) ||
    (view !== 'projects' &&
      !app.querySelector('.task-row') &&
      !app.querySelector('#plannerSearch'))
  ) {
    refreshTaskSelection();
    return;
  }
  let button = $('#toggleTaskSelection');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'toggleTaskSelection';
    button.className = 'secondary';
    (
      app.querySelector('.project-page-actions') || app.querySelector('.top')
    ).append(button);
  }
  const search = app.querySelector('#projectSearch, #plannerSearch');
  if (search) {
    const label = search.closest('label');
    let group = label.parentElement;
    if (!group.classList.contains('task-selection-search')) {
      group = document.createElement('div');
      group.className = 'task-selection-search';
      label.replaceWith(group);
      group.append(label);
    }
    if (button.parentElement !== group) group.append(button);
  }
  const hasTasks = !!app.querySelector(
    '.task-row:not([data-virtual]):not(.task-historical)',
  );
  button.textContent = taskSelectionMode ? 'إنهاء التحديد' : 'تحديد عدة مهام';
  button.disabled = !hasTasks && !taskSelectionMode;
  button.title = button.disabled
    ? selectedProject
      ? 'لا توجد مهام ظاهرة في هذا المشروع للتحديد'
      : 'اختر مشروعًا لبدء تحديد مهامه'
    : 'اختر مهام لتعديلها جماعيًا أو حذفها';
  button.setAttribute('aria-pressed', String(taskSelectionMode));
  button.onclick = () => {
    taskSelectionMode = !taskSelectionMode;
    if (!taskSelectionMode) selectedTaskRefs.clear();
    installTaskSelection();
  };
  let toolbar = $('#taskSelectionToolbar');
  if (taskSelectionMode && !toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'taskSelectionToolbar';
    toolbar.className = 'task-selection-toolbar';
    toolbar.innerHTML =
      '<span id="selectedTaskCount" role="status"></span><button type="button" id="selectVisibleTasks">تحديد الظاهر</button><button type="button" id="clearSelectedTasks">مسح التحديد</button><button type="button" id="editSelectedTasks" class="primary">تعديل المحدد</button><button type="button" id="transferSelectedTasks" class="secondary" title="تسجيل عدم الإنجاز ونقل المحدد">نقل</button><button type="button" id="deleteSelectedTasks" class="secondary">حذف المحدد</button>';
    app.querySelector('.top').after(toolbar);
    $('#selectVisibleTasks').onclick = () => {
      app.querySelectorAll('[data-select-task]').forEach((input) => {
        if (input.closest('[hidden]')) return;
        const card = input.closest('.task-row');
        const ref = {
          id: card.dataset.taskId,
          date: card.dataset.taskDate || '',
        };
        const task = rowTask(card);
        if (task && !task.historical)
          selectedTaskRefs.set(taskIdentity(task), ref);
      });
      refreshTaskSelection();
    };
    $('#clearSelectedTasks').onclick = () => {
      selectedTaskRefs.clear();
      refreshTaskSelection();
    };
    $('#editSelectedTasks').onclick = openSelectedTaskEditor;
    $('#transferSelectedTasks').onclick = openSelectedTaskTransfer;
    $('#deleteSelectedTasks').onclick = deleteSelectedTasks;
  }
  if (!taskSelectionMode) toolbar?.remove();
  if (!app.taskSelectionBound) {
    app.taskSelectionBound = true;
    app.addEventListener('change', (event) => {
      if (!event.target.matches('[data-select-task]')) return;
      const task = rowTask(event.target.closest('.task-row'));
      if (!task) return;
      if (event.target.checked)
        selectedTaskRefs.set(taskIdentity(task), {
          id: task.id,
          date: task.date || '',
        });
      else selectedTaskRefs.delete(taskIdentity(task));
      refreshTaskSelection();
    });
  }
  refreshTaskSelection();
}
function openSelectedTaskTransfer() {
  const references = [...selectedTaskRefs.values()],
    originalState = state;
  if (!references.length) return;
  const signature = () =>
    JSON.stringify(
      references.map((ref) => {
        const task = findTask(ref.id, ref.date);
        return task
          ? { task, outcome: outcome(task), slots: completedSlots(task) }
          : null;
      }),
    );
  if (taskSelectionState !== state) {
    toast('تغيرت البيانات أو الحساب؛ أعد تحديد المهام.');
    return;
  }
  const tasks = references.map((ref) => findTask(ref.id, ref.date));
  if (tasks.some((t) => !t || t.historical)) {
    toast('تغيرت بعض المهام؛ أعد تحديدها.');
    return;
  }
  if (tasks.some((t) => !t.date)) {
    toast('بعض المهام بلا تاريخ؛ حدد تاريخها أولًا أو أزلها من التحديد.');
    return;
  }
  const captured = signature(),
    latest = tasks
      .map((t) => t.date)
      .sort()
      .at(-1);
  let dialog = $('#selectedTasksTransfer');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'selectedTasksTransfer';
    document.body.append(dialog);
  }
  dialog.setAttribute('aria-labelledby', 'selectedTransferTitle');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="selectedTransferTitle">نقل ${tasks.length} مهمة</h2><button type="button" data-close-bulk-transfer aria-label="إغلاق">×</button></div><p class="hint">يُسجّل عدم الإنجاز في الأيام الأصلية، وتُنقل المهام مع تقدمها وسجلها.</p><form id="selectedTasksTransferForm"><label class="field">اليوم الجديد<input type="date" name="transferDate" required min="${addDate(latest, 1)}" value="${addDate(latest > activeDay() ? latest : activeDay(), 1)}"></label><button type="button" data-bulk-transfer-tomorrow>غدًا</button><label class="field">الفترة<select name="transferPrayer"><option value="keep">نفس فترة كل مهمة</option><option value="none">بدون فترة</option>${names.map((name, p) => `<option value="${p}">${name}</option>`).join('')}</select></label><p data-bulk-transfer-error role="alert"></p><div class="selected-tasks-actions"><button type="submit" class="primary">نقل</button><button type="button" data-close-bulk-transfer>إلغاء</button></div></form>`;
  dialog
    .querySelectorAll('[data-close-bulk-transfer]')
    .forEach((b) => (b.onclick = () => dialog.close()));
  dialog.querySelector('[data-bulk-transfer-tomorrow]').onclick = () => {
    dialog.querySelector('[name=transferDate]').value = addDate(activeDay(), 1);
  };
  dialog.querySelector('form').onsubmit = (event) => {
    event.preventDefault();
    try {
      if (state !== originalState || signature() !== captured)
        throw Error('تغيرت المهام أو الحساب؛ أغلق النافذة وأعد التحديد.');
      const f = event.currentTarget.elements,
        p = f.transferPrayer.value;
      const next = bulkTransferSelectedTasks(
        state,
        references,
        f.transferDate.value,
        p === 'keep' ? null : p === 'none' ? [] : [+p],
      );
      rememberProjectView();
      rememberDashboardPosition();
      state = next;
      taskSelectionState = state;
      selectedTaskRefs.clear();
      save();
      dialog.close();
      render();
      toast(`تم نقل ${tasks.length} مهمة وحفظ عدم الإنجاز`);
    } catch (error) {
      dialog.querySelector('[data-bulk-transfer-error]').textContent =
        error.message;
    }
  };
  dialog.showModal();
}
function deleteSelectedTasks() {
  const references = [...selectedTaskRefs.values()],
    originalState = state;
  if (!references.length) return;
  try {
    if (taskSelectionState !== state)
      throw Error('تغيرت البيانات أو الحساب. أعد تحديد المهام.');
    // Prepare the whole deletion before confirmation; never partially delete.
    const next = bulkDeleteSelectedTasks(state, references);
    if (
      !confirm(
        `حذف ${references.length} مهمة محددة؟ لا يمكن التراجع.\nسيُحذف المحدد فقط؛ تبقى الفروع غير المحددة وسجل الأيام الأخرى.\nالمهام المشتركة تُحذف من جميع مشاريعها، والمتكررة من يومها المحدد فقط.`,
      )
    )
      return;
    if (state !== originalState)
      throw Error('تغيرت البيانات أو الحساب. أعد تحديد المهام.');
    rememberProjectView();
    rememberDashboardPosition();
    state = next;
    taskSelectionState = state;
    selectedTaskRefs.clear();
    save();
    preserveTaskScroll(() => {
      if (view === 'projects') renderProjectTaskList();
      else if (plannerListRefresh) plannerListRefresh();
      refreshTaskRowValues();
      installTaskSelection();
      applyCompletedVisibility();
    });
    $('#selectVisibleTasks')?.focus({ preventScroll: true });
    toast('تم حذف المهام المحددة');
  } catch (error) {
    toast(error.message);
  }
}
try {
  hideCompletedWork = sessionStorage.getItem('wkt-hide-completed') === 'true';
} catch {}
function applyCompletedVisibility() {
  if (!['projects', 'dashboard', 'day'].includes(view)) return;
  if (!hideCompletedWork) {
    app.querySelectorAll('[data-completed-hidden]').forEach((node) => {
      node.hidden = false;
      delete node.dataset.completedHidden;
    });
    return;
  }
  const hide = (node, value) => {
    node.hidden = !!value;
    if (value) node.dataset.completedHidden = '';
    else delete node.dataset.completedHidden;
  };
  app.querySelectorAll('.task-row').forEach((card) => {
    const task = rowTask(card);
    hide(card, task && taskCompletion(task) === 100);
  });
  app.querySelectorAll('[data-month-task]').forEach((chip) => {
    const task = findTask(chip.dataset.monthTask, chip.dataset.monthDate);
    hide(chip, task && taskCompletion(task) === 100);
  });
  if (view === 'projects') {
    const complete = (id) => {
      const model = projectModel(id);
      return model.roots.length > 0 && model.done === model.roots.length;
    };
    app
      .querySelectorAll('#projectNavigation [data-project]')
      .forEach((button) => {
        hide(button, complete(button.dataset.project));
      });
    app.querySelectorAll('#projectSelect option[value]').forEach((option) => {
      hide(option, option.value && complete(option.value));
    });
  }
}
function installCompletedToggle() {
  if (!['projects', 'dashboard', 'day'].includes(view)) return;
  let button = app.querySelector('#toggleCompletedWork');
  if (!button) {
    button = document.createElement('button');
    button.id = 'toggleCompletedWork';
    button.type = 'button';
    button.className = 'secondary';
    (
      app.querySelector('.project-page-actions') || app.querySelector('.top')
    ).append(button);
  }
  button.textContent = hideCompletedWork ? 'إظهار المكتمل' : 'إخفاء المكتمل';
  button.setAttribute('aria-pressed', String(hideCompletedWork));
  button.onclick = () => {
    hideCompletedWork = !hideCompletedWork;
    try {
      sessionStorage.setItem('wkt-hide-completed', String(hideCompletedWork));
    } catch {}
    installCompletedToggle();
    if (
      view === 'projects' &&
      app.querySelector('#projectNavigation .chosen')?.hidden
    ) {
      const next = [
        ...app.querySelectorAll('#projectNavigation [data-project]'),
      ].find((node) => !node.hidden);
      if (next) selectProject(next.dataset.project);
      else {
        selectedProject = '';
        renderProjectDetails();
        $('#projectSelect').value = '';
      }
    }
  };
  applyCompletedVisibility();
}
function dashboardTasks() {
  return allTasksOn(date);
}
function taskStatus(t) {
  return outcome(t);
}
// UI-only state; never included in the saved snapshot.
const expandedTaskRows = new Set();
let plannerListRefresh = null,
  taskRowSerial = 0;
const taskIconMarkup = new Map();
function taskIcon(name) {
  if (taskIconMarkup.has(name)) return taskIconMarkup.get(name);
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    cross: '<path d="m6 6 12 12M18 6 6 18"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    chevron: '<path d="m14 7-5 5 5 5"/>',
    edit: '<path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    flag: '<path d="M5 21V4h13l-3 4 3 4H5"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    slots:
      '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 12h16M12 4v16"/>',
    repeat:
      '<path d="M18 8a7 7 0 0 0-12-2L3 9m0-5v5h5m-2 7a7 7 0 0 0 12 2l3-3m0 5v-5h-5"/>',
  };
  const markup = `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.circle}</svg>`;
  taskIconMarkup.set(name, markup);
  return markup;
}
function taskRowMetrics(t, children = childTasks(t)) {
  const completion = taskCompletion(t);
  return `${t.priority ? `<span class="row-priority" title="الأولوية ${taskPriority(t)}">${taskIcon('flag')}${taskPriority(t)}</span>` : ''}${t.startSlot != null ? `<span title="بداية التنفيذ ${time(t.startSlot)}">${taskIcon('clock')}</span>` : ''}${t.recurrent ? `<span title="متكررة">${taskIcon('repeat')}</span>` : ''}${children.length || taskExpectedSlots(t) || completion ? `<span class="row-completion" title="الإنجاز ${percentLabel(completion)}">${taskProgressBar(t)}<small>${percentLabel(completion)}</small></span>` : ''}`;
}
function taskOrderField(key, context, task) {
  const parent = task?.parentId ? parentTask(task) : null;
  let position, total, attributes, label;
  if (parent) {
    const siblings = childTasks(parent);
    position = siblings.findIndex((t) => taskIdentity(t) === key) + 1;
    total = siblings.length;
    attributes = 'data-subtask-order';
    label = 'داخل المهمة الرئيسية';
  } else if (context?.order?.has(key)) {
    const order = context.order.get(key);
    position = order.position;
    total = order.total;
    attributes = `data-project-order-key="${esc(key)}" data-project-order-id="${esc(context.projectId || selectedProject)}"`;
    label = 'داخل المشروع';
  }
  return position
    ? `<label class="project-task-order" title="ترتيب ${esc(task.name)} ${label}، من 1 إلى ${total}"><span class="sr-only">الترتيب</span><input type="number" min="1" max="${total}" step="1" inputmode="numeric" value="${position}" ${attributes} aria-label="ترتيب ${esc(task.name)} ${label}"></label>`
    : '';
}
function preserveTaskScroll(action) {
  const nodes = [
    document.scrollingElement,
    app,
    $('#projectDetails'),
    ...document.querySelectorAll('.task-children'),
  ].filter(Boolean);
  const positions = nodes.map((node) => [
    node,
    node.scrollTop,
    node.scrollLeft,
  ]);
  const focused = document.activeElement;
  action();
  if (focused?.isConnected && document.activeElement !== focused)
    focused.focus({ preventScroll: true });
  positions.forEach(([node, top, left]) => {
    node.scrollTop = top;
    node.scrollLeft = left;
  });
}
function refreshTaskOrderRows(ordered, selector) {
  const ranks = new Map(ordered.map((t, i) => [taskIdentity(t), i + 1])),
    containers = new Set();
  preserveTaskScroll(() => {
    document.querySelectorAll(selector).forEach((input) => {
      const card = input.closest('.task-row'),
        task = rowTask(card),
        rank = task && ranks.get(taskIdentity(task));
      if (!rank) return;
      input.value = rank;
      input.max = ordered.length;
      containers.add(card.parentElement);
    });
    containers.forEach((container) => {
      const cards = new Map(
        [...container.children]
          .filter((el) => el.matches('.task-row'))
          .map((card) => [taskIdentity(rowTask(card)), card]),
      );
      ordered.forEach((t) => {
        const card = cards.get(taskIdentity(t));
        if (card) {
          if (container.moveBefore) container.moveBefore(card, null);
          else container.append(card);
        }
      });
    });
  });
}
function taskRow(
  t,
  mode = 'planner',
  depth = 0,
  path = new Set(),
  context = null,
) {
  const rowId = 'task-row-' + ++taskRowSerial;
  const key = taskIdentity(t);
  if (path.has(key)) return '';
  path = new Set(path);
  path.add(key);
  const children =
    t.historical || ['period', 'series'].includes(mode)
      ? []
      : childTasks(t).filter((c) => !path.has(taskIdentity(c)));
  const status = t.virtual ? 'pending' : outcome(t);
  const visibleChildren = children.filter(
    (c) => !context?.visible || context.visible.has(taskIdentity(c)),
  );
  const expanded =
    visibleChildren.length > 0 &&
    (expandedTaskRows.has(key) || !!context?.forced?.has(key));
  const hideDescription = !!context?.hideDescription;
  const fullText =
    t.name + (!hideDescription && t.description ? ' — ' + t.description : '');
  const contextLabel =
    mode === 'series'
      ? taskPeriodLabel(t) +
        ' · ' +
        (t.days.length === 7 ? 'كل يوم' : t.days.map((i) => week[i]).join('، '))
      : t.virtual
        ? 'المهمة الرئيسية حُذفت؛ فروعها محفوظة هنا.'
        : [
            t.date || 'تحتاج توزيعًا',
            taskPeriodLabel(t),
            projectName(t),
            state.actions.find((a) => a.id === t.actionId)?.name ||
              (t.actionId ? 'الفعل المرتبط محذوف' : ''),
          ]
            .filter(Boolean)
            .join(' · ');
  const primary =
    mode === 'series'
      ? `<div class="task-row-primary"><button type="button" data-edit="${esc(t.id)}" title="تعديل السلسلة" aria-label="تعديل ${esc(t.name)}">${taskIcon('edit')}</button></div>`
      : t.historical
        ? '<button type="button" data-task-history>سجل النقل</button>'
        : t.virtual
          ? `<button type="button" data-task-edit title="إدارة الفروع المحفوظة" aria-label="إدارة ${esc(t.name)}">${taskIcon('edit')}</button>`
          : `<div class="task-row-primary"><button type="button" data-outcome="done" aria-pressed="${status === 'done'}" title="فعلتها" aria-label="فعلتها: ${esc(t.name)}">${taskIcon('check')}</button><button type="button" data-outcome="failed" aria-pressed="${status === 'failed'}" title="لم أفعلها" aria-label="لم أفعلها: ${esc(t.name)}">${taskIcon('cross')}</button><button type="button" data-task-edit title="تعديل" aria-label="تعديل ${esc(t.name)}">${taskIcon('edit')}</button></div><label class="row-slot-editor" dir="ltr" title="الخانات المنجزة / المتوقعة"><span class="sr-only">الخانات المنجزة</span><input data-progress type="number" min="0" max="9999" step="1" inputmode="numeric" value="${completedSlots(t)}" aria-label="الخانات المنجزة: ${esc(t.name)}"><span aria-hidden="true">/</span><output data-row-expected aria-label="الخانات المتوقعة">${taskExpectedSlots(t)}</output></label>${taskOrderField(key, context, t)}`;
  return `<article class="task-row ${mode === 'planner' ? 'planner-task' : 'daily-task'} ${t.virtual ? 'task-family' : ''} ${t.historical ? 'task-historical' : ''} ${status}" data-task-id="${esc(t.id)}" data-task-date="${esc(t.date || '')}" data-row-mode="${mode}" ${context?.matches?.has(key) ? 'data-project-match="true"' : ''} data-row-depth="${depth}" ${t.virtual ? 'data-virtual="true"' : ''} style="--task-indent:${Math.min(depth, 3)}">
    <div class="task-row-heading planner-task-heading">
      ${visibleChildren.length ? `<button type="button" class="task-row-toggle" data-task-toggle aria-controls="${rowId}-children" aria-expanded="${expanded}" aria-label="${expanded ? 'طي' : 'فتح'} فروع ${esc(t.name)}">${taskIcon('chevron')}</button>` : '<span class="task-row-spacer" aria-hidden="true"></span>'}
      <button type="button" class="task-row-select" data-task-select aria-expanded="false" aria-controls="taskTextPopover" title="${esc(fullText)}" data-task-context="${esc(contextLabel)}">
        <span class="task-row-status" role="img" aria-label="${mode === 'series' ? 'سلسلة متكررة' : { done: 'فعلتها', failed: 'لم أفعلها', pending: 'لم تُسجل' }[status]}">${taskIcon(mode === 'series' ? 'repeat' : status === 'done' ? 'check' : status === 'failed' ? 'cross' : 'circle')}</span>
        <span class="task-row-copy"><strong class="daily-task-name">${esc(t.name)}</strong>${t.historical ? `<small class="transfer-badge">لم تُنجز ← ${esc(t.transferredTo)}</small>` : taskIsDeferred(t) ? '<small class="transfer-badge" title="مؤجلة — السجل داخل التعديل">↪ مؤجلة</small>' : ''}${hideDescription ? '' : taskDescription(t)}${mode === 'period' && t.parentId ? `<small class="row-parent">↳ ${esc(parentName(t))}</small>` : ''}</span>
        <span class="task-row-metrics">${mode === 'series' || t.virtual ? '' : taskRowMetrics(t, children)}</span>
        ${children.length ? `<span class="task-row-count" title="الفروع المسجلة فعلتها / جميع الفروع">${children.filter((c) => outcome(c) === 'done').length}/${children.length}</span>` : ''}
      </button>
      <div class="task-row-actions daily-task-controls">${primary}<details class="task-row-secondary"><summary aria-label="المزيد من إجراءات ${esc(t.name)}" title="إجراءات إضافية">${taskIcon('more')}</summary><div>${t.historical ? '<span>سجل للقراءة فقط</span>' : mode === 'series' ? `<button type="button" data-del="${esc(t.id)}">حذف السلسلة</button>` : t.virtual ? '<span>فروع محفوظة لأصل محذوف</span>' : `<button type="button" data-task-child>إضافة فرعية</button><button type="button" data-task-delete>حذف المهمة</button>`}</div></details></div>
    </div>
    ${visibleChildren.length ? `<div id="${rowId}-children" class="task-children" ${expanded ? '' : 'hidden'}>${expanded ? visibleChildren.map((c) => taskRow(c, mode, depth + 1, path, context)).join('') : ''}</div>` : ''}
  </article>`;
}
function taskCard(t, context = null) {
  return taskRow(t, 'planner', 0, new Set(), context);
}
function compactTaskCard(t) {
  return taskRow(t, 'period');
}
function compactTaskGroup(t) {
  return taskRow(t, 'daily');
}
function rowOwn(card, selector) {
  return [...card.querySelectorAll(selector)].filter(
    (el) => el.closest('.task-row') === card,
  );
}
function rowTask(card) {
  if (card.dataset.rowMode === 'series')
    return state.repeat.find((t) => t.id === card.dataset.taskId);
  return card.dataset.virtual
    ? {
        id: card.dataset.taskId,
        date: card.dataset.taskDate,
        virtual: true,
        name: card.querySelector('.daily-task-name').textContent,
      }
    : findTask(card.dataset.taskId, card.dataset.taskDate);
}
function selectTaskRow(card, selected = true) {
  const button = rowOwn(card, '[data-task-select]')[0];
  document.querySelectorAll('.task-row.is-selected').forEach((other) => {
    other.classList.remove('is-selected');
    rowOwn(other, '[data-task-select]')[0]?.setAttribute(
      'aria-expanded',
      'false',
    );
  });
  let popover = $('#taskTextPopover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'taskTextPopover';
    popover.className = 'task-text-popover';
    popover.setAttribute('popover', 'auto');
    popover.innerHTML =
      '<p class="task-row-full"></p><p class="task-row-context"></p>';
    document.body.append(popover);
  }
  if (!selected) {
    if (popover.hidePopover) popover.hidePopover();
    else popover.hidden = true;
    return;
  }
  card.classList.add('is-selected');
  button.setAttribute('aria-expanded', 'true');
  popover.querySelector('.task-row-full').textContent = button.title;
  popover.querySelector('.task-row-context').textContent =
    button.dataset.taskContext;
  if (popover.showPopover) popover.showPopover();
  else popover.hidden = false;
}
function toggleTaskRow(card) {
  const t = rowTask(card),
    button = rowOwn(card, '[data-task-toggle]')[0];
  if (!t || !button) return;
  const key = taskIdentity(t),
    container = rowOwn(card, '.task-children')[0];
  const opening = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(opening));
  button.setAttribute(
    'aria-label',
    (opening ? 'طي' : 'فتح') + ' فروع ' + t.name,
  );
  if (opening) {
    expandedTaskRows.add(key);
    const path = new Set();
    let ancestor = card;
    while (ancestor) {
      path.add(
        taskIdentity({
          id: ancestor.dataset.taskId,
          date: ancestor.dataset.taskDate,
        }),
      );
      ancestor = ancestor.parentElement.closest('.task-row');
    }
    const context = card.closest('.task-week')
      ? { hideDescription: true }
      : card.closest('#plannerResults')
        ? dashboardRowContext
        : typeof projectRowContext === 'function'
          ? projectRowContext(card)
          : null;
    container.innerHTML = childTasks(t)
      .filter((c) => !context?.visible || context.visible.has(taskIdentity(c)))
      .map((c) =>
        taskRow(
          c,
          card.dataset.rowMode,
          Number(card.dataset.rowDepth) + 1,
          path,
          context,
        ),
      )
      .join('');
  } else {
    expandedTaskRows.delete(key);
    container.replaceChildren();
  }
  container.hidden = !opening;
  applyCompletedVisibility();
  if (taskSelectionMode) refreshTaskSelection();
}
function refreshTaskRowValues(changed = null) {
  const affected = new Set();
  let ancestor = changed;
  while (ancestor && !affected.has(taskIdentity(ancestor))) {
    affected.add(taskIdentity(ancestor));
    const parent = parentTask(ancestor);
    if (!parent && ancestor.parentId)
      affected.add(
        taskIdentity({ id: ancestor.parentId, date: ancestor.parentDate }),
      );
    ancestor = parent;
  }
  document.querySelectorAll('.task-row').forEach((card) => {
    if (card.dataset.rowMode === 'series') return;
    const t = rowTask(card);
    if (!t || (changed && !affected.has(taskIdentity(t)))) return;
    const children = childTasks(t),
      status = t.virtual ? 'pending' : outcome(t);
    card.classList.remove('done', 'failed', 'pending');
    card.classList.add(status);
    const statusNode = rowOwn(card, '.task-row-status')[0];
    statusNode.innerHTML = taskIcon(
      status === 'done' ? 'check' : status === 'failed' ? 'cross' : 'circle',
    );
    statusNode.setAttribute(
      'aria-label',
      { done: 'فعلتها', failed: 'لم أفعلها', pending: 'لم تُسجل' }[status],
    );
    rowOwn(card, '.task-row-metrics')[0].innerHTML = t.virtual
      ? ''
      : taskRowMetrics(t, children);
    const expected = rowOwn(card, '[data-row-expected]')[0];
    if (expected) expected.textContent = taskExpectedSlots(t);
    const counter = rowOwn(card, '.task-row-count')[0];
    if (counter)
      counter.textContent = `${children.filter((c) => outcome(c) === 'done').length}/${children.length}`;
    rowOwn(card, '[data-outcome]').forEach((b) =>
      b.setAttribute('aria-pressed', String(status === b.dataset.outcome)),
    );
    rowOwn(card, '[data-progress]').forEach((input) => {
      if (document.activeElement !== input) input.value = completedSlots(t);
    });
  });
  document
    .querySelectorAll('[data-completion-id], [data-completion-label]')
    .forEach((node) => {
      const id = node.dataset.completionId ?? node.dataset.completionLabel;
      if (
        changed &&
        !affected.has(taskIdentity({ id, date: node.dataset.completionDate }))
      )
        return;
      const t = findTask(id, node.dataset.completionDate);
      if (!t) return;
      const value = taskCompletion(t);
      if (node.tagName === 'PROGRESS') {
        node.value = value;
        node.setAttribute(
          'aria-label',
          `إنجاز ${t.name}: ${percentLabel(value)}`,
        );
      } else node.textContent = percentLabel(value);
    });
  document.querySelectorAll('[data-project-summary]').forEach((node) => {
    const id = node.dataset.projectSummary,
      list = taskGroups(projectTasks(id)),
      done = list.filter((t) => taskCompletion(t) === 100).length;
    if (node.tagName === 'PROGRESS') node.value = projectCompletion(id);
    else if (node.dataset.summaryKind === 'outcomes')
      node.textContent = `${done} مكتملة · ${list.filter((t) => outcome(t) === 'failed').length} لم تُفعل · ${list.filter((t) => outcome(t) === 'pending').length} بانتظار التسجيل`;
    else if (node.dataset.summaryKind === 'count')
      node.textContent = `${done}/${list.length}`;
    else if (node.dataset.summaryKind === 'slots')
      node.textContent = projectSlotsLabel(id);
    else if (node.dataset.summaryKind === 'percent')
      node.textContent = percentLabel(projectCompletion(id));
    else
      node.textContent = `${percentLabel(projectCompletion(id))} إنجاز · ${done} / ${list.length} مهام مكتملة · ${projectSlotsLabel(id)}`;
  });
  refreshProjectGoals();
  const all = allTasksOn(date),
    groups = taskGroups(all);
  if ($('#dashboardDone'))
    $('#dashboardDone').textContent =
      `${groups.filter((t) => taskCompletion(t) === 100).length}/${groups.length}`;
  if ($('#dashboardPending'))
    $('#dashboardPending').textContent = all.filter(
      (t) => outcome(t) === 'pending',
    ).length;
  const missed = taskEntries().filter(
    (t) => t.date && t.date < activeDay() && outcome(t) === 'pending',
  );
  const missedTab = app.querySelector('[data-planner-tab="missed"]');
  if (missedTab)
    missedTab.textContent = `الفائتة (${taskGroups(missed).length})`;
}
function refreshFilteredTaskRows() {
  const selected = [...app.querySelectorAll('.task-row.is-selected')].map(
    (card) => ({
      key: taskIdentity(rowTask(card)),
      mode: card.dataset.rowMode,
      more: rowOwn(card, '.task-row-secondary')[0]?.open || false,
    }),
  );
  const active = document.activeElement,
    activeCard = active.closest?.('.task-row');
  const focus = activeCard
    ? {
        key: taskIdentity(rowTask(activeCard)),
        mode: activeCard.dataset.rowMode,
        selector: active.matches('[data-outcome]')
          ? `[data-outcome="${active.dataset.outcome}"]`
          : active.matches('[data-progress]')
            ? '[data-progress]'
            : '[data-task-select]',
      }
    : null;
  plannerListRefresh();
  app.querySelectorAll('.task-row').forEach((card) => {
    const key = taskIdentity(rowTask(card)),
      mode = card.dataset.rowMode;
    const previous = selected.find(
      (item) => item.key === key && item.mode === mode,
    );
    if (previous) {
      selectTaskRow(card, true);
      const more = rowOwn(card, '.task-row-secondary')[0];
      if (more) more.open = previous.more;
    }
    if (focus && focus.key === key && focus.mode === mode)
      rowOwn(card, focus.selector)[0]?.focus({ preventScroll: true });
  });
  if (focus && document.activeElement === document.body)
    ($('#plannerResults [data-task-select]') || $('#plannerStatus'))?.focus({
      preventScroll: true,
    });
}
function taskRowChanged(t, progressEdit = false) {
  // Saving invalidates the read scope. Update only mounted rows and live summaries.
  taskReadScope(() => {
    if (
      view === 'dashboard' &&
      plannerListRefresh &&
      (plannerTab === 'missed' ||
        (plannerStatus !== 'all' &&
          !document.activeElement?.matches('[data-progress]')))
    )
      refreshFilteredTaskRows();
    refreshTaskRowValues(t);
    applyCompletedVisibility();
  })();
  let status = $('#inlineTaskStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'inlineTaskStatus';
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  t = findTask(t.id, t.date) || t;
  status.textContent = progressEdit
    ? 'حُفظت الخانات المنجزة'
    : outcome(t) === 'done'
      ? 'سُجلت: فعلتها'
      : outcome(t) === 'failed'
        ? 'سُجلت: لم أفعلها'
        : 'أُلغيت نتيجة المهمة';
}
function bindTaskCards(root = app, insideManager = false) {
  applyCompletedVisibility();
  if (taskSelectionMode && root.closest('#app')) refreshTaskSelection();
  root.dataset.taskList = '';
  if (!root.inlineMenuBound) {
    root.inlineMenuBound = true;
    root.addEventListener(
      'toggle',
      (e) => {
        const menu = e.target;
        if (!menu.matches?.('.task-row-secondary') || !menu.open) return;
        const panel = menu.querySelector(':scope > div'),
          anchor = menu.querySelector('summary').getBoundingClientRect();
        panel.style.left =
          Math.max(8, Math.min(innerWidth - 188, anchor.right - 180)) + 'px';
        panel.style.top =
          (anchor.bottom + panel.offsetHeight <= innerHeight - 8
            ? anchor.bottom
            : Math.max(8, anchor.top - panel.offsetHeight)) + 'px';
      },
      true,
    );
  }

  root.onclick = taskReadScope((e) => {
    const card = e.target.closest('.task-row');
    if (!card || !root.contains(card)) return;
    const target = e.target.closest('button');
    if (!target || target.closest('.task-row') !== card) return;
    const t = rowTask(card);
    if (!t) return;
    if (target.matches('[data-task-toggle]')) {
      toggleTaskRow(card);
      return;
    }
    if (target.matches('[data-task-select]')) {
      selectTaskRow(card, !card.classList.contains('is-selected'));
      return;
    }
    if (t.historical) {
      openTaskHistory(t);
      return;
    }
    if (target.dataset.outcome) {
      if (target.dataset.outcome === 'failed') {
        openTaskFailure(t);
        return;
      }
      recordTaskOutcome(t, target.dataset.outcome);
      save();
      taskRowChanged(t);
      return;
    }
    if (target.matches('[data-task-edit]')) {
      if (t.virtual) openTaskManager(t);
      else openPlannerEditor(t, null, '', { returnToList: !insideManager });
    } else if (target.matches('[data-task-child]')) {
      if (t.parentId && !insideManager) openTaskManager(t);
      else openPlannerEditor(null, t);
    } else if (target.matches('[data-task-delete]')) {
      if (t.parentId && !insideManager) openTaskManager(t);
      else {
        const parent = parentTask(t);
        if (deletePlannedTask(t) && insideManager && parent)
          openPlannerEditor(parent);
      }
    }
  });
  root.onchange = taskReadScope((e) => {
    const orderInput = e.target.closest(
      '[data-subtask-order], [data-project-order-key]',
    );
    if (orderInput) {
      const task = rowTask(orderInput.closest('.task-row'));
      if (!task) return;
      const parent = parentTask(task),
        siblings = orderInput.matches('[data-subtask-order]')
          ? parent
            ? childTasks(parent)
            : []
          : [];
      const position = Number(orderInput.value);
      if (
        !orderInput.value ||
        !Number.isInteger(position) ||
        position < 1 ||
        position > Number(orderInput.max)
      ) {
        orderInput.value = orderInput.matches('[data-project-order-key]')
          ? orderedProjectTasks(orderInput.dataset.projectOrderId).findIndex(
              (t) => taskIdentity(t) === taskIdentity(task),
            ) + 1
          : siblings.findIndex((t) => taskIdentity(t) === taskIdentity(task)) +
            1;
        toast('أدخل رقم ترتيب صحيح ضمن حدود القائمة');
        return;
      }
      if (
        !orderInput.matches('[data-project-order-key]') &&
        position ===
          siblings.findIndex((t) => taskIdentity(t) === taskIdentity(task)) + 1
      )
        return;
      if (orderInput.matches('[data-project-order-key]'))
        moveProjectTask(
          orderInput.dataset.projectOrderId,
          taskIdentity(task),
          position,
        );
      else if (parent) {
        if (moveSubtask(task, position))
          refreshTaskOrderRows(childTasks(parent), '[data-subtask-order]');
      }
      return;
    }
    const input = e.target.closest('[data-progress]');
    if (!input) return;
    const card = input.closest('.task-row'),
      t = rowTask(card),
      n = +input.value;
    if (!t) return;
    if (!Number.isInteger(n) || n < 0 || n > 9999 || input.value === '') {
      input.value = completedSlots(t);
      toast('أدخل عددًا صحيحًا بين ٠ و٩٩٩٩');
      return;
    }
    if (n === completedSlots(t)) return;
    try {
      recordTaskProgress(t, n);
    } catch (error) {
      toast(error.message);
      return;
    }
    save();
    taskRowChanged(t, true);
  });
  root.onkeydown = (e) => {
    const card = e.target.closest('.task-row');
    if (!card) return;
    if (e.target.matches('[data-subtask-order], [data-project-order-key]')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    if (e.key === 'Escape') {
      rowOwn(card, '.task-row-secondary').forEach(
        (menu) => (menu.open = false),
      );
      selectTaskRow(card, false);
      rowOwn(card, '[data-task-select]')[0].focus();
    }
    if (e.key === 'Enter' && e.target.matches('[data-progress]')) {
      e.preventDefault();
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (
      e.target.matches('[data-task-select]') &&
      ['ArrowLeft', 'ArrowRight'].includes(e.key)
    ) {
      const button = rowOwn(card, '[data-task-toggle]')[0];
      if (
        button &&
        button.getAttribute('aria-expanded') !== String(e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
        taskReadScope(() => toggleTaskRow(card))();
      }
    }
  };
}
function sortedTasks(list) {
  return [...list].sort(
    (a, b) =>
      taskPriority(a) - taskPriority(b) || a.name.localeCompare(b.name, 'ar'),
  );
}
function filteredTasks(list) {
  return sortedTasks(
    list.filter(
      (t) =>
        (!plannerQuery ||
          (t.name + ' ' + (t.description || ''))
            .toLocaleLowerCase()
            .includes(plannerQuery.trim().toLocaleLowerCase())) &&
        (plannerPriority === 'all' ||
          String(taskPriority(t)) === plannerPriority) &&
        (plannerStatus === 'all' || outcome(t) === plannerStatus) &&
        (plannerProject === 'all' ||
          (plannerProject === 'none'
            ? !effectiveProjectIds(t).some((id) =>
                state.projects.some((p) => p.id === id),
              )
            : effectiveProjectIds(t).includes(plannerProject))),
    ),
  );
}
function daySummary(key) {
  const tasks = taskGroups(allTasksOn(key)),
    d = state.sunsetDays[key] || emptyDay();
  return {
    total: tasks.length,
    done: tasks.filter((t) => !t.historical && taskCompletion(t) === 100)
      .length,
    checks: prayerOrder.reduce((n, p) => n + prayerCount(p, d), 0),
  };
}
function dateControls() {
  return `<div class="date"><button data-planner-shift="-1" aria-label="اليوم السابق">→</button><input type="date" id="plannerDate" value="${date}" aria-label="اليوم المختار"><button data-planner-shift="1" aria-label="اليوم التالي">←</button><button id="plannerToday">اليوم</button></div>`;
}
// Project selection belongs to each backlog view and survives outcome edits.
const plannerProjectTabs = { inbox: '', missed: '' };
let dashboardRowContext = null;
function dashboardTaskCard(task) {
  return taskCard(task, dashboardRowContext);
}
function dashboardFilterContext(list) {
  if (!plannerQuery.trim() && plannerTab !== 'missed') return null;
  const visible = new Set(list.map(taskIdentity)),
    forced = new Set();
  for (const task of list) {
    let current = task;
    const seen = new Set();
    while (current.parentId && !seen.has(taskIdentity(current))) {
      seen.add(taskIdentity(current));
      current = parentTask(current) || mainTask(current);
      visible.add(taskIdentity(current));
      forced.add(taskIdentity(current));
      if (current.virtual) break;
    }
  }
  return { visible, forced };
}
function groupedPlannerTasks(list) {
  const projects = state.projects || [],
    byProject = new Map(projects.map((p) => [p.id, []])),
    unassigned = [];
  for (const t of list) {
    const ids = effectiveProjectIds(t).filter((id) => byProject.has(id));
    if (!ids.length) unassigned.push(t);
    else ids.forEach((id) => byProject.get(id).push(t));
  }
  const available = projects.filter((p) => byProject.get(p.id).length);
  if (!available.some((p) => p.id === plannerProjectTabs[plannerTab]))
    plannerProjectTabs[plannerTab] = available[0]?.id || '';
  const selected = plannerProjectTabs[plannerTab],
    cards = (tasks, projectId = '') => {
      const context = projectId
        ? {
            ...(dashboardRowContext || {}),
            projectId,
            order: projectModel(projectId).order,
          }
        : dashboardRowContext;
      const keys = projectId
        ? new Set(taskGroups(tasks).map(taskIdentity))
        : null;
      const roots = projectId
        ? orderedProjectTasks(projectId).filter((t) =>
            keys.has(taskIdentity(t)),
          )
        : taskGroups(tasks);
      return roots.map((t) => taskCard(t, context)).join('');
    };
  return `<section class="planner-task-section" data-planner-section="projects"><h2>مهام المشاريع</h2>${available.length ? `<div class="planner-tabs" role="group" aria-label="مشاريع المهام">${available.map((p) => `<button type="button" class="secondary ${p.id === selected ? 'chosen' : ''}" data-planner-project="${esc(p.id)}" aria-pressed="${p.id === selected}">${esc(p.name)} (${taskGroups(byProject.get(p.id)).length})</button>`).join('')}</div><div class="planner-project-tasks">${cards(byProject.get(selected), selected)}</div>` : '<p class="empty-note">لا توجد مهام تابعة لمشاريع تطابق التصفية.</p>'}</section>
 <section class="planner-task-section" data-planner-section="unassigned"><h2>مهام بدون مشروع (${taskGroups(unassigned).length})</h2>${cards(unassigned) || '<p class="empty-note">لا توجد مهام بدون مشروع تطابق التصفية.</p>'}</section>`;
}
const dashboardPositions = new Map();
let mountedDashboard = '';
function rememberDashboardPosition() {
  if (!app.firstElementChild?.classList.contains('dashboard-workspace')) return;
  dashboardPositions.set(mountedDashboard, {
    app: app.scrollTop,
    page: document.scrollingElement?.scrollTop || 0,
  });
}
function renderDashboard() {
  const reuseShell =
    !!app.firstElementChild?.classList.contains('dashboard-workspace') &&
    mountedDashboard.endsWith(':' + date);
  rememberDashboardPosition();
  mountedDashboard = plannerTab + ':' + date;
  plannerListRefresh = null;
  const all = allTasksOn(date),
    done = taskGroups(all).filter((t) => taskCompletion(t) === 100).length,
    pending = all.filter((t) => outcome(t) === 'pending').length;
  const entries = taskEntries(),
    today = activeDay(),
    missed = entries.filter(
      (t) => t.date && t.date < today && outcome(t) === 'pending',
    ),
    future = entries.filter((t) => t.date > today && !t.recurrent),
    inbox = state.taskInbox || [];
  const dashboardHTML = `<div class="dashboard-workspace"><div class="top"><h1>لوحة المهام</h1>${dateControls()}</div>
 <div class="dashboard-summary" aria-label="ملخص اليوم"><span>${hijriLabel(date)}</span><span>${dayRangeLabel()}</span><span><strong id="dashboardDone">${done}/${taskGroups(all).length}</strong> مكتملة</span><span><strong id="dashboardPending">${pending}</strong> بانتظار التسجيل</span><span>${daySummary(date).checks}/${prayerCheckTotal()} من مهام الصلوات</span></div>
 <div class="planner-toolbar"><button id="newPlannedTask" class="primary">${taskIcon('plus')} إضافة مهمة وتوزيعها</button><button id="plannerRepeats" class="secondary">${taskIcon('repeat')} المهام المتكررة</button></div>
 <div class="planner-tabs" role="group" aria-label="عروض المهام">${[
   ['day', 'اليوم'],
   ['missed', `الفائتة (${taskGroups(missed).length})`],
   ['future', `المستقبلية (${taskGroups(future).length})`],
   ['inbox', `تحتاج توزيعًا (${taskGroups(inbox).length})`],
   ['month', 'الشهر'],
   ['week', 'الأسبوع'],
 ]
   .map(
     ([v, n]) =>
       `<button class="secondary ${plannerTab === v ? 'chosen' : ''}" data-planner-tab="${v}" aria-pressed="${plannerTab === v}">${n}</button>`,
   )
   .join('')}</div>
 <div id="plannerContent"></div></div>`;
  if (!reuseShell) app.innerHTML = dashboardHTML;
  else {
    $('#plannerContent').replaceChildren();
    $('#dashboardDone').textContent = `${done}/${taskGroups(all).length}`;
    $('#dashboardPending').textContent = pending;
    for (const [tab, tasks] of [
      ['missed', missed],
      ['future', future],
      ['inbox', inbox],
    ]) {
      const button = $(`[data-planner-tab="${tab}"]`);
      const label = {
        missed: 'الفائتة',
        future: 'المستقبلية',
        inbox: 'تحتاج توزيعًا',
      }[tab];
      button.textContent = `${label} (${taskGroups(tasks).length})`;
    }
  }
  app.querySelectorAll('[data-planner-tab]').forEach((button) => {
    const chosen = button.dataset.plannerTab === plannerTab;
    button.classList.toggle('chosen', chosen);
    button.setAttribute('aria-pressed', String(chosen));
  });
  $('#plannerDate').onchange = (e) => {
    if (e.target.value) {
      plannerTab = 'day';
      goDay(e.target.value, false);
    }
  };
  $('#plannerToday').onclick = () => {
    plannerTab = 'day';
    goDay(activeDay(), true);
  };
  app
    .querySelectorAll('[data-planner-shift]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          goDay(addDate(date, +b.dataset.plannerShift), false)),
    );
  $('#newPlannedTask').onclick = () => openPlannerEditor();
  $('#plannerRepeats').onclick = () => {
    view = 'repeat';
    render();
  };
  app.querySelectorAll('[data-planner-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        plannerTab = b.dataset.plannerTab;
        document.body.classList.toggle('monthly-view', plannerTab === 'month');
        renderDashboard();
      }),
  );
  if (plannerTab === 'month') renderTaskMonth();
  else if (plannerTab === 'week') renderTaskWeek();
  else {
    const content = $('#plannerContent');
    content.innerHTML = `${plannerTab === 'inbox' ? '<form id="dashboardQuickTask" class="dashboard-quick"><label for="dashboardQuickName">مهمة سريعة</label><input id="dashboardQuickName" name="taskName" required maxlength="150" placeholder="ماذا تريد أن تنجز؟"><button class="primary">إضافة</button></form>' : ''}<section class="panel dashboard-list"><div class="dashboard-filters"><label class="field">بحث<input id="plannerSearch" type="search" value="${esc(plannerQuery)}" placeholder="اسم المهمة"></label><label class="field">الأولوية<select id="plannerPriority"><option value="all">كل الأولويات</option>${Object.entries(
      priorityNames,
    )
      .map(([v, n]) => `<option value="${v}">${n}</option>`)
      .join(
        '',
      )}</select></label><label class="field">الحالة<select id="plannerStatus"><option value="all">كل الحالات</option><option value="pending">لم تُسجل</option><option value="done">فعلتها</option><option value="failed">لم أفعلها</option></select></label><label class="field">المشروع<select id="plannerProject"><option value="all">كل المشاريع</option><option value="none">بدون مشروع</option>${state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label></div><details class="dashboard-help"><summary>عن هذه القائمة</summary><p class="hint">${plannerTab === 'missed' ? 'المهام في الأيام السابقة دون علامة فعلتها أو لم أفعلها، حتى لو سجلت بعض الخانات.' : plannerTab === 'future' ? 'المهام المستقلة والمستقلة عن التكرار في الأيام القادمة؛ لا تشمل السلاسل المتكررة.' : plannerTab === 'inbox' ? 'أفكارك السريعة هنا؛ وزع المهمة عندما تكون مستعدًا.' : 'كل فترة تعرض المهام وإجمالي المتاح والمشغول من الخانات.'}</p></details><div id="plannerResults" data-task-list></div></section>`;
    $('#plannerPriority').value = plannerPriority;
    $('#plannerStatus').value = plannerStatus;
    $('#plannerProject').value = plannerProject;
    const refresh = taskReadScope(() => {
      const list = filteredTasks(
        plannerTab === 'day'
          ? all
          : plannerTab === 'missed'
            ? missed.filter((t) => outcome(t) === 'pending')
            : plannerTab === 'future'
              ? future
              : inbox.map((t) => ({ ...t, date: '' })),
      );
      dashboardRowContext = dashboardFilterContext(list);
      const scroll = app.scrollTop,
        pageScroll = document.scrollingElement?.scrollTop || 0;
      $('#plannerResults').innerHTML =
        plannerTab === 'day'
          ? prayerOrder
              .map(
                (p) =>
                  `<section class="planner-period"><div class="panel-title"><h2>${names[p]}</h2><button data-add-period="${p}" class="secondary">＋ مهمة</button></div><p class="capacity-note">${capacityText(date, p)}</p>${
                    taskGroups(list.filter((t) => taskInPeriod(t, p)))
                      .map((t) => dashboardTaskCard(t))
                      .join('') ||
                    '<p class="empty-note">لا توجد مهام مطابقة في هذه الفترة.</p>'
                  }<details><summary>قائمة صلاة ${names[p]} · ${prayerCount(p, taskDay(date))}/${prayerCheckTasks(p).length}</summary><button class="secondary" data-open-prayer="${p}">عرض وتسجيل مهام الصلاة</button></details></section>`,
              )
              .join('') +
            (list.some((t) => !taskPeriods(t).length)
              ? `<section class="planner-period"><h2>بدون فترة محددة</h2>${taskGroups(
                  list.filter((t) => !taskPeriods(t).length),
                )
                  .map((t) => dashboardTaskCard(t))
                  .join('')}</section>`
              : '')
          : ['inbox', 'missed'].includes(plannerTab)
            ? groupedPlannerTasks(list)
            : taskGroups(list)
                .map((t) => dashboardTaskCard(t))
                .join('') ||
              '<p class="empty-note">لا توجد مهام في هذه القائمة تطابق التصفية.</p>';
      app.querySelectorAll('[data-planner-project]').forEach(
        (b) =>
          (b.onclick = () => {
            plannerProjectTabs[plannerTab] = b.dataset.plannerProject;
            refresh();
          }),
      );
      app.scrollTop = scroll;
      if (document.scrollingElement)
        document.scrollingElement.scrollTop = pageScroll;
      bindTaskCards();
      app.querySelectorAll('[data-add-period]').forEach(
        (b) =>
          (b.onclick = () => {
            prayer = +b.dataset.addPeriod;
            openPlannerEditor();
          }),
      );
      app.querySelectorAll('[data-open-prayer]').forEach(
        (b) =>
          (b.onclick = () => {
            prayer = +b.dataset.openPrayer;
            openPrayer();
          }),
      );
      installTaskSelection();
    });
    $('#plannerSearch').oninput = (e) => {
      plannerQuery = e.target.value;
      refresh();
    };
    $('#plannerPriority').onchange = (e) => {
      plannerPriority = e.target.value;
      refresh();
    };
    $('#plannerStatus').onchange = (e) => {
      plannerStatus = e.target.value;
      refresh();
    };
    $('#plannerProject').onchange = (e) => {
      plannerProject = e.target.value;
      refresh();
    };
    const quick = $('#dashboardQuickTask');
    if (quick)
      quick.onsubmit = (e) => {
        e.preventDefault();
        const name = quick.elements.taskName.value.trim();
        if (!name) return;
        (state.taskInbox ??= []).push({
          id: uid(),
          name,
          description: '',
          priority: 3,
          expectedSlots: 0,
          showInMonthlyCalendar: true,
        });
        save();
        quick.reset();
        refresh();
        const tab = $('[data-planner-tab="inbox"]');
        tab.textContent = `تحتاج توزيعًا (${taskGroups(state.taskInbox).length})`;
        $('#dashboardQuickName').focus({ preventScroll: true });
        toast('أضيفت إلى المهام التي تحتاج توزيعًا');
      };
    plannerListRefresh = refresh;
    refresh();
  }
  installTaskSelection();
  const position = dashboardPositions.get(mountedDashboard);
  if (position) {
    app.scrollTop = position.app;
    if (document.scrollingElement)
      document.scrollingElement.scrollTop = position.page;
  }
}
function openPlannerDay(key) {
  plannerTab = 'day';
  plannerQuery = '';
  plannerPriority = plannerStatus = 'all';
  goDay(key, false);
}
// Filters affect this calendar only; occurrence identity is always id + logical day.
const monthFilters = {
  project: 'all',
  category: 'all',
  status: 'all',
  priority: 'all',
  period: 'all',
  query: '',
};
let monthFiltersOpen = false,
  monthMenuCleanup = null;
function monthlyTasks(key, entries = progressEntries()) {
  const unique = new Map(allTasksOn(key).map((t) => [taskIdentity(t), t]));
  const periodRank = (t) =>
    Math.min(...taskPeriods(t).map((p) => prayerOrder.indexOf(p)), 5);
  return [...unique.values()]
    .filter((t) => {
      const action = state.actions.find((a) => a.id === t.actionId);
      return (
        t.showInMonthlyCalendar !== false &&
        (monthFilters.project === 'all' ||
          effectiveProjectIds(t, entries).includes(monthFilters.project)) &&
        (monthFilters.category === 'all' ||
          ActionCategories.category(state, action)?.id ===
            monthFilters.category) &&
        (monthFilters.status === 'all' || outcome(t) === monthFilters.status) &&
        (monthFilters.priority === 'all' ||
          String(taskPriority(t)) === monthFilters.priority) &&
        (monthFilters.period === 'all' ||
          taskInPeriod(t, +monthFilters.period)) &&
        (!monthFilters.query.trim() ||
          t.name
            .toLocaleLowerCase()
            .includes(monthFilters.query.trim().toLocaleLowerCase()))
      );
    })
    .sort(
      (a, b) =>
        periodRank(a) - periodRank(b) ||
        taskPriority(a) - taskPriority(b) ||
        a.name.localeCompare(b.name, 'ar'),
    );
}
function monthlySummary(tasks) {
  const done = tasks.filter((t) => outcome(t) === 'done').length,
    failed = tasks.filter((t) => outcome(t) === 'failed').length;
  return {
    total: tasks.length,
    done,
    failed,
    pending: tasks.length - done - failed,
    percent: done + failed ? (done / (done + failed)) * 100 : null,
  };
}
function closeMonthTaskMenu() {
  monthMenuCleanup?.();
  monthMenuCleanup = null;
}
function openMonthTaskMenu(anchor) {
  closeMonthTaskMenu();
  const captured = state,
    id = anchor.dataset.monthTask,
    key = anchor.dataset.monthDate,
    t = findTask(id, key);
  if (!t) return;
  if (t.historical) {
    openTaskHistory(t);
    return;
  }
  const menu = document.createElement('div');
  menu.id = 'monthTaskMenu';
  menu.className = 'month-task-menu';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'إجراءات المهمة: ' + t.name);
  const status = outcome(t);
  menu.innerHTML = `<button type="button" data-month-outcome="done" aria-pressed="${status === 'done'}">✓ صح</button><button type="button" data-month-outcome="failed" aria-pressed="${status === 'failed'}">✕ غلط</button><button type="button" data-month-edit>✎ تعديل</button>`;
  document.body.append(menu);
  anchor.setAttribute('aria-expanded', 'true');
  const position = () => {
    const r = anchor.getBoundingClientRect(),
      m = menu.getBoundingClientRect(),
      v = window.visualViewport;
    const left = v?.offsetLeft || 0,
      top = v?.offsetTop || 0,
      width = v?.width || window.innerWidth,
      height = v?.height || window.innerHeight;
    menu.style.left =
      Math.max(
        left + 8,
        Math.min(r.right - m.width, left + width - m.width - 8),
      ) + 'px';
    menu.style.top =
      Math.max(
        top + 8,
        Math.min(
          r.bottom + 6 + m.height <= top + height - 8
            ? r.bottom + 6
            : r.top - m.height - 6,
          top + height - m.height - 8,
        ),
      ) + 'px';
  };
  const outside = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target))
      closeMonthTaskMenu();
  };
  const keyboard = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMonthTaskMenu();
      anchor.focus();
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const buttons = [...menu.querySelectorAll('button')],
        index = buttons.indexOf(document.activeElement);
      buttons[
        (index + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : 2)) % 3
      ].focus();
    }
  };
  const focus = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) closeMonthTaskMenu();
  };
  monthMenuCleanup = () => {
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', keyboard);
    document.removeEventListener('focusin', focus);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    window.visualViewport?.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('scroll', position);
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', keyboard);
  document.addEventListener('focusin', focus);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  menu.querySelectorAll('[data-month-outcome]').forEach(
    (b) =>
      (b.onclick = () => {
        if (state !== captured) {
          closeMonthTaskMenu();
          return;
        }
        const current = findTask(id, key);
        if (!current) {
          closeMonthTaskMenu();
          return;
        }
        if (b.dataset.monthOutcome === 'failed') {
          closeMonthTaskMenu();
          openTaskFailure(current);
          return;
        }
        recordTaskOutcome(current, b.dataset.monthOutcome);
        closeMonthTaskMenu();
        save();
        taskReadScope(() => {
          refreshMonthTaskValues();
          refreshTaskRowValues(current);
          applyCompletedVisibility();
        })();
        [...app.querySelectorAll('[data-month-task]')]
          .find(
            (b) => b.dataset.monthTask === id && b.dataset.monthDate === key,
          )
          ?.focus();
      }),
  );
  menu.querySelector('[data-month-edit]').onclick = () => {
    closeMonthTaskMenu();
    if (state === captured) openTaskManager(findTask(id, key));
  };
  position();
  menu.querySelector('button').focus();
}
function monthTaskChip(t, entries = progressEntries()) {
  const result = outcome(t),
    label = { done: 'فعلتها', failed: 'لم أفعلها', pending: 'لم تُسجل' }[
      result
    ],
    parent = t.parentId ? mainTask(t, entries) : null,
    progress = percentLabel(taskCompletion(t, entries));
  return `<button type="button" class="month-task ${result}${t.historical ? ' task-historical' : ''}" data-month-task="${esc(t.id)}" data-month-date="${t.date}" title="${esc(t.name)}${parent ? ' — ضمن ' + esc(parent.name) : ''} — ${label} — التقدم ${progress}" aria-haspopup="dialog" aria-expanded="false" aria-controls="monthTaskMenu" aria-label="${esc(t.name)}${parent ? '، ضمن ' + esc(parent.name) : ''}، ${label}، التقدم ${progress}"><span aria-hidden="true">${{ done: '✓', failed: '✕', pending: '○' }[result]}</span><span class="month-task-text">${esc(t.name)}${t.historical ? `<small>← ${esc(t.transferredTo)}</small>` : taskIsDeferred(t) ? '<small>↪ مؤجلة</small>' : ''}${parent ? `<small>↳ ${esc(parent.name)}</small>` : ''}</span></button>`;
}
function refreshMonthTaskValues() {
  const entries = progressEntries(),
    visible = [],
    byDate = new Map();
  app.querySelectorAll('[data-calendar-day]').forEach((heading) => {
    const key = heading.dataset.calendarDay,
      tasks = monthlyTasks(key, entries),
      summary = monthlySummary(tasks);
    byDate.set(key, new Set(tasks.map(taskIdentity)));
    visible.push(...tasks);
    heading.querySelector('span').textContent =
      `${summary.done}/${summary.total} تمت`;
    heading.setAttribute(
      'aria-label',
      `${key}: ${summary.total} مهام ظاهرة، ${summary.done} تمت`,
    );
  });
  app.querySelectorAll('[data-month-task]').forEach((chip) => {
    const t = findTask(chip.dataset.monthTask, chip.dataset.monthDate);
    if (!t || !byDate.get(t.date)?.has(taskIdentity(t))) {
      chip.remove();
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = monthTaskChip(t, entries);
    const fresh = template.content.firstElementChild;
    ['class', 'title', 'aria-label'].forEach((name) =>
      chip.setAttribute(name, fresh.getAttribute(name)),
    );
    chip.firstElementChild.textContent = fresh.firstElementChild.textContent;
  });
  const stats = monthlySummary(visible);
  const values = [
    stats.total,
    stats.done,
    stats.failed,
    stats.pending,
    stats.percent === null ? 'لا نتائج مسجلة' : percentLabel(stats.percent),
  ];
  app
    .querySelectorAll('.month-summary b')
    .forEach((node, i) => (node.textContent = values[i]));
}
function renderTaskMonth() {
  closeMonthTaskMenu();
  plannerMonth ||= date.slice(0, 7);
  const first = plannerMonth + '-01',
    start = new Date(first + 'T12:00:00'),
    offset = start.getDay(),
    last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(),
    today = activeDay(),
    entries = progressEntries();
  const days = Array.from({ length: last }, (_, i) => {
    const key = plannerMonth + '-' + String(i + 1).padStart(2, '0');
    return { key, number: i + 1, tasks: monthlyTasks(key, entries) };
  });
  const stats = monthlySummary(days.flatMap((d) => d.tasks));
  const select = (field, label, options) =>
    `<label class="field">${label}<select data-month-filter="${field}"><option value="all">الكل</option>${options.map(([value, name]) => `<option value="${esc(value)}" ${String(value) === monthFilters[field] ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
  const chip = (t) => monthTaskChip(t, entries);
  $('#plannerContent').innerHTML =
    `<section class="panel monthly-panel"><div class="top"><h2>خطة الشهر</h2><div class="date"><button data-month-shift="-1" aria-label="الشهر السابق">→</button><input id="taskMonth" type="month" value="${plannerMonth}" aria-label="الشهر"><button data-month-shift="1" aria-label="الشهر التالي">←</button></div></div>
 <p class="hint">تقويم ميلادي بحسب تاريخ نهار اليوم الذي يبدأ من المغرب. اضغط التاريخ لتفاصيل اليوم، أو المهمة لتسجيل نتيجتها وتعديلها. ○ غير مسجلة · ✓ تمت · ✕ لم تتم. تفاصيل التقدم متاحة عند تمرير المؤشر أو فتح تعديل المهمة.</p>
 <details id="monthFilters" ${monthFiltersOpen ? 'open' : ''}><summary>البحث وتصفية التقويم</summary><div class="month-filters">
 ${select(
   'project',
   'المشروع',
   (state.projects || []).map((p) => [p.id, p.name]),
 )}
 ${select(
   'category',
   'القسم المرتبط بالفعل',
   state.categories.map((c) => [c.id, c.name]),
 )}
 ${select('status', 'حالة المهمة', [
   ['done', 'تمت'],
   ['failed', 'لم تتم'],
   ['pending', 'غير مسجلة'],
 ])}
 ${select('priority', 'الأولوية (1 الأعلى)', Object.entries(priorityNames))}
 ${select(
   'period',
   'فترة الصلاة',
   prayerOrder.map((p) => [String(p), names[p]]),
 )}
 <label class="field">بحث باسم المهمة<input data-month-filter="query" type="search" value="${esc(monthFilters.query)}"></label></div></details>
 <div class="month-summary" role="status" aria-live="polite"><span>المعروضة: <b>${stats.total}</b></span><span>فعلتها: <b>${stats.done}</b></span><span>لم أفعلها: <b>${stats.failed}</b></span><span>غير مسجلة: <b>${stats.pending}</b></span><span>الإنجاز من النتائج المسجلة: <b>${stats.percent === null ? 'لا نتائج مسجلة' : percentLabel(stats.percent)}</b></span></div>
 <p class="hint">الأعداد تخص المهام الظاهرة بعد التصفية وخيارات الظهور. نسبة النتائج = فعلتها ÷ (فعلتها + لم أفعلها). تقدم المشاريع العام لا يتأثر بالإخفاء أو التصفية. المهام المستقبلية غير المسجلة ليست فائتة.</p>
 <div class="task-month-scroll" tabindex="0" role="region" aria-label="التقويم الشهري"><div class="task-month">${week.map((n) => `<div class="month-weekday">${n}</div>`).join('')}${Array.from({ length: offset }, () => '<div aria-hidden="true"></div>').join('')}${days
   .map(({ key, number, tasks }) => {
     const s = monthlySummary(tasks),
       d = state.sunsetDays[key] || emptyDay(),
       prayerChecks = prayerOrder.reduce((n, p) => n + prayerCount(p, d), 0);
     return `<section class="month-day ${key === today ? 'is-today' : ''}" aria-label="يوم ${key}"><button type="button" data-calendar-day="${key}" class="month-day-heading" ${key === today ? 'aria-current="date"' : ''} aria-label="${key}: ${s.total} مهام ظاهرة، ${s.done} تمت"><strong>${number}</strong><span>${s.done}/${s.total} تمت</span></button>${key <= today ? `<small class="month-prayer-checks">الصلاة ${prayerChecks}/${prayerCheckTotal()}</small>` : ''}<div class="month-tasks">${tasks.map(chip).join('')}</div></section>`;
   })
   .join(
     '',
   )}</div></div><p class="hint">السجل الموثوق للمهام المتكررة يبدأ من ${esc(state.taskHistoryStart || 'تفعيل السجل')}. ما قبل ذلك يُعرض من البيانات المسجلة المتاحة فقط.</p></section>`;
  $('#taskMonth').onchange = (e) => {
    if (e.target.value) {
      plannerMonth = e.target.value;
      renderTaskMonth();
    }
  };
  app.querySelectorAll('[data-month-shift]').forEach(
    (b) =>
      (b.onclick = () => {
        const next = new Date(first + 'T12:00:00');
        next.setMonth(next.getMonth() + +b.dataset.monthShift);
        plannerMonth = localDate(next).slice(0, 7);
        renderTaskMonth();
      }),
  );
  $('#monthFilters').ontoggle = (e) => {
    if (e.target.isConnected) monthFiltersOpen = e.target.open;
  };
  app.querySelectorAll('[data-month-filter]').forEach((input) => {
    const refresh = () => {
      const field = input.dataset.monthFilter;
      monthFilters[field] = input.value;
      monthFiltersOpen = $('#monthFilters').open;
      const pos = input.selectionStart;
      renderTaskMonth();
      const replacement = app.querySelector(`[data-month-filter="${field}"]`);
      replacement.focus();
      if (field === 'query' && pos !== null)
        replacement.setSelectionRange(pos, pos);
    };
    if (input.type === 'search') input.oninput = refresh;
    else input.onchange = refresh;
  });
  app
    .querySelectorAll('[data-calendar-day]')
    .forEach((b) => (b.onclick = () => openPlannerDay(b.dataset.calendarDay)));
  app
    .querySelectorAll('[data-month-task]')
    .forEach((b) => (b.onclick = () => openMonthTaskMenu(b)));
  applyCompletedVisibility();
}
function renderTaskWeek() {
  plannerWeek ||= addDate(date, -new Date(date + 'T12:00:00').getDay());
  const dates = Array.from({ length: 7 }, (_, i) => addDate(plannerWeek, i));
  $('#plannerContent').innerHTML =
    `<section class="panel"><div class="top"><h2>التخطيط الأسبوعي</h2><div class="date"><button data-week-shift="-7">الأسبوع السابق</button><span>${dates[0]} — ${dates[6]}</span><button data-week-shift="7">الأسبوع التالي</button></div></div><div class="task-week">${dates
      .map(
        (key) =>
          `<section class="week-day"><button class="week-heading" data-calendar-day="${key}"><strong>${week[new Date(key + 'T12:00:00').getDay()]}</strong><small>${key}</small></button>${prayerOrder
            .map((p) => {
              const list = taskGroups(
                  allTasksOn(key).filter((t) => taskInPeriod(t, p)),
                ),
                c = capacity(key, p);
              return `<div class="week-period"><b>${names[p]}</b><small>${c.free} متاحة / ${c.total} · تقدير ${c.estimates}</small>${list.map((t) => taskCard(t, { hideDescription: true })).join('')}<button class="week-add" data-week-add="${key}" data-period="${p}" aria-label="إضافة مهمة يوم ${key} فترة ${names[p]}">＋</button></div>`;
            })
            .join('')}${
            allTasksOn(key).some((t) => !taskPeriods(t).length)
              ? `<div class="week-period"><b>بدون فترة محددة</b>${taskGroups(
                  allTasksOn(key).filter((t) => !taskPeriods(t).length),
                )
                  .map((t) => taskCard(t, { hideDescription: true }))
                  .join('')}</div>`
              : ''
          }</section>`,
      )
      .join('')}</div></section>`;
  app.querySelectorAll('[data-week-shift]').forEach(
    (b) =>
      (b.onclick = () => {
        plannerWeek = addDate(plannerWeek, +b.dataset.weekShift);
        renderTaskWeek();
      }),
  );
  app
    .querySelectorAll('[data-calendar-day]')
    .forEach((b) => (b.onclick = () => openPlannerDay(b.dataset.calendarDay)));
  bindTaskCards();
  app.querySelectorAll('[data-week-add]').forEach(
    (b) =>
      (b.onclick = () => {
        const original = date;
        date = b.dataset.weekAdd;
        prayer = +b.dataset.period;
        openPlannerEditor();
        date = original;
      }),
  );
}
