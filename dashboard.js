/* Unified daily, backlog, future, inbox, monthly and weekly planning. */
let plannerTab='day',plannerQuery='',plannerPriority='all',plannerStatus='all',plannerMonth='',plannerWeek='';
function dashboardTasks(){return allTasksOn(date)}
function taskStatus(t){return outcome({...t,date:t.date||date})}
function taskCard(t){
 const status=t.date?outcome(t):'pending',count=t.date?completedSlots(t):0,expected=t.expectedSlots||0;
 const children=taskEntries().filter(x=>x.parentId===t.id&&(!x.parentDate||x.parentDate===t.date)),action=state.actions.find(a=>a.id===t.actionId);
 const doneChildren=children.filter(x=>x.date&&outcome(x)==='done').length;
 return `<article class="planner-task ${status}" data-task-id="${esc(t.id)}" data-task-date="${t.date||''}"><div class="planner-task-heading"><strong>${esc(t.name)}</strong><span class="priority ${t.priority||'medium'}">${priorityNames[t.priority]||priorityNames.medium}</span></div>
 <p class="task-meta">${t.date?`${t.date} · ${names[t.prayer]} · `:'تحتاج توزيعًا · '}${t.recurrent?'↻ متكررة · ':''}${{pending:'لم تُسجل نتيجتها',done:'فعلتها',failed:'لم أفعلها'}[status]}${action?' · الفعل: '+esc(action.name):t.actionId?' · الفعل المرتبط محذوف':''}</p>
 ${t.parentId?`<p class="task-parent">↳ ${esc(parentName(t))}</p>`:''}
 <div class="task-effort">${t.date?`<label>الخانات المنجزة <input data-progress type="number" min="0" max="9999" step="1" value="${count}" aria-label="الخانات المنجزة: ${esc(t.name)}"></label>`:'<span>التقدير</span>'}<strong> / ${expected} خانة مستهدفة</strong><span class="hint">${expected*15} دقيقة مخططة${count>expected?' · تجاوزت المستهدف':''}</span></div>
 ${expected?`<progress value="${Math.min(count,expected)}" max="${expected}" aria-label="تقدم الخانات"></progress>`:''}
 ${children.length?`<details class="task-children"><summary>${children.length} مهام فرعية · ${doneChildren} مكتملة</summary>${children.map(c=>`<p>${esc(c.name)} — ${c.date?c.date+' · '+names[c.prayer]:'تحتاج توزيعًا'} · ${c.date?completedSlots(c):0}/${c.expectedSlots||0} خانة</p>`).join('')}</details>`:''}
 <div class="task-controls">${t.date?`<button data-outcome="done" class="secondary ${status==='done'?'selected-outcome':''}" aria-pressed="${status==='done'}">✓ فعلتها</button><button data-outcome="failed" class="secondary ${status==='failed'?'selected-outcome':''}" aria-pressed="${status==='failed'}">✕ لم أفعلها</button>`:''}<button data-task-edit class="secondary">${t.date?'تعديل / توزيع':'توزيع المهمة'}</button><button data-task-child class="secondary">＋ فرعية</button><button data-task-delete class="danger">حذف</button></div></article>`;
}
function compactTaskCard(t){
 const status=outcome(t),count=completedSlots(t),expected=t.expectedSlots||0;
 const action=state.actions.find(a=>a.id===t.actionId),children=taskEntries().filter(x=>x.parentId===t.id&&(!x.parentDate||x.parentDate===t.date));
 const info=[`<span class="priority ${esc(t.priority||'medium')}">${priorityNames[t.priority]||priorityNames.medium}</span>`];
 if(expected>0)info.push(`<label class="daily-task-progress" title="الخانات المنجزة من ${expected} خانة مستهدفة · ${expected*15} دقيقة مخططة"><input data-progress type="number" min="0" max="9999" step="1" inputmode="numeric" value="${count}" aria-label="الخانات المنجزة: ${esc(t.name)}"><span dir="ltr">/ ${expected}</span><span>خانة</span></label>`);
 if(action)info.push(`<span>${esc(action.name)}</span>`);
 if(t.recurrent)info.push('<span>↻ متكررة</span>');
 if(t.parentId)info.push(`<span>↳ ${esc(parentName(t))}</span>`);
 if(children.length)info.push(`<span>${children.filter(c=>c.date&&outcome(c)==='done').length}/${children.length} فرعية مكتملة</span>`);
 if(t.startSlot!=null)info.push(`<span>◷ ${time(t.startSlot)}</span>`);
 return `<article class="daily-task ${status}" data-task-id="${esc(t.id)}" data-task-date="${t.date}"><div class="daily-task-content"><strong class="daily-task-name">${esc(t.name)}</strong><div class="daily-task-info">${info.join('')}</div></div><div class="daily-task-controls"><button data-outcome="done" class="status-button ${status==='done'?'yes':''}" aria-label="فعلتها: ${esc(t.name)}" title="فعلتها" aria-pressed="${status==='done'}">✓</button><button data-outcome="failed" class="status-button ${status==='failed'?'no':''}" aria-label="لم أفعلها: ${esc(t.name)}" title="لم أفعلها" aria-pressed="${status==='failed'}">✕</button><button data-task-edit class="secondary" aria-label="تعديل: ${esc(t.name)}">تعديل</button></div></article>`;
}
function bindTaskCards(root=app){root.querySelectorAll('[data-task-id]').forEach(card=>{
 const get=()=>findTask(card.dataset.taskId,card.dataset.taskDate);
 card.querySelectorAll('[data-outcome]').forEach(b=>b.onclick=()=>{const t=get();if(!t)return;setTaskOutcome(taskDay(t.date),t.id,b.dataset.outcome);save();render()});
 const progress=card.querySelector('[data-progress]');if(progress){progress.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();progress.blur()}};progress.onchange=()=>{const t=get(),n=+progress.value;if(!t)return;if(!Number.isInteger(n)||n<0||n>9999||progress.value===''){progress.value=completedSlots(t);toast('أدخل عددًا صحيحًا بين ٠ و٩٩٩٩');return}(taskDay(t.date).taskProgress??={})[t.id]=n;save();render()};}
 card.querySelector('[data-task-edit]').onclick=()=>openPlannerEditor(get());
 if(card.querySelector('[data-task-child]'))card.querySelector('[data-task-child]').onclick=()=>openPlannerEditor(null,get());
 if(card.querySelector('[data-task-delete]'))card.querySelector('[data-task-delete]').onclick=()=>{const t=get();if(t)deletePlannedTask(t)};
 })}
