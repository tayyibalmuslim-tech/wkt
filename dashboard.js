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
 return `<article class="planner-task ${status}" data-task-id="${esc(t.id)}" data-task-date="${t.date||''}"><div class="planner-task-heading"><strong>${esc(t.name)}</strong><span class="priority p${taskPriority(t)}">${taskPriority(t)}</span></div>
 <p class="task-meta">${t.date?`${t.date} · ${taskPeriodLabel(t)} · `:'تحتاج توزيعًا · '}${t.recurrent?'↻ متكررة · ':''}${{pending:'لم تُسجل نتيجتها',done:'فعلتها',failed:'لم أفعلها'}[status]}${action?' · الفعل: '+esc(action.name):t.actionId?' · الفعل المرتبط محذوف':''}</p>
 ${projectName(t)?`<p class="task-meta">المشروع: ${esc(projectName(t))}</p>`:''}
 ${t.parentId?`<p class="task-parent">↳ ${esc(parentName(t))}</p>`:''}
 <p class="task-completion">الإنجاز: <strong>${percentLabel(taskCompletion(t))}</strong>${taskProgressBar(t)}</p><div class="task-effort">${t.date?`<label>الخانات المنجزة <input data-progress type="number" min="0" max="9999" step="1" value="${count}" aria-label="الخانات المنجزة: ${esc(t.name)}"></label>`:'<span>التقدير</span>'}<strong> / ${expected} خانة مستهدفة</strong><span class="hint">${expected*15} دقيقة مخططة${count>expected?' · تجاوزت المستهدف':''}</span></div>
 ${expected?`<progress value="${Math.min(count,expected)}" max="${expected}" aria-label="تقدم الخانات"></progress>`:''}

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
 return `<article class="daily-task ${status}" data-task-id="${esc(t.id)}" data-task-date="${t.date}"><div class="daily-task-content"><strong class="daily-task-name">${esc(t.name)}</strong><div class="daily-task-info">${info.join('')}</div></div><div class="daily-task-controls"><button data-outcome="done" class="status-button ${status==='done'?'yes':''}" aria-label="فعلتها: ${esc(t.name)}" title="فعلتها" aria-pressed="${status==='done'}">✓</button><button data-outcome="failed" class="status-button ${status==='failed'?'no':''}" aria-label="لم أفعلها: ${esc(t.name)}" title="لم أفعلها" aria-pressed="${status==='failed'}">✕</button><button data-task-edit class="secondary" aria-label="تعديل: ${esc(t.name)}">تعديل</button></div></article>`;
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
function filteredTasks(list){return sortedTasks(list.filter(t=>(!plannerQuery||t.name.toLocaleLowerCase().includes(plannerQuery.trim().toLocaleLowerCase()))&&(plannerPriority==='all'||String(taskPriority(t))===plannerPriority)&&(plannerStatus==='all'||outcome(t)===plannerStatus)))}
function daySummary(key){const tasks=taskGroups(allTasksOn(key)),d=state.sunsetDays[key]||emptyDay();return {total:tasks.length,done:tasks.filter(t=>taskCompletion(t)===100).length,checks:prayerOrder.reduce((n,p)=>n+checks.filter((_,i)=>d.checks[p+'-'+i]).length,0)}}
function dateControls(){return `<div class="date"><button data-planner-shift="-1" aria-label="اليوم السابق">→</button><input type="date" id="plannerDate" value="${date}" aria-label="اليوم المختار"><button data-planner-shift="1" aria-label="اليوم التالي">←</button><button id="plannerToday">اليوم</button></div>`}
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
  const refresh=()=>{const list=filteredTasks(plannerTab==='day'?all:plannerTab==='missed'?missed:plannerTab==='future'?future:inbox.map(t=>({...t,date:''})));
   $('#plannerResults').innerHTML=plannerTab==='day'?prayerOrder.map(p=>`<section class="planner-period"><div class="panel-title"><h2>${names[p]}</h2><button data-add-period="${p}" class="secondary">＋ مهمة</button></div><p class="capacity-note">${capacityText(date,p)}</p>${taskGroups(list.filter(t=>taskInPeriod(t,p))).map(t=>taskCard(t)).join('')||'<p class="empty-note">لا توجد مهام مطابقة في هذه الفترة.</p>'}<details><summary>قائمة صلاة ${names[p]} · ${checks.filter((_,i)=>taskDay(date).checks[p+'-'+i]).length}/5</summary><button class="secondary" data-open-prayer="${p}">عرض وتسجيل مهام الصلاة</button></details></section>`).join('')+(list.some(t=>!taskPeriods(t).length)?`<section class="planner-period"><h2>بدون فترة محددة</h2>${taskGroups(list.filter(t=>!taskPeriods(t).length)).map(t=>taskCard(t)).join('')}</section>`:''):taskGroups(list).map(t=>taskCard(t)).join('')||'<p class="empty-note">لا توجد مهام في هذه القائمة تطابق التصفية.</p>';
   bindTaskCards();app.querySelectorAll('[data-add-period]').forEach(b=>b.onclick=()=>{prayer=+b.dataset.addPeriod;openPlannerEditor()});app.querySelectorAll('[data-open-prayer]').forEach(b=>b.onclick=()=>{prayer=+b.dataset.openPrayer;openPrayer()});
  };
  $('#plannerSearch').oninput=e=>{plannerQuery=e.target.value;refresh()};$('#plannerPriority').onchange=e=>{plannerPriority=e.target.value;refresh()};$('#plannerStatus').onchange=e=>{plannerStatus=e.target.value;refresh()};refresh();
 }
}
function openPlannerDay(key){plannerTab='day';plannerQuery='';plannerPriority=plannerStatus='all';goDay(key,false)}
function renderTaskMonth(){
 plannerMonth||=date.slice(0,7);const first=plannerMonth+'-01',start=new Date(first+'T12:00:00'),offset=start.getDay(),last=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();
 $('#plannerContent').innerHTML=`<section class="panel"><div class="top"><h2>خطة الشهر</h2><div class="date"><button data-month-shift="-1" aria-label="الشهر السابق">→</button><input id="taskMonth" type="month" value="${plannerMonth}" aria-label="الشهر"><button data-month-shift="1" aria-label="الشهر التالي">←</button></div></div><p class="hint">تقويم ميلادي بحسب تاريخ نهار اليوم الذي يبدأ من المغرب. اضغط يومًا لعرض مهامه في الصلوات الخمس. ملخص الصلاة مستقل عن المهام العادية.</p><div class="task-month">${week.map(n=>`<div class="month-weekday">${n}</div>`).join('')}${Array.from({length:offset},()=>'<div aria-hidden="true"></div>').join('')}${Array.from({length:last},(_,i)=>{const key=plannerMonth+'-'+String(i+1).padStart(2,'0'),s=daySummary(key);return `<button data-calendar-day="${key}" class="month-day ${key===activeDay()?'is-today':''}" aria-label="${key}: ${s.total} مهام، ${s.done} مكتملة، ${s.checks} من مهام الصلوات"><strong>${i+1}</strong><span>${s.total} مهام</span>${key<=activeDay()?`<small>✓ ${s.done} منجزة</small><small>الصلاة ${s.checks}/25</small>`:''}</button>`}).join('')}</div><p class="hint">السجل الموثوق للمهام المتكررة يبدأ من ${state.taskHistoryStart}. ما قبل ذلك يُعرض من البيانات المسجلة المتاحة فقط.</p></section>`;
 $('#taskMonth').onchange=e=>{if(e.target.value){plannerMonth=e.target.value;renderTaskMonth()}};
 app.querySelectorAll('[data-month-shift]').forEach(b=>b.onclick=()=>{const next=new Date(first+'T12:00:00');next.setMonth(next.getMonth()+ +b.dataset.monthShift);plannerMonth=localDate(next).slice(0,7);renderTaskMonth()});
 app.querySelectorAll('[data-calendar-day]').forEach(b=>b.onclick=()=>openPlannerDay(b.dataset.calendarDay));
}
function weekChildLabels(t,key,p){return allTasksOn(key).filter(c=>c.parentId&&taskIdentity(mainTask(c))===taskIdentity(t)&&(p===null?!taskPeriods(c).length:taskInPeriod(c,p))).map(c=>`<small>↳ ${esc(c.name)} · ${percentLabel(taskCompletion(c))}</small>`).join('')}
function renderTaskWeek(){
 plannerWeek||=addDate(date,-new Date(date+'T12:00:00').getDay());
 const dates=Array.from({length:7},(_,i)=>addDate(plannerWeek,i));
 $('#plannerContent').innerHTML=`<section class="panel"><div class="top"><h2>التخطيط الأسبوعي</h2><div class="date"><button data-week-shift="-7">الأسبوع السابق</button><span>${dates[0]} — ${dates[6]}</span><button data-week-shift="7">الأسبوع التالي</button></div></div><div class="task-week">${dates.map(key=>`<section class="week-day"><button class="week-heading" data-calendar-day="${key}"><strong>${week[new Date(key+'T12:00:00').getDay()]}</strong><small>${key}</small></button>${prayerOrder.map(p=>{const list=taskGroups(allTasksOn(key).filter(t=>taskInPeriod(t,p))),c=capacity(key,p);return `<div class="week-period"><b>${names[p]}</b><small>${c.free} متاحة / ${c.total} · تقدير ${c.estimates}</small>${list.map(t=>`<button data-week-task="${esc(t.id)}" data-week-date="${t.date||''}" class="week-task"><i class="priority-dot p${taskPriority(t)}"></i>${esc(t.name)}${weekChildLabels(t,key,p)}<small>${completedSlots(t)}/${t.expectedSlots||0} خانة${t.recurrent?' ↻':''}</small></button>`).join('')}<button class="week-add" data-week-add="${key}" data-period="${p}" aria-label="إضافة مهمة يوم ${key} فترة ${names[p]}">＋</button></div>`}).join('')}${allTasksOn(key).some(t=>!taskPeriods(t).length)?`<div class="week-period"><b>بدون فترة محددة</b>${taskGroups(allTasksOn(key).filter(t=>!taskPeriods(t).length)).map(t=>`<button data-week-task="${esc(t.id)}" data-week-date="${t.date||''}" class="week-task">${esc(t.name)}${weekChildLabels(t,key,null)}</button>`).join('')}</div>`:''}</section>`).join('')}</div></section>`;
 app.querySelectorAll('[data-week-shift]').forEach(b=>b.onclick=()=>{plannerWeek=addDate(plannerWeek,+b.dataset.weekShift);renderTaskWeek()});app.querySelectorAll('[data-calendar-day]').forEach(b=>b.onclick=()=>openPlannerDay(b.dataset.calendarDay));
 app.querySelectorAll('[data-week-task]').forEach(b=>b.onclick=()=>openTaskManager(findTask(b.dataset.weekTask,b.dataset.weekDate)));
 app.querySelectorAll('[data-week-add]').forEach(b=>b.onclick=()=>{const original=date;date=b.dataset.weekAdd;prayer=+b.dataset.period;openPlannerEditor();date=original});
}
