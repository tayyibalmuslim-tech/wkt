const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://test.local',
    runScripts: 'outside-only',
  }),
  w = dom.window;
w.structuredClone = structuredClone;
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.confirm = () => true;
const errors = [];
dom.virtualConsole.on('jsdomError', (e) => errors.push(e.message));
w.addEventListener('error', (e) => errors.push(e.error));
w.eval(
  [
    'vendor/adhan.js',
    'calendar.js',
    'categories.js',
    'slots.js',
    'task-engine.js',
    'dashboard.js',
    'projects.js',
    'tafsir-default.js',
    'app.js',
  ]
    .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
    .join('\n') + '\nwindow.inlineRun=code=>eval(code)',
);
const run = w.inlineRun,
  $ = (s) => w.document.querySelector(s),
  row = (id) => $('#app [data-task-id="' + id + '"]'),
  own = (r, s) =>
    [...r.querySelectorAll(s)].find((e) => e.closest('.task-row') === r),
  change = (input, value, key = 'change') => {
    input.value = value;
    input.dispatchEvent(
      key === 'Enter'
        ? new w.KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            cancelable: true,
          })
        : new w.Event('change', { bubbles: true }),
    );
  };
try {
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'inline-a',name:'أ'},{id:'inline-b',name:'ب'}];state.taskInbox=[{id:'inline-root',name:'الأصل المشترك',projectIds:['inline-a','inline-b']},{id:'inline-other',name:'أصل آخر',projectId:'inline-a',expectedSlots:2},{id:'inline-free',name:'مستقلة أ',expectedSlots:2},{id:'inline-free2',name:'مستقلة ب',expectedSlots:3},...Array.from({length:20},(_,i)=>({id:'inline-child-'+i,name:'فرع '+i,parentId:'inline-root',parentDate:'',expectedSlots:2,priority:3})),{id:'inline-deep',name:'عميقة',parentId:'inline-child-9',parentDate:'',expectedSlots:2}];expandedTaskRows.clear();projectViews.clear();view='projects';selectedProject='inline-a';render();window.inlineRenderCount=0;const inlineRender=render;render=(...args)=>{window.inlineRenderCount++;return inlineRender(...args)};`,
  );
  assert.equal(row('inline-child-0'), null);
  const root = row('inline-root');
  for (const selector of [
    '[data-outcome="done"]',
    '[data-outcome="failed"]',
    '[data-task-edit]',
    '[data-progress]',
    '[data-project-order-key]',
  ]) {
    assert.ok(own(root, selector));
    assert.ok(own(root, selector).closest('.task-row-heading'));
    assert.equal(own(root, selector).closest('.task-row-secondary'), null);
  }
  own(root, '[data-task-toggle]').click();
  assert.equal(root.querySelectorAll('.task-children .task-row').length, 20);
  const child = row('inline-child-0'),
    input = own(child, '[data-progress]'),
    other = row('inline-other');
  assert.equal(
    child.querySelector('.row-parent'),
    null,
    'no repeated parent name inside the hierarchy',
  );
  input.focus();
  change(input, '1', 'Enter');
  assert.equal(w.document.activeElement, input);
  assert.equal(row('inline-child-0'), child);
  assert.equal(row('inline-other'), other);
  assert.equal(run(`completedSlots(findTask('inline-child-0',''))`), 1);
  assert.equal(run(`projectCompletion('inline-b')`), 2.5);
  own(child, '[data-outcome="done"]').click();
  assert.equal(run(`projectCompletion('inline-b')`), 5);
  own(child, '[data-outcome="done"]').click();
  assert.equal(run(`projectCompletion('inline-b')`), 2.5);
  own(child, '[data-outcome="failed"]').click();
  assert.ok(child.classList.contains('failed'));
  assert.equal(run(`projectCompletion('inline-b')`), 2.5);
  for (const invalid of ['-1', '2.5', '', '10000']) {
    change(input, invalid);
    assert.equal(input.value, '1');
  }
  change(input, '3', 'Enter');
  assert.equal(run(`completedSlots(findTask('inline-child-0',''))`), 3);
  assert.equal(own(child, '[data-row-expected]').textContent, '2');
  const ranked = row('inline-child-9');
  own(ranked, '[data-task-toggle]').click();
  const deep = row('inline-deep');
  $('#projectDetails').scrollTop = 280;
  const rank = own(ranked, '[data-subtask-order]');
  rank.focus();
  change(rank, '1', 'Enter');
  assert.equal(w.document.activeElement, rank);
  assert.equal($('#projectDetails').scrollTop, 280);
  assert.equal(row('inline-child-9'), ranked);
  assert.equal(row('inline-deep'), deep);
  assert.equal(
    run(`childTasks(findTask('inline-root',''))[0].id`),
    'inline-child-9',
  );
  assert.equal(
    run('window.inlineRenderCount'),
    0,
    'inline changes and sibling reorder never redraw the page',
  );
  const projectRank = own(other, '[data-project-order-key]');
  projectRank.focus();
  change(projectRank, '1', 'Enter');
  assert.equal($('#projectTaskList > .task-row'), other);
  assert.equal(w.document.activeElement, projectRank);
  assert.equal(run('window.inlineRenderCount'), 0);
  own(ranked, '[data-task-edit]').click();
  assert.equal(
    $('#plannerForm').elements.taskName.value,
    'فرع 9',
    'pencil opens the child directly',
  );
  $('#plannerForm').elements.taskName.value = 'فرع معدل';
  $('#plannerForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.equal($('#plannerEditor').open, false);
  assert.ok(row('inline-deep'));
  assert.equal($('#projectDetails').scrollTop, 280);
  assert.equal(own(row('inline-child-9'), '[data-subtask-order]').value, '1');
  // Ordinary roots have no manual order, including records saved by the previous version.
  run(
    `findTask('inline-free','').priority=1;findTask('inline-free','').listPosition=2;findTask('inline-free2','').priority=5;findTask('inline-free2','').listPosition=1;save();view='dashboard';plannerTab='inbox';plannerQuery='';plannerStatus=plannerPriority=plannerProject='all';render();`,
  );
  const free = row('inline-free2');
  assert.equal(own(free, '.project-task-order'), undefined);
  assert.equal(own(row('inline-free'), '.project-task-order'), undefined);
  assert.equal($('[data-root-order]'), null);
  assert.ok(own(free, '[data-task-edit]'));
  assert.ok(own(free, '[data-progress]'));
  assert.equal(
    $('[data-planner-section="unassigned"] > .task-row').dataset.taskId,
    'inline-free',
  );
  assert.ok(
    $('.planner-project-tasks [data-project-order-key]'),
    'project order remains available in dashboard project groups',
  );
  run(
    `state=JSON.parse(localStorage.getItem('waqti-v1'));validate(state);render()`,
  );
  assert.equal(
    $('[data-planner-section="unassigned"] > .task-row').dataset.taskId,
    'inline-free',
  );
  assert.equal(
    run(`findTask('inline-free2','').listPosition`),
    1,
    'legacy data is preserved but ignored',
  );
  run(`view='day';render()`);
  assert.equal($('[data-root-order]'), null);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: always-visible inline controls, shared results, numeric validation/focus, local sibling/project ordering, direct child editing and no ordinary-task ordering',
  );
} finally {
  dom.window.close();
}
