const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://test.local',runScripts:'outside-only'});
const w=dom.window;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
const errors=[];w.addEventListener('error',e=>errors.push(e.error));
w.eval(['vendor/adhan.js','calendar.js','categories.js','slots.js','task-engine.js','dashboard.js','projects.js','app.js'].map(f=>fs.readFileSync(root+f,'utf8')).join('\n')+'\nwindow.test={run:code=>eval(code)};');
const run=w.test.run,$=s=>w.document.querySelector(s),click=s=>$(s).click(),submit=s=>$(s).dispatchEvent(new w.Event('submit',{cancelable:true}));
run("view='dashboard';render()");assert.equal(w.document.querySelectorAll('.planner-period').length,5);
click('#quickTaskButton');$('#quickTaskForm').elements.taskName.value='مهمة سريعة';submit('#quickTaskForm');assert.equal(run('state.taskInbox.length'),1);
click('[data-planner-tab="inbox"]');
assert.equal($('#plannerResults [data-outcome="done"]').disabled,false);
click('#plannerResults [data-outcome="done"]');assert.equal(run("state.taskInbox[0].inboxOutcome"),'done');
assert.equal($('#plannerResults [data-outcome="done"]').getAttribute('aria-pressed'),'true');
click('#plannerResults [data-outcome="done"]');assert.equal(run("outcome(state.taskInbox[0])"),'pending');
click('#plannerResults [data-outcome="failed"]');assert.equal(run("outcome(state.taskInbox[0])"),'failed');
run("plannerStatus='done';render()");assert.equal($('#plannerResults [data-task-id]'),null);
run("plannerStatus='failed';render()");assert.ok($('#plannerResults [data-task-id]'));
run("plannerStatus='all';render()");
click('[data-task-edit]');let f=$('#plannerForm').elements;f.taskDate.value=run('date');$('#plannerForm').querySelectorAll('[name=taskPeriods]').forEach(b=>b.checked=b.value==='0');f.taskDate.dispatchEvent(new w.Event('change'));f.priority.value='1';f.expectedSlots.value='2';f.actionId.value=run('state.actions[0].id');f.startSlot.value=run('String(periodSlots(date,0)[0])');submit('#plannerForm');assert.equal(run('state.taskInbox.length'),0);assert.equal(run('outcome(allTasksOn(date)[0])'),'failed');assert.equal(run('allTasksOn(date)[0].expectedSlots'),2);assert.equal(run('Object.keys(day().planned).length'),2);
click('[data-planner-tab="day"]');assert.equal(w.document.querySelectorAll('[data-task-id]').length,1);let progress=$('[data-progress]');progress.value='1';progress.dispatchEvent(new w.Event('change'));assert.equal(run('completedSlots(allTasksOn(date)[0])'),1);click('[data-outcome="done"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'done');click('[data-outcome="failed"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'failed');click('[data-outcome="failed"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'pending');
click('[data-task-child]');f=$('#plannerForm').elements;f.taskName.value='فرعية غدًا';f.taskDate.value=run('addDate(date,1)');$('#plannerForm').querySelectorAll('[name=taskPeriods]').forEach(b=>b.checked=b.value==='4');f.expectedSlots.value='3';submit('#plannerForm');assert.equal(run("allTasksOn(addDate(date,1))[0].parentId"),run('allTasksOn(date)[0].id'));
click('[data-planner-tab="future"]');assert.match($('#plannerResults').textContent,/فرعية غدًا/);assert.equal(w.document.querySelectorAll('[data-task-id]').length,1);
run("state.repeat.push({id:'r',name:'متكررة أصلية',prayer:0,days:[0,1,2,3,4,5,6],priority:'low',expectedSlots:1,startDate:date});state.taskHistoryThrough=addDate(date,-2);state.taskHistoryStart=addDate(date,-1);state.repeat[0].startDate=addDate(date,-1);initializeTaskHistory();render()");
assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='r').name"),'متكررة أصلية');
run("view='repeat';renderRepeat(state.repeat[0])");f=$('#repeatForm').elements;f.name.value='متكررة جديدة';f.priority.value='1';f.expectedSlots.value='4';submit('#repeatForm');assert.equal(run('state.repeat[0].expectedSlots'),4);assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='r').name"),'متكررة أصلية');
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
// Optional/multiple periods: one occurrence, shared outcome/progress and valid export.
run("view='day';prayer=0;openPlannerEditor()");
f=$('#plannerForm').elements;f.taskName.value='عدة فترات';f.expectedSlots.value='2';
click('#plannerForm [data-no-period]');
click('#plannerForm [name=taskPeriods][value="0"]');click('#plannerForm [name=taskPeriods][value="4"]');submit('#plannerForm');
const multiId=run("allTasksOn(date).find(t=>t.name==='عدة فترات').id");
assert.equal(run('taskPeriods(findTask('+JSON.stringify(multiId)+',date)).length'),2);
assert.equal($('#allDayTaskCards').querySelectorAll('[data-task-id="'+multiId+'"]').length,1);
click('#dailyTaskCards [data-task-id="'+multiId+'"] [data-outcome="done"]');
run('prayer=4;render()');assert.equal($('#dailyTaskCards [data-task-id="'+multiId+'"] [data-outcome="done"]').getAttribute('aria-pressed'),'true');
let multiProgress=$('#dailyTaskCards [data-task-id="'+multiId+'"] [data-progress]');multiProgress.value='2';multiProgress.dispatchEvent(new w.Event('change'));
assert.equal($('#allDayTaskCards [data-task-id="'+multiId+'"] [data-progress]').value,'2');
click('#allDayTaskCards [data-task-id="'+multiId+'"] [data-task-edit]');
assert.equal($('#plannerForm').querySelectorAll('[name=taskPeriods]:checked').length,2);
click('#plannerForm [data-no-period]');assert.equal($('#plannerForm').elements.startSlot.disabled,true);submit('#plannerForm');
assert.equal($('#dailyTaskCards [data-task-id="'+multiId+'"]'),null);assert.ok($('#allDayTaskCards [data-task-id="'+multiId+'"]'));
run("view='dashboard';plannerTab='day';render()");assert.match($('#plannerResults').lastElementChild.textContent,/بدون فترة محددة/);
run("plannerTab='week';render()");assert.ok($('[data-week-task="'+multiId+'"]'));
run('validate(state)');
assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'invalid-periods',name:'bad',prayers:[0,0]}]})"));
assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'invalid-periods',name:'bad',prayers:[5]}]})"));
// Recurring tasks also support no period and multiple periods.
run("view='repeat';render()");f=$('#repeatForm').elements;f.name.value='تكرار بدون فترة';click('#repeatForm [data-no-period]');submit('#repeatForm');
assert.equal(run('taskPeriods(state.repeat.at(-1)).length'),0);run('validate(state)');
run('renderRepeat(state.repeat.at(-1))');click('#repeatForm [name=taskPeriods][value="1"]');click('#repeatForm [name=taskPeriods][value="2"]');submit('#repeatForm');
assert.equal(run('taskPeriods(state.repeat.at(-1)).length'),2);run('validate(state)');
// Scheduling can use either chosen period, but cannot spill beyond one period.
run("savePlannedTask(null,{id:'multi-scheduled',name:'حجز متعدد',date,prayers:[0,4],prayer:0,expectedSlots:1,actionId:state.actions[0].id,startSlot:periodSlots(date,4)[0]})");
assert.equal(run("day().taskSlotOwners[periodSlots(date,4)[0]%96]"),'multi-scheduled');
assert.throws(()=>run("scheduleTask({id:'no-period',date,prayers:[],expectedSlots:1,actionId:state.actions[0].id},periodSlots(date,0)[0])"));

