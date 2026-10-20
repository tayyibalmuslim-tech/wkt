/* Missed tasks keep project sections while grouping by action and root task. */
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://test.local',
  runScripts: 'outside-only',
});
const w = dom.window;
w.structuredClone = structuredClone;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.confirm = () => true;
const errors = [];
dom.virtualConsole.on('jsdomError', (error) => errors.push(error.message));
w.addEventListener('error', (error) => errors.push(error.error));
w.eval(
  [
    'vendor/adhan.js', 'calendar.js', 'categories.js', 'slots.js',
    'task-engine.js', 'dashboard.js', 'projects.js',
    'tafsir-default.js', 'app.js',
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') +
    '\nwindow.missedRun=code=>eval(code)',
);
const run = w.missedRun;
const $ = (selector) => w.document.querySelector(selector);
const byId = (container, id) =>
  container.querySelector('[data-task-id="' + id + '"]');
const rows = (container) =>
  [...container.querySelectorAll('.task-row')].map((row) => row.dataset.taskId);
try {
  run(`
    state.sunsetDays={};state.repeat=[];state.taskInbox=[];
    state.projects=[{id:'p-a',name:'المشروع ألف'},{id:'p-b',name:'المشروع باء'}];
    state.taskHistoryStart=activeDay();
    state.taskHistoryThrough=addDate(activeDay(),-1);
    const past=addDate(activeDay(),-1), tomorrow=addDate(activeDay(),1);
    const actionA=state.actions[0].id, actionB=state.actions[1].id;
    taskDay(past).tasks=[
      {id:'root',name:'العمل الرئيسي',projectId:'p-a',prayer:3,actionId:actionA,priority:3},
      {id:'child-a',name:'فرع فائت ألف',parentId:'root',parentDate:past,prayer:3,actionId:actionA,priority:3},
      {id:'child-b',name:'فرع فائت باء',parentId:'root',parentDate:past,prayer:3,actionId:actionB,priority:3},
      {id:'child-done',name:'فرع مكتمل',parentId:'root',parentDate:past,prayer:3,actionId:actionA,priority:3},
      {id:'done-root',name:'أصل مكتمل',projectId:'p-a',prayer:3,actionId:actionA,priority:3},
      {id:'missed-under-done',name:'فرع فائت تحت أصل مكتمل',parentId:'done-root',parentDate:past,prayer:3,actionId:actionA,priority:3},
      {id:'other-project',name:'مهمة مشروع باء',projectId:'p-b',prayer:3,actionId:actionA,priority:3},
      {id:'unlinked',name:'فائتة بدون فعل',prayer:3,priority:3},
      {id:'independent',name:'فائتة مستقلة',prayer:3,actionId:actionA,priority:3}
    ];
    taskDay(past).done={'child-done':true,'done-root':true};
    taskDay(tomorrow).tasks=[
      {id:'tomorrow-child',name:'فرع مستقبلي',parentId:'root',parentDate:past,prayer:3,actionId:actionA,priority:3}
    ];
    view='dashboard';plannerTab='missed';plannerQuery='';
    plannerPriority=plannerStatus=plannerProject='all';
    render();
  `);
  const projects = () => $('[data-planner-section="projects"]');
  const withoutProject = () => $('[data-planner-section="unassigned"]');
  const actionNames = [run('state.actions[0].name'), run('state.actions[1].name')];
  assert.equal(w.document.querySelectorAll('[data-planner-project]').length, 3);
  const currentProjects = projects();
  assert.ok(currentProjects.textContent.includes('المشروع ألف'));
  assert.equal(currentProjects.querySelectorAll('.period-action-group').length, 2);
  const actionA = [...currentProjects.querySelectorAll('.period-action-group')]
    .find((group) => group.querySelector('h3').textContent.includes(actionNames[0]));
  const actionB = [...currentProjects.querySelectorAll('.period-action-group')]
    .find((group) => group.querySelector('h3').textContent.includes(actionNames[1]));
  assert.ok(actionA && actionB);
  assert.deepEqual(rows(currentProjects).sort(),
    ['root','child-a','child-b','missed-under-done'].sort(),
    'show only missed tasks, with each missed task rendered once');
  assert.ok(byId(actionA,'root'));
  assert.ok(byId(actionA,'child-a').closest('.period-task-family'));
  assert.ok(byId(actionB,'child-b'));
  assert.equal(byId(actionB,'root'),null,
    'parent with a different action remains a label rather than an extra task');
  assert.match(actionB.querySelector('.period-family-heading').textContent,/العمل الرئيسي/);
  assert.equal(byId(actionA,'done-root'),null,
    'completed parent appears only as a non-interactive heading');
  assert.ok(byId(actionA,'missed-under-done'));
  assert.match(actionA.textContent,/أصل مكتمل/);
  assert.equal(byId(currentProjects,'child-done'),null);
  assert.equal(byId(currentProjects,'tomorrow-child'),null);
  assert.equal(byId(currentProjects,'other-project'),null);
  assert.deepEqual(rows(withoutProject()).sort(),['independent','unlinked'].sort());
  assert.ok(withoutProject().querySelector('.period-action-heading'));
  assert.ok(withoutProject().textContent.includes('بدون فعل مرتبط'));
  assert.ok($('#toggleTaskSelection') && !$('#toggleTaskSelection').disabled);
  $('#toggleTaskSelection').click();
  assert.ok(w.document.querySelector('[data-select-task]'),
    'multi-selection remains available on missed tasks');
  $('#toggleTaskSelection').click();
  $('[data-planner-project="p-b"]').click();
  assert.deepEqual(rows(projects()),['other-project']);
  $('[data-planner-project="p-a"]').click();
  $('#plannerSearch').value = 'فرع فائت باء';
  $('#plannerSearch').dispatchEvent(new w.Event('input'));
  assert.deepEqual(rows(projects()),['child-b']);
  assert.match(projects().textContent,/العمل الرئيسي/);
  $('#plannerSearch').value='';
  $('#plannerSearch').dispatchEvent(new w.Event('input'));
  byId(projects(),'child-b').querySelector('[data-outcome="done"]').click();
  assert.equal(run("outcome(findTask('child-b',addDate(activeDay(),-1)))"),'done');
  assert.equal(byId(projects(),'child-b'),null,'completed task exits missed list');
  assert.deepEqual(errors,[]);
  console.log('Missed action/parent grouping checks passed.');
} finally {
  dom.window.close();
}

