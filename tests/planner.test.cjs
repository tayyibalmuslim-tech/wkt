const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'https://test.local',runScripts:'outside-only'});
const w=dom.window;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
const errors=[];w.addEventListener('error',e=>errors.push(e.error));
w.eval(['vendor/adhan.js','calendar.js','categories.js','slots.js','task-engine.js','dashboard.js','projects.js','tafsir-default.js','app.js'].map(f=>fs.readFileSync(root+f,'utf8')).join('\n')+'\nwindow.test={run:code=>eval(code)};');
const run=w.test.run,$=s=>w.document.querySelector(s),click=s=>$(s).click(),submit=s=>$(s).dispatchEvent(new w.Event('submit',{cancelable:true}));
run("state.taskInbox=[];state.projects=[];view='dashboard';render()");assert.equal(w.document.querySelectorAll('.planner-period').length,5);
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
click('[data-task-edit]');let f=$('#plannerForm').elements;f.taskDate.value=run('date');$('#plannerForm').querySelectorAll('[name=taskPeriods]').forEach(b=>b.checked=b.value==='0');f.taskDate.dispatchEvent(new w.Event('change',{bubbles:true}));f.priority.value='1';f.expectedSlots.value='2';f.actionId.value=run('state.actions[0].id');f.startSlot.value=run('String(periodSlots(date,0)[0])');submit('#plannerForm');assert.equal(run('state.taskInbox.length'),0);assert.equal(run('outcome(allTasksOn(date)[0])'),'failed');assert.equal(run('allTasksOn(date)[0].expectedSlots'),2);assert.equal(run('Object.keys(day().planned).length'),2);
click('[data-planner-tab="day"]');assert.equal(w.document.querySelectorAll('#app [data-task-id]').length,1);let progress=$('[data-progress]');progress.value='1';progress.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(run('completedSlots(allTasksOn(date)[0])'),1);click('[data-outcome="done"]');assert.equal(run('outcome(allTasksOn(date)[0])'),'done');click('[data-outcome="failed"]');click('[data-failure-only]');assert.equal(run('outcome(allTasksOn(date)[0])'),'failed');click('[data-outcome="failed"]');click('[data-failure-only]');assert.equal(run('outcome(allTasksOn(date)[0])'),'pending');
click('[data-task-child]');f=$('#plannerForm').elements;f.taskName.value='فرعية غدًا';f.taskDate.value=run('addDate(date,1)');$('#plannerForm').querySelectorAll('[name=taskPeriods]').forEach(b=>b.checked=b.value==='4');f.expectedSlots.value='3';submit('#plannerForm');assert.equal(run("allTasksOn(addDate(date,1))[0].parentId"),run('allTasksOn(date)[0].id'));
click('[data-planner-tab="future"]');assert.equal($('#plannerResults .task-children [data-task-id]'),null);click('#plannerResults [data-task-toggle]');assert.match($('#plannerResults').textContent,/فرعية غدًا/);assert.equal(w.document.querySelectorAll('#plannerResults > [data-task-id]').length,1);assert.ok($('#plannerResults .task-children [data-task-id]'));
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
run("view='day';prayer=0;render()");assert.equal($('#dailyTaskCards').querySelectorAll('input,select,textarea').length,1);assert.equal($('#dailyTaskCards [data-progress]').value,'1');$('#dailyTaskCards [data-progress]').value='2';$('#dailyTaskCards [data-progress]').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(run('completedSlots(allTasksOn(date)[0])'),2);assert.equal($('#dailyTaskCards .task-row-primary').querySelectorAll('button').length,3);click('#dailyTaskCards [data-task-edit]');assert.equal($('#plannerForm').elements.completedSlots.value,'2');$('#plannerForm').elements.completedSlots.value='3';submit('#plannerForm');assert.equal(run('completedSlots(allTasksOn(date)[0])'),3);assert.equal($('#dailyTaskCards [data-progress]').value,'3');assert.ok($('[data-slot]'));assert.match($('.capacity-note').textContent,/مشغولة/);
// Delete removes task-owned planned slots; preserves later manual changes.
run("day().planned[periodSlots(date,0)[0]%144]='manual-edit'");click('#dailyTaskCards [data-task-edit]');click('#editorDeleteTask');assert.equal($('#plannerEditor').open,false);assert.equal(run('Object.keys(day().planned).length'),1);assert.equal(run('Object.values(day().planned)[0]'),'manual-edit');
run('validate(state)');
// Import/export preserves optional planning data and rejects malformed progress.
const exported=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(exported)+');validate(state);render()');
assert.equal(run('JSON.stringify(state)'),exported);
 // Download works from every tab and produces a restorable, full current-state JSON snapshot.
 assert.ok($('#downloadBackup'));
 const oldBlob=w.Blob,oldAnchorClick=w.HTMLAnchorElement.prototype.click;
 let backupCapture=null,downloadName='';
 w.Blob=class {constructor(parts,options){backupCapture={parts,options}}};
 w.URL.createObjectURL=()=> 'blob:test-waqti-backup';
 w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){downloadName=this.download};
 click('#downloadBackup');
 assert.equal(JSON.stringify(JSON.parse(backupCapture.parts.join(''))),exported);
 assert.equal(backupCapture.options.type,'application/json;charset=utf-8');
 assert.match(downloadName,/^waqti-backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
 assert.equal($('a[download]'),null);
 const prevView=run('view');
 run("view='settings';render()");
 click('#export');
 assert.equal(JSON.stringify(JSON.parse(backupCapture.parts.join(''))),exported);
 run('view='+JSON.stringify(prevView)+';render()');
 w.Blob=oldBlob;w.HTMLAnchorElement.prototype.click=oldAnchorClick;

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
let multiProgress=$('#dailyTaskCards [data-task-id="'+multiId+'"] [data-progress]');multiProgress.value='2';multiProgress.dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal($('#allDayTaskCards [data-task-id="'+multiId+'"] [data-progress]').value,'2');
click('#allDayTaskCards [data-task-id="'+multiId+'"] [data-task-edit]');
assert.equal($('#plannerForm').querySelectorAll('[name=taskPeriods]:checked').length,2);
click('#plannerForm [data-no-period]');assert.equal($('#plannerForm').elements.startSlot.disabled,true);submit('#plannerForm');
assert.equal($('#dailyTaskCards [data-task-id="'+multiId+'"]'),null);assert.ok($('#allDayTaskCards [data-task-id="'+multiId+'"]'));
run("view='dashboard';plannerTab='day';render()");assert.match($('#plannerResults').lastElementChild.textContent,/بدون فترة محددة/);
run("plannerTab='week';render()");assert.ok($('.week-period [data-task-id="'+multiId+'"]'));
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
assert.equal(run("day().taskSlotOwners[periodSlots(date,4)[0]%144]"),'multi-scheduled');
assert.throws(()=>run("scheduleTask({id:'no-period',date,prayers:[],expectedSlots:1,actionId:state.actions[0].id},periodSlots(date,0)[0])"));

// Numeric priorities migrate every storage location, including history, and sort/filter.
run("state.taskInbox=[{id:'legacy-h',name:'قديم',priority:'high'},{id:'legacy-m',name:'متوسط',priority:'medium'},{id:'legacy-l',name:'منخفض',priority:'low'}];state.repeat[0].priority='low';day().repeatSnapshot=[{id:'history',name:'سجل',prayer:0,priority:'high'}];render()");
assert.equal(run('state.taskInbox.map(t=>t.priority).join()'),'1,3,5');
assert.equal(run('state.repeat[0].priority'),5);assert.equal(run('day().repeatSnapshot[0].priority'),1);
assert.equal(run("sortedTasks([5,2,4,1,3].map(priority=>({priority,name:'a'}))).map(t=>t.priority).join()"),'1,2,3,4,5');
run("plannerPriority='2'");assert.equal(run("filteredTasks([1,2,3,4,5].map(priority=>({priority,name:'a'}))).length"),1);run("plannerPriority='all';plannerStatus='all'");
for(const priority of [0,6,1.5,'2'])assert.throws(()=>run('validatePlanning({...state,taskInbox:[{id:"bad",name:"bad",priority:'+JSON.stringify(priority)+'}]})'));
run("view='day';prayer=3;state.taskInbox=[];day().tasks=[{id:'actual-task',name:'مهمة <اختبار>',prayers:[3,4],priority:2,actionId:state.actions[0].id},{id:'no-action',name:'بلا فعل',prayer:3},{id:'other-period',name:'فترة أخرى',prayer:0,actionId:state.actions[0].id}];render()");
const actualSlot=run('range(3)[0]'),actualIndex=actualSlot%144;
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
click('.slot-planned[data-slot="'+actualSlot+'"]');assert.equal($('#slotTasks').hidden,false);assert.ok($('[data-task-choice="actual-task"]'));click('#close');
// Bulk task registration covers the chosen range and survives export/import.
click('#bulkSlots');$('#slotTo').value=String(actualSlot+2);click('[data-task-choice="actual-task"]');submit('#slotForm');
assert.equal(run('day().actualTasks['+((actualSlot+1)%144)+'].id'),'actual-task');
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
run("prayer=4;render()");click('.slot-actual');click('[data-task-choice="actual-repeat"]');click('.slot-actual');click('#clearSlot');assert.equal(run('day().actualTasks[range(4)[0]%144]'),undefined);assert.equal(run('day().slots[range(4)[0]%144]'),undefined);
assert.throws(()=>run("validatePlanning({...state,sunsetDays:{[date]:{...day(),actualTasks:{144:{id:'a',name:'a',actionId:'a'}}}}})"));
run('validate(state)');

// Project lifecycle, existing-task linking, recurrence, subtasks and backup compatibility.
run("view='projects';render()");click('#newProject');
f=$('#projectForm').elements;f.projectName.value='مشروع <تجريبي>';f.description.value='هدف المشروع';submit('#projectForm');
const projectId=run('state.projects[0].id');assert.equal($('#projectDetails h2').textContent,'مشروع <تجريبي>');
click('#newProjectTask');f=$('#plannerForm').elements;assert.equal($('#plannerForm input[name=projectIds]:checked').value,projectId);
f.taskName.value='مهمة مشروع';f.taskDate.value='';submit('#plannerForm');
assert.equal(run("state.taskInbox.find(t=>t.name==='مهمة مشروع').projectId"),projectId);
let projectCard=[...w.document.querySelectorAll('#projectDetails [data-task-id]')].find(c=>c.textContent.includes('مهمة مشروع'));
projectCard.querySelector('[data-outcome="done"]').click();assert.match($('#projectDetails').textContent,/1 مكتملة/);
projectCard=[...w.document.querySelectorAll('#projectDetails [data-task-id]')].find(c=>c.textContent.includes('مهمة مشروع'));
projectCard.querySelector('[data-task-child]').click();assert.equal($('#plannerForm input[name=projectIds]:checked').value,projectId);click('#closePlanner');
run("state.taskInbox.push({id:'project-existing',name:'مهمة موجودة',prayers:[]});render()");
click('#linkProjectTask');let link=[...w.document.querySelectorAll('[data-link-task]')].find(b=>b.textContent.includes('مهمة موجودة'));link.click();
assert.equal($('#plannerForm input[name=projectIds]:checked').value,projectId);submit('#plannerForm');assert.equal(run("state.taskInbox.find(t=>t.id==='project-existing').projectId"),projectId);
run("view='repeat';render()");f=$('#repeatForm').elements;f.name.value='تكرار مشروع';$('#repeatForm input[name=projectIds][value="'+projectId+'"]').checked=true;submit('#repeatForm');
assert.equal(run("state.repeat.find(t=>t.name==='تكرار مشروع').projectId"),projectId);
run("view='projects';render()");assert.match($('#projectDetails').textContent,/تكرار مشروع/);
click('#editProject');$('#projectForm').elements.projectName.value='اسم جديد';submit('#projectForm');assert.equal($('#projectDetails h2').textContent,'اسم جديد');
const projectBackup=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(projectBackup)+');validate(state);render()');assert.equal(run('state.projects[0].id'),projectId);
assert.throws(()=>run("validatePlanning({...state,projects:[{id:'x',name:'أ'},{id:'x',name:'ب'}]})"));
assert.throws(()=>run("validatePlanning({...state,projects:{}})"));assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'bad',name:'bad',projectId:3}]})"));
const beforeProjectDelete=run('taskEntries().length'),beforeProjectOutcome=run("outcome(state.taskInbox.find(t=>t.name==='مهمة مشروع'))");
click('#deleteProject');assert.equal(run('state.projects.length'),0);assert.equal(run('taskEntries().length'),beforeProjectDelete);assert.equal(run("outcome(state.taskInbox.find(t=>t.name==='مهمة مشروع'))"),beforeProjectOutcome);
assert.equal(run("taskProjectIds(state.repeat.find(t=>t.name==='تكرار مشروع')).length"),0);assert.equal(run("taskEntries().some(t=>t.projectId==="+JSON.stringify(projectId)+")"),false);
run('delete state.projects;validate(state);render()');