// Numeric priorities migrate every storage location, including history, and sort/filter.
run("state.taskInbox=[{id:'legacy-h',name:'قديم',priority:'high'},{id:'legacy-m',name:'متوسط',priority:'medium'},{id:'legacy-l',name:'منخفض',priority:'low'}];state.repeat[0].priority='low';day().repeatSnapshot=[{id:'history',name:'سجل',prayer:0,priority:'high'}];render()");
assert.equal(run('state.taskInbox.map(t=>t.priority).join()'),'1,3,5');
assert.equal(run('state.repeat[0].priority'),5);assert.equal(run('day().repeatSnapshot[0].priority'),1);
assert.equal(run("sortedTasks([5,2,4,1,3].map(priority=>({priority,name:'a'}))).map(t=>t.priority).join()"),'1,2,3,4,5');
run("plannerPriority='2'");assert.equal(run("filteredTasks([1,2,3,4,5].map(priority=>({priority,name:'a'}))).length"),1);run("plannerPriority='all';plannerStatus='all'");
for(const priority of [0,6,1.5,'2'])assert.throws(()=>run('validatePlanning({...state,taskInbox:[{id:"bad",name:"bad",priority:'+JSON.stringify(priority)+'}]})'));
run("view='day';prayer=3;state.taskInbox=[];day().tasks=[{id:'actual-task',name:'مهمة <اختبار>',prayers:[3,4],priority:2,actionId:state.actions[0].id},{id:'no-action',name:'بلا فعل',prayer:3},{id:'other-period',name:'فترة أخرى',prayer:0,actionId:state.actions[0].id}];render()");
const actualSlot=run('range(3)[0]'),actualIndex=actualSlot%96;
const plannedBefore=run('JSON.stringify(day().planned)'),progressBefore=run('JSON.stringify(day().taskProgress)'),doneBefore=run('JSON.stringify(day().done)');
click('.slot-actual[data-slot="'+actualSlot+'"]');
assert.equal($('#slotTasks').hidden,false);
assert.ok($('#slotTasks').compareDocumentPosition($('.slot-action-groups'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
assert.equal($('[data-task-choice="other-period"]'),null);assert.equal($('[data-task-choice="no-action"]').disabled,true);
assert.equal($('[data-task-choice="actual-task"] strong').textContent,'مهمة <اختبار>');
click('[data-task-choice="actual-task"]');assert.equal($('#picker').open,false);
assert.equal(run('day().slots['+actualIndex+']'),run('state.actions[0].id'));
assert.equal(run('day().actualTasks['+actualIndex+'].id'),'actual-task');
assert.equal($('.slot-actual[data-slot="'+actualSlot+'"] .slot-task-name').textContent,'مهمة <اختبار>');
assert.equal($('.slot-actual[data-slot="'+actualSlot+'"]').style.background,$('[data-task-choice="actual-task"]').style.background);
assert.equal(run('JSON.stringify(day().planned)'),plannedBefore);assert.equal(run('JSON.stringify(day().taskProgress)'),progressBefore);assert.equal(run('JSON.stringify(day().done)'),doneBefore);
// Notes keep the task snapshot; manual action replacement and clearing remove it.
click('.slot-actual[data-slot="'+actualSlot+'"]');$('#slotNote').value='ملاحظة المهمة';submit('#slotForm');
assert.equal(run('day().actualTasks['+actualIndex+'].id'),'actual-task');
click('.slot-planned[data-slot="'+actualSlot+'"]');assert.equal($('#slotTasks').hidden,true);click('#close');
// Bulk task registration covers the chosen range and survives export/import.
click('#bulkSlots');$('#slotTo').value=String(actualSlot+2);click('[data-task-choice="actual-task"]');submit('#slotForm');
assert.equal(run('day().actualTasks['+((actualSlot+1)%96)+'].id'),'actual-task');
const actualExport=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(actualExport)+');validate(state);render()');
assert.equal(run('JSON.stringify(state)'),actualExport);
// A bulk range crossing an unrelated prayer must leave the entire state untouched.
click('#bulkSlots');$('#slotTo').value=String(run('range(0)[0]+1'));click('[data-task-choice="actual-task"]');
const beforeInvalidRange=run('JSON.stringify(state)');submit('#slotForm');assert.equal($('#picker').open,true);assert.match($('#slotError').textContent,/المهمة/);assert.equal(run('JSON.stringify(state)'),beforeInvalidRange);click('#close');
// Multiple periods and recurring occurrences are available in their own slot periods.
run("prayer=4;render()");click('.slot-actual');assert.ok($('[data-task-choice="actual-task"]'));click('#close');
run("state.repeat.push({id:'actual-repeat',name:'متكررة فعلية',prayer:4,days:[0,1,2,3,4,5,6],actionId:state.actions[0].id});render()");click('.slot-actual');assert.ok($('[data-task-choice="actual-repeat"]'));click('#close');
// Historical task labels remain readable and notes editable after deletion.
run("prayer=3;day().tasks=day().tasks.filter(t=>t.id!=='actual-task');render()");
click('.slot-actual[data-slot="'+actualSlot+'"]');$('#slotNote').value='بعد حذف المهمة';submit('#slotForm');assert.equal($('#picker').open,false);assert.equal(run('day().actualTasks['+actualIndex+'].name'),'مهمة <اختبار>');
click('.slot-actual[data-slot="'+actualSlot+'"]');click('[data-action-choice]');assert.equal(run('day().actualTasks['+actualIndex+']'),undefined);
run("prayer=4;render()");click('.slot-actual');click('[data-task-choice="actual-repeat"]');click('.slot-actual');click('#clearSlot');assert.equal(run('day().actualTasks[range(4)[0]%96]'),undefined);assert.equal(run('day().slots[range(4)[0]%96]'),undefined);
assert.throws(()=>run("validatePlanning({...state,sunsetDays:{[date]:{...day(),actualTasks:{96:{id:'a',name:'a',actionId:'a'}}}}})"));
run('validate(state)');

// Project lifecycle, existing-task linking, recurrence, subtasks and backup compatibility.
run("view='projects';render()");click('#newProject');
f=$('#projectForm').elements;f.projectName.value='مشروع <تجريبي>';f.description.value='هدف المشروع';submit('#projectForm');
const projectId=run('state.projects[0].id');assert.equal($('#projectDetails h2').textContent,'مشروع <تجريبي>');
click('#newProjectTask');f=$('#plannerForm').elements;assert.equal(f.projectId.value,projectId);
f.taskName.value='مهمة مشروع';f.taskDate.value='';submit('#plannerForm');
assert.equal(run("state.taskInbox.find(t=>t.name==='مهمة مشروع').projectId"),projectId);
let projectCard=[...w.document.querySelectorAll('#projectDetails [data-task-id]')].find(c=>c.textContent.includes('مهمة مشروع'));
projectCard.querySelector('[data-outcome="done"]').click();assert.match($('#projectDetails').textContent,/1 مكتملة/);
projectCard=[...w.document.querySelectorAll('#projectDetails [data-task-id]')].find(c=>c.textContent.includes('مهمة مشروع'));
projectCard.querySelector('[data-task-child]').click();assert.equal($('#plannerForm').elements.projectId.value,projectId);click('#closePlanner');
run("state.taskInbox.push({id:'project-existing',name:'مهمة موجودة',prayers:[]});render()");
click('#linkProjectTask');let link=[...w.document.querySelectorAll('[data-link-task]')].find(b=>b.textContent.includes('مهمة موجودة'));link.click();
assert.equal($('#plannerForm').elements.projectId.value,projectId);submit('#plannerForm');assert.equal(run("state.taskInbox.find(t=>t.id==='project-existing').projectId"),projectId);
run("view='repeat';render()");f=$('#repeatForm').elements;f.name.value='تكرار مشروع';f.projectId.value=projectId;submit('#repeatForm');
assert.equal(run("state.repeat.find(t=>t.name==='تكرار مشروع').projectId"),projectId);
run("view='projects';render()");assert.match($('#projectDetails').textContent,/تكرار مشروع/);
click('#editProject');$('#projectForm').elements.projectName.value='اسم جديد';submit('#projectForm');assert.equal($('#projectDetails h2').textContent,'اسم جديد');
const projectBackup=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(projectBackup)+');validate(state);render()');assert.equal(run('state.projects[0].id'),projectId);
assert.throws(()=>run("validatePlanning({...state,projects:[{id:'x',name:'أ'},{id:'x',name:'ب'}]})"));
assert.throws(()=>run("validatePlanning({...state,projects:{}})"));assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'bad',name:'bad',projectId:3}]})"));
const beforeProjectDelete=run('taskEntries().length'),beforeProjectOutcome=run("outcome(state.taskInbox.find(t=>t.name==='مهمة مشروع'))");
click('#deleteProject');assert.equal(run('state.projects.length'),0);assert.equal(run('taskEntries().length'),beforeProjectDelete);assert.equal(run("outcome(state.taskInbox.find(t=>t.name==='مهمة مشروع'))"),beforeProjectOutcome);
assert.equal(run("state.repeat.find(t=>t.name==='تكرار مشروع').projectId"),undefined);assert.equal(run("taskEntries().some(t=>t.projectId==="+JSON.stringify(projectId)+")"),false);
run('delete state.projects;validate(state);render()');

assert.deepEqual(errors,[]);console.log('PASS: inbox, priority, estimates/progress, schedule, outcomes, children, future/backlog, recurrence history, month/week, conflict rollback, daily integration, owned-slot cleanup, validation');dom.window.close();
