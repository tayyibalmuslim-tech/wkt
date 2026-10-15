/* Projects live in the same snapshot as tasks, including account sync and backups. */
let selectedProject='';
function projectName(t){return (state.projects||[]).find(p=>p.id===effectiveProjectId(t))?.name||''}
function projectField(t){return `<label class="field">المشروع<select name="projectId"><option value="">بدون مشروع</option>${(state.projects||[]).map(p=>`<option value="${esc(p.id)}" ${p.id===effectiveProjectId(t)?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`}
function validateProjects(s){
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
 const entries=taskEntries();
 for(const t of allTasksOn(date))if(!entries.some(x=>x.id===t.id&&x.date===t.date))entries.push(t);
 return sortedTasks(entries.filter(t=>effectiveProjectId(t)===id));
}
// Order belongs to the project; it never changes task priority, dates or parent links.
function orderedProjectTasks(id){
 const list=taskGroups(projectTasks(id)),order=state.projects?.find(p=>p.id===id)?.taskOrder||[],ranks=new Map(order.map((key,i)=>[key,i]));
 return list.sort((a,b)=>(ranks.get(taskIdentity(a))??Infinity)-(ranks.get(taskIdentity(b))??Infinity));
}
function moveProjectTask(projectId,key,direction){
 const project=state.projects?.find(p=>p.id===projectId);if(!project||![-1,1].includes(direction))return;
 const keys=orderedProjectTasks(projectId).map(taskIdentity),index=keys.indexOf(key),next=index+direction;
 if(index<0||next<0||next>=keys.length)return;
 [keys[index],keys[next]]=[keys[next],keys[index]];
 // Keep saved ranks for recurring occurrences outside the currently selected day.
 const visible=new Set(keys);project.taskOrder=[...keys,...(project.taskOrder||[]).filter(k=>!visible.has(k))];
 save();render();
 const control=[...document.querySelectorAll('[data-project-order-key]')].find(b=>b.dataset.projectOrderKey===key&&+b.dataset.projectOrderMove===direction);
 if(control&&!control.disabled)control.focus();
 else [...document.querySelectorAll('[data-project-order-key]')].find(b=>b.dataset.projectOrderKey===key&&!b.disabled)?.focus();
}
function bindProjectTaskOrder(details,project,list){
 const cards=[...details.children].filter(el=>el.matches('.planner-task,.task-family'));
 cards.forEach((card,index)=>{
  const t=list[index];if(!t)return;
  const controls=document.createElement('span');controls.className='project-task-order';controls.setAttribute('role','group');controls.setAttribute('aria-label','ترتيب '+t.name);
  controls.innerHTML=`<button type="button" class="secondary" data-project-order-move="-1" aria-label="تحريك ${esc(t.name)} لأعلى" title="تحريك لأعلى" ${index===0?'disabled':''}>↑</button><button type="button" class="secondary" data-project-order-move="1" aria-label="تحريك ${esc(t.name)} لأسفل" title="تحريك لأسفل" ${index===list.length-1?'disabled':''}>↓</button>`;
  controls.querySelectorAll('button').forEach(b=>{b.dataset.projectOrderKey=taskIdentity(t);b.onclick=()=>moveProjectTask(project.id,b.dataset.projectOrderKey,+b.dataset.projectOrderMove)});
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
function renderProjects(){
 const projects=state.projects||[],project=projects.find(p=>p.id===selectedProject);
 app.innerHTML=`<div class="top"><div><h1>المشاريع</h1><p>اجمع المهام المرتبطة بهدف واحد، وتابع إنجازها.</p></div><button class="primary" id="newProject">＋ مشروع جديد</button></div><div class="project-layout"><section class="panel"><h2>مشاريعي (${projects.length})</h2><div class="project-list">${projects.map(p=>{const list=taskGroups(projectTasks(p.id)),done=list.filter(t=>taskCompletion(t)===100).length;return `<button class="secondary ${p.id===selectedProject?'chosen':''}" data-project="${esc(p.id)}" aria-pressed="${p.id===selectedProject}"><strong>${esc(p.name)}</strong><small>${percentLabel(projectCompletion(p.id))} إنجاز · ${done} / ${list.length} مهام مكتملة</small></button>`}).join('')||'<p class="empty-note">أضف أول مشروع، ثم اربط به مهامك.</p>'}</div></section><section class="panel" id="projectDetails"></section></div>`;
 $('#newProject').onclick=()=>openProjectEditor();
 app.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>{selectedProject=b.dataset.project;render()});
 const details=$('#projectDetails');
 if(!project){details.innerHTML='<p class="empty-note">اختر مشروعًا لعرض مهامه أو أنشئ مشروعًا جديدًا.</p>';return}
 const list=orderedProjectTasks(project.id),done=list.filter(t=>taskCompletion(t)===100).length;
 details.innerHTML=`<div class="panel-title"><h2>${esc(project.name)}</h2><button class="secondary" id="editProject">تعديل المشروع</button></div>${project.description?`<p class="project-description">${esc(project.description)}</p>`:''}<p>${done} مكتملة · ${list.filter(t=>outcome(t)==='failed').length} لم تُفعل · ${list.filter(t=>outcome(t)==='pending').length} بانتظار التسجيل</p><p class="project-completion">إنجاز المشروع: <strong>${percentLabel(projectCompletion(project.id))}</strong></p><progress value="${projectCompletion(project.id)}" max="100" aria-label="إنجاز مهام المشروع"></progress><p class="hint">كل مهمة نهائية لها وزن متساوٍ؛ المهمة ذات الفروع تُحسب من فروعها دون احتسابها مرتين.</p><div class="planner-toolbar"><button class="primary" id="newProjectTask">＋ مهمة للمشروع</button><button class="secondary" id="linkProjectTask">ربط مهمة موجودة</button><button class="danger" id="deleteProject">حذف المشروع</button></div><p class="hint">تُعرض المهام الموزعة وغير الموزعة والنسخ المسجلة من المهام المتكررة، مع نسخ اليوم المختار (${date}). استخدم ↑ و↓ لترتيب المهام الرئيسية مع فروعها. يُحفظ الترتيب لهذا المشروع. يمكن تغيير المشروع أو إلغاء الربط من تعديل المهمة.</p>${list.map(t=>taskCard(t)).join('')||'<p class="empty-note">لا توجد مهام مرتبطة بهذا المشروع بعد.</p>'}`;
 $('#editProject').onclick=()=>openProjectEditor(project);$('#deleteProject').onclick=()=>deleteProject(project);
 $('#newProjectTask').onclick=()=>openPlannerEditor(null,null,project.id);$('#linkProjectTask').onclick=()=>openProjectTaskLink(project);bindTaskCards(details);bindProjectTaskOrder(details,project,list);
}