// Slot-derived completion and four equally weighted final subtasks.
run("state.projects=[{id:'weighted',name:'مشروع النسب'}];state.taskInbox=[{id:'pa',name:'رئيسية أ',projectId:'weighted'},{id:'pb',name:'رئيسية ب',projectId:'weighted'},{id:'a1',name:'فرعية أ١',parentId:'pa',parentDate:'',projectId:'weighted',expectedSlots:4},{id:'a2',name:'فرعية أ٢',parentId:'pa',parentDate:'',projectId:'weighted',expectedSlots:4},{id:'b1',name:'فرعية ب١',parentId:'pb',parentDate:'',projectId:'weighted',expectedSlots:4},{id:'b2',name:'فرعية ب٢',parentId:'pb',parentDate:'',projectId:'weighted',expectedSlots:4}];view='projects';selectedProject='weighted';render()");
assert.equal(run("projectCompletion('weighted')"),0);
click('#projectDetails [data-task-id="pa"] [data-task-toggle]');
click('#projectDetails [data-task-id="a1"] [data-outcome="done"]');assert.equal(run("projectCompletion('weighted')"),25);assert.equal(run("taskCompletion(findTask('pa',''))"),50);
assert.equal($('#projectDetails progress').value,25);assert.equal($('[data-task-id="a1"] .task-progress-bar').value,100);
click('#projectDetails [data-task-id="a1"] [data-outcome="done"]');assert.equal(run("projectCompletion('weighted')"),0);
click('#projectDetails [data-task-id="a1"] [data-task-edit]');f=$('#plannerForm').elements;f.completedSlots.value='2';submit('#plannerForm');assert.equal(run("projectCompletion('weighted')"),12.5);assert.equal($('[data-task-id="a1"] .task-progress-bar').value,50);
// Done overrides unfinished children without mutating them; undo restores computed progress.
click('#projectDetails [data-task-id="pa"] [data-outcome="done"]');assert.equal(run("taskCompletion(findTask('pa',''))"),100);assert.equal(run("projectCompletion('weighted')"),50);assert.equal(run("completedSlots(findTask('a1',''))"),2);
click('#projectDetails [data-task-id="pa"] [data-outcome="done"]');assert.equal(run("projectCompletion('weighted')"),12.5);
click('#projectDetails [data-task-id="a1"] [data-outcome="failed"]');click('[data-failure-only]');assert.equal($('[data-task-id="a1"] .task-progress-bar').value,50);
// Moving out of and back into inbox preserves completed slots and percentage.
click('#projectDetails [data-task-id="a1"] [data-task-edit]');f=$('#plannerForm').elements;f.taskDate.value=run('date');submit('#plannerForm');assert.equal(run("completedSlots(findTask('a1',date))"),2);assert.equal(run("projectCompletion('weighted')"),12.5);
click('#projectDetails [data-task-id="a1"] [data-task-edit]');f=$('#plannerForm').elements;f.taskDate.value='';submit('#plannerForm');assert.equal(run("completedSlots(findTask('a1',''))"),2);
// Overruns cap at 100; no estimate is zero until marked done.
run("findTask('a1','').completedSlotCount=8;render()");assert.equal($('[data-task-id="a1"] .task-progress-bar').value,100);
run("findTask('a1','').expectedSlots=0;render()");assert.equal($('#projectDetails [data-task-id="a1"] > .task-row-heading .task-progress-bar'),null);assert.equal(run("taskCompletion(findTask('a1',''))"),0);
click('#projectDetails [data-task-id="a1"] [data-outcome="done"]');assert.equal($('[data-task-id="a1"] .task-progress-bar').value,100);
run("view='day';render()");assert.ok($('#allDayTaskCards .task-row'));assert.equal($('#allDayTaskCards .task-row-primary').querySelectorAll('button').length,3);
// Descendants without explicit project links are counted, and cyclic input stays finite.
run("delete findTask('a1','').projectId");assert.equal(run("projectCompletion('weighted')"),0);
run("findTask('a1','').parentId='a2';findTask('a2','').parentId='a1'");assert.ok(Number.isFinite(run("projectCompletion('weighted')")));
assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'bad',name:'bad',completedSlotCount:-1}]})"));
const percentBackup=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(percentBackup)+');validate(state);render()');assert.equal(run("findTask('a1','').completedSlotCount"),8);

