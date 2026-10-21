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
    .join('\n') + '\nwindow.dayRun=code=>eval(code)',
);
const run = w.dayRun,
  $ = (s) => w.document.querySelector(s),
  slot = (n, kind = 'actual') => $(`[data-slot="${n}"][data-kind="${kind}"]`),
  submit = () =>
    $('#slotForm').dispatchEvent(
      new w.Event('submit', { bubbles: true, cancelable: true }),
    );
try {
  run("state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];prayer=0;view='settings';render()");
  const actions = run('state.actions.slice(0,3).map(a=>a.id)');
  const baseline = run('JSON.stringify({days:state.sunsetDays,repeat:state.repeat,inbox:state.taskInbox,projects:state.projects,checks:state.prayerTasks})');
  const add = (id, slots) => {
    $('#addPrayerAction select').value=id;
    $('#addPrayerAction input').value=slots;
    $('#addPrayerAction').dispatchEvent(new w.Event('submit',{cancelable:true}));
  };
  add(actions[0],6);add(actions[1],4);add(actions[2],2);
  assert.equal(run('prayerActionPlans(0).length'),3);
  const first=$('[data-plan-id] input'), otherPanel=$('#prayerTaskSettings');
  first.value=9;first.dispatchEvent(new w.Event('change'));
  assert.equal($('[data-plan-id] input'),first,'count change retains DOM and focus');
  assert.equal($('#prayerTaskSettings'),otherPanel);
  assert.equal(run('prayerActionPlans(0)[0].slots'),9);
  first.value=0;first.dispatchEvent(new w.Event('change'));
  assert.equal(run('prayerActionPlans(0)[0].slots'),9);
  $('[data-plan-move="1"]').click();
  assert.equal(run('prayerActionPlans(0)[1].id'),actions[0]);
  $('#prayerActionPrayer').value=2;$('#prayerActionPrayer').dispatchEvent(new w.Event('change'));
  add(actions[0],3);
  assert.equal(run('prayerActionPlans(2)[0].slots'),3);
  assert.equal(run('prayerActionPlans(0)[1].slots'),9);
  $('[data-plan-delete]').click();
  assert.equal(run('prayerActionPlans(2).length'),0);
  assert.ok(run('state.actions.some(a=>a.id==='+JSON.stringify(actions[0])+')'));
  assert.equal(run('JSON.stringify({days:state.sunsetDays,repeat:state.repeat,inbox:state.taskInbox,projects:state.projects,checks:state.prayerTasks})'),baseline,'planning leaves all recording data unchanged');
  run("view='day';render()");
  assert.equal(w.document.querySelectorAll('[data-prayer="0"] .prayer-action-chip').length,3);
  assert.equal($('[data-prayer="2"] .prayer-action-summary'),null);
  run("state.actions[0].name='<اسم جديد>';state.categories.find(c=>c.id===state.actions[0].categoryId).color='#123456';render()");
  const renamed=[...w.document.querySelectorAll('.prayer-action-chip')].find(el=>el.textContent.includes('<اسم جديد>'));
  assert.ok(renamed);assert.equal(renamed.querySelector('i').style.background,'rgb(18, 52, 86)');
  run('state.actions=state.actions.filter(a=>a.id!=='+JSON.stringify(actions[0])+');render()');
  assert.equal(w.document.querySelectorAll('[data-prayer="0"] .prayer-action-chip').length,2);
  run("view='settings';render()");
  assert.match($('#prayerActionSettings').textContent,/فعل محذوف/);
  const saved=w.localStorage.getItem('waqti-v1');
  run('state=JSON.parse('+JSON.stringify(saved)+');validate(state);render()');
  assert.equal(run('prayerActionPlans(0).length'),3,'plans survive local reload/backup validation');
  for(const plans of ['{5:[]}','{0:[{id:"x",slots:0}]}','{0:[{id:"x",slots:1.5}]}','{0:[{id:"x",slots:1},{id:"x",slots:2}]}']) assert.throws(()=>run('validate({...state,prayerActionPlans:'+plans+'})'));
  assert.deepEqual(errors,[]);
  console.log('Prayer action plans: CRUD, order, shared actions, live names/colors, missing actions, local restore, validation and recording isolation passed');
} finally { w.close(); }
