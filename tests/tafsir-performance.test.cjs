/* Real built-in tafsir data, with structural guards instead of machine-specific timing limits. */
const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(
  process.env.WKT_BENCH_ROOT || path.join(__dirname, '..'),
);
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
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
    .join('\n') + `\nwindow.tafsirRun=code=>eval(code)`,
);
const run = w.tafsirRun,
  $ = (s) => w.document.querySelector(s),
  rowRoot = () => $('#projectTaskList') || $('#projectDetails');
try {
  run(
    `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];delete state.tafsirDefaultInstalled;installDefaultTafsir(state);view='projects';selectedProject=TAFSIR_PROJECT_ID;expandedTaskRows.clear();if(typeof projectViews!=='undefined')projectViews.clear();window.tafsirRenderedChildren=0;const tafsirRow=taskRow;taskRow=(t,...args)=>{if(t.parentId)window.tafsirRenderedChildren++;return tafsirRow(t,...args)};`,
  );
  assert.equal(run('state.taskInbox.filter(t=>!t.parentId).length'), 30);
  assert.equal(run('state.taskInbox.filter(t=>t.parentId).length'), 240);
  const metrics = {};
  let start = performance.now();
  run('render()');
  metrics.initialMs = Math.round(performance.now() - start);
  assert.equal(rowRoot().querySelectorAll(':scope > .task-row').length, 30);
  assert.equal(
    run('window.tafsirRenderedChildren'),
    0,
    'closed tafsir branches must never be generated',
  );
  assert.equal(
    rowRoot().querySelectorAll('.task-children .task-row').length,
    0,
  );
  if (process.env.WKT_BENCH_INITIAL_ONLY === '1') {
    console.log('TAFSIR ' + JSON.stringify(metrics));
    return;
  }
  const snapshot = run('JSON.stringify(state)'),
    first = rowRoot().querySelector('.task-row'),
    firstToggle = first.querySelector('[data-task-toggle]');
  start = performance.now();
  firstToggle.click();
  metrics.openPartMs = Math.round(performance.now() - start);
  assert.equal(first.querySelectorAll('.task-children .task-row').length, 8);
  assert.equal(run('window.tafsirRenderedChildren'), 8);
  assert.equal(rowRoot().querySelector(':scope > .task-row'), first);
  start = performance.now();
  firstToggle.click();
  rowRoot()
    .querySelectorAll(':scope > .task-row')[1]
    .querySelector('[data-task-toggle]')
    .click();
  metrics.switchPartMs = Math.round(performance.now() - start);
  assert.equal(first.querySelectorAll('.task-children .task-row').length, 0);
  assert.equal(
    rowRoot().querySelectorAll('.task-children .task-row').length,
    8,
  );
  if ($('#projectSearch')) {
    const search = $('#projectSearch');
    start = performance.now();
    search.value = 'الربع الثامن ج٣٠';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    metrics.searchMs = Math.round(performance.now() - start);
    assert.equal(rowRoot().querySelectorAll(':scope > .task-row').length, 1);
    assert.equal(rowRoot().querySelectorAll('[data-project-match]').length, 1);
    assert.match(rowRoot().textContent, /الجزء الثلاثون/);
    assert.match(rowRoot().textContent, /الربع الثامن ج30/);
    $('#clearProjectSearch').click();
    start = performance.now();
    $('#expandProjectTasks').click();
    metrics.expandAllMs = Math.round(performance.now() - start);
    assert.equal(rowRoot().querySelectorAll('.task-row').length, 270);
    start = performance.now();
    $('#collapseProjectTasks').click();
    metrics.collapseAllMs = Math.round(performance.now() - start);
    assert.equal(rowRoot().querySelectorAll('.task-row').length, 30);
    run(
      `state.projects.push({id:'tafsir-small',name:'مشروع صغير'});state.taskInbox.push({id:'tafsir-small-task',name:'مهمة صغيرة',projectId:'tafsir-small'});save();render();`,
    );
    start = performance.now();
    run(`selectProject('tafsir-small');selectProject(TAFSIR_PROJECT_ID)`);
    metrics.switchProjectMs = Math.round(performance.now() - start);
    assert.equal(rowRoot().querySelectorAll('.task-row').length, 30);
    run(
      `state.projects=state.projects.filter(p=>p.id!=='tafsir-small');state.taskInbox=state.taskInbox.filter(t=>t.id!=='tafsir-small-task');`,
    );
  }
  assert.equal(
    run('JSON.stringify(state)'),
    snapshot,
    'browsing does not alter tafsir tasks or progress',
  );
  console.log(
    'PASS: built-in tafsir project, 30 roots / 240 lazy children, local part navigation and unchanged task data',
  );
  console.log('TAFSIR ' + JSON.stringify(metrics));
} finally {
  w.close();
}