// Subtasks are grouped under their true parent across dates and projects.
run("state.sunsetDays={};state.repeat=[];state.projects=[{id:'family',name:'مشروع العائلة'},{id:'other',name:'مشروع آخر'}];state.taskInbox=[{id:'root-family',name:'المهمة الرئيسية',projectId:'family',prayers:[]}];taskDay(date).tasks.push({id:'child-family',name:'الفرعية في العصر',parentId:'root-family',parentDate:'',parentName:'المهمة الرئيسية',date,prayers:[2],prayer:2,expectedSlots:2,actionId:state.actions[0].id,projectId:'other'});view='projects';selectedProject='family';render()");
assert.equal($('#projectTaskList').querySelectorAll(':scope > [data-task-id]').length,1);
click('#projectTaskList > [data-task-id="root-family"] [data-task-toggle]');assert.ok($('#projectTaskList > [data-task-id="root-family"] .task-children [data-task-id="child-family"]'));
assert.equal(run("projectName(findTask('child-family',date))"),'مشروع العائلة');
run("selectedProject='other';render()");assert.equal($('#projectDetails [data-task-id]'),null);
run("view='day';prayer=2;render()");
assert.ok($('#dailyTaskCards > [data-task-id="child-family"]'));assert.match($('#dailyTaskCards').textContent,/المهمة الرئيسية/);
assert.equal($('#allDayTaskCards').querySelectorAll(':scope > [data-task-id]').length,1);assert.ok($('#allDayTaskCards > [data-task-id="root-family"] .task-children [data-task-id="child-family"]'));
click('#dailyTaskCards [data-task-edit]');assert.equal($('#plannerForm').elements.taskName.value,'الفرعية في العصر');
f=$('#plannerForm').elements;assert.equal(f.taskName.value,'الفرعية في العصر');assert.equal($('#plannerForm input[name=projectIds]:checked').value,'family');f.taskName.value='فرعية معدلة';f.completedSlots.value='1';submit('#plannerForm');
assert.equal($('#plannerEditor').open,false);assert.equal(run("taskCompletion(findTask('root-family',''))"),50);
const childSlot=run('range(2)[0]'),childSlotIndex=childSlot%144;
click('.slot-actual[data-slot="'+childSlot+'"]');assert.match($('#slotTasks [data-task-choice="child-family"]').textContent,/المهمة الرئيسية/);click('[data-task-choice="child-family"]');
assert.equal(run('day().actualTasks['+childSlotIndex+'].parentName'),'المهمة الرئيسية');
assert.equal($('.slot-actual[data-slot="'+childSlot+'"] .slot-task-parent').textContent,'المهمة الرئيسية');assert.equal($('.slot-actual[data-slot="'+childSlot+'"] .slot-task-name').textContent,'فرعية معدلة');
run("view='dashboard';plannerTab='week';plannerWeek=date;render()");assert.equal($('.week-period > [data-task-id="child-family"]'),null);assert.match($('.week-period > [data-task-id="root-family"]').textContent,/فرعية معدلة/);click('.week-period > [data-task-id="root-family"] [data-task-edit]');assert.equal($('#plannerForm').elements.taskName.value,'المهمة الرئيسية');click('#closePlanner');
// Moving the parent preserves exact occurrence identity and the child remains nested.
run("const root=findTask('root-family','');savePlannedTask(root,{...root,date,prayers:[]},0);view='projects';selectedProject='family';render()");assert.equal(run("findTask('child-family',date).parentDate"),run('date'));assert.equal($('#projectTaskList').querySelectorAll(':scope > [data-task-id]').length,1);
assert.equal(run("childTasks({id:'root-family',date:''}).length"),0);
const nestedBackup=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(nestedBackup)+');validate(state);render()');assert.equal(run('day().actualTasks['+childSlotIndex+'].parentName'),'المهمة الرئيسية');
// Legacy deleted parents stay grouped rather than turning their children into main tasks.
run("day().tasks=day().tasks.filter(t=>t.id!=='root-family');render()");if(!$('#projectTaskList > .task-family [data-task-id="child-family"]'))click('#projectTaskList > .task-family [data-task-toggle]');assert.ok($('#projectTaskList > .task-family [data-task-id="child-family"]'));assert.equal($('#projectTaskList > [data-task-id="child-family"]'),null);

