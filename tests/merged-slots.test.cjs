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
  run(
    `state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];view='day';prayer=4;render();window.slotRenders=0;const savedSlotRender=render;render=(...args)=>{window.slotRenders++;return savedSlotRender(...args)};`,
  );
  const first = run('range(prayer)[0]');
  run(
    `window.mergeFirst=${first};SlotTools.apply(day(),mergeFirst,mergeFirst+6,'actual',state.actions[0].id,'ملاحظة واحدة',starts()[3]);SlotTools.apply(day(),mergeFirst,mergeFirst+3,'planned',state.actions[1].id,'خطة مستقلة',starts()[3]);save();refreshDailySlots(mergeFirst,mergeFirst+6)`,
  );
  const shell = $('.day-workspace'),
    grid = $('#dailySlots'),
    untouched = slot(first + 6);
  const pieces = [...w.document.querySelectorAll('.slot-actual')].filter(
    (b) => +b.dataset.rangeStart === first,
  );
  assert.equal(
    pieces.length,
    2,
    'six slots wrap as a 4-column piece and a 2-column continuation',
  );
  assert.equal(
    pieces.reduce((n, b) => n + (+b.dataset.pieceEnd - +b.dataset.slot), 0),
    6,
  );
  assert.equal(
    pieces.reduce((n, b) => n + b.querySelectorAll('.slot-note').length, 0),
    1,
    'note appears once across continuations',
  );
  assert.equal(
    +$('.slot-planned').dataset.rangeEnd - first,
    3,
    'planned merging is independent',
  );
  slot(first).click();
  assert.equal(+$('#slotFrom').value, first);
  assert.equal(+$('#slotTo').value, first + 6);
  assert.ok($('#singleSlotOnly'));
  $('#slotNote').value = 'ملاحظة الفترة';
  submit();
  for (let i = 0; i < 6; i++)
    assert.equal(run(`day().actualNotes[${first + i}%144]`), 'ملاحظة الفترة');
  assert.equal(run(`day().plannedNotes[${first}%144]`), 'خطة مستقلة');
  assert.equal(
    slot(first + 6),
    untouched,
    'unrelated buttons keep their nodes',
  );
  assert.equal($('.day-workspace'), shell);
  assert.equal($('#dailySlots'), grid);
  assert.equal(run('window.slotRenders'), 0);
  slot(first).click();
  $('#singleSlotOnly').click();
  assert.equal(+$('#slotTo').value, first + 1);
  $('#slotNote').value = 'خانة واحدة';
  submit();
  assert.equal(run(`day().actualNotes[${first}%144]`), 'خانة واحدة');
  assert.equal(run(`day().actualNotes[${first + 1}%144]`), 'ملاحظة الفترة');
  assert.equal(+slot(first).dataset.rangeEnd, first + 1);
  const cases = [
    [`({slots:{0:'a',1:'a'},actualNotes:{0:'ن',1:'ن'}})`, [0, 1], 1],
    [`({slots:{0:'a',1:'a'},actualNotes:{0:'ن',1:'م'}})`, [0, 1], 2],
    [`({slots:{0:'a',1:'b'}})`, [0, 1], 2],
    [`({slots:{},actualNotes:{0:'ن',1:'ن'}})`, [0, 1], 1],
    [`({slots:{}})`, [0, 1], 2],
    [
      `({slots:{0:'a',1:'a'},actualTasks:{0:{id:'a',name:'أ'},1:{id:'b',name:'ب'}}})`,
      [0, 1],
      2,
    ],
    [
      `({slots:{0:'a',1:'a'},actualTasks:{0:{id:'a',name:'أ'},1:{name:'أ',id:'a'}}})`,
      [0, 1],
      1,
    ],
    [`({slots:{143:'a',0:'a',1:'a'}})`, [143, 144, 145], 1],
    [`({slots:{0:'a',2:'a'}})`, [0, 2], 2],
  ];
  for (const [data, indices, count] of cases)
    assert.equal(
      run(
        `SlotTools.groups(${data},${JSON.stringify(indices)},'actual').length`,
      ),
      count,
    );
  assert.equal(
    run(
      `SlotTools.groups({planned:{0:'a',1:'a'},taskSlotOwners:{0:'one',1:'two'}},[0,1],'planned').length`,
    ),
    2,
  );
  // Archived task labels remain editable without requiring a live task record.
  run(
    `for(let i=mergeFirst;i<mergeFirst+2;i++){day().slots[i%144]=state.actions[0].id;day().actualNotes[i%144]='قديم';(day().actualTasks??={})[i%144]={id:'removed',name:'مهمة محذوفة',actionId:state.actions[0].id}}save();refreshDailySlots(mergeFirst,mergeFirst+2)`,
  );
  slot(first).click();
  $('#slotNote').value = 'حُفظ السجل';
  submit();
  assert.equal($('#picker').open, false);
  assert.equal(run(`day().actualTasks[${first}%144].id`), 'removed');
  const snapshot = run('JSON.stringify(state)');
  run('renderDailySlotGrid()');
  assert.equal(
    run('JSON.stringify(state)'),
    snapshot,
    'grouping only changes presentation',
  );
  // Project content follows document scroll, remembered per project.
  run(
    `state.projects=[{id:'scroll-a',name:'أ'},{id:'scroll-b',name:'ب'}];state.taskInbox=[{id:'scroll-task',name:'مهمة',projectId:'scroll-a'}];view='projects';selectedProject='scroll-a';render();projectWindowScroll(360);selectProject('scroll-b')`,
  );
  assert.equal(run('projectWindowScroll()'), 0);
  run(`projectWindowScroll(120);selectProject('scroll-a')`);
  assert.equal(run('projectWindowScroll()'), 360);
  run(`selectProject('scroll-b')`);
  assert.equal(run('projectWindowScroll()'), 120);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: proportional range pieces, independent planned/actual notes and task boundaries, midnight/wrapping, single-slot/range editing, archived labels, local DOM reuse and per-project document scroll',
  );
} finally {
  w.close();
}
