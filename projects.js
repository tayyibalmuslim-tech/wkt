/* Projects live in the same snapshot as tasks, including account sync and backups. */
let selectedProject='';
function projectName(t){return (state.projects||[]).find(p=>p.id===effectiveProjectId(t))?.name||''}
function projectField(t){return `<label class="field">المشروع<select name="projectId"><option value="">بدون مشروع</option>${(state.projects||[]).map(p=>`<option value="${esc(p.id)}" ${p.id===effectiveProjectId(t)?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`}
function validateProjects(s){
 if(s.tafsirDefaultInstalled!==undefined&&typeof s.tafsirDefaultInstalled!=='boolean')throw Error('حالة المشروع الافتراضي غير صالحة');
 if(s.projects===undefined)return;
 if(!Array.isArray(s.projects))throw Error('قائمة مشاريع غير صالحة');
 const ids=new Set();
 for(const p of s.projects){
  if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||p.description!==undefined&&(typeof p.description!=='string'||p.description.length>1000))throw Error('مشروع غير صالح');
  if(p.taskOrder!==undefined&&(!Array.isArray(p.taskOrder)||p.taskOrder.some(key=>typeof key!=='string')||new Set(p.taskOrder).size!==p.taskOrder.length))throw Error('ترتيب مهام المشروع غير صالح');
  ids.add(p.id);
 }
}
function projectTasks(id){
 const entries=progressEntries();
 return sortedTasks(entries.filter(t=>effectiveProjectId(t)===id));
}
// Order belongs to the project; it never changes task priority, dates or parent links.
function orderedProjectTasks(id){
 const list=taskGroups(projectTasks(id)),order=state.projects?.find(p=>p.id===id)?.taskOrder||[],ranks=new Map(order.map((key,i)=>[key,i]));
 return list.sort((a,b)=>(ranks.get(taskIdentity(a))??Infinity)-(ranks.get(taskIdentity(b))??Infinity));
}
function moveProjectTask(projectId,key,position){
 const project=state.projects?.find(p=>p.id===projectId);if(!project||!Number.isInteger(position))return;
 const keys=orderedProjectTasks(projectId).map(taskIdentity),index=keys.indexOf(key),next=position-1;
 if(index<0||next<0||next>=keys.length||index===next)return;
 keys.splice(index,1);keys.splice(next,0,key);
 // Keep saved ranks for recurring occurrences outside the currently selected day.
 const visible=new Set(keys);project.taskOrder=[...keys,...(project.taskOrder||[]).filter(k=>!visible.has(k))];
 save();render();
 [...document.querySelectorAll('[data-project-order-key]')].find(input=>input.dataset.projectOrderKey===key)?.focus();
}
function bindProjectTaskOrder(details,project,list){
 const cards=[...details.children].filter(el=>el.matches('.planner-task,.task-family'));
 cards.forEach((card,index)=>{
  const t=list[index];if(!t)return;
  const controls=document.createElement('label');controls.className='project-task-order';
  controls.innerHTML=`<span>الترتيب</span><input type="number" min="1" max="${list.length}" step="1" inputmode="numeric" value="${index+1}" aria-label="ترتيب ${esc(t.name)}" title="اكتب موضع المهمة من 1 إلى ${list.length}">`;
  const input=controls.querySelector('input');input.dataset.projectOrderKey=taskIdentity(t);
  const apply=()=>{
   const position=Number(input.value);
   if(!input.value||!Number.isInteger(position)||position<1||position>list.length){input.value=index+1;toast(`أدخل رقم ترتيب من 1 إلى ${list.length}`);return}
   moveProjectTask(project.id,input.dataset.projectOrderKey,position);
  };
  input.onchange=apply;
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();apply()}else if(e.key==='Escape'){e.preventDefault();input.value=index+1}};
  (card.querySelector('.planner-task-heading')||card.querySelector('h3')).append(controls);
 });
}
function openProjectEditor(project=null){
 let dialog=$('#projectEditor');if(!dialog){dialog=document.createElement('dialog');dialog.id='projectEditor';document.body.append(dialog)}
 const originalState=state;
 dialog.innerHTML=`<div class="dialog-head"><h2 id="projectEditorTitle">${project?'تعديل المشروع':'مشروع جديد'}</h2><button type="button" data-close-project aria-label="إغلاق">×</button></div><form id="projectForm"><label class="field">اسم المشروع<input name="projectName" required maxlength="100" value="${esc(project?.name||'')}"></label><label class="field">وصف مختصر<textarea name="description" maxlength="1000">${esc(project?.description||'')}</textarea></label><p role="alert" id="projectError"></p><button class="primary">حفظ المشروع</button></form>`;
 dialog.setAttribute('aria-labelledby','projectEditorTitle');
 dialog.querySelector('[data-close-project]').onclick=()=>dialog.close();
 $('#projectForm').onsubmit=e=>{e.preventDefault();if(state!==originalState){$('#projectError').textContent='تغيرت البيانات. أغلق النافذة وافتحها مجددًا.';return}
  const f=e.target.elements,name=f.projectName.value.trim();if(!name)return;
  state.projects??=[];
  const target=project?state.projects.find(p=>p.id===project.id):null;
  if(project&&!target){$('#projectError').textContent='المشروع لم يعد موجودًا.';return}
  const next={id:project?.id||uid(),name,description:f.description.value.trim()};
  if(target)Object.assign(target,next);else state.projects.push(next);
  selectedProject=next.id;save();dialog.close();render();
 };
 dialog.showModal();
}
function deleteProject(project){
 if(!confirm('حذف المشروع وإلغاء ربط مهامه؟ ستبقى المهام ونتائجها محفوظة.'))return;
 state.projects=(state.projects||[]).filter(p=>p.id!==project.id);
 const lists=[state.taskInbox||[],state.repeat||[],...[...Object.values(state.days||{}),...Object.values(state.sunsetDays||{})].flatMap(d=>[d.tasks||[],d.repeatSnapshot||[]])];
 for(const list of lists)for(const t of list)if(t.projectId===project.id)delete t.projectId;
 selectedProject='';save();render();
}

function removeProjectAndItsTasks(snapshot,projectId){
 const next=structuredClone(snapshot);
 if(!(next.projects||[]).some(p=>p.id===projectId))throw Error('لم يعد المشروع موجودًا.');
 const days=[...Object.values(next.days||{}),...Object.values(next.sunsetDays||{})];
 const collections=[next.taskInbox||[],next.repeat||[],...days.flatMap(d=>[d.tasks||[],d.repeatSnapshot||[]])];
 const ids=new Set();let expanded=true;
 while(expanded){
  expanded=false;
  for(const list of collections)for(const task of list){
   if(!ids.has(task.id)&&(task.projectId===projectId||ids.has(task.parentId)||ids.has(task.detachedFrom))){ids.add(task.id);expanded=true}
  }
 }
 const keep=list=>list.filter(t=>!ids.has(t.id));
 next.taskInbox=keep(next.taskInbox||[]);
 next.repeat=keep(next.repeat||[]);
 next.projects=next.projects.filter(p=>p.id!==projectId);
 for(const p of next.projects)if(p.taskOrder)p.taskOrder=p.taskOrder.filter(key=>{try{return !ids.has(JSON.parse(key)[0])}catch{return true}});
 for(const d of days){
  if(Array.isArray(d.tasks))d.tasks=keep(d.tasks);
  if(Array.isArray(d.repeatSnapshot))d.repeatSnapshot=keep(d.repeatSnapshot);
  for(const field of ['done','failed','taskProgress','excludedRepeat'])if(d[field])for(const id of ids)delete d[field][id];
  for(const [slot,owner] of Object.entries(d.taskSlotOwners||{}))if(ids.has(owner)){
   if(d.planned?.[slot]===d.taskSlotValues?.[slot])delete d.planned[slot];
   if(d.plannedNotes?.[slot]===d.taskSlotNotes?.[slot])delete d.plannedNotes[slot];
   delete d.taskSlotOwners[slot];if(d.taskSlotValues)delete d.taskSlotValues[slot];if(d.taskSlotNotes)delete d.taskSlotNotes[slot];
  }
  // Keep actual recorded actions in slots, but remove deleted task labels.
  for(const [slot,task] of Object.entries(d.actualTasks||{}))if(ids.has(task?.id))delete d.actualTasks[slot];
 }
 validatePlanning(next);
 return {state:next,deletedTasks:ids.size};
}
function deleteProjectWithTasks(project){
 const result=removeProjectAndItsTasks(state,project.id);
 if(!confirm('هل تريد حذف مشروع «'+project.name+'» نهائيًا مع جميع مهامه الرئيسية والفرعية والمتكررة وسجلات إنجازها ('+result.deletedTasks+' مهمة)؟ لا يتأثر أي مشروع آخر. لا يمكن التراجع؛ يُنصح بتنزيل نسخة احتياطية أولًا.'))return false;
 state=result.state;selectedProject='';save();render();toast('حُذف المشروع وجميع مهامه المرتبطة');
 return true;
}

function openProjectTaskLink(project){
 let dialog=$('#projectTaskLink');if(!dialog){dialog=document.createElement('dialog');dialog.id='projectTaskLink';document.body.append(dialog)}
 const originalState=state,entries=taskEntries().filter(t=>!t.parentId&&!t.recurrent&&t.projectId!==project.id),series=state.repeat.filter(t=>t.projectId!==project.id);
 const options=[...entries.map(t=>({task:t,series:false})),...series.map(t=>({task:t,series:true}))];
 dialog.innerHTML=`<div class="dialog-head"><h2 id="projectLinkTitle">ربط مهمة موجودة</h2><button type="button" data-close-link aria-label="إغلاق">×</button></div><p class="hint">اختر المهمة ثم احفظها لتأكيد ربطها بهذا المشروع.</p><label class="field">بحث<input type="search" id="projectLinkSearch" placeholder="اسم المهمة"></label><div class="project-link-list">${options.map(({task:t,series},i)=>`<button type="button" class="secondary" data-link-task="${i}"><strong>${esc(t.name)}</strong><small>${series?'↻ سلسلة متكررة':t.date||'تحتاج توزيعًا'}${projectName(t)?' · '+esc(projectName(t)):''}</small></button>`).join('')||'<p class="empty-note">لا توجد مهام أخرى. يمكنك إضافة مهمة جديدة للمشروع.</p>'}</div>`;
 dialog.setAttribute('aria-labelledby','projectLinkTitle');
 dialog.querySelector('[data-close-link]').onclick=()=>dialog.close();
 $('#projectLinkSearch').oninput=e=>dialog.querySelectorAll('[data-link-task]').forEach(b=>b.hidden=!options[+b.dataset.linkTask].task.name.includes(e.target.value.trim()));
 dialog.querySelectorAll('[data-link-task]').forEach(b=>b.onclick=()=>{
  if(state!==originalState)return;
  const {task,series}=options[+b.dataset.linkTask];dialog.close();
  const draft={...task,projectId:project.id};
  if(series){view='repeat';render();renderRepeat(draft)}else openPlannerEditor(draft);
 });dialog.showModal();
}

function importProjectPackage(data){
 if(!data||data.format!=='wkt-project-v1'||data.version!==1||!data.project||!Array.isArray(data.tasks)||!data.tasks.length||data.tasks.length>1000)throw Error('هذا ليس ملف مشروع wkt مدعومًا.');
 const p=data.project;
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100||p.description!==undefined&&(typeof p.description!=='string'||p.description.length>1000))throw Error('اسم المشروع أو وصفه غير صالح.');
 const ids=new Map(),tasks=[],roots=[],projectId=uid();
 for(const t of data.tasks){
  if(!t||typeof t.id!=='string'||!t.id||t.id.length>120||ids.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>150||t.description!==undefined&&(typeof t.description!=='string'||t.description.length>500))throw Error('يوجد اسم مهمة أو وصف أو معرف غير صالح في الملف.');
  if(t.parentId!==undefined&&(typeof t.parentId!=='string'||!ids.has(t.parentId)))throw Error('المهام الفرعية يجب أن تأتي بعد مهامها الرئيسية.');
  if(t.priority!==undefined&&(!Number.isInteger(t.priority)||t.priority<1||t.priority>5))throw Error('أولوية غير صالحة.');
  if(t.expectedSlots!==undefined&&(!Number.isInteger(t.expectedSlots)||t.expectedSlots<0||t.expectedSlots>96))throw Error('عدد خانات غير صالح.');
  if(t.showInMonthlyCalendar!==undefined&&typeof t.showInMonthlyCalendar!=='boolean')throw Error('خيار التقويم غير صالح.');
  const newId=uid(),parent=t.parentId?ids.get(t.parentId):null;
  const item={id:newId,name:t.name.trim(),description:t.description||'',projectId,priority:t.priority??3,expectedSlots:t.expectedSlots??0,completedSlotCount:0,showInMonthlyCalendar:t.showInMonthlyCalendar!==false,prayers:[]};
  if(parent){item.parentId=parent.id;item.parentDate='';item.parentName=parent.name;}else roots.push(item);
  ids.set(t.id,item);tasks.push(item);
 }
 if(!roots.length)throw Error('الملف بلا مهام رئيسية.');
 const project={id:projectId,name:p.name.trim(),description:p.description||'',taskOrder:roots.map(t=>taskIdentity(t))};
 const candidate={...state,projects:[...(state.projects||[]),project],taskInbox:[...(state.taskInbox||[]),...tasks]};
 validatePlanning(candidate);
 // Validate everything before changing the current snapshot.
 state.projects=candidate.projects;state.taskInbox=candidate.taskInbox;
 selectedProject=project.id;view='projects';save();render();toast('تمت إضافة المشروع مع '+roots.length+' مهمة رئيسية و'+(tasks.length-roots.length)+' فرعية');
 return project;
}
function renderProjects(){
 const projects=state.projects||[],project=projects.find(p=>p.id===selectedProject);
 app.innerHTML=`<div class="top"><div><h1>المشاريع</h1><p>اجمع المهام المرتبطة بهدف واحد، وتابع إنجازها.</p></div><div class="planner-toolbar"><button class="primary" id="newProject">＋ مشروع جديد</button><label class="secondary project-import-label">↑ استيراد مشروع<input type="file" id="projectImport" accept=".json,application/json" hidden></label></div></div><div class="project-layout"><section class="panel"><h2>مشاريعي (${projects.length})</h2><div class="project-list">${projects.map(p=>{const list=taskGroups(projectTasks(p.id)),done=list.filter(t=>taskCompletion(t)===100).length;return `<button class="secondary ${p.id===selectedProject?'chosen':''}" data-project="${esc(p.id)}" aria-pressed="${p.id===selectedProject}"><strong>${esc(p.name)}</strong><small>${percentLabel(projectCompletion(p.id))} إنجاز · ${done} / ${list.length} مهام مكتملة</small></button>`}).join('')||'<p class="empty-note">أضف أول مشروع، ثم اربط به مهامك.</p>'}</div></section><section class="panel" id="projectDetails"></section></div>`;
 $('#newProject').onclick=()=>openProjectEditor();
 $('#projectImport').onchange=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{
   if(file.size>1000000)throw Error('ملف المشروع أكبر من الحد المسموح (1 ميجابايت).');
   const data=JSON.parse(await file.text());
   if(state.projects?.some(p=>p.name===data?.project?.name)&&!confirm('هناك مشروع بهذا الاسم؛ هل تريد إضافة نسخة جديدة مستقلة؟'))return;
   importProjectPackage(data);
  }catch(err){toast(err instanceof SyntaxError?'ملف JSON غير صالح':err.message||'تعذر استيراد المشروع');}
 };
 app.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>{selectedProject=b.dataset.project;render()});
 const details=$('#projectDetails');
 if(!project){details.innerHTML='<p class="empty-note">اختر مشروعًا لعرض مهامه أو أنشئ مشروعًا جديدًا.</p>';return}
 const list=orderedProjectTasks(project.id),done=list.filter(t=>taskCompletion(t)===100).length;
 details.innerHTML=`<div class="panel-title"><h2>${esc(project.name)}</h2><button class="secondary" id="editProject">تعديل المشروع</button></div>${project.description?`<p class="project-description">${esc(project.description)}</p>`:''}<p>${done} مكتملة · ${list.filter(t=>outcome(t)==='failed').length} لم تُفعل · ${list.filter(t=>outcome(t)==='pending').length} بانتظار التسجيل</p><p class="project-completion">إنجاز المشروع: <strong>${percentLabel(projectCompletion(project.id))}</strong></p><progress value="${projectCompletion(project.id)}" max="100" aria-label="إنجاز مهام المشروع"></progress><p class="hint">كل مهمة نهائية لها وزن متساوٍ؛ المهمة ذات الفروع تُحسب من فروعها دون احتسابها مرتين.</p><div class="planner-toolbar"><button class="primary" id="newProjectTask">＋ مهمة للمشروع</button><button class="secondary" id="linkProjectTask">ربط مهمة موجودة</button><button class="secondary" id="deleteProject">حذف المشروع فقط (الاحتفاظ بالمهام)</button><button class="danger" id="deleteProjectWithTasks">حذف المشروع وجميع مهامه</button></div><p class="hint">تُعرض المهام الموزعة وغير الموزعة والنسخ المسجلة من المهام المتكررة، مع نسخ اليوم المختار (${date}). اكتب رقم الموضع في خانة الترتيب لنقل المهمة الرئيسية مع فروعها؛ تبدأ الأرقام من 1. يُحفظ الترتيب لهذا المشروع. يمكن تغيير المشروع أو إلغاء الربط من تعديل المهمة.</p>${list.map(t=>taskCard(t)).join('')||'<p class="empty-note">لا توجد مهام مرتبطة بهذا المشروع بعد.</p>'}`;
 $('#editProject').onclick=()=>openProjectEditor(project);$('#deleteProject').onclick=()=>deleteProject(project);$('#deleteProjectWithTasks').onclick=()=>deleteProjectWithTasks(project);
 $('#newProjectTask').onclick=()=>openPlannerEditor(null,null,project.id);$('#linkProjectTask').onclick=()=>openProjectTaskLink(project);bindTaskCards(details);bindProjectTaskOrder(details,project,list);
}