// Expanded monthly calendar: visibility, result state, filters and task families.
run("state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[{id:'monthly-project',name:'مشروع الشهر'}];date=activeDay();plannerMonth=date.slice(0,7);view='dashboard';plannerTab='month';Object.assign(monthFilters,{project:'all',category:'all',status:'all',priority:'all',period:'all',query:''});taskDay(date).tasks=[{id:'legacy-month',name:'قديمة',prayers:[3,4],priority:1,expectedSlots:2},{id:'slots-only',name:'خانات كاملة',prayers:[],expectedSlots:2}];taskDay(date).taskProgress={'legacy-month':1,'slots-only':2};render()");
const monthChip=id=>'[data-month-task="'+id+'"]';
assert.ok($(monthChip('legacy-month')));assert.equal(w.document.querySelectorAll(monthChip('legacy-month')).length,1);
assert.equal($(monthChip('slots-only')).classList.contains('pending'),true);
assert.match($(monthChip('slots-only')).getAttribute('aria-label'),/100٪/);
assert.equal(run('monthlySummary(monthlyTasks(date)).done'),0);
assert.equal($('.month-day').tagName,'SECTION');
assert.equal($('button button'),null);
const monthDaySelector='[data-calendar-day="'+run('date')+'"]';
assert.equal($(monthDaySelector).parentElement.querySelectorAll('.month-task').length,2);
click(monthChip('legacy-month'));assert.equal($('#monthTaskMenu').querySelectorAll('button').length,3);
assert.equal($(monthChip('legacy-month')).getAttribute('aria-expanded'),'true');
assert.equal(run('plannerTab'),'month');
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
assert.equal($('#monthTaskMenu'),null);assert.equal(w.document.activeElement,$(monthChip('legacy-month')));
click(monthChip('legacy-month'));w.document.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal($('#monthTaskMenu'),null);
click(monthChip('legacy-month'));click('[data-month-outcome="done"]');
assert.equal(run("outcome(findTask('legacy-month',date))"),'done');
assert.equal(JSON.parse(w.localStorage.getItem('waqti-v1')).sunsetDays[run('date')].done['legacy-month'],true);
assert.equal(run('monthlySummary(monthlyTasks(date)).percent'),100);
click(monthChip('legacy-month'));click('[data-month-outcome="done"]');assert.equal(run("outcome(findTask('legacy-month',date))"),'pending');
click(monthChip('legacy-month'));click('[data-month-outcome="failed"]');click('[data-failure-only]');assert.equal(run('monthlySummary(monthlyTasks(date)).failed'),1);
click(monthChip('legacy-month'));click('[data-month-outcome="failed"]');click('[data-failure-only]');assert.equal(run("outcome(findTask('legacy-month',date))"),'pending');
// Save visibility alone, without silently taking the editor's progress-only shortcut.
click(monthChip('legacy-month'));click('[data-month-edit]');f=$('#plannerForm').elements;
assert.equal(f.showInMonthlyCalendar.checked,true);f.showInMonthlyCalendar.checked=false;submit('#plannerForm');
assert.equal($(monthChip('legacy-month')),null);
assert.equal(run("completedSlots(findTask('legacy-month',date))"),1);
run("setTaskOutcome(taskDay(date),'legacy-month','done');openPlannerEditor(findTask('legacy-month',date))");
f=$('#plannerForm').elements;assert.equal(f.showInMonthlyCalendar.checked,false);f.showInMonthlyCalendar.checked=true;submit('#plannerForm');
assert.equal($(monthChip('legacy-month')).classList.contains('done'),true);
assert.equal(run("completedSlots(findTask('legacy-month',date))"),1);
// Every creation path defaults to visible.
run('openPlannerEditor()');f=$('#plannerForm').elements;assert.equal(f.showInMonthlyCalendar.checked,true);f.taskName.value='جديدة';submit('#plannerForm');
assert.equal(run("allTasksOn(date).find(t=>t.name==='جديدة').showInMonthlyCalendar"),true);
click('#quickTaskButton');$('#quickTaskForm').elements.taskName.value='سريعة ظاهرة';submit('#quickTaskForm');
assert.equal(run('state.taskInbox.at(-1).showInMonthlyCalendar'),true);
// Cross-date parent, deep descendants, hidden parent, and four equally weighted leaves.
run("const otherDate=addDate(date,-1);taskDay(otherDate).tasks.push({id:'month-parent',name:'رئيسية يوم آخر',projectId:'monthly-project',prayers:[],showInMonthlyCalendar:false});taskDay(date).tasks.push({id:'m-sub-a',name:'فرع أول',parentId:'month-parent',parentDate:otherDate,prayers:[2],expectedSlots:2},{id:'m-sub-b',name:'فرع ثان',parentId:'month-parent',parentDate:otherDate,prayers:[2],expectedSlots:2});state.taskInbox.push({id:'month-parent-b',name:'رئيسية أخرى',projectId:'monthly-project'},{id:'m-sub-c',name:'فرع ثالث',parentId:'month-parent-b',parentDate:'',expectedSlots:2},{id:'m-sub-d',name:'فرع رابع',parentId:'month-parent-b',parentDate:'',expectedSlots:2});render()");
assert.match($(monthChip('m-sub-a')).textContent,/رئيسية يوم آخر/);assert.equal($(monthChip('month-parent')),null);
assert.equal(run("projectCompletion('monthly-project')"),0);
click(monthChip('m-sub-a'));click('[data-month-outcome="done"]');assert.equal(run("projectCompletion('monthly-project')"),25);
assert.equal(run("taskCompletion(findTask('month-parent',addDate(date,-1)))"),50);
click(monthChip('m-sub-a'));click('[data-month-edit]');assert.equal($('#plannerForm').elements.taskName.value,'رئيسية يوم آخر');
assert.ok($('#plannerEditor [data-task-id="m-sub-a"]'));click('#closePlanner');
run("view='projects';selectedProject='monthly-project';render()");
assert.equal($('#projectDetails progress').value,25);assert.equal($('#projectTaskList > [data-task-id="m-sub-a"]'),null);
run("view='dashboard';plannerTab='month';render();openPlannerEditor(findTask('m-sub-a',date))");
f=$('#plannerForm').elements;f.showInMonthlyCalendar.checked=false;submit('#plannerForm');assert.equal(run("projectCompletion('monthly-project')"),25);
assert.equal($(monthChip('m-sub-a')),null);click('#closePlanner');
run("openPlannerEditor(findTask('m-sub-a',date))");f=$('#plannerForm').elements;f.showInMonthlyCalendar.checked=true;submit('#plannerForm');click('#closePlanner');
run("taskDay(date).tasks.push({id:'deep-month',name:'فرع عميق',parentId:'m-sub-b',parentDate:date,prayers:[0]},{id:'orphan-month',name:'فرع يتيم',parentId:'deleted-month',parentName:'أصل محذوف محفوظ',parentDate:'',prayers:[]});render()");
assert.match($(monthChip('deep-month')).textContent,/رئيسية يوم آخر/);
assert.match($(monthChip('orphan-month')).textContent,/أصل محذوف محفوظ/);
click(monthChip('orphan-month'));click('[data-month-edit]');assert.equal($('#orphanTasks').open,true);assert.ok($('#orphanTasks [data-task-id="orphan-month"]'));$('#orphanTasks').close();
// Filters are view-only, use inherited project and linked action category, and count visible tasks.
const beforeFilters=run('JSON.stringify(state)');
const changeMonthFilter=(field,value)=>{const el=$('[data-month-filter="'+field+'"]');el.value=value;el.dispatchEvent(new w.Event(field==='query'?'input':'change'))};
changeMonthFilter('project','monthly-project');assert.ok($(monthChip('deep-month')));assert.equal($(monthChip('legacy-month')),null);
assert.equal(run('monthlySummary(monthlyTasks(date)).total'),3);
changeMonthFilter('status','done');assert.ok($(monthChip('m-sub-a')));assert.equal($(monthChip('m-sub-b')),null);
changeMonthFilter('status','pending');assert.equal($(monthChip('m-sub-a')),null);
changeMonthFilter('status','failed');assert.equal(w.document.querySelectorAll('.month-task').length,0);
changeMonthFilter('status','all');changeMonthFilter('period','2');assert.equal(w.document.querySelectorAll('.month-task').length,2);
changeMonthFilter('priority','1');assert.equal(w.document.querySelectorAll('.month-task').length,0);
changeMonthFilter('priority','all');changeMonthFilter('query','ثان');assert.ok($(monthChip('m-sub-b')));assert.equal($(monthChip('m-sub-a')),null);
changeMonthFilter('query','');changeMonthFilter('project','all');changeMonthFilter('period','all');
changeMonthFilter('category',run('state.categories[0].id'));assert.equal($(monthChip('slots-only')),null);
changeMonthFilter('category','all');assert.ok($(monthChip('slots-only')));assert.equal(run('JSON.stringify(state)'),beforeFilters);
run("taskDay(date).tasks.find(t=>t.id==='legacy-month').actionId=state.actions[0].id;render()");
changeMonthFilter('category',run('state.actions[0].categoryId'));assert.ok($(monthChip('legacy-month')));changeMonthFilter('category','all');
// Prayer order starts with Maghrib; priority is secondary, and no-period tasks remain visible.
run("taskDay(date).tasks=Array.from({length:120},(_,i)=>({id:'many-'+i,name:i===0?'اسم طويل جدًا '.repeat(20):'م'+i,prayers:[3,4],priority:i%5+1}));taskDay(date).tasks.push({id:'asr-month',name:'عصر',prayers:[2],priority:1},{id:'unperiod-month',name:'دون فترة',prayers:[]});render()");
assert.equal($(monthDaySelector).parentElement.querySelectorAll('.month-task').length,122);
assert.equal(run("monthlyTasks(date).filter(t=>t.id.startsWith('many-')).length"),120);
assert.equal(run("monthlyTasks(date)[0].priority"),1);
assert.equal(run("monthlyTasks(date).at(-1).id"),'unperiod-month');
assert.equal($('.month-task .month-task-text').textContent,'اسم طويل جدًا '.repeat(20));
assert.equal($('.month-task').querySelectorAll('button').length,0);
assert.equal($('.month-day [data-month-outcome]'),null);
click(monthDaySelector);assert.equal(run('plannerTab'),'day');
run("plannerTab='month';render()");
// Series visibility changes preserve old snapshots; one-day edits detach only that occurrence.
run("state.repeat=[{id:'month-repeat',name:'تكرار ظاهر',prayers:[3],days:[0,1,2,3,4,5,6],startDate:addDate(date,-2),showInMonthlyCalendar:true}];taskDay(addDate(date,-1)).repeatSnapshot=repeatFor(addDate(date,-1));taskDay(addDate(date,-1)).done['month-repeat']=true;view='repeat';renderRepeat(state.repeat[0])");
f=$('#repeatForm').elements;f.showInMonthlyCalendar.checked=false;submit('#repeatForm');
assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='month-repeat').showInMonthlyCalendar"),true);
assert.equal(run("outcome(findTask('month-repeat',addDate(date,-1)))"),'done');
assert.equal(run("allTasksOn(addDate(date,1)).find(t=>t.id==='month-repeat').showInMonthlyCalendar"),false);
run("view='dashboard';plannerTab='month';openPlannerEditor(findTask('month-repeat',date))");
f=$('#plannerForm').elements;assert.equal(f.showInMonthlyCalendar.checked,false);f.showInMonthlyCalendar.checked=true;submit('#plannerForm');
assert.equal(run("taskDay(date).excludedRepeat['month-repeat']"),true);
assert.equal(run("allTasksOn(date).find(t=>t.detachedFrom==='month-repeat').showInMonthlyCalendar"),true);
assert.equal(run("state.repeat[0].showInMonthlyCalendar"),false);
assert.equal(run("allTasksOn(addDate(date,-1)).find(t=>t.id==='month-repeat').showInMonthlyCalendar"),true);
const monthBackup=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(monthBackup)+');validate(state);save();render()');
assert.equal(run('JSON.stringify(state)'),monthBackup);
assert.equal(JSON.parse(w.localStorage.getItem('waqti-v1')).repeat[0].showInMonthlyCalendar,false);
// All transport locations validate booleans without requiring migration of old tasks.
for(const bad of ['false',0,null])for(const place of ['inbox','repeat','tasks','snapshot']){
 const task={id:'bad-visible',name:'bad',prayers:[],days:[0],showInMonthlyCalendar:bad},json=JSON.stringify(task);
 const replacement=place==='inbox'?'taskInbox:['+json+']':place==='repeat'?'repeat:['+json+']':'sunsetDays:{[date]:{...emptyDay(),'+(place==='tasks'?'tasks':'repeatSnapshot')+':['+json+']}}';
 assert.throws(()=>run('validatePlanning({...state,'+replacement+'})'));
}
// Layout invariants in the shipped CSS; real pixel geometry is tested separately in Chromium.
const sheet=w.document.createElement('style');sheet.textContent=fs.readFileSync(root+'style.css','utf8');w.document.head.append(sheet);
assert.equal(w.getComputedStyle($('.month-tasks')).display,'flex');
assert.equal(w.getComputedStyle($('.month-tasks')).flexWrap,'wrap');
assert.equal(w.getComputedStyle($('.task-month')).display,'grid');
assert.equal(w.getComputedStyle($('.task-month')).minWidth,'0px');
assert.notEqual(w.getComputedStyle($('.task-month-scroll')).overflowX,'auto');
assert.equal(w.getComputedStyle($('.month-task')).whiteSpace,'normal');
assert.equal(w.getComputedStyle($('.month-task')).overflowWrap,'anywhere');
assert.equal(w.getComputedStyle($('.month-task')).maxWidth,'100%');
click('.month-task');assert.equal(w.getComputedStyle($('#monthTaskMenu')).position,'fixed');
run('closeMonthTaskMenu()');
// Same validated snapshot is forwarded through the existing Firebase save hook.
run("window.syncedMonthState=null;window.WaqtiSync={changed:()=>{window.syncedMonthState=JSON.parse(JSON.stringify(state));validate(window.syncedMonthState)}};save()");
assert.equal(run('window.syncedMonthState.repeat[0].showInMonthlyCalendar'),false);run('delete window.WaqtiSync');
console.log('PASS: expanded monthly calendar, visibility, filters, outcomes, families, project rollup, recurrence history and backup/sync payload');



