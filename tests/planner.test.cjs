const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://test.local',runScripts:'outside-only'});
const w=dom.window;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
const errors=[];w.addEventListener('error',e=>errors.push(e.error));
w.eval(['vendor/adhan.js','calendar.js','categories.js','slots.js','task-engine.js','dashboard.js','app.js'].map(f=>fs.readFileSync(root+f,'utf8')).join('\n')+'\nwindow.test={run:code=>eval(code)};');
const run=w.test.run,$=s=>w.document.querySelector(s),click=s=>$(s).click(),submit=s=>$(s).dispatchEvent(new w.Event('submit',{cancelable:true}));
run("view='dashboard';render()");assert.equal(w.document.querySelectorAll('.planner-period').length,5);
click('#quickTaskButton');$('#quickTaskForm').elements.taskName.value='مهمة سريعة';submit('#quickTaskForm');assert.equal(run('state.taskInbox.length'),1);
click('[data-planner-tab="inbox"]');click('[data-task-edit]');let f=$('#plannerForm').elements;f.taskDate.value=run('date');f.taskPrayer.value='0';f.taskDate.dispatchEvent(new w.Event('change'));f.priority.value='high';f.expectedSlots.value='2';f.actionId.value=run('state.actions[0].id');f.startSlot.value=run('String(periodSlots(date,0)[0])');submit('#plannerForm');assert.equal(run('state.taskInbox.length'),0);assert.equal(run('allTasksOn(date)[0].expectedSlots'),2);assert.equal(run('Object.keys(day().planned).length'),2);
click('[data-planner-tab="day"]');assert.equal(w.document.querySelectorAll('[data-task-id]').length,1);let progress=$('[data-progress]');progress.value='1';progress.dispatchEvent(new w.Event('change'));assert.equal(run('completedSlots(allTasksOn(date)[0])'),1);click('[data-outcome="done"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'done');click('[data-outcome="failed"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'failed');click('[data-outcome="failed"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'pending');
click('[data-task-child]');f=$('#plannerForm').elements;f.taskName.value='فرعية غدًا';f.taskDate.value=run('addDate(date,1)');f.taskPrayer.value='4';f.expectedSlots.value='3';submit('#plannerForm');assert.equal(run("allTasksOn(addDate(date,1))[0].parentId"),run('allTasksOn(date)[0].id'));
click('[data-planner-tab="future"]');assert.match($('#plannerResults').textContent,/فرعية غدًا/);assert.equal(w.document.querySelectorAll('[data-task-id]').length,1);
run("state.repeat.push({id:'r',name:'متكررة أصلية',prayer:0,days:[0,1,2,3,4,5,6],priority:'low',expectedSlots:1,startDate:date});state.taskHistoryThrough=addDate(date,-2);state.taskHistoryStart=addDate(date,-1);state.repeat[0].startDate=addDate(date,-1);initializeTaskHistory();render()");
assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='r').name"),'متكررة أصلية');
run("view='repeat';renderRepeat(state.repeat[0])");f=$('#repeatForm').elements;f.name.value='متكررة جديدة';f.priority.value='high';f.expectedSlots.value='4';submit('#repeatForm');assert.equal(run('state.repeat[0].expectedSlots'),4);assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='r').name"),'متكررة أصلية');
click('[data-del="r"]');assert.equal(run('state.repeat.length'),0);assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='r').name"),'متكررة أصلية');
run("view='dashboard';plannerTab='missed';render()");assert.match($('#plannerResults').textContent,/متكررة أصلية/);click('[data-outcome="done"]');assert.doesNotMatch($('#plannerResults').textContent,/متكررة أصلية/);
click('[data-planner-tab="month"]');assert.equal(w.document.querySelectorAll('[data-calendar-day]').length,run("new Date(Number(plannerMonth.slice(0,4)),Number(plannerMonth.slice(5)),0).getDate()"));click('[data-calendar-day="'+run('date')+'"]');assert.equal(w.document.querySelectorAll('.planner-period').length,5);
click('[data-planner-tab="week"]');assert.equal(w.document.querySelectorAll('.week-day').length,7);click('[data-week-add]');assert.equal($('#plannerEditor').open,true);click('#closePlanner');
// Collision must roll back every mutation.
const snapshot=run('JSON.stringify(state)');assert.throws(()=>run("savePlannedTask(null,{id:'conflict',name:'تعارض',date,prayer:0,expectedSlots:2,actionId:state.actions[0].id,startSlot:periodSlots(date,0)[0]})"));assert.equal(run('JSON.stringify(state)'),snapshot);
// End of period must not spill into the next prayer.
assert.throws(()=>run("savePlannedTask(null,{id:'overflow',name:'تجاوز',date,prayer:0,expectedSlots:96,actionId:state.actions[0].id,startSlot:periodSlots(date,0)[0]})"));assert.equal(run('JSON.stringify(state)'),snapshot);
// Main view integrates cards, progress and capacity without altering slot controls.
run("view='day';prayer=0;render()");assert.equal($('#dailyTaskCards').querySelectorAll('input,select,textarea').length,1);assert.equal($('#dailyTaskCards [data-progress]').value,'1');$('#dailyTaskCards [data-progress]').value='2';$('#dailyTaskCards [data-progress]').dispatchEvent(new w.Event('change'));assert.equal(run('completedSlots(allTasksOn(date)[0])'),2);assert.equal($('#dailyTaskCards .daily-task').querySelectorAll('button').length,3);click('#dailyTaskCards [data-task-edit]');assert.equal($('#plannerForm').elements.completedSlots.value,'2');$('#plannerForm').elements.completedSlots.value='3';submit('#plannerForm');assert.equal(run('completedSlots(allTasksOn(date)[0])'),3);assert.equal($('#dailyTaskCards [data-progress]').value,'3');assert.ok($('[data-slot]'));assert.match($('.capacity-note').textContent,/مشغولة/);
// Delete removes task-owned planned slots; preserves later manual changes.
run("day().planned[periodSlots(date,0)[0]%96]='manual-edit'");click('#dailyTaskCards [data-task-edit]');click('#editorDeleteTask');assert.equal($('#plannerEditor').open,false);assert.equal(run('Object.keys(day().planned).length'),1);assert.equal(run('Object.values(day().planned)[0]'),'manual-edit');
run('validate(state)');
// Import/export preserves optional planning data and rejects malformed progress.
const exported=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(exported)+');validate(state);render()');
assert.equal(run('JSON.stringify(state)'),exported);
assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'bad',name:'bad',expectedSlots:-1}]})"));
// A manual slot edit relinquishes ownership so task cleanup cannot erase it.
run("const sd=taskDay(date);sd.taskSlotOwners={1:'manual'};sd.taskSlotValues={1:'old'};sd.taskSlotNotes={1:'old'};SlotTools.apply(sd,1,2,'planned','chosen','note',0);");
assert.equal(run('day().taskSlotOwners[1]'),undefined);assert.equal(run('day().planned[1]'),'chosen');
assert.deepEqual(errors,[]);console.log('PASS: inbox, priority, estimates/progress, schedule, outcomes, children, future/backlog, recurrence history, month/week, conflict rollback, daily integration, owned-slot cleanup, validation');dom.window.close();
