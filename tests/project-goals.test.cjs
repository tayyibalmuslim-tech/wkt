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
    .join('\n') + '\nwindow.goalsRun=code=>eval(code)',
);
const run = w.goalsRun,
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
const submitGoal = (date, percent) => {
  const form = $('#projectGoalForm');
  form.elements.goalDate.value = date;
  form.elements.goalPercent.value = String(percent);
  form.dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
};
try {
  run(
    `state.sunsetDays={};state.repeat=[];state.projects=[{id:'goals-a',name:'أ'},{id:'goals-b',name:'ب',goals:[{id:'b80',date:'2050-12-01',percent:80}]}];state.taskInbox=[{id:'goals-root',name:'أصل',projectIds:['goals-a','goals-b']},{id:'goals-child',name:'فرع',parentId:'goals-root',parentDate:'',expectedSlots:10}];view='projects';selectedProject='goals-a';render();`,
  );
  assert.equal($('.project-goal-marker'), null);
  const rootRow = $('#projectTaskList > .task-row');
  own(rootRow, '[data-task-toggle]').click();
  const child = $('#projectTaskList [data-task-id="goals-child"]');
  $('#projectDetails').scrollTop = 200;
  $('#projectGoals').click();
  submitGoal('2050-11-01', 50);
  assert.equal($('#projectGoalError').textContent, '');
  const id = run(`state.projects[0].goals[0].id`);
  assert.equal(
    $('.project-goal-marker').style.getPropertyValue('--goal-percent'),
    '50',
  );
  assert.match($('.project-goal-marker').title, /50%.*2050-11-01/);
  assert.match($('#projectGoalSummary').textContent, /50%.*2050-11-01/);
  assert.equal($('#projectTaskList > .task-row'), rootRow);
  assert.equal($('#projectDetails').scrollTop, 200);
  $('[data-close-goals]').click();
  const progress = own(child, '[data-progress]');
  change(progress, '5');
  assert.equal($('#projectTaskList [data-task-id="goals-child"]'), child);
  assert.equal(run(`projectCompletion('goals-a')`), 50);
  assert.equal(run(`projectCompletion('goals-b')`), 50);
  assert.ok($('.project-goal-marker').classList.contains('reached'));
  assert.match($('#projectGoalSummary').textContent, /متحققة حاليًا/);
  $('.project-goal-marker').click();
  assert.equal($('#projectGoalForm').elements.goalId.value, id);
  submitGoal('2050-11-01', 60);
  assert.equal(run('state.projects[0].goals.length'), 1);
  assert.equal(run('state.projects[0].goals[0].id'), id);
  assert.equal($('.project-goal-marker').classList.contains('reached'), false);
  submitGoal('2000-01-01', 75);
  assert.ok($('.project-goal-marker.overdue'));
  assert.match($('#projectGoalSummary').textContent, /75%.*تجاوز الموعد/);
  submitGoal('2051-01-01', 60);
  assert.equal(run('state.projects[0].goals.length'), 3);
  assert.equal(
    w.document.querySelectorAll('.project-goal-marker').length,
    2,
    'equal targets share a marker',
  );
  assert.match(
    $('.project-goal-marker:not(.overdue)').title,
    /2050-11-01.*2051-01-01/,
  );
  const late = run(`state.projects[0].goals.find(g=>g.percent===75).id`);
  $(`[data-delete-goal="${late}"]`).click();
  assert.equal(run('state.projects[0].goals.length'), 2);
  assert.equal($('.project-goal-marker.overdue'), null);
  const snapshot = run('JSON.stringify(state)');
  submitGoal('2050-12-01', 101);
  assert.match($('#projectGoalError').textContent, /نسبة/);
  assert.equal(run('JSON.stringify(state)'), snapshot);
  run('validate(state)');
  for (const patch of [
    '{percent:0}',
    '{percent:101}',
    '{percent:1.5}',
    "{date:'2050-02-30'}",
    "{date:'not-date'}",
    "{id:''}",
  ]) {
    assert.throws(() =>
      run(
        `validateProjectGoals([{id:'x',date:'2050-01-01',percent:50,...${patch}}])`,
      ),
    );
  }
  assert.throws(() =>
    run(
      `validateProjectGoals([{id:'x',date:'2050-01-01',percent:50},{id:'x',date:'2051-01-01',percent:60}])`,
    ),
  );
  assert.throws(() =>
    run(
      `validateProjectGoals(Array.from({length:101},(_,i)=>({id:String(i),date:'2050-01-01',percent:50})))`,
    ),
  );
  run(
    `validateProjectGoals(undefined);validateProjectGoals([{id:'leap',date:'2028-02-29',percent:100}])`,
  );
  assert.equal(
    run(`projectGoalStatus({percent:80,date:'2050-01-01'},50,'2050-01-01')`),
    'موعده اليوم',
  );
  assert.equal(
    run(`projectGoalStatus({percent:50,date:'2000-01-01'},50,'2050-01-01')`),
    'متحقق حاليًا',
  );
  const savedGoals = run('JSON.stringify(state.projects[0].goals)');
  run(
    `state=JSON.parse(localStorage.getItem('waqti-v1'));validate(state);render()`,
  );
  assert.equal(
    run('JSON.stringify(state.projects[0].goals)'),
    savedGoals,
    'full backup preserves goals',
  );
  assert.equal(w.document.querySelectorAll('.project-goal-marker').length, 1);
  $('[data-close-goals]').click();
  run(`openProjectEditor(state.projects[0])`);
  $('#projectForm').elements.projectName.value = 'اسم معدل';
  $('#projectForm').dispatchEvent(
    new w.Event('submit', { bubbles: true, cancelable: true }),
  );
  assert.equal(
    run('JSON.stringify(state.projects[0].goals)'),
    savedGoals,
    'renaming preserves goals',
  );
  run(
    `importProjectPackage({format:'wkt-project-v1',version:1,project:{name:'مستورد',goals:[{id:'imported-goal',date:'2050-01-01',percent:50}]},tasks:[{id:'one',name:'مهمة',expectedSlots:10}]})`,
  );
  assert.equal(run('state.projects.at(-1).goals[0].percent'), 50);
  const before = run('JSON.stringify(state)');
  assert.throws(() =>
    run(
      `importProjectPackage({format:'wkt-project-v1',version:1,project:{name:'سيئ',goals:[{id:'bad',date:'2050-02-30',percent:50}]},tasks:[{id:'one',name:'مهمة'}]})`,
    ),
  );
  assert.equal(
    run('JSON.stringify(state)'),
    before,
    'invalid import is atomic',
  );
  $('#projectGoals').click();
  run('state=structuredClone(state)');
  submitGoal('2050-12-01', 50);
  assert.match($('#projectGoalError').textContent, /تغيرت البيانات/);
  assert.equal(
    run('JSON.stringify(state)'),
    before,
    'stale editor cannot save to a replaced account',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: project goal CRUD, dated RTL marker values, live shared progress, grouping, validation, legacy/full backup/import compatibility and stale-state protection',
  );
} finally {
  w.close();
}