// Project ordering moves whole families, persists independently of task priority and progress.
run("state.sunsetDays={};state.repeat=[];state.projects=[{id:'order-p',name:'ترتيب المشروع'},{id:'order-other',name:'مشروع مستقل'}];state.taskInbox=[{id:'order-a',name:'الأولى',priority:1,projectId:'order-p'},{id:'order-b',name:'الثانية',priority:2,projectId:'order-p'},{id:'order-c',name:'الثالثة',priority:3,projectId:'order-p'},{id:'order-child',name:'فرع الأولى',parentId:'order-a',parentDate:'',inboxOutcome:'done'},{id:'order-x',name:'مهمة المشروع الآخر',projectId:'order-other'}];view='projects';selectedProject='order-p';render()");
click('#projectDetails [data-task-id="order-a"] [data-task-toggle]');
const orderedIds=()=>[...$('#projectTaskList').children].filter(c=>c.matches('[data-task-id]')).map(c=>c.dataset.taskId).join();
assert.equal(orderedIds(),'order-a,order-b,order-c');
assert.equal($('#projectDetails [data-task-id="order-a"] [data-project-order-key]').value,'1');
assert.equal($('#projectDetails [data-task-id="order-c"] [data-project-order-key]').value,'3');
assert.equal($('#projectDetails [data-task-id="order-child"] [data-project-order-key]'),null);
const beforeOrderingTasks=run('JSON.stringify(state.taskInbox)'),beforeOrderingProgress=run("projectCompletion('order-p')");
const orderInput=(id)=>$('#projectDetails [data-task-id="'+id+'"] [data-project-order-key]');
orderInput('order-b').value='1';orderInput('order-b').dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(orderedIds(),'order-b,order-a,order-c');
assert.ok($('#projectTaskList > [data-task-id="order-a"] [data-task-id="order-child"]'));
assert.equal(run('JSON.stringify(state.taskInbox)'),beforeOrderingTasks);
assert.equal(run("projectCompletion('order-p')"),beforeOrderingProgress);
orderInput('order-a').value='3';orderInput('order-a').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
assert.equal(orderedIds(),'order-b,order-c,order-a');
assert.equal(run("state.projects.find(p=>p.id==='order-other').taskOrder"),undefined);
click('#editProject');$('#projectForm').elements.projectName.value='مشروع مرتب';submit('#projectForm');
assert.equal(orderedIds(),'order-b,order-c,order-a');
run("state.taskInbox.push({id:'order-new',name:'جديدة عالية الأولوية',priority:1,projectId:'order-p'});render()");
assert.equal(orderedIds(),'order-b,order-c,order-a,order-new');
const orderBackup=run('JSON.stringify(state)');run('state=JSON.parse('+JSON.stringify(orderBackup)+');validate(state);save();render()');
assert.equal(orderedIds(),'order-b,order-c,order-a,order-new');
assert.ok(JSON.parse(w.localStorage.getItem('waqti-v1')).projects[0].taskOrder.length);
run("selectedProject='order-other';render()");assert.equal(orderedIds(),'order-x');
for(const taskOrder of [null,{},[3],['same','same']])assert.throws(()=>run('validateProjects({projects:[{id:"bad-order",name:"bad",taskOrder:'+JSON.stringify(taskOrder)+'}]})'));
run("selectedProject='order-p';render();const first=orderedProjectTasks('order-p')[0];moveProjectTask('order-p',taskIdentity(first),0)");
assert.equal(orderedIds(),'order-b,order-c,order-a,order-new');
// Invalid positions restore the shown rank and never alter the saved order.
for(const value of ['', '0','5','1.5']){orderInput('order-b').value=value;orderInput('order-b').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(orderInput('order-b').value,'1');assert.equal(orderedIds(),'order-b,order-c,order-a,order-new')}
orderInput('order-b').value='4';orderInput('order-b').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',cancelable:true}));assert.equal(orderInput('order-b').value,'1');
orderInput('order-new').value='1';orderInput('order-new').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(orderedIds(),'order-new,order-b,order-c,order-a');
assert.equal(orderInput('order-a').value,'4');
console.log('PASS: project task order, family grouping, independent projects, persistence and validation');

