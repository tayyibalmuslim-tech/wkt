/* Task planning shares the existing sunset-day storage and Firebase snapshot. */
const priorityNames={high:'عالية',medium:'متوسطة',low:'منخفضة'};
function taskDay(key){return state.sunsetDays[key]??=(emptyDay())}
function repeatFor(key){const weekday=new Date(key+'T12:00:00').getDay();return state.repeat.filter(t=>t.days.includes(weekday)&&(!t.startDate||t.startDate<=key)).map(t=>({...structuredClone(t),recurrent:true}))}
function initializeTaskHistory(){
 state.taskInbox??=[];
 const today=activeDay();let changed=false;
 if(!state.taskHistoryStart){
  state.taskHistoryStart=today;state.taskHistoryThrough=addDate(today,-1);changed=true;
  // Only observed legacy occurrences can be reconstructed; do not invent missed days.
  for(const [key,d] of Object.entries(state.sunsetDays))if(key<today&&!d.repeatSnapshot){d.repeatSnapshot=repeatFor(key).filter(t=>d.done?.[t.id]||d.failed?.[t.id]||d.excludedRepeat?.[t.id]);}
 }
 for(let key=addDate(state.taskHistoryThrough||addDate(state.taskHistoryStart,-1),1);key<today;key=addDate(key,1)){
  const d=taskDay(key);d.repeatSnapshot??=repeatFor(key);state.taskHistoryThrough=key;changed=true;
 }
 if(changed)save();
}
function allTasksOn(key){
 const d=state.sunsetDays[key]||emptyDay();
 const repeats=key<activeDay()?(d.repeatSnapshot||[]):repeatFor(key);
 return [...d.tasks,...repeats.filter(t=>!d.excludedRepeat?.[t.id])].map(t=>({...t,date:key}));
}
function outcome(t){const d=state.sunsetDays[t.date];return d?.done?.[t.id]?'done':d?.failed?.[t.id]?'failed':'pending'}
function completedSlots(t){return state.sunsetDays[t.date]?.taskProgress?.[t.id]||0}
function taskEntries(){return [...Object.keys(state.sunsetDays).sort().flatMap(allTasksOn),...(state.taskInbox||[]).map(t=>({...t,date:''}))]}
function findTask(id,key){return key?allTasksOn(key).find(t=>t.id===id):(state.taskInbox||[]).find(t=>t.id===id)}
function parentName(t){if(!t.parentId)return '';return t.parentName||taskEntries().find(x=>x.id===t.parentId)?.name||'مهمة رئيسية'}
function periodSlots(key,p){const previous=date;try{date=key;return range(p)}finally{date=previous}}
function capacity(key,p,ignoreId=''){
 const d=state.sunsetDays[key]||emptyDay(),slots=periodSlots(key,p);
 const occupied=slots.filter(n=>(d.planned?.[n%96]||d.plannedNotes?.[n%96])&&d.taskSlotOwners?.[n%96]!==ignoreId).length;
 const actual=slots.filter(n=>d.slots?.[n%96]||d.actualNotes?.[n%96]).length;
 const estimates=allTasksOn(key).filter(t=>t.prayer===p&&t.id!==ignoreId).reduce((n,t)=>n+(t.expectedSlots||0),0);
 return {total:slots.length,occupied,free:slots.length-occupied,actual,unrecorded:slots.length-actual,estimates};
}
function capacityText(key,p,ignoreId=''){const c=capacity(key,p,ignoreId);return `${c.total} خانة إجمالًا · ${c.occupied} مشغولة بالتخطيط · ${c.free} متاحة · ${c.actual} مسجلة فعليًا · ${c.unrecorded} لم تُسجل · تقديرات المهام: ${c.estimates} خانة`}
function removeTaskSchedule(key,id){const d=state.sunsetDays[key];if(!d)return;
 for(const [slot,owner] of Object.entries(d.taskSlotOwners||{}))if(owner===id){
  // Preserve later manual edits to either the action or its note.
  if(d.planned?.[slot]===d.taskSlotValues?.[slot])delete d.planned[slot];
  if(d.plannedNotes?.[slot]===d.taskSlotNotes?.[slot])delete d.plannedNotes[slot];
  delete d.taskSlotOwners[slot];if(d.taskSlotValues)delete d.taskSlotValues[slot];if(d.taskSlotNotes)delete d.taskSlotNotes[slot];
 }
}
function scheduleTask(t,start){
 if(start===null)return;
 const slots=periodSlots(t.date,t.prayer),count=t.expectedSlots;
 if(!t.actionId||!state.actions.some(a=>a.id===t.actionId))throw Error('اختر فعلًا موجودًا لجدولة المهمة.');
 if(!Number.isInteger(count)||count<1)throw Error('حدد عدد الخانات المتوقع أولًا.');
 const index=slots.indexOf(start);if(index<0||index+count>slots.length)throw Error('المدة تتجاوز نهاية فترة الصلاة.');
 const d=taskDay(t.date),selected=slots.slice(index,index+count);
 if(selected.some(n=>(d.planned?.[n%96]||d.plannedNotes?.[n%96])&&d.taskSlotOwners?.[n%96]!==t.id))throw Error('بعض الخانات مشغولة بالفعل؛ اختر بداية أخرى أو أفرغها من صفحة يومي.');
 for(const field of ['planned','plannedNotes','taskSlotOwners','taskSlotValues','taskSlotNotes'])d[field]??={};
 for(const n of selected){const slot=n%96;d.planned[slot]=t.actionId;d.plannedNotes[slot]='مهمة: '+t.name;d.taskSlotOwners[slot]=t.id;d.taskSlotValues[slot]=t.actionId;d.taskSlotNotes[slot]=d.plannedNotes[slot];}
}
function savePlannedTask(original,next,progress=null){
 if(progress!==null&&(!Number.isInteger(progress)||progress<0||progress>9999))throw Error('الخانات المنجزة يجب أن تكون بين ٠ و٩٩٩٩.');
 // Validate the schedule against a temporary copy before touching the real state.
 const snapshot=structuredClone(state);
 try{
  if(original?.date)removeTaskSchedule(original.date,original.id);
  const moved=original&&original.date!==next.date;
  if(original){
   if(original.date){const d=taskDay(original.date);if(original.recurrent)(d.excludedRepeat??={})[original.id]=true;else d.tasks=d.tasks.filter(t=>t.id!==original.id);}
   else state.taskInbox=state.taskInbox.filter(t=>t.id!==original.id);
  }
  let item={...next};delete item.recurrent;
  if(original?.recurrent){item.id=uid();item.detachedFrom=original.id;}
  if(item.date){
   const d=taskDay(item.date);d.tasks.push(item);
   if(original?.date&&(moved||original.recurrent)){
    const old=taskDay(original.date);
    for(const field of ['done','failed','taskProgress']){if(old[field]?.[original.id]!==undefined){(d[field]??={})[item.id]=old[field][original.id];delete old[field][original.id];}}
   }
   if(progress!==null)(d.taskProgress??={})[item.id]=progress;
   scheduleTask(item,item.startSlot??null);
  }else state.taskInbox.push(item);
  // Child names stay readable if the parent is subsequently removed.
  if(original)for(const child of [...Object.values(state.sunsetDays).flatMap(d=>d.tasks),...state.taskInbox])if(child.parentId===original.id&&(!child.parentDate||child.parentDate===original.date)){child.parentId=item.id;child.parentName=item.name;child.parentDate=item.date||'';}
  save();return item;
 }catch(error){for(const key of Object.keys(state))delete state[key];Object.assign(state,snapshot);throw error}
}
function deletePlannedTask(t){
 if(!confirm('حذف هذه المهمة فقط؟ ستبقى مهامها الفرعية وسجل الأيام الأخرى.'))return;
 if(!t.date)state.taskInbox=state.taskInbox.filter(x=>x.id!==t.id);
 else{const d=taskDay(t.date);removeTaskSchedule(t.date,t.id);if(t.recurrent)(d.excludedRepeat??={})[t.id]=true;else d.tasks=d.tasks.filter(x=>x.id!==t.id);for(const f of ['done','failed','taskProgress'])if(d[f])delete d[f][t.id];}
 save();render();return true;
}
function taskFields(t={},includeDate=true){return `
 <label class="field">الأولوية<select name="priority">${Object.entries(priorityNames).map(([v,n])=>`<option value="${v}" ${(t.priority||'medium')===v?'selected':''}>${n}</option>`).join('')}</select></label>
 <label class="field">الخانات المتوقعة (الخانة ١٥ دقيقة)<input name="expectedSlots" type="number" min="0" max="96" step="1" value="${t.expectedSlots||0}" required></label>
 <label class="field">الفعل المرتبط<select name="actionId"><option value="">بدون ربط</option>${state.actions.map(a=>`<option value="${esc(a.id)}" ${t.actionId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
 ${includeDate?`<label class="field">اليوم (اتركه فارغًا لصندوق الوارد)<input name="taskDate" type="date" value="${t.date||''}"></label><label class="field">فترة الصلاة<select name="taskPrayer">${prayerOrder.map(p=>`<option value="${p}" ${p===(t.prayer??prayer)?'selected':''}>${names[p]}</option>`).join('')}</select></label>`:''}`}
function openPlannerEditor(t=null,parent=null){
 let dialog=$('#plannerEditor');if(!dialog){dialog=document.createElement('dialog');dialog.id='plannerEditor';dialog.setAttribute('aria-labelledby','plannerTitle');document.body.append(dialog)}
 const editorState=state;
 const draft=t||{id:uid(),name:'',date:parent?'':date,prayer,priority:'medium',expectedSlots:0,parentId:parent?.id,parentName:parent?.name,parentDate:parent?.date||''};
 dialog.innerHTML=`<div class="dialog-head"><h2 id="plannerTitle">${t?'تعديل وتوزيع المهمة':parent?'إضافة مهمة فرعية':'إضافة مهمة'}</h2><button type="button" id="closePlanner" aria-label="إغلاق">×</button></div><form id="plannerForm"><label class="field">المهمة<input name="taskName" maxlength="150" required value="${esc(draft.name)}"></label>${draft.parentId?`<p>ضمن: ${esc(parentName(draft))}</p>`:''}<div class="planner-fields">${taskFields(draft)}${t?.date?`<label class="field">الخانات المنجزة<input name="completedSlots" type="number" min="0" max="9999" step="1" required value="${completedSlots(t)}"></label>`:''}</div><p id="plannerCapacity" class="capacity-note"></p><label class="field">بداية التنفيذ في خانات الفعل المطلوب<select name="startSlot"></select></label><p class="hint">التخطيط يحجز عدد الخانات المتوقع ويكتب الفعل المرتبط. لا يغيّر تسجيلك الفعلي ولا يضع علامة إنجاز تلقائيًا.</p>${t?.recurrent?'<p class="hint">تعديل هذه النسخة يفصلها عن السلسلة لهذا اليوم فقط.</p>':''}<p id="plannerError" role="alert"></p><button class="primary">حفظ المهمة</button></form>${t?'<div class="planner-edit-actions"><button type="button" id="editorAddChild" class="secondary">＋ إضافة مهمة فرعية</button><button type="button" id="editorDeleteTask" class="danger">حذف المهمة</button></div>':''}`;
 const form=$('#plannerForm'),f=form.elements;
 const refresh=()=>{const key=f.taskDate.value,p=+f.taskPrayer.value,old=f.startSlot.value;
  $('#plannerCapacity').textContent=key?capacityText(key,p,t?.date===key?t.id:''):'ستظهر المهمة في «تحتاج توزيعًا» حتى تختار يومًا.';
  f.startSlot.innerHTML='<option value="">بدون حجز وقت محدد</option>'+(key?periodSlots(key,p).map(n=>`<option value="${n}">${time(n)}</option>`).join(''):'');
  if([...f.startSlot.options].some(o=>o.value===old))f.startSlot.value=old;
  f.taskPrayer.disabled=!key;f.startSlot.disabled=!key;
 };
 f.taskDate.onchange=f.taskPrayer.onchange=refresh;refresh();if(draft.startSlot!=null)f.startSlot.value=String(draft.startSlot);
 $('#closePlanner').onclick=()=>dialog.close();
 if(t){$('#editorAddChild').onclick=()=>{dialog.close();openPlannerEditor(null,t)};$('#editorDeleteTask').onclick=()=>{if(deletePlannedTask(t))dialog.close()};}
 form.onsubmit=e=>{e.preventDefault();const name=f.taskName.value.trim();if(!name)return;try{
  if(state!==editorState)throw Error('تغيرت البيانات أو الحساب. أغلق النافذة وافتح المهمة مجددًا.');
  const count=+f.expectedSlots.value;if(!Number.isInteger(count)||count<0||count>96)throw Error('عدد الخانات يجب أن يكون عددًا صحيحًا بين ٠ و٩٦.');
  const next={...draft,name,priority:f.priority.value,expectedSlots:count,actionId:f.actionId.value,date:f.taskDate.value,prayer:+f.taskPrayer.value,startSlot:f.taskDate.value&&f.startSlot.value!==''?+f.startSlot.value:null},progress=f.completedSlots?+f.completedSlots.value:null;
  if(progress!==null&&(!Number.isInteger(progress)||progress<0||progress>9999))throw Error('الخانات المنجزة يجب أن تكون بين ٠ و٩٩٩٩.');
  const progressOnly=t?.date&&next.name===t.name&&next.date===t.date&&next.prayer===t.prayer&&next.priority===(t.priority||'medium')&&next.expectedSlots===(t.expectedSlots||0)&&next.actionId===(t.actionId||'')&&next.startSlot===(t.startSlot??null);
  if(progressOnly){(taskDay(t.date).taskProgress??={})[t.id]=progress;save()}else savePlannedTask(t,next,progress);
  dialog.close();render();toast('تم حفظ المهمة');
 }catch(err){$('#plannerError').textContent=err.message}};
 dialog.showModal();
}
function quickTask(){let dialog=$('#quickTaskDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='quickTaskDialog';document.body.append(dialog)}dialog.innerHTML='<h2>التقط المهمة الآن</h2><form id="quickTaskForm"><label class="field">المهمة<input name="taskName" maxlength="150" required autofocus placeholder="اكتب المهمة فقط…"></label><p>ستجدها في قائمة «تحتاج توزيعًا».</p><button class="primary">إضافة</button><button type="button" class="secondary" id="closeQuickTask">إلغاء</button></form>';$('#closeQuickTask').onclick=()=>dialog.close();$('#quickTaskForm').onsubmit=e=>{e.preventDefault();const name=e.target.elements.taskName.value.trim();if(!name)return;(state.taskInbox??=[]).push({id:uid(),name,priority:'medium',expectedSlots:0});save();dialog.close();render();toast('أضيفت إلى المهام التي تحتاج توزيعًا')};dialog.showModal()}
function installQuickTask(){if($('#quickTaskButton'))return;const b=document.createElement('button');b.id='quickTaskButton';b.className='quick-task';b.textContent='＋ مهمة سريعة';b.onclick=()=>{if(app.inert){toast('انتظر تحميل بيانات الحساب');return}quickTask()};document.body.append(b)}
function renderRepeat(edit=null){
 renderRepeatLegacy(edit);
 const form=$('#repeatForm');
 const extra=document.createElement('div');extra.className='planner-fields';extra.innerHTML=taskFields(edit||{},false);form.insertBefore(extra,form.querySelector('.primary'));
 const submit=form.onsubmit;
 form.onsubmit=e=>{
  const f=form.elements,count=+f.expectedSlots.value;
  if(!Number.isInteger(count)||count<0||count>96){e.preventDefault();toast('الخانات المتوقعة بين ٠ و٩٦');return}
  if(!f.name.value.trim()||!form.querySelector('[name=days]:checked')){submit(e);return}
  initializeTaskHistory();
  const fields={priority:f.priority.value,expectedSlots:count,actionId:f.actionId.value,startDate:edit?.startDate||activeDay()};
  const before=new Set(state.repeat.map(t=>t.id));submit(e);
  const target=edit?state.repeat.find(t=>t.id===edit.id):state.repeat.find(t=>!before.has(t.id));
  if(target){Object.assign(target,fields);save();render()}
 };
 // Capture days elapsed while this screen was left open before mutating a series.
 app.querySelectorAll('[data-del]').forEach(b=>{const remove=b.onclick;b.onclick=()=>{initializeTaskHistory();remove()}});
 const note=document.createElement('p');note.className='hint';note.textContent='تعديل السلسلة يغيّر اليوم والأيام القادمة فقط. سجلات الأيام السابقة محفوظة منذ تفعيل سجل المهام.';form.before(note);
}
function validatePlanning(s){
 if(!s||typeof s!=='object')throw Error('بيانات غير صالحة');
 const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 for(const f of ['taskHistoryStart','taskHistoryThrough'])if(s[f]!==undefined&&!validDate(s[f]))throw Error('تاريخ سجل غير صالح');
 if(s.taskInbox!==undefined&&!Array.isArray(s.taskInbox))throw Error('قائمة مهام غير صالحة');
 const checkTask=t=>{
  if(!t||typeof t.id!=='string'||typeof t.name!=='string')throw Error('مهمة غير صالحة');
  if(t.priority!==undefined&&!Object.hasOwn(priorityNames,t.priority))throw Error('أولوية غير صالحة');
  if(t.expectedSlots!==undefined&&(!Number.isInteger(t.expectedSlots)||t.expectedSlots<0||t.expectedSlots>96))throw Error('عدد خانات غير صالح');
  if(t.date&&!validDate(t.date)||t.startDate&&!validDate(t.startDate)||t.parentDate&&!validDate(t.parentDate))throw Error('تاريخ مهمة غير صالح');
  if(t.startSlot!=null&&(!Number.isInteger(t.startSlot)||t.startSlot<0||t.startSlot>192))throw Error('وقت غير صالح');
  for(const key of ['actionId','parentId','parentName'])if(t[key]!==undefined&&typeof t[key]!=='string')throw Error('بيانات مهمة غير صالحة');
 };
 for(const t of [...(s.taskInbox||[]),...(Array.isArray(s.repeat)?s.repeat:[])])checkTask(t);
 for(const [key,d] of Object.entries(s.sunsetDays||{})){
  if(!validDate(key))throw Error('تاريخ يوم غير صالح');
  for(const t of Array.isArray(d?.tasks)?d.tasks:[])checkTask(t);
  if(d?.repeatSnapshot!==undefined){if(!Array.isArray(d.repeatSnapshot))throw Error('سجل غير صالح');for(const t of d.repeatSnapshot){checkTask(t);if(!Number.isInteger(t.prayer)||t.prayer<0||t.prayer>4)throw Error('فترة غير صالحة')}}
  if(d?.taskProgress&&Object.values(d.taskProgress).some(n=>!Number.isInteger(n)||n<0||n>9999))throw Error('تقدم غير صالح');
 }
}
