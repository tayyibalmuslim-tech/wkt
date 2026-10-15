/* Unified daily, backlog, future, inbox, monthly and weekly planning. */
let plannerTab='day',plannerQuery='',plannerPriority='all',plannerStatus='all',plannerMonth='',plannerWeek='';
function dashboardTasks(){return allTasksOn(date)}
function taskStatus(t){return outcome(t)}
function taskCard(t,path=new Set()){
 const key=taskIdentity(t);if(path.has(key))return '';path=new Set(path);path.add(key);
 if(t.virtual)return `<section class="task-family"><h3>${esc(t.name)}</h3><p class="hint">المهمة الرئيسية حُذفت؛ فروعها محفوظة هنا.</p>${childTasks(t).map(c=>taskCard(c,path)).join('')}</section>`;
 const status=outcome(t),count=t.date?completedSlots(t):0,expected=t.expectedSlots||0;
 const children=childTasks(t),action=state.actions.find(a=>a.id===t.actionId);
 const doneChildren=children.filter(x=>outcome(x)==='done').length;
 return `<article class="planner-task ${status}" data-task-id="${esc(t.id)}" data-task-date="${t.date||''}"><div class="planner-task-heading"><strong>${esc(t.name)}</strong>${taskDescription(t)}<span class="priority p${taskPriority(t)}">${taskPriority(t)}</span></div>
 <p class="task-meta">${t.date?`${t.date} · ${taskPeriodLabel(t)} · `:'تحتاج توزيعًا · '}${t.recurrent?'↻ متكررة · ':''}${{pending:'لم تُسجل نتيجتها',done:'فعلتها',failed:'لم أفعلها'}[status]}${action?' · الفعل: '+esc(action.name):t.actionId?' · الفعل المرتبط محذوف':''}</p>
 ${projectName(t)?`<p class="task-meta">المشروع: ${esc(projectName(t))}</p>`:''}
 ${t.parentId?`<p class="task-parent">↳ ${esc(parentName(t))}</p>`:''}
 <p class="task-completion">الإنجاز: <strong>${percentLabel(taskCompletion(t))}</strong>${taskProgressBar(t)}</p><div class="task-effort">${t.date?`<label>الخانات المنجزة <input data-progress type="number" min="0" max="9999" step="1" value="${count}" aria-label="الخانات المنجزة: ${esc(t.name)}"></label>`:'<span>التقدير</span>'}<strong> / ${expected} خانة مستهدفة</strong><span class="hint">${expected*15} دقيقة مخططة${count>expected?' · تجاوزت المستهدف':''}</span></div>

 <div class="task-controls"><button data-outcome="done" class="secondary ${status==='done'?'selected-outcome':''}" aria-pressed="${status==='done'}">✓ فعلتها</button><button data-outcome="failed" class="secondary ${status==='failed'?'selected-outcome':''}" aria-pressed="${status==='failed'}">✕ لم أفعلها</button><button data-task-edit class="secondary">${t.date?'تعديل / توزيع':'توزيع المهمة'}</button><button data-task-child class="secondary">＋ فرعية</button><button data-task-delete class="danger">حذف</button></div> ${children.length?`<details class="task-children"><summary>${children.length} مهام فرعية · ${doneChildren} مكتملة</summary>${children.map(c=>taskCard(c,path)).join('')}</details>`:''} </article>`;
}
function compactTaskCard(t){
 const status=outcome(t),count=completedSlots(t),expected=t.expectedSlots||0;
 const action=state.actions.find(a=>a.id===t.actionId),children=childTasks(t);
 const info=[`<span class="priority p${taskPriority(t)}">${taskPriority(t)}</span>`];
 info.push(`<span>${taskPeriodLabel(t)}</span><span class="task-completion">${percentLabel(taskCompletion(t))}${taskProgressBar(t)}</span>`);
 if(expected>0)info.push(`<label class="daily-task-progress" title="الخانات المنجزة من ${expected} خانة مستهدفة · ${expected*15} دقيقة مخططة"><input data-progress type="number" min="0" max="9999" step="1" inputmode="numeric" value="${count}" aria-label="الخانات المنجزة: ${esc(t.name)}"><span dir="ltr">/ ${expected}</span><span>خانة</span></label>`);
 if(projectName(t))info.push(`<span>▣ ${esc(projectName(t))}</span>`);
 if(action)info.push(`<span>${esc(action.name)}</span>`);
 if(t.recurrent)info.push('<span>↻ متكررة</span>');
 if(t.parentId)info.push(`<span>↳ ${esc(parentName(t))}</span>`);
 if(children.length)info.push(`<span>${children.filter(c=>outcome(c)==='done').length}/${children.length} فرعية مكتملة</span>`);
 if(t.startSlot!=null)info.push(`<span>◷ ${time(t.startSlot)}</span>`);
 return `<article class="daily-task ${status}" data-task-id="${esc(t.id)}" data-task-date="${t.date}"><div class="daily-task-content"><div class="daily-task-title"><strong class="daily-task-name">${esc(t.name)}</strong>${taskDescription(t)}</div><div class="daily-task-info">${info.join('')}</div></div><div class="daily-task-controls"><button data-outcome="done" class="status-button ${status==='done'?'yes':''}" aria-label="فعلتها: ${esc(t.name)}" title="فعلتها" aria-pressed="${status==='done'}">✓</button><button data-outcome="failed" class="status-button ${status==='failed'?'no':''}" aria-label="لم أفعلها: ${esc(t.name)}" title="لم أفعلها" aria-pressed="${status==='failed'}">✕</button><button data-task-edit class="secondary" aria-label="تعديل: ${esc(t.name)}">تعديل</button></div></article>`;
}
function compactTaskGroup(t,path=new Set()){
 const key=taskIdentity(t);if(path.has(key))return '';path=new Set(path);path.add(key);
 const children=childTasks(t),card=t.virtual?`<section class="task-family"><h3>${esc(t.name)}</h3>${children.map(c=>compactTaskGroup(c,path)).join('')}</section>`:compactTaskCard(t);
 if(t.virtual)return card;
 return children.length?card.replace('</article>',`<details class="task-children"><summary>${children.length} مهام فرعية</summary>${children.map(c=>compactTaskGroup(c,path)).join('')}</details></article>`):card;
}
function bindTaskCards(root=app,insideManager=false){root.querySelectorAll('[data-task-id]').forEach(card=>{
 const own=selector=>[...card.querySelectorAll(selector)].filter(el=>el.closest('[data-task-id]')===card);
 const get=()=>findTask(card.dataset.taskId,card.dataset.taskDate);
 own('[data-outcome]').forEach(b=>b.onclick=()=>{const t=get();if(!t)return;if(t.date)setTaskOutcome(taskDay(t.date),t.id,b.dataset.outcome);else setInboxOutcome(t,b.dataset.outcome);save();render();if(insideManager)openTaskManager(t)});
 const progress=own('[data-progress]')[0];if(progress){progress.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();progress.blur()}};progress.onchange=()=>{const t=get(),n=+progress.value;if(!t)return;if(!Number.isInteger(n)||n<0||n>9999||progress.value===''){progress.value=completedSlots(t);toast('أدخل عددًا صحيحًا بين ٠ و٩٩٩٩');return}if(t.date)(taskDay(t.date).taskProgress??={})[t.id]=n;else t.completedSlotCount=n;save();render();if(insideManager)openTaskManager(t)};}
 own('[data-task-edit]')[0].onclick=()=>{const t=get();if(insideManager||!t.parentId)openPlannerEditor(t);else openTaskManager(t)};
 if(own('[data-task-child]')[0])own('[data-task-child]')[0].onclick=()=>{const t=get();if(t.parentId&&!insideManager)openTaskManager(t);else openPlannerEditor(null,t)};
 if(own('[data-task-delete]')[0])own('[data-task-delete]')[0].onclick=()=>{const t=get();if(t){if(t.parentId&&!insideManager)openTaskManager(t);else{const parent=parentTask(t);if(deletePlannedTask(t)&&insideManager&&parent)openPlannerEditor(parent)}}};
 })}