// Unscheduled and missed task lists separate projects from independent tasks.
run("state.sunsetDays={};state.repeat=[];state.projects=[{id:'group-p',name:'المشروع الأول'},{id:'group-q',name:'المشروع الثاني'}];state.taskInbox=[{id:'gp',name:'أصل المشروع الأول',priority:3,projectId:'group-p'},{id:'gc',name:'فرع موروث',priority:3,parentId:'gp',parentDate:''},{id:'gq',name:'مهمة المشروع الثاني',priority:3,projectId:'group-q'},{id:'free',name:'مهمة مستقلة',priority:3}];plannerQuery='';plannerPriority=plannerStatus='all';view='dashboard';plannerTab='inbox';render()");
const projectSection=()=>$('#plannerResults [data-planner-section="projects"]'),unassignedSection=()=>$('#plannerResults [data-planner-section="unassigned"]');
assert.equal(w.document.querySelectorAll('[data-planner-project]').length,3);
if(!projectSection().querySelector('[data-task-id="gc"]'))click('[data-planner-section="projects"] [data-task-id="gp"] [data-task-toggle]');assert.ok(projectSection().querySelector('[data-task-id="gp"] [data-task-id="gc"]'));
assert.ok(unassignedSection().querySelector('[data-task-id="free"]'));
assert.equal(unassignedSection().querySelector('[data-task-id="gc"]'),null);
assert.equal(projectSection().querySelector('[data-task-id="gq"]'),null);
const groupData=run('JSON.stringify(state.taskInbox)');
click('[data-planner-project="group-q"]');
assert.equal(run('JSON.stringify(state.taskInbox)'),groupData);
assert.ok(projectSection().querySelector('[data-task-id="gq"]'));
assert.equal(projectSection().querySelector('[data-task-id="gp"]'),null);
click('[data-planner-section="projects"] [data-outcome="done"]');
assert.equal($('[data-planner-project="group-q"]').getAttribute('aria-pressed'),'true');
assert.equal(run("outcome(state.taskInbox.find(t=>t.id==='gq'))"),'done');
assert.equal(run("outcome(state.taskInbox.find(t=>t.id==='free'))"),'pending');
$('#plannerSearch').value='فرع موروث';$('#plannerSearch').dispatchEvent(new w.Event('input'));
assert.equal($('[data-planner-project="group-p"]').getAttribute('aria-pressed'),'true');
if(!projectSection().querySelector('[data-task-id="gc"]'))click('[data-planner-section="projects"] [data-task-id="gp"] [data-task-toggle]');assert.ok(projectSection().querySelector('[data-task-id="gp"] [data-task-id="gc"]'));
assert.equal(unassignedSection().querySelector('[data-task-id]'),null);
$('#plannerSearch').value='لا يوجد بهذا الاسم';$('#plannerSearch').dispatchEvent(new w.Event('input'));
assert.equal(w.document.querySelectorAll('[data-planner-project]').length,0);
assert.ok(projectSection().querySelector('.empty-note'));assert.ok(unassignedSection().querySelector('.empty-note'));
run("plannerQuery='';const old=taskDay(addDate(activeDay(),-1));old.tasks=[{id:'past-p',name:'فائتة مشروع',priority:3,prayer:0,projectId:'group-p'},{id:'past-free',name:'فائتة مستقلة',priority:3,prayer:0}];plannerTab='missed';render()");
assert.ok(projectSection().querySelector('[data-task-id="past-p"]'));
assert.ok(unassignedSection().querySelector('[data-task-id="past-free"]'));
click('[data-planner-section="projects"] [data-outcome="done"]');
assert.equal(projectSection().querySelector('[data-task-id="past-p"]'),null);
assert.ok(unassignedSection().querySelector('[data-task-id="past-free"]'));
run("plannerTab='inbox';render();state.projects=state.projects.filter(p=>p.id!=='group-p');render()");
assert.ok(unassignedSection().querySelector('[data-task-id="gp"] [data-task-id="gc"]'));
assert.equal($('[data-planner-project="group-q"]').getAttribute('aria-pressed'),'true');
console.log('PASS: project tabs and independent sections in inbox/missed, inherited families, filters, outcomes and missing projects');

