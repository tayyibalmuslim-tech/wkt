const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://test.local',runScripts:'outside-only'});
const w=dom.window;
w.structuredClone=structuredClone;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false};
w.confirm=()=>true;
w.eval(['vendor/adhan.js','calendar.js','categories.js','slots.js','task-engine.js','dashboard.js','projects.js','tafsir-default.js','app.js'].map(f=>fs.readFileSync(root+f,'utf8')).join('\n')+'\nwindow.run=code=>eval(code);');
const run=w.run;
assert.equal(run('state.slotMinutes'),10);
assert.equal(run('prayerOrder.flatMap(range).length'),144);
assert.equal(run('new Set(prayerOrder.flatMap(range).map(n=>n%144)).size'),144);
assert.equal(run('time(0)'),'12:00 ص');
assert.equal(run('time(1)'),'12:10 ص');
assert.equal(run('time(143)'),'11:50 م');
assert.equal(run('time(144)'),'12:00 ص');
assert.match(w.document.querySelector('.day-summary').textContent,/144/);
run('openPicker(starts()[3],"actual",true)');
assert.equal(w.document.querySelector('#slotFrom').options.length,144);
run('document.querySelector("#slotTo").value=starts()[3]+12;document.querySelector("#slotTo").onchange()');
assert.match(w.document.querySelector('#slotCount').textContent,/12 خانة · 120 دقيقة/);
run('const midnight={slots:{}};SlotTools.apply(midnight,143,145,"actual","work","note",100);window.midnight=midnight');
assert.equal(w.midnight.slots[143],'work');assert.equal(w.midnight.slots[0],'work');
assert.throws(()=>run('SlotTools.validate(100,245,100)'));
// Migration preserves coherent action/note/task bundles and schedule ownership.
run(`window.old={days:{},repeat:[{id:'r',startSlot:120}],taskInbox:[{id:'in',expectedSlots:4,completedSlotCount:2}],sunsetDays:{'2026-10-15':{
 slots:{0:'a',1:'b',95:'last'},actualNotes:{0:'alpha',1:'beta'},actualTasks:{1:{id:'task',name:'Task',actionId:'b'}},
 planned:{1:'p'},plannedNotes:{1:'plan'},taskSlotOwners:{1:'owner'},taskSlotValues:{1:'p'},taskSlotNotes:{1:'plan'},
 tasks:[{id:'owner',startSlot:1}],repeatSnapshot:[{id:'r',startSlot:120}],taskProgress:{owner:2},done:{owner:true},checks:{'0-0':true}
 }}};SlotTools.migrate(window.old)`);
const old=w.old,d=old.sunsetDays['2026-10-15'];
assert.equal(old.slotMinutes,10);
assert.equal(d.slots[0],'a');assert.equal(d.slots[1],'a');assert.equal(d.slots[2],'b');assert.equal(d.slots[143],'last');
assert.equal(d.actualNotes[2],'beta');assert.equal(d.actualTasks[2].actionId,d.slots[2]);
assert.equal(d.planned[1],'p');assert.equal(d.planned[2],'p');assert.equal(d.taskSlotOwners[2],'owner');assert.equal(d.taskSlotValues[2],d.planned[2]);
assert.equal(d.legacyQuarterHour.slots[1],'b');assert.equal(d.legacyQuarterHour.actualTasks[1].id,'task');
assert.equal(d.tasks[0].startSlot,1);assert.equal(d.repeatSnapshot[0].startSlot,180);assert.equal(old.repeat[0].startSlot,180);
assert.equal(d.taskProgress.owner,2);assert.equal(old.taskInbox[0].expectedSlots,4);assert.equal(old.taskInbox[0].completedSlotCount,2);
assert.equal(d.done.owner,true);assert.equal(d.checks['0-0'],true);
const migrated=JSON.stringify(old);assert.equal(run('SlotTools.migrate(window.old)'),false);assert.equal(JSON.stringify(old),migrated);
run('window.roundtrip=JSON.parse(JSON.stringify(window.old));SlotTools.migrate(window.roundtrip)');assert.equal(JSON.stringify(w.roundtrip),migrated);
assert.throws(()=>run('SlotTools.migrate({slotMinutes:20})'));
// Every full legacy day becomes exactly 144 entries, including the final minute.
run('window.full={days:{},sunsetDays:{x:{slots:Object.fromEntries(Array.from({length:96},(_,i)=>[i,"a"+i]))}}};SlotTools.migrate(window.full)');
assert.equal(Object.keys(w.full.sunsetDays.x.slots).length,144);
assert.equal(new Set(Object.values(w.full.sunsetDays.x.slots)).size,96);
// Account snapshots must migrate on receipt and queue the new marker for sync.
run("window.cloudOld=structuredClone(state);delete window.cloudOld.slotMinutes;window.cloudOld.sunsetDays={[date]:{slots:{95:state.actions[0].id},actualNotes:{95:'cloud note'},checks:{},tasks:[],done:{}}}");
let authListener;
const refs=new Map();
const db={ref(path){if(!refs.has(path))refs.set(path,{on(event,cb){this.cb=cb},off(){}});return refs.get(path)}};
w.firebase={initializeApp(){},auth(){return {onAuthStateChanged(cb){authListener=cb}}},database(){return db}};
run(fs.readFileSync(root+'sync-merge.js','utf8')+'\n'+fs.readFileSync(root+'sync.js','utf8'));
authListener({uid:'slot-migration-test',email:'test@example.com'});
refs.get('waqti/users/slot-migration-test').cb({val:()=>({revision:1,payload:JSON.stringify(w.cloudOld)})});
assert.equal(run('state.slotMinutes'),10);
assert.equal(run('state.sunsetDays[date].slots[143]'),run('state.actions[0].id'));
assert.equal(run('state.sunsetDays[date].actualNotes[143]'),'cloud note');
const cached=JSON.parse(w.localStorage.getItem('waqti-account-slot-migration-test'));
assert.equal(cached.dirty,true);assert.equal(cached.state.slotMinutes,10);
run('validate(state)');
w.close();console.log('Ten-minute slot, migration and cloud snapshot tests passed');