function sortedTasks(list){return [...list].sort((a,b)=>taskPriority(a)-taskPriority(b)||a.name.localeCompare(b.name,'ar'))}
function filteredTasks(list){return sortedTasks(list.filter(t=>(!plannerQuery||(t.name+' '+(t.description||'')).toLocaleLowerCase().includes(plannerQuery.trim().toLocaleLowerCase()))&&(plannerPriority==='all'||String(taskPriority(t))===plannerPriority)&&(plannerStatus==='all'||outcome(t)===plannerStatus)))}
function daySummary(key){const tasks=taskGroups(allTasksOn(key)),d=state.sunsetDays[key]||emptyDay();return {total:tasks.length,done:tasks.filter(t=>taskCompletion(t)===100).length,checks:prayerOrder.reduce((n,p)=>n+checks.filter((_,i)=>d.checks[p+'-'+i]).length,0)}}
function dateControls(){return `<div class="date"><button data-planner-shift="-1" aria-label="اليوم السابق">→</button><input type="date" id="plannerDate" value="${date}" aria-label="اليوم المختار"><button data-planner-shift="1" aria-label="اليوم التالي">←</button><button id="plannerToday">اليوم</button></div>`}
// Project selection belongs to each backlog view and survives outcome edits.
const plannerProjectTabs={inbox:'',missed:''};
function groupedPlannerTasks(list){
 const projects=state.projects||[],byProject=new Map(projects.map(p=>[p.id,[]])),unassigned=[];
 for(const t of list){const ids=effectiveProjectIds(t).filter(id=>byProject.has(id));if(!ids.length)unassigned.push(t);else ids.forEach(id=>byProject.get(id).push(t))}
 const available=projects.filter(p=>byProject.get(p.id).length);
 if(!available.some(p=>p.id===plannerProjectTabs[plannerTab]))plannerProjectTabs[plannerTab]=available[0]?.id||'';
 const selected=plannerProjectTabs[plannerTab],cards=tasks=>taskGroups(tasks).map(t=>taskCard(t)).join('');
 return `<section class="planner-task-section" data-planner-section="projects"><h2>مهام المشاريع</h2>${available.length?`<div class="planner-tabs" role="group" aria-label="مشاريع المهام">${available.map(p=>`<button type="button" class="secondary ${p.id===selected?'chosen':''}" data-planner-project="${esc(p.id)}" aria-pressed="${p.id===selected}">${esc(p.name)} (${taskGroups(byProject.get(p.id)).length})</button>`).join('')}</div><div class="planner-project-tasks">${cards(byProject.get(selected))}</div>`:'<p class="empty-note">لا توجد مهام تابعة لمشاريع تطابق التصفية.</p>'}</section>
 <section class="planner-task-section" data-planner-section="unassigned"><h2>مهام بدون مشروع (${taskGroups(unassigned).length})</h2>${cards(unassigned)||'<p class="empty-note">لا توجد مهام بدون مشروع تطابق التصفية.</p>'}</section>`;
}
function renderDashboard(){
 const all=allTasksOn(date),done=taskGroups(all).filter(t=>taskCompletion(t)===100).length,pending=all.filter(t=>outcome(t)==='pending').length;
 const entries=taskEntries(),today=activeDay(),missed=entries.filter(t=>t.date&&t.date<today&&outcome(t)==='pending'),future=entries.filter(t=>t.date>today&&!t.recurrent),inbox=state.taskInbox||[];
 app.innerHTML=`<div class="top"><div><h1>لوحة المهام</h1><p>خطط حول صلاتك، وقس تقدمك بخانات الوقت.</p></div>${dateControls()}</div>
 <div class="hero"><div><h2>${hijriLabel(date)}</h2><p>${dayRangeLabel()}</p></div><div class="stats"><div class="stat"><strong>${done}/${taskGroups(all).length}</strong><span>مهام مكتملة</span></div><div class="stat"><strong>${pending}</strong><span>بانتظار التسجيل</span></div><div class="stat"><strong>${daySummary(date).checks}/25</strong><span>من مهام الصلوات</span></div></div></div>
 <div class="planner-toolbar"><button id="newPlannedTask" class="primary">＋ إضافة مهمة وتوزيعها</button><button id="plannerRepeats" class="secondary">↻ المهام المتكررة</button></div>
 <div class="planner-tabs" role="group" aria-label="عروض المهام">${[['day','اليوم'],['missed',`الفائتة (${taskGroups(missed).length})`],['future',`المستقبلية (${taskGroups(future).length})`],['inbox',`تحتاج توزيعًا (${taskGroups(inbox).length})`],['month','الشهر'],['week','الأسبوع']].map(([v,n])=>`<button class="secondary ${plannerTab===v?'chosen':''}" data-planner-tab="${v}" aria-pressed="${plannerTab===v}">${n}</button>`).join('')}</div>
 <div id="plannerContent"></div>`;
 $('#plannerDate').onchange=e=>{if(e.target.value){plannerTab='day';goDay(e.target.value,false)}};$('#plannerToday').onclick=()=>{plannerTab='day';goDay(activeDay(),true)};
 app.querySelectorAll('[data-planner-shift]').forEach(b=>b.onclick=()=>goDay(addDate(date,+b.dataset.plannerShift),false));
 $('#newPlannedTask').onclick=()=>openPlannerEditor();$('#plannerRepeats').onclick=()=>{view='repeat';render()};
 app.querySelectorAll('[data-planner-tab]').forEach(b=>b.onclick=()=>{plannerTab=b.dataset.plannerTab;render()});
 if(plannerTab==='month')renderTaskMonth();else if(plannerTab==='week')renderTaskWeek();else{
  const content=$('#plannerContent');
  content.innerHTML=`<section class="panel"><div class="dashboard-filters"><label class="field">بحث<input id="plannerSearch" type="search" value="${esc(plannerQuery)}" placeholder="اسم المهمة"></label><label class="field">الأولوية<select id="plannerPriority"><option value="all">كل الأولويات</option>${Object.entries(priorityNames).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label><label class="field">الحالة<select id="plannerStatus"><option value="all">كل الحالات</option><option value="pending">لم تُسجل</option><option value="done">فعلتها</option><option value="failed">لم أفعلها</option></select></label></div><p class="hint">${plannerTab==='missed'?'المهام في الأيام السابقة دون علامة فعلتها أو لم أفعلها، حتى لو سجلت بعض الخانات.':plannerTab==='future'?'المهام المستقلة والمستقلة عن التكرار في الأيام القادمة؛ لا تشمل السلاسل المتكررة.':plannerTab==='inbox'?'أفكارك السريعة هنا؛ وزع المهمة عندما تكون مستعدًا.':'كل فترة تعرض المهام وإجمالي المتاح والمشغول من الخانات.'}</p><div id="plannerResults"></div></section>`;
  $('#plannerPriority').value=plannerPriority;$('#plannerStatus').value=plannerStatus;
  const refresh=taskReadScope(()=>{const list=filteredTasks(plannerTab==='day'?all:plannerTab==='missed'?missed:plannerTab==='future'?future:inbox.map(t=>({...t,date:''})));
   $('#plannerResults').innerHTML=plannerTab==='day'?prayerOrder.map(p=>`<section class="planner-period"><div class="panel-title"><h2>${names[p]}</h2><button data-add-period="${p}" class="secondary">＋ مهمة</button></div><p class="capacity-note">${capacityText(date,p)}</p>${taskGroups(list.filter(t=>taskInPeriod(t,p))).map(t=>taskCard(t)).join('')||'<p class="empty-note">لا توجد مهام مطابقة في هذه الفترة.</p>'}<details><summary>قائمة صلاة ${names[p]} · ${checks.filter((_,i)=>taskDay(date).checks[p+'-'+i]).length}/5</summary><button class="secondary" data-open-prayer="${p}">عرض وتسجيل مهام الصلاة</button></details></section>`).join('')+(list.some(t=>!taskPeriods(t).length)?`<section class="planner-period"><h2>بدون فترة محددة</h2>${taskGroups(list.filter(t=>!taskPeriods(t).length)).map(t=>taskCard(t)).join('')}</section>`:''):['inbox','missed'].includes(plannerTab)?groupedPlannerTasks(list):taskGroups(list).map(t=>taskCard(t)).join('')||'<p class="empty-note">لا توجد مهام في هذه القائمة تطابق التصفية.</p>';
   app.querySelectorAll('[data-planner-project]').forEach(b=>b.onclick=()=>{plannerProjectTabs[plannerTab]=b.dataset.plannerProject;refresh()});
   bindTaskCards();app.querySelectorAll('[data-add-period]').forEach(b=>b.onclick=()=>{prayer=+b.dataset.addPeriod;openPlannerEditor()});app.querySelectorAll('[data-open-prayer]').forEach(b=>b.onclick=()=>{prayer=+b.dataset.openPrayer;openPrayer()});
  });
  $('#plannerSearch').oninput=e=>{plannerQuery=e.target.value;refresh()};$('#plannerPriority').onchange=e=>{plannerPriority=e.target.value;refresh()};$('#plannerStatus').onchange=e=>{plannerStatus=e.target.value;refresh()};refresh();
 }
}
function openPlannerDay(key){plannerTab='day';plannerQuery='';plannerPriority=plannerStatus='all';goDay(key,false)}
// Filters affect this calendar only; occurrence identity is always id + logical day.
const monthFilters={project:'all',category:'all',status:'all',priority:'all',period:'all',query:''};
let monthFiltersOpen=false,monthMenuCleanup=null;
function monthlyTasks(key,entries=progressEntries()){
 const unique=new Map(allTasksOn(key).map(t=>[taskIdentity(t),t]));
 const periodRank=t=>Math.min(...taskPeriods(t).map(p=>prayerOrder.indexOf(p)),5);
 return [...unique.values()].filter(t=>{
  const action=state.actions.find(a=>a.id===t.actionId);
  return t.showInMonthlyCalendar!==false&&
   (monthFilters.project==='all'||effectiveProjectIds(t,entries).includes(monthFilters.project))&&
   (monthFilters.category==='all'||ActionCategories.category(state,action)?.id===monthFilters.category)&&
   (monthFilters.status==='all'||outcome(t)===monthFilters.status)&&
   (monthFilters.priority==='all'||String(taskPriority(t))===monthFilters.priority)&&
   (monthFilters.period==='all'||taskInPeriod(t,+monthFilters.period))&&
   (!monthFilters.query.trim()||t.name.toLocaleLowerCase().includes(monthFilters.query.trim().toLocaleLowerCase()));
 }).sort((a,b)=>periodRank(a)-periodRank(b)||taskPriority(a)-taskPriority(b)||a.name.localeCompare(b.name,'ar'));
}
function monthlySummary(tasks){
 const done=tasks.filter(t=>outcome(t)==='done').length,failed=tasks.filter(t=>outcome(t)==='failed').length;
 return {total:tasks.length,done,failed,pending:tasks.length-done-failed,percent:done+failed?done/(done+failed)*100:null};
}
function closeMonthTaskMenu(){monthMenuCleanup?.();monthMenuCleanup=null}
function openMonthTaskMenu(anchor){
 closeMonthTaskMenu();
 const captured=state,id=anchor.dataset.monthTask,key=anchor.dataset.monthDate,t=findTask(id,key);
 if(!t)return;
 const menu=document.createElement('div');menu.id='monthTaskMenu';menu.className='month-task-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-label','إجراءات المهمة: '+t.name);
 const status=outcome(t);
 menu.innerHTML=`<button type="button" data-month-outcome="done" aria-pressed="${status==='done'}">✓ صح</button><button type="button" data-month-outcome="failed" aria-pressed="${status==='failed'}">✕ غلط</button><button type="button" data-month-edit>✎ تعديل</button>`;
 document.body.append(menu);anchor.setAttribute('aria-expanded','true');
 const position=()=>{
  const r=anchor.getBoundingClientRect(),m=menu.getBoundingClientRect(),v=window.visualViewport;
  const left=v?.offsetLeft||0,top=v?.offsetTop||0,width=v?.width||window.innerWidth,height=v?.height||window.innerHeight;
  menu.style.left=Math.max(left+8,Math.min(r.right-m.width,left+width-m.width-8))+'px';
  menu.style.top=Math.max(top+8,Math.min(r.bottom+6+m.height<=top+height-8?r.bottom+6:r.top-m.height-6,top+height-m.height-8))+'px';
 };
 const outside=e=>{if(!menu.contains(e.target)&&!anchor.contains(e.target))closeMonthTaskMenu()};
 const keyboard=e=>{
  if(e.key==='Escape'){e.preventDefault();closeMonthTaskMenu();anchor.focus()}
  if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(e.key)){
   e.preventDefault();const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
   buttons[(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:2))%3].focus();
  }
 };
 const focus=e=>{if(!menu.contains(e.target)&&e.target!==anchor)closeMonthTaskMenu()};
 monthMenuCleanup=()=>{menu.remove();anchor.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard);document.removeEventListener('focusin',focus);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position)};
 document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard);document.addEventListener('focusin',focus);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
 menu.querySelectorAll('[data-month-outcome]').forEach(b=>b.onclick=()=>{
  if(state!==captured){closeMonthTaskMenu();return}
  const current=findTask(id,key);if(!current){closeMonthTaskMenu();return}
  setTaskOutcome(taskDay(key),id,b.dataset.monthOutcome);closeMonthTaskMenu();save();render();
  [...app.querySelectorAll('[data-month-task]')].find(b=>b.dataset.monthTask===id&&b.dataset.monthDate===key)?.focus();
 });
 menu.querySelector('[data-month-edit]').onclick=()=>{closeMonthTaskMenu();if(state===captured)openTaskManager(findTask(id,key))};
 position();menu.querySelector('button').focus();
}
function renderTaskMonth(){
 closeMonthTaskMenu();
 plannerMonth||=date.slice(0,7);const first=plannerMonth+'-01',start=new Date(first+'T12:00:00'),offset=start.getDay(),last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate(),today=activeDay(),entries=progressEntries();
 const days=Array.from({length:last},(_,i)=>{const key=plannerMonth+'-'+String(i+1).padStart(2,'0');return {key,number:i+1,tasks:monthlyTasks(key,entries)}});
 const stats=monthlySummary(days.flatMap(d=>d.tasks));
 const select=(field,label,options)=>`<label class="field">${label}<select data-month-filter="${field}"><option value="all">الكل</option>${options.map(([value,name])=>`<option value="${esc(value)}" ${String(value)===monthFilters[field]?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
 const chip=t=>{
  const result=outcome(t),label={done:'فعلتها',failed:'لم أفعلها',pending:'لم تُسجل'}[result],parent=t.parentId?mainTask(t,entries):null,progress=percentLabel(taskCompletion(t,entries));
  return `<button type="button" class="month-task ${result}" data-month-task="${esc(t.id)}" data-month-date="${t.date}" title="${esc(t.name)}${t.description?' — '+esc(t.description):''}${parent?' — ضمن '+esc(parent.name):''} — ${label} — التقدم ${progress}" aria-haspopup="dialog" aria-expanded="false" aria-controls="monthTaskMenu" aria-label="${esc(t.name)}${parent?'، ضمن '+esc(parent.name):''}، ${label}، التقدم ${progress}"><span aria-hidden="true">${{done:'✓',failed:'✕',pending:'○'}[result]}</span><span class="month-task-text">${esc(t.name)}${taskDescription(t)}${parent?`<small>↳ ${esc(parent.name)}</small>`:''}</span></button>`;
 };
 $('#plannerContent').innerHTML=`<section class="panel monthly-panel"><div class="top"><h2>خطة الشهر</h2><div class="date"><button data-month-shift="-1" aria-label="الشهر السابق">→</button><input id="taskMonth" type="month" value="${plannerMonth}" aria-label="الشهر"><button data-month-shift="1" aria-label="الشهر التالي">←</button></div></div>
 <p class="hint">تقويم ميلادي بحسب تاريخ نهار اليوم الذي يبدأ من المغرب. اضغط التاريخ لتفاصيل اليوم، أو المهمة لتسجيل نتيجتها وتعديلها. ○ غير مسجلة · ✓ تمت · ✕ لم تتم. تفاصيل التقدم متاحة عند تمرير المؤشر أو فتح تعديل المهمة.</p>
 <details id="monthFilters" ${monthFiltersOpen?'open':''}><summary>البحث وتصفية التقويم</summary><div class="month-filters">
 ${select('project','المشروع',(state.projects||[]).map(p=>[p.id,p.name]))}
 ${select('category','القسم المرتبط بالفعل',state.categories.map(c=>[c.id,c.name]))}
 ${select('status','حالة المهمة',[['done','تمت'],['failed','لم تتم'],['pending','غير مسجلة']])}
 ${select('priority','الأولوية (1 الأعلى)',Object.entries(priorityNames))}
 ${select('period','فترة الصلاة',prayerOrder.map(p=>[String(p),names[p]]))}
 <label class="field">بحث باسم المهمة<input data-month-filter="query" type="search" value="${esc(monthFilters.query)}"></label></div></details>
 <div class="month-summary" role="status" aria-live="polite"><span>المعروضة: <b>${stats.total}</b></span><span>فعلتها: <b>${stats.done}</b></span><span>لم أفعلها: <b>${stats.failed}</b></span><span>غير مسجلة: <b>${stats.pending}</b></span><span>الإنجاز من النتائج المسجلة: <b>${stats.percent===null?'لا نتائج مسجلة':percentLabel(stats.percent)}</b></span></div>
 <p class="hint">الأعداد تخص المهام الظاهرة بعد التصفية وخيارات الظهور. نسبة النتائج = فعلتها ÷ (فعلتها + لم أفعلها). تقدم المشاريع العام لا يتأثر بالإخفاء أو التصفية. المهام المستقبلية غير المسجلة ليست فائتة.</p>
 <div class="task-month-scroll" tabindex="0" role="region" aria-label="التقويم الشهري، يمكن تمريره أفقيًا"><div class="task-month">${week.map(n=>`<div class="month-weekday">${n}</div>`).join('')}${Array.from({length:offset},()=>'<div aria-hidden="true"></div>').join('')}${days.map(({key,number,tasks})=>{
  const s=monthlySummary(tasks),d=state.sunsetDays[key],prayerChecks=prayerOrder.reduce((n,p)=>n+checks.filter((_,i)=>d?.checks?.[p+'-'+i]).length,0);
  return `<section class="month-day ${key===today?'is-today':''}" aria-label="يوم ${key}"><button type="button" data-calendar-day="${key}" class="month-day-heading" ${key===today?'aria-current="date"':''} aria-label="${key}: ${s.total} مهام ظاهرة، ${s.done} تمت"><strong>${number}</strong><span>${s.done}/${s.total} تمت</span></button>${key<=today?`<small class="month-prayer-checks">الصلاة ${prayerChecks}/25</small>`:''}<div class="month-tasks">${tasks.map(chip).join('')}</div></section>`;
 }).join('')}</div></div><p class="hint">السجل الموثوق للمهام المتكررة يبدأ من ${esc(state.taskHistoryStart||'تفعيل السجل')}. ما قبل ذلك يُعرض من البيانات المسجلة المتاحة فقط.</p></section>`;
 $('#taskMonth').onchange=e=>{if(e.target.value){plannerMonth=e.target.value;renderTaskMonth()}};
 app.querySelectorAll('[data-month-shift]').forEach(b=>b.onclick=()=>{const next=new Date(first+'T12:00:00');next.setMonth(next.getMonth()+ +b.dataset.monthShift);plannerMonth=localDate(next).slice(0,7);renderTaskMonth()});
 $('#monthFilters').ontoggle=e=>{if(e.target.isConnected)monthFiltersOpen=e.target.open};
 app.querySelectorAll('[data-month-filter]').forEach(input=>{
  const refresh=()=>{const field=input.dataset.monthFilter;monthFilters[field]=input.value;monthFiltersOpen=$('#monthFilters').open;const pos=input.selectionStart;renderTaskMonth();const replacement=app.querySelector(`[data-month-filter="${field}"]`);replacement.focus();if(field==='query'&&pos!==null)replacement.setSelectionRange(pos,pos)};
  if(input.type==='search')input.oninput=refresh;else input.onchange=refresh;
 });
 app.querySelectorAll('[data-calendar-day]').forEach(b=>b.onclick=()=>openPlannerDay(b.dataset.calendarDay));
 app.querySelectorAll('[data-month-task]').forEach(b=>b.onclick=()=>openMonthTaskMenu(b));
}
function weekChildLabels(t,key,p){return allTasksOn(key).filter(c=>c.parentId&&taskIdentity(mainTask(c))===taskIdentity(t)&&(p===null?!taskPeriods(c).length:taskInPeriod(c,p))).map(c=>`<small>↳ ${esc(c.name)}${c.description?' — '+esc(c.description):''} · ${percentLabel(taskCompletion(c))}</small>`).join('')}
function renderTaskWeek(){
 plannerWeek||=addDate(date,-new Date(date+'T12:00:00').getDay());
 const dates=Array.from({length:7},(_,i)=>addDate(plannerWeek,i));
 $('#plannerContent').innerHTML=`<section class="panel"><div class="top"><h2>التخطيط الأسبوعي</h2><div class="date"><button data-week-shift="-7">الأسبوع السابق</button><span>${dates[0]} — ${dates[6]}</span><button data-week-shift="7">الأسبوع التالي</button></div></div><div class="task-week">${dates.map(key=>`<section class="week-day"><button class="week-heading" data-calendar-day="${key}"><strong>${week[new Date(key+'T12:00:00').getDay()]}</strong><small>${key}</small></button>${prayerOrder.map(p=>{const list=taskGroups(allTasksOn(key).filter(t=>taskInPeriod(t,p))),c=capacity(key,p);return `<div class="week-period"><b>${names[p]}</b><small>${c.free} متاحة / ${c.total} · تقدير ${c.estimates}</small>${list.map(t=>`<button data-week-task="${esc(t.id)}" data-week-date="${t.date||''}" class="week-task"><i class="priority-dot p${taskPriority(t)}"></i>${esc(t.name)}${taskDescription(t)}${weekChildLabels(t,key,p)}<small>${completedSlots(t)}/${t.expectedSlots||0} خانة${t.recurrent?' ↻':''}</small></button>`).join('')}<button class="week-add" data-week-add="${key}" data-period="${p}" aria-label="إضافة مهمة يوم ${key} فترة ${names[p]}">＋</button></div>`}).join('')}${allTasksOn(key).some(t=>!taskPeriods(t).length)?`<div class="week-period"><b>بدون فترة محددة</b>${taskGroups(allTasksOn(key).filter(t=>!taskPeriods(t).length)).map(t=>`<button data-week-task="${esc(t.id)}" data-week-date="${t.date||''}" class="week-task">${esc(t.name)}${taskDescription(t)}${weekChildLabels(t,key,null)}</button>`).join('')}</div>`:''}</section>`).join('')}</div></section>`;
 app.querySelectorAll('[data-week-shift]').forEach(b=>b.onclick=()=>{plannerWeek=addDate(plannerWeek,+b.dataset.weekShift);renderTaskWeek()});app.querySelectorAll('[data-calendar-day]').forEach(b=>b.onclick=()=>openPlannerDay(b.dataset.calendarDay));
 app.querySelectorAll('[data-week-task]').forEach(b=>b.onclick=()=>openTaskManager(findTask(b.dataset.weekTask,b.dataset.weekDate)));
 app.querySelectorAll('[data-week-add]').forEach(b=>b.onclick=()=>{const original=date;date=b.dataset.weekAdd;prayer=+b.dataset.period;openPlannerEditor();date=original});
}