// Bulk project edits include inherited children, series and saved occurrences, and are atomic.
run("state.days={};state.sunsetDays={};state.taskInbox=[{id:'bulk-root',name:'أصل',priority:3,projectId:'bulk-p',expectedSlots:2},{id:'bulk-child',name:'فرع',priority:2,parentId:'bulk-root',parentDate:'',expectedSlots:1,completedSlotCount:1,inboxOutcome:'done'},{id:'bulk-other',name:'مستقلة بمشروع آخر',priority:4,projectId:'bulk-q',expectedSlots:7}];state.projects=[{id:'bulk-p',name:'تعديل جماعي'},{id:'bulk-q',name:'آخر'}];state.repeat=[{id:'bulk-repeat',name:'سلسلة',prayer:0,days:[0,1,2,3,4,5,6],priority:3,projectId:'bulk-p',expectedSlots:2}];const bulkKey=activeDay(),bulkSlots=periodSlots(bulkKey,0);for(let i=0;i<2;i++){const t={id:'bulk-scheduled-'+i,name:'مجدولة '+i,prayer:0,priority:3,projectId:'bulk-p',expectedSlots:2,actionId:state.actions[0].id,startSlot:bulkSlots[0]+i*3};taskDay(bulkKey).tasks.push(t);scheduleTask({...t,date:bulkKey},t.startSlot)}taskDay(bulkKey).done['bulk-scheduled-0']=true;taskDay(bulkKey).taskProgress={'bulk-scheduled-0':1};taskDay(addDate(bulkKey,-1)).repeatSnapshot=[{...state.repeat[0]}];view='projects';selectedProject='bulk-p';render()");
const beforeBulk=run('JSON.stringify(state)'),otherBulk=run("JSON.stringify(state.taskInbox.find(t=>t.id==='bulk-other'))");
assert.throws(()=>run("bulkUpdateProjectTasks(state,'bulk-p',{})"));
for(const patch of [{priority:6},{expectedSlots:-1},{showInMonthlyCalendar:'false'},{actionId:'missing'},{name:'bad'}])assert.throws(()=>run('bulkUpdateProjectTasks(state,"bulk-p",'+JSON.stringify(patch)+')'));
assert.equal(run('JSON.stringify(state)'),beforeBulk);
// Two three-slot reservations fit; four slots collide and must not mutate anything.
assert.throws(()=>run("bulkUpdateProjectTasks(state,'bulk-p',{priority:1,expectedSlots:4})"));
assert.equal(run('JSON.stringify(state)'),beforeBulk);
run("const changed=bulkUpdateProjectTasks(state,'bulk-p',{priority:1,expectedSlots:3,showInMonthlyCalendar:false,actionId:state.actions[1].id});if(state===changed)throw Error('must prepare a copy');window.bulkCandidate=changed;");
assert.equal(run('JSON.stringify(state)'),beforeBulk);
run('state=window.bulkCandidate;delete window.bulkCandidate;save();render()');
assert.equal(run("JSON.stringify(state.taskInbox.find(t=>t.id==='bulk-other'))"),otherBulk);
assert.equal(run("projectTaskRecords(state,'bulk-p').every(r=>r.task.priority===1&&r.task.expectedSlots===3&&r.task.showInMonthlyCalendar===false&&r.task.actionId===state.actions[1].id)"),true);
assert.equal(run("state.taskInbox.find(t=>t.id==='bulk-child').completedSlotCount"),1);
assert.equal(run("state.taskInbox.find(t=>t.id==='bulk-child').inboxOutcome"),'done');
assert.equal(run("taskDay(activeDay()).done['bulk-scheduled-0']"),true);
assert.equal(run("taskDay(activeDay()).taskProgress['bulk-scheduled-0']"),1);
assert.equal(run("Object.keys(taskDay(activeDay()).taskSlotOwners).length"),6);
assert.equal(run("Object.values(taskDay(activeDay()).planned).every(id=>id===state.actions[1].id)"),true);
click('#bulkProjectTasks');assert.equal($('#projectBulkEditor').open,true);
submit('#projectBulkForm');assert.match($('#projectBulkError').textContent,/اختر حقلًا/);
let bulkCheck=$('#projectBulkForm [data-bulk-field="priority"]');bulkCheck.checked=true;bulkCheck.dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal($('#projectBulkForm [data-bulk-value="priority"]').disabled,false);
assert.equal($('#projectBulkForm [data-bulk-value="expectedSlots"]').disabled,true);
$('#projectBulkForm').elements.priority.value='5';submit('#projectBulkForm');
assert.equal($('#projectBulkEditor').open,false);
assert.equal(run("projectTaskRecords(state,'bulk-p').every(r=>r.task.priority===5&&r.task.expectedSlots===3&&r.task.showInMonthlyCalendar===false)"),true);
// Removing the linked action clears reservations but leaves recorded actual work intact.
run("const d=taskDay(activeDay()),slot=periodSlots(activeDay(),0)[0]%144;d.slots[slot]=state.actions[0].id;d.actualTasks={[slot]:{id:'bulk-scheduled-0',name:'عمل مسجل',actionId:state.actions[0].id}};state=bulkUpdateProjectTasks(state,'bulk-p',{actionId:''});validatePlanning(state)");
assert.equal(run('Object.keys(taskDay(activeDay()).taskSlotOwners).length'),0);
assert.equal(run('Object.values(taskDay(activeDay()).slots)[0]'),run('state.actions[0].id'));
assert.equal(run('Object.values(taskDay(activeDay()).actualTasks)[0].name'),'عمل مسجل');
assert.equal(run('taskDay(activeDay()).tasks.every(t=>t.startSlot===null)'),true);
console.log('PASS: selective project bulk edits, inherited children, recurrence history, reservation rebuild/rollback and retained outcomes/actual slots');


