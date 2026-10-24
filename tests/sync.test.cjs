/* Two independent app windows sharing a deterministic Firebase contract mock.
   No real account, credentials, network or production database is used. */
const { JSDOM } = require('jsdom'),
  fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  clone = structuredClone;
const appSource =
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
    .join('\n') + '\nwindow.run=source=>eval(source);';
const syncSource = ['sync-merge.js', 'sync.js']
  .map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n');
const snapshot = (value) => ({ val: () => clone(value) });
class Hub {
  records = new Map();
  clients = [];
  pending = [];
  writes = 0;
  failNext = false;
  broadcast(uid) {
    for (const client of this.clients)
      if (client.online)
        client.refs
          .get('waqti/users/' + uid)
          ?.cb?.(snapshot(this.records.get(uid) || null));
  }
  transaction(client, uid, update, applyLocally) {
    assert.equal(applyLocally, false);
    const initial = client.emptyCache ? null : this.records.get(uid) || null;
    client.emptyCache = false;
    let proposal;
    try {
      proposal = update(clone(initial));
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) =>
      this.pending.push(() => {
        if (this.failNext) {
          this.failNext = false;
          reject({ code: 'auth/network-request-failed' });
          return;
        }
        // Firebase retries against a newer server value before committing a CAS.
        let next = proposal;
        try {
          if (proposal !== undefined)
            next = update(clone(this.records.get(uid) || null));
        } catch (error) {
          reject(error);
          return;
        }
        if (next === undefined) {
          resolve({
            committed: false,
            snapshot: snapshot(this.records.get(uid) || null),
          });
          return;
        }
        assert.equal(next.revision, (this.records.get(uid)?.revision || 0) + 1);
        this.records.set(uid, clone(next));
        this.writes++;
        this.broadcast(uid);
        resolve({ committed: true, snapshot: snapshot(next) });
      }),
    );
  }
  publish(uid, mutate) {
    const record = this.records.get(uid),
      state = JSON.parse(record.payload);
    mutate(state);
    this.records.set(uid, {
      payload: JSON.stringify(state),
      revision: record.revision + 1,
      updatedAt: 1234,
    });
    this.broadcast(uid);
  }
}
function client(hub, seed = null, storage = {}, online = true) {
  const dom = new JSDOM(
      fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
      { url: 'https://test.local', runScripts: 'outside-only' },
    ),
    w = dom.window;
  w.structuredClone = structuredClone;
  Object.defineProperty(w.document, 'hidden', {
    value: false,
    configurable: true,
  });
  w.confirm = () => true;
  w.alert = () => {};
  w.setInterval = () => 0;
  const timers = new Map();
  let nextTimer = 0;
  w.setTimeout = (fn, delay = 0) => {
    timers.set(++nextTimer, { fn, delay });
    return nextTimer;
  };
  w.clearTimeout = (id) => timers.delete(id);
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    if (this.contains(w.document.activeElement))
      w.document.activeElement.blur();
    this.open = false;
    this.dispatchEvent(new w.Event('close'));
  };
  const errors = [];
  dom.virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  for (const [key, value] of Object.entries(storage))
    w.localStorage.setItem(key, value);
  w.eval(appSource);
  if (seed)
    w.run(
      `state=JSON.parse(${JSON.stringify(JSON.stringify(seed))});render();`,
    );
  w.run(
    `state.starterIntroPending=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());`,
  );
  const c = {
    w,
    dom,
    errors,
    timers,
    refs: new Map(),
    online,
    emptyCache: false,
    authListener: null,
    auth: { currentUser: null },
  };
  c.auth.onAuthStateChanged = (callback) => {
    c.authListener = callback;
  };
  c.auth.signOut = async () => c.login(null);
  c.login = (uid = 'same-account') => {
    c.auth.currentUser = uid ? { uid, email: uid + '@example.com' } : null;
    c.authListener(c.auth.currentUser);
  };
  c.data = () => JSON.parse(w.run('JSON.stringify(state)'));
  c.save = (source) => w.run(source + ';save();');
  c.account = () => w.run("view='account';render();");
  c.storage = () =>
    Object.fromEntries(
      Array.from({ length: w.localStorage.length }, (_, i) => {
        const key = w.localStorage.key(i);
        return [key, w.localStorage.getItem(key)];
      }),
    );
  c.runTimers = (limit = 500) => {
    const batch = [...timers].filter(([, t]) => t.delay <= limit);
    for (const [id, t] of batch) if (timers.delete(id)) t.fn();
    return batch.length;
  };
  c.connect = (value) => {
    c.online = value;
    c.refs.get('.info/connected')?.cb?.(snapshot(value));
    if (value && c.auth.currentUser) hub.broadcast(c.auth.currentUser.uid);
  };
  const db = {
    ref(p) {
      if (!c.refs.has(p))
        c.refs.set(p, {
          cb: null,
          on(event, callback) {
            this.cb = callback;
            if (p === '.info/connected') callback(snapshot(c.online));
            else if (c.online)
              callback(snapshot(hub.records.get(p.split('/').at(-1)) || null));
          },
          off(event, callback) {
            if (this.cb === callback) this.cb = null;
          },
          get: async () =>
            snapshot(hub.records.get(p.split('/').at(-1)) || null),
          once: async () =>
            snapshot(hub.records.get(p.split('/').at(-1)) || null),
          transaction(update, complete, applyLocally) {
            return hub.transaction(
              c,
              p.split('/').at(-1),
              update,
              applyLocally,
            );
          },
        });
      return c.refs.get(p);
    },
  };
  const database = () => db;
  database.ServerValue = { TIMESTAMP: 1234 };
  w.firebase = { initializeApp() {}, auth: () => c.auth, database };
  hub.clients.push(c);
  w.run(syncSource);
  return c;
}
async function microtasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
async function pump(hub, clients, limit = 30) {
  for (let round = 0; round < limit; round++) {
    let activity = clients.reduce((sum, c) => sum + c.runTimers(), 0);
    if (hub.pending.length) {
      hub.pending.shift()();
      activity++;
    }
    await microtasks();
    if (
      !activity &&
      !hub.pending.length &&
      !clients.some((c) => [...c.timers.values()].some((t) => t.delay <= 500))
    )
      return;
  }
  throw Error('sync did not settle');
}
(async () => {
  // The sync page exports the active snapshot, including offline pending edits.
  {
    const hub = new Hub(), c = client(hub);
    let blob, filename;
    c.w.URL.createObjectURL = (value) => { blob = value; return 'blob:backup'; };
    c.w.URL.revokeObjectURL = () => {};
    c.w.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
    c.account();
    assert.equal(c.w.document.querySelector('#exportSyncBackup').disabled, true);
    c.login(null);
    c.save("state.taskInbox=[{id:'export-task',name:'Guest backup'}]");
    const guest = c.data();
    c.w.document.querySelector('#exportSyncBackup').click();
    const read = () => new Promise((resolve, reject) => {
      const reader = new c.w.FileReader();
      reader.onload = () => resolve(JSON.parse(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    assert.deepEqual(await read(), guest);
    assert.match(filename, /^waqti-backup-.*\.json$/);
    c.login();
    await pump(hub, [c]);
    c.connect(false);
    c.save("state.taskInbox=[{id:'pending-export',name:'Pending offline edit'}]");
    const pending = c.data(), writes = hub.writes, cached = c.storage();
    c.w.document.querySelector('#exportSyncBackup').click();
    assert.deepEqual(await read(), pending);
    assert.deepEqual(c.data(), pending);
    assert.deepEqual(c.storage(), cached);
    assert.equal(hub.writes, writes);
    assert.deepEqual(c.errors, []);
    c.dom.window.close();
    const cold = client(new Hub(), null, {}, false);
    cold.login();
    cold.account();
    assert.equal(cold.w.document.querySelector('#exportSyncBackup').disabled, true);
    cold.dom.window.close();
    console.log('PASS: sync-page backup exports guest and pending offline data without changing state or cloud');
  }
  const hub = new Hub(),
    a = client(hub);
  a.w.run(
    `state.starterIntroPending=false;state.projects=[{id:'p',name:'Project'}];state.taskInbox=[{id:'inbox',name:'Task',projectId:'p',expectedSlots:2,priority:3}];state.repeat=[];taskDay(date);save();render();`,
  );
  const seed = a.data(),
    day = a.w.run('date'),
    action = seed.actions[0].id,
    other = seed.actions[1].id;
  hub.records.set('same-account', {
    revision: 1,
    payload: JSON.stringify(seed),
    updatedAt: 1234,
  });
  const b = client(hub, seed);
  a.login();
  b.login();
  await pump(hub, [a, b]);
  // First plans from legacy data merge across two independently signed-in devices.
  const recordingBeforePlans = JSON.stringify(a.data().sunsetDays);
  a.save(`state.prayerActionPlans={0:[{id:${JSON.stringify(action)},slots:6}]};`);
  b.save(`state.prayerActionPlans={2:[{id:${JSON.stringify(action)},slots:4}]};`);
  a.runTimers();b.runTimers();
  await pump(hub,[a,b]);
  for (const c of [a,b]) {
    assert.equal(c.data().prayerActionPlans[0][0].slots,6);
    assert.equal(c.data().prayerActionPlans[2][0].slots,4);
    assert.equal(JSON.stringify(c.data().sunsetDays),recordingBeforePlans);
  }
  a.save(`state.prayerActionPlans[0].push({id:${JSON.stringify(other)},slots:2});`);
  b.save('state.prayerActionPlans[0][0].slots=8;');
  a.runTimers();b.runTimers();await pump(hub,[a,b]);
  for(const c of [a,b]) {
    assert.equal(c.data().prayerActionPlans[0].length,2);
    assert.equal(c.data().prayerActionPlans[0][0].slots,8);
  }
  a.save('state.prayerActionPlans[0].reverse();');
  b.save('state.prayerActionPlans[0][0].slots=9;');
  a.runTimers();b.runTimers();await pump(hub,[a,b]);
  assert.equal(b.data().prayerActionPlans[0][0].id,other);
  assert.equal(a.data().prayerActionPlans[0][1].slots,9);
  a.save('state.prayerActionPlans[0].splice(0,1);');
  await pump(hub,[a,b]);
  assert.equal(b.data().prayerActionPlans[0].length,1);
  console.log('PASS: prayer plans first-add, count/add, reorder/edit and deletion synchronize without touching recordings');
  const initial = hub.writes;
  a.save(
    `taskDay(date).slots[1]=${JSON.stringify(action)};taskDay(date).actualNotes={1:'desktop'};`,
  );
  b.save(
    `taskDay(date).slots[2]=${JSON.stringify(other)};taskDay(date).actualNotes={2:'phone'};`,
  );
  a.runTimers();
  b.runTimers();
  assert.equal(hub.pending.length, 2, 'both devices have in-flight writes');
  await pump(hub, [a, b]);
  for (const c of [a, b]) {
    assert.equal(c.data().sunsetDays[day].slots[1], action);
    assert.equal(c.data().sunsetDays[day].slots[2], other);
    assert.equal(c.data().sunsetDays[day].actualNotes[1], 'desktop');
    assert.equal(c.data().sunsetDays[day].actualNotes[2], 'phone');
    assert.match(
      c.w.document.querySelector('#syncStatus').textContent,
      /تمت المزامنة/,
    );
  }
  assert.ok(hub.writes - initial <= 2, 'no echo-write storm');
  const acknowledged = hub.writes;
  a.save('state.taskInbox=state.taskInbox');
  await pump(hub, [a, b]);
  assert.equal(hub.writes, acknowledged, 'no-op saves are not uploaded');
  // New edits while a write is in flight survive its acknowledgement.
  a.save("state.taskInbox[0].name='First edit'");
  a.runTimers();
  a.save('state.taskInbox[0].priority=1');
  await pump(hub, [a, b]);
  assert.equal(b.data().taskInbox[0].name, 'First edit');
  assert.equal(b.data().taskInbox[0].priority, 1);
  // Offline queues survive reload; reverse bases remain compact and merge on reconnect.
  b.connect(false);
  b.save(
    'taskDay(date).slots[3]=' +
      JSON.stringify(action) +
      ";taskDay(date).actualNotes[3]='offline phone'",
  );
  const cached = JSON.parse(b.storage()['waqti-account-same-account']);
  assert.ok(cached.basePatch.length);
  assert.ok(
    JSON.stringify(cached.basePatch).length <
      JSON.stringify(cached.state).length / 3,
  );
  a.save('taskDay(date).slots[4]=' + JSON.stringify(other));
  await pump(hub, [a, b]);
  const offlineStorage = b.storage();
  b.dom.window.close();
  hub.clients = hub.clients.filter((c) => c !== b);
  const reloaded = client(hub, seed, offlineStorage, false);
  reloaded.login();
  assert.equal(reloaded.data().sunsetDays[day].slots[3], action);
  reloaded.connect(true);
  await pump(hub, [a, reloaded]);
  assert.equal(a.data().sunsetDays[day].slots[3], action);
  assert.equal(reloaded.data().sunsetDays[day].slots[4], other);
  // A late value event merges automatically even before this device starts writing.
  reloaded.save('taskDay(date).slots[5]=' + JSON.stringify(action));
  hub.publish('same-account', (s) => {
    s.sunsetDays[day].slots[6] = other;
  });
  await pump(hub, [a, reloaded]);
  assert.equal(a.data().sunsetDays[day].slots[5], action);
  assert.equal(reloaded.data().sunsetDays[day].slots[6], other);
  // A real same-slot conflict asks only about that bundle, retaining other edits.
  reloaded.connect(false);
  a.connect(false);
  a.save(
    'taskDay(date).slots[7]=' +
      JSON.stringify(action) +
      ";taskDay(date).actualNotes[7]='desktop conflict';taskDay(date).slots[8]=" +
      JSON.stringify(action),
  );
  reloaded.save(
    'taskDay(date).slots[7]=' +
      JSON.stringify(other) +
      ";taskDay(date).actualNotes[7]='phone conflict';taskDay(date).slots[9]=" +
      JSON.stringify(other),
  );
  a.connect(true);
  await pump(hub, [a, reloaded]);
  reloaded.connect(true);
  await pump(hub, [a, reloaded]);
  reloaded.account();
  const choice = reloaded.w.document.querySelector(
    '[data-sync-choice="remote"]',
  );
  assert.ok(choice, 'field choice UI replaces whole-snapshot conflict');
  assert.equal(
    reloaded.w.document.querySelectorAll('.sync-conflicts section').length,
    1,
  );
  choice.click();
  await pump(hub, [a, reloaded]);
  assert.equal(a.data().sunsetDays[day].slots[7], action);
  assert.equal(a.data().sunsetDays[day].actualNotes[7], 'desktop conflict');
  assert.equal(a.data().sunsetDays[day].slots[8], action);
  assert.equal(a.data().sunsetDays[day].slots[9], other);
  // Unsaved task editors stay open; incoming changes integrate after save/cancel.
  a.w.run(
    "view='projects';selectedProject='p';render();openPlannerEditor(findTask('inbox',''));",
  );
  a.w.document.querySelector('#plannerForm [name=taskName]').value =
    'Kept draft';
  hub.publish('same-account', (s) => {
    s.sunsetDays[day].slots[10] = other;
  });
  assert.equal(a.w.document.querySelector('#plannerEditor').open, true);
  assert.equal(
    a.w.document.querySelector('#plannerForm [name=taskName]').value,
    'Kept draft',
  );
  a.w.document
    .querySelector('#plannerForm')
    .dispatchEvent(
      new a.w.Event('submit', { bubbles: true, cancelable: true }),
    );
  await pump(hub, [a, reloaded]);
  assert.equal(reloaded.data().taskInbox[0].name, 'Kept draft');
  assert.equal(a.data().sunsetDays[day].slots[10], other);
  // Receiving remote updates must not stop already saved inline edits from uploading.
  a.w.run("view='projects';selectedProject='p';render();");
  const inline = a.w.document.querySelector('#projectTaskList [data-progress]');
  inline.focus();
  hub.publish('same-account', (s) => {
    s.taskInbox[0].description = 'Remote while focused';
  });
  assert.equal(a.w.document.activeElement, inline);
  inline.value = '1';
  inline.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  await pump(hub, [a, reloaded]);
  assert.equal(reloaded.data().taskInbox[0].completedSlotCount, 1);
  assert.equal(
    JSON.parse(hub.records.get('same-account').payload).taskInbox[0]
      .description,
    'Remote while focused',
  );
  assert.equal(
    a.w.document.activeElement,
    inline,
    'uploading does not redraw the focused input',
  );
  assert.equal(
    JSON.parse(a.storage()['waqti-account-same-account']).dirty,
    false,
    'remote-only updates waiting to render are not unsent local edits',
  );
  const settledReload = new a.w.Event('beforeunload', { cancelable: true });
  a.w.dispatchEvent(settledReload);
  assert.equal(
    settledReload.defaultPrevented,
    false,
    'acknowledged edits do not trigger a false reload warning',
  );
  inline.blur();
  await pump(hub, [a, reloaded]);
  assert.equal(a.data().taskInbox[0].description, 'Remote while focused');
  // Keep an unsaved editor open while saved changes and independent remote changes sync.
  a.w.run("openPlannerEditor(findTask('inbox',''))");
  const openEditor = a.w.document.querySelector('#plannerEditor');
  a.w.document.querySelector('#plannerForm [name=taskName]').value =
    'Still an unsaved draft';
  hub.publish('same-account', (s) => {
    s.taskInbox[0].description = 'Other device during editor';
  });
  a.save('taskDay(date).slots[11]=' + JSON.stringify(action));
  a.runTimers();
  assert.ok(
    hub.pending.length,
    'saved edits upload even with a deferred incoming snapshot',
  );
  // Another save made in flight needs its own acknowledgement, not a false clean state.
  a.save('taskDay(date).slots[12]=' + JSON.stringify(other));
  const pendingReload = new a.w.Event('beforeunload', { cancelable: true });
  a.w.dispatchEvent(pendingReload);
  assert.equal(pendingReload.defaultPrevented, true);
  await pump(hub, [a, reloaded]);
  assert.equal(openEditor.open, true);
  assert.equal(
    a.w.document.querySelector('#plannerForm [name=taskName]').value,
    'Still an unsaved draft',
  );
  assert.equal(reloaded.data().sunsetDays[day].slots[11], action);
  assert.equal(reloaded.data().sunsetDays[day].slots[12], other);
  assert.equal(
    reloaded.data().taskInbox[0].description,
    'Other device during editor',
  );
  assert.equal(
    JSON.parse(a.storage()['waqti-account-same-account']).dirty,
    false,
  );
  // Reloading while remote rendering is deferred restores the acknowledged base safely.
  const deferredReload = client(hub, seed, a.storage());
  deferredReload.login();
  await pump(hub, [a, reloaded, deferredReload]);
  assert.equal(
    deferredReload.data().taskInbox[0].description,
    'Other device during editor',
  );
  assert.equal(deferredReload.data().sunsetDays[day].slots[12], other);
  deferredReload.dom.window.close();
  hub.clients = hub.clients.filter((c) => c !== deferredReload);
  openEditor.close();
  await pump(hub, [a, reloaded]);
  assert.equal(a.data().taskInbox[0].description, 'Other device during editor');
  // An open editor must still never permit overwriting a genuine concurrent conflict.
  a.w.run("openPlannerEditor(findTask('inbox',''))");
  hub.publish('same-account', (s) => {
    s.taskInbox[0].priority = 2;
  });
  a.save('state.taskInbox[0].priority=5');
  await pump(hub, [a, reloaded]);
  assert.equal(
    JSON.parse(hub.records.get('same-account').payload).taskInbox[0].priority,
    2,
  );
  assert.equal(
    JSON.parse(a.storage()['waqti-account-same-account']).dirty,
    true,
  );
  a.w.document.querySelector('#plannerEditor').close();
  await pump(hub, [a, reloaded]);
  a.account();
  assert.ok(a.w.document.querySelector('[data-sync-choice="local"]'));
  a.w.document.querySelector('[data-sync-choice="local"]').click();
  await pump(hub, [a, reloaded]);
  assert.equal(reloaded.data().taskInbox[0].priority, 5);
  // Transient errors retry without deleting a local/remote snapshot.
  hub.failNext = true;
  a.save('state.taskInbox[0].expectedSlots=4');
  await pump(hub, [a, reloaded]);
  assert.equal(reloaded.data().taskInbox[0].expectedSlots, 4);
  // Firebase may start a transaction with a cold-cache null; recover via a read.
  a.emptyCache = true;
  a.save("state.taskInbox[0].description='Cold cache'");
  await pump(hub, [a, reloaded]);
  assert.equal(reloaded.data().taskInbox[0].description, 'Cold cache');
  // Foreground refresh recovers a missed listener notification.
  const ref = reloaded.refs.get('waqti/users/same-account'),
    listener = ref.cb;
  ref.cb = null;
  hub.publish('same-account', (s) => {
    s.taskInbox[0].priority = 4;
  });
  ref.cb = listener;
  reloaded.w.dispatchEvent(new reloaded.w.Event('focus'));
  await microtasks();
  await pump(hub, [a, reloaded]);
  assert.equal(reloaded.data().taskInbox[0].priority, 4);
  // Account epoch/ref guards prevent an old write from replacing another account.
  a.save("state.taskInbox[0].name='Old account pending'");
  a.runTimers();
  assert.ok(hub.pending.length);
  const otherAccount = clone(seed);
  otherAccount.taskInbox[0].name = 'Other account';
  hub.records.set('other', {
    revision: 1,
    payload: JSON.stringify(otherAccount),
    updatedAt: 1234,
  });
  a.login('other');
  await pump(hub, [a, reloaded]);
  assert.equal(a.data().taskInbox[0].name, 'Other account');
  assert.equal(
    JSON.parse(hub.records.get('other').payload).taskInbox[0].name,
    'Other account',
  );
  // A dirty legacy cache with no base is kept; unknown differences need choices.
  const legacy = clone(seed);
  legacy.taskInbox[0].name = 'Legacy offline edit';
  const legacyClient = client(hub, seed, {
    'waqti-account-same-account': JSON.stringify({
      state: legacy,
      baseRevision: 1,
      dirty: true,
    }),
  });
  legacyClient.login();
  await pump(hub, [a, reloaded, legacyClient]);
  assert.equal(legacyClient.data().taskInbox[0].name, 'Legacy offline edit');
  legacyClient.account();
  assert.ok(legacyClient.w.document.querySelector('[data-sync-choice]'));
  // An unreadable reverse base must not discard a valid queued local snapshot.
  const broken = client(
    hub,
    seed,
    {
      'waqti-account-same-account': JSON.stringify({
        state: legacy,
        baseRevision: 1,
        dirty: true,
        basePatch: [{ path: ['missing', 'field'], value: 1 }],
      }),
    },
    false,
  );
  broken.login();
  assert.equal(broken.data().taskInbox[0].name, 'Legacy offline edit');
  // If extra base metadata reaches the quota, save the current edits without it.
  const storageSet = broken.w.Storage.prototype.setItem;
  broken.w.Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('waqti-account-') && JSON.parse(value).basePatch)
      throw Error('quota');
    return storageSet.call(this, key, value);
  };
  // Recover a known base first, then make one offline change with the quota mock.
  broken.login('other');
  broken.connect(true);
  await pump(hub, [a, reloaded, legacyClient, broken]);
  broken.connect(false);
  broken.save("state.taskInbox[0].name='Quota-safe edit'");
  assert.equal(
    JSON.parse(broken.storage()['waqti-account-other']).state.taskInbox[0].name,
    'Quota-safe edit',
  );
  assert.equal(
    JSON.parse(broken.storage()['waqti-account-other']).basePatch,
    undefined,
  );
  // Transfer events travel through the actual account queue and Firebase CAS path,
  // including a refresh before any upload and conflicting offline destinations.
  {
    const transfers = new Hub(),
      transferSeed = clone(seed);
    transferSeed.sunsetDays[day].tasks.push({
      id: 'transfer-sync',
      name: 'نقل بين جهازين',
      prayer: 0,
      expectedSlots: 6,
      projectId: 'p',
    });
    transferSeed.sunsetDays[day].taskProgress = { 'transfer-sync': 2 };
    transfers.records.set('transfer-account', {
      revision: 1,
      payload: JSON.stringify(transferSeed),
      updatedAt: 1234,
    });
    const desktop = client(transfers, transferSeed),
      phone = client(transfers, transferSeed);
    desktop.login('transfer-account');
    phone.login('transfer-account');
    await pump(transfers, [desktop, phone]);
    desktop.save(
      "transferTask(findTask('transfer-sync',date),addDate(date,1),[2])",
    );
    const queued = desktop.storage();
    desktop.connect(false);
    const refreshed = client(transfers, transferSeed, queued, false);
    refreshed.login('transfer-account');
    assert.equal(
      refreshed.w.run(
        "completedSlots(findTask('transfer-sync',addDate(date,1)))",
      ),
      2,
    );
    refreshed.connect(true);
    await pump(transfers, [phone, refreshed]);
    assert.equal(
      phone.w.run("outcome(findTask('transfer-sync',date))"),
      'failed',
    );
    assert.equal(
      phone.w.run("findTask('transfer-sync',addDate(date,1)).prayer"),
      2,
    );
    phone.connect(false);
    refreshed.connect(false);
    phone.save(
      "transferTask(findTask('transfer-sync',addDate(date,1)),addDate(date,2),[1])",
    );
    refreshed.save(
      "transferTask(findTask('transfer-sync',addDate(date,1)),addDate(date,3),[4])",
    );
    phone.connect(true);
    refreshed.connect(true);
    await pump(transfers, [phone, refreshed]);
    const conflicted = [phone, refreshed].filter((c) => {
      c.account();
      return c.w.document.querySelector('[data-sync-choice]');
    });
    assert.ok(conflicted.length > 0, 'competing destinations require a choice');
    assert.match(
      conflicted[0].w.document.querySelector('[data-sync-choice="remote"]')
        .textContent,
      /\d{4}-\d{2}-\d{2}.*خانة/,
    );
    for (const c of conflicted) {
      for (let count = 0; count < 10; count++) {
        const choice = c.w.document.querySelector(
          '[data-sync-choice="remote"]',
        );
        if (!choice) break;
        choice.click();
        await pump(transfers, [phone, refreshed]);
      }
    }
    for (const c of [phone, refreshed]) {
      const record = c
        .data()
        .sunsetDays[day].tasks.find((t) => t.id === 'transfer-sync');
      assert.equal(
        Object.keys(record.executionEvents).length,
        3,
        'both competing transfers survive in history',
      );
      assert.equal(
        c.w.run("taskEntries().filter(t=>t.id==='transfer-sync').length"),
        1,
      );
      c.w.run('validate(state)');
      assert.deepEqual(c.errors, []);
    }
    assert.deepEqual(phone.data(), refreshed.data());
    for (const c of [desktop, phone, refreshed]) c.dom.window.close();
    console.log(
      'PASS: task transfer account queue, pre-upload reload, two-device delivery and explicit offline destination conflict without lost history',
    );
  }
  broken.dom.window.close();
  for (const c of [a, reloaded, legacyClient]) {
    assert.deepEqual(c.errors, []);
    c.dom.window.close();
  }
  console.log(
    'PASS: two-device CAS merges, simultaneous/offline/reloaded/in-flight edits, granular slot conflicts, editor preservation, retry/cold cache/foreground refresh, account guards and legacy queue safety',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
