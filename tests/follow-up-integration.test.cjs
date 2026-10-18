const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
    url: 'https://test.local',
    runScripts: 'outside-only',
  }),
  w = dom.window;
w.structuredClone = structuredClone;
w.confirm = () => true;
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let exported;
w.URL.createObjectURL = (b) => {
  exported = b;
  return 'blob:test';
};
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () {};
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
    'follow-up.js',
    'app.js',
  ]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n') + '\nwindow.run=code=>eval(code)',
);
const run = w.run;
run("state.starterIntroPending=false;view='followUp';render()");
w.document.querySelector('#fuCreate').click();
const before = run('JSON.stringify(state)');
assert.ok(run('downloadBackup(true)'));
const reader = new w.FileReader();
reader.onload = () => {
  try {
    const combined = JSON.parse(reader.result);
    assert.ok(combined.followUpReference);
    assert.ok(combined.followUpReference.updateInstructions);
    assert.equal(run('JSON.stringify(state)'), before);
    run('validate(' + JSON.stringify(combined) + ')');
    assert.ok(run('downloadBackup()'));
    const ordinary = new w.FileReader();
    ordinary.onload = () => {
      try {
        assert.equal(
          Object.hasOwn(JSON.parse(ordinary.result), 'followUpReference'),
          false,
        );
        console.log(
          'Follow-up combined backup stays compatible and never enters application/sync state',
        );
      } finally {
        dom.window.close();
      }
    };
    ordinary.readAsText(exported);
  } catch (e) {
    dom.window.close();
    throw e;
  }
};
reader.readAsText(exported);