// Shared memberships: one task identity, synchronized outcome and progress in two projects.
run("state.sunsetDays={};state.repeat=[];state.projects=[{id:'shared-a',name:'مشروع أ'},{id:'shared-b',name:'مشروع ب'}];state.taskInbox=[{id:'shared-parent',name:'مهمة مشتركة',projectId:'shared-a',projectIds:['shared-a','shared-b'],priority:3,prayers:[]},{id:'shared-child',name:'فرعية مشتركة',parentId:'shared-parent',parentDate:'',expectedSlots:2,completedSlotCount:0,prayers:[]},{id:'exclusive-b',name:'خاصة ب',projectId:'shared-b',expectedSlots:2,prayers:[]}];selectedProject='shared-a';view='projects';render()");
assert.ok($('#projectDetails [data-task-id="shared-parent"]'));
assert.ok(run("projectTasks('shared-b').some(t=>t.id==='shared-parent')"));
assert.equal(run("projectTasks('shared-a').filter(t=>t.id==='shared-parent').length"),1);
run("setInboxOutcome(findTask('shared-child',''),'done');save()");
assert.equal(run("projectCompletion('shared-a')"),100);
assert.equal(run("projectCompletion('shared-b')"),50);
run("openPlannerEditor(findTask('shared-parent',''))");
assert.equal($('#plannerForm').querySelectorAll('input[name=projectIds]:checked').length,2);
assert.ok($('#plannerForm').querySelector('input[name=projectIds][value="shared-b"]'));
$('#closePlanner').click();
run("selectedProject='shared-b';render()");
assert.ok($('#projectDetails [data-task-id="shared-parent"]'));
run("state.taskInbox.push({id:'legacy-a',name:'قديم أ',projectId:'shared-a',prayers:[]});validate(state)");
assert.deepEqual(Array.from(run("effectiveProjectIds(findTask('legacy-a',''))")),['shared-a']);
assert.throws(()=>run("validatePlanning({...state,taskInbox:[{id:'dup',name:'تكرار',projectIds:['shared-a','shared-a']}]})"));
const sharedBefore=run("JSON.stringify(state)");
run("window.sharedPurge=removeProjectAndItsTasks(state,'shared-a')");
assert.equal(run("JSON.stringify(state)"),sharedBefore);
assert.equal(run("window.sharedPurge.state.taskInbox.some(t=>t.id==='legacy-a')"),false);
assert.equal(run("window.sharedPurge.state.taskInbox.some(t=>t.id==='shared-parent')"),true);
assert.equal(run("window.sharedPurge.state.taskInbox.find(t=>t.id==='shared-parent').projectIds.join(',')"),'shared-b');
assert.equal(run("window.sharedPurge.state.taskInbox.find(t=>t.id==='shared-child').inboxOutcome"),'done');
assert.equal(run("window.sharedPurge.state.projects.length"),1);
run("state=window.sharedPurge.state;delete window.sharedPurge;save();render()");
assert.equal(run("projectCompletion('shared-b')"),50);
run("deleteProject(state.projects[0])");
assert.equal(run("state.taskInbox.some(t=>t.id==='shared-parent')"),true);
assert.deepEqual(Array.from(run("taskProjectIds(findTask('shared-parent',''))")),[]);
console.log('PASS: shared project membership, inherited subtasks, unified progress, backward compatibility and safe project deletion');

assert.deepEqual(errors,[]);console.log('PASS: inbox, priority, estimates/progress, schedule, outcomes, children, future/backlog, recurrence history, month/week, conflict rollback, daily integration, owned-slot cleanup, validation');

// Project progress weights final tasks by slots, excludes unestimated work and caps overruns.
run("state.sunsetDays={};state.repeat=[];state.projects=[{id:'slot-weight',name:'وزن الخانات'}];state.taskInbox=[{id:'slot-root',name:'أصل',projectId:'slot-weight',expectedSlots:100},{id:'slot-small',name:'صغيرة',parentId:'slot-root',parentDate:'',expectedSlots:2,inboxOutcome:'done'},{id:'slot-large',name:'كبيرة',parentId:'slot-root',parentDate:'',expectedSlots:8},{id:'slot-zero',name:'بلا تقدير',projectId:'slot-weight',inboxOutcome:'done',completedSlotCount:50}];render()");
assert.equal(run("projectCompletion('slot-weight')"),20);
run("findTask('slot-large','').completedSlotCount=4;render()");
assert.equal(run("projectCompletion('slot-weight')"),60);
run("findTask('slot-large','').completedSlotCount=20;render()");
assert.equal(run("projectCompletion('slot-weight')"),100);
run("findTask('slot-large','').completedSlotCount=0;findTask('slot-root','').inboxOutcome='done';render()");
assert.equal(run("projectCompletion('slot-weight')"),100);
run("delete findTask('slot-root','').inboxOutcome;render()");
assert.equal(run("projectCompletion('slot-weight')"),20);
run("findTask('slot-small','').expectedSlots=0;findTask('slot-large','').expectedSlots=0;render()");
assert.equal(run("projectCompletion('slot-weight')"),0);
console.log('PASS: slot-weighted project completion');

// Parent estimates sum final descendants, remain read-only and can exceed a day's slots.
run("state.sunsetDays={};state.repeat=[];state.projects=[];state.taskInbox=[{id:'sum-root',name:'مجموع الأصل',expectedSlots:7},{id:'sum-branch',name:'فرع',parentId:'sum-root',parentDate:'',expectedSlots:90},{id:'sum-a',name:'ورقة أ',parentId:'sum-branch',parentDate:'',expectedSlots:144},{id:'sum-b',name:'ورقة ب',parentId:'sum-root',parentDate:'',expectedSlots:144}];view='dashboard';plannerTab='inbox';render();openPlannerEditor(findTask('sum-root',''))");
assert.equal(run("taskExpectedSlots(findTask('sum-root',''))"),288);
assert.equal(run("taskExpectedSlots(findTask('sum-branch',''))"),144);
f=$('#plannerForm').elements;
assert.equal(f.expectedSlots.value,'288');assert.equal(f.expectedSlots.disabled,true);
f.taskName.value='مجموع محفوظ';submit('#plannerForm');
assert.equal(run("findTask('sum-root','').name"),'مجموع محفوظ');
assert.equal(run("taskExpectedSlots(findTask('sum-root',''))"),288);
run("findTask('sum-a','').expectedSlots=2;save();openPlannerEditor(findTask('sum-root',''))");
assert.equal($('#plannerForm').elements.expectedSlots.value,'146');
run("state.taskInbox=state.taskInbox.filter(t=>t.id!=='sum-b');save();openPlannerEditor(findTask('sum-root',''))");
assert.equal($('#plannerForm').elements.expectedSlots.value,'2');
run("state.taskInbox=state.taskInbox.filter(t=>!t.parentId);save();openPlannerEditor(findTask('sum-root',''))");
assert.equal($('#plannerForm').elements.expectedSlots.disabled,false);
assert.equal($('#plannerForm').elements.expectedSlots.value,'7');
console.log('PASS: automatic nested parent slot totals, updates and editable leaf estimates');

// Adding an existing dated task to a second project must persist even if no other fields change.
run("state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[{id:'link-a',name:'أ'},{id:'link-b',name:'ب'}];date=activeDay();taskDay(date).tasks=[{id:'link-dated',name:'مشتركة موزعة',description:'',projectIds:['link-a'],projectId:'link-a',priority:3,prayers:[],expectedSlots:2,actionId:'',startSlot:null,showInMonthlyCalendar:true}];view='projects';selectedProject='link-b';render()");
click('#linkProjectTask');click('[data-link-task]');
assert.equal($('#plannerForm').querySelectorAll('input[name="projectIds"]:checked').length,2);
submit('#plannerForm');
assert.deepEqual(Array.from(run("taskProjectIds(findTask('link-dated',date))")),['link-a','link-b']);
assert.equal(run("taskDay(date).tasks.filter(t=>t.id==='link-dated').length"),1);
console.log('PASS: existing dated task gains project membership without copying or unrelated edits');
assert.deepEqual(errors,[]);dom.window.close();