function sortedTasks(list){const order={high:0,medium:1,low:2};return [...list].sort((a,b)=>(order[a.priority||'medium']??1)-(order[b.priority||'medium']??1)||a.name.localeCompare(b.name,'ar'))}
function filteredTasks(list){return sortedTasks(list.filter(t=>(!plannerQuery||t.name.toLocaleLowerCase().includes(plannerQuery.trim().toLocaleLowerCase()))&&(plannerPriority==='all'||(t.priority||'medium')===plannerPriority)&&(plannerStatus==='all'||(t.date?outcome(t):'pending')===plannerStatus)))}
function daySummary(key){const tasks=allTasksOn(key),d=state.sunsetDays[key]||emptyDay();return {total:tasks.length,done:tasks.filter(t=>outcome(t)==='done').length,checks:prayerOrder.reduce((n,p)=>n+checks.filter((_,i)=>d.checks[p+'-'+i]).length,0)}}
function dateControls(){return `<div class="date"><button data-planner-shift="-1" aria-label="اليوم السابق">→</button><input type="date" id="plannerDate" value="${date}" aria-label="اليوم المختار"><button data-planner-shift="1" aria-label="اليوم التالي">←</button><button id="plannerToday">اليوم</button></div>`}
function renderDashboard(){
 const all=allTasksOn(date),done=all.filter(t=>outcome(t)==='done').length,pending=all.filter(t=>outcome(t)==='pending').length;
 const entries=taskEntries(),today=activeDay(),missed=entries.filter(t=>t.date&&t.date<today&&outcome(t)==='pending'),future=entries.filter(t=>t.date>today&&!t.recurrent),inbox=state.taskInbox||[];
 app.innerHTML=`<div class="top"><div><h1>لوحة المهام</h1><p>خطط حول صلاتك، وقس تقدمك بخانات الوقت.</p></div>${dateControls()}</div>
 <div class="hero"><div><h2>${hijriLabel(date)}</h2><p>${dayRangeLabel()}</p></div><div class="stats"><div class="stat"><strong>${done}/${all.length}</strong><span>مهام مكتملة</span></div><div class="stat"><strong>${pending}</strong><span>بانتظار التسجيل</span></div><div class="stat"><strong>${daySummary(date).checks}/25</strong><span>من مهام الصلوات</span></div></div></div>
 <div class="planner-toolbar"><button id="newPlannedTask" class="primary">＋ إضافة مهمة وتوزيعها</button><button id="plannerRepeats" class="secondary">↻ المهام المتكررة</button></div>
 <div class="planner-tabs" role="group" aria-label="عروض المهام">${[['day','اليوم'],['missed',`الفائتة (${missed.length})`],['future',`المستقبلية (${future.length})`],['inbox',`تحتاج توزيعًا (${inbox.length})`],['month','الشهر'],['week','الأسبوع']].map(([v,n])=>`<button class="secondary ${plannerTab===v?'chosen':''}" data-planner-tab="${v}" aria-pressed="${plannerTab===v}">${n}</button>`).join('')}</div>
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
   $('#plannerResults').innerHTML=plannerTab==='day'?prayerOrder.map(p=>`<section class="planner-period"><div class="panel-title"><h2>${names[p]}</h2><button data-add-period="${p}" class="secondary">＋ مهمة</button></div><p class="capacity-note">${capacityText(date,p)}</p>${list.filter(t=>t.prayer===p).map(taskCard).join('')||'<p class="empty-note">لا توجد مهام مطابقة في هذه الفترة.</p>'}<details><summary>قائمة صلاة ${names[p]} · ${checks.filter((_,i)=>taskDay(date).checks[p+'-'+i]).length}/5</summary><button class="secondary" data-open-prayer="${p}">عرض وتسجيل مهام الصلاة</button></details></section>`).join(''):list.map(taskCard).join('')||'<p class="empty-note">لا توجد مهام في هذه القائمة تطابق التصفية.</p>';
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
function renderTaskWeek(){
 plannerWeek||=addDate(date,-new Date(date+'T12:00:00').getDay());
 const dates=Array.from({length:7},(_,i)=>addDate(plannerWeek,i));
 $('#plannerContent').innerHTML=`<section class="panel"><div class="top"><h2>التخطيط الأسبوعي</h2><div class="date"><button data-week-shift="-7">الأسبوع السابق</button><span>${dates[0]} — ${dates[6]}</span><button data-week-shift="7">الأسبوع التالي</button></div></div><div class="task-week">${dates.map(key=>`<section class="week-day"><button class="week-heading" data-calendar-day="${key}"><strong>${week[new Date(key+'T12:00:00').getDay()]}</strong><small>${key}</small></button>${prayerOrder.map(p=>{const list=sortedTasks(allTasksOn(key).filter(t=>t.prayer===p)),c=capacity(key,p);return `<div class="week-period"><b>${names[p]}</b><small>${c.free} متاحة / ${c.total} · تقدير ${c.estimates}</small>${list.map(t=>`<button data-week-task="${esc(t.id)}" data-week-date="${key}" class="week-task"><i class="priority-dot ${t.priority||'medium'}"></i>${esc(t.name)}<small>${completedSlots(t)}/${t.expectedSlots||0} خانة${t.recurrent?' ↻':''}</small></button>`).join('')}<button class="week-add" data-week-add="${key}" data-period="${p}" aria-label="إضافة مهمة يوم ${key} فترة ${names[p]}">＋</button></div>`}).join('')}</section>`).join('')}</div></section>`;
 app.querySelectorAll('[data-week-shift]').forEach(b=>b.onclick=()=>{plannerWeek=addDate(plannerWeek,+b.dataset.weekShift);renderTaskWeek()});app.querySelectorAll('[data-calendar-day]').forEach(b=>b.onclick=()=>openPlannerDay(b.dataset.calendarDay));
 app.querySelectorAll('[data-week-task]').forEach(b=>b.onclick=()=>openPlannerEditor(findTask(b.dataset.weekTask,b.dataset.weekDate)));
 app.querySelectorAll('[data-week-add]').forEach(b=>b.onclick=()=>{const original=date;date=b.dataset.weekAdd;prayer=+b.dataset.period;openPlannerEditor();date=original});
}
