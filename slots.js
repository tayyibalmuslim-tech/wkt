/* Slot notes and half-open ten-minute ranges. */
const SlotTools=(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
// Old snapshots have no duration marker. Retain their exact maps before resampling.
function migrate(data){
 if(data.slotMinutes===10)return false;
 if(data.slotMinutes!==undefined&&data.slotMinutes!==15)throw Error('مدة خانات غير مدعومة');
 const groups=[['slots','actualNotes','actualTasks'],['planned','plannedNotes','taskSlotOwners','taskSlotValues','taskSlotNotes']];
 const seen=new Set();
 for(const d of [...Object.values(data.days||{}),...Object.values(data.sunsetDays||{})]){
  if(!d||seen.has(d))continue;seen.add(d);
  const fields=groups.flat().filter(f=>d[f]!==undefined);
  if(fields.some(f=>Object.keys(d[f]||{}).length)){
   d.legacyQuarterHour=Object.fromEntries(fields.map(f=>[f,structuredClone(d[f])]));
   for(const group of groups){
    const source=Object.fromEntries(group.map(f=>[f,d[f]||{}]));
    const occupied=i=>group.some(f=>source[f][i]!==undefined);
    const mapped=Object.fromEntries(group.filter(f=>d[f]!==undefined).map(f=>[f,{}]));
    // Civil-day legacy indices can extend past midnight; preserve their day offset.
    const max=Math.max(95,...group.flatMap(f=>Object.keys(source[f]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<192)));
    for(let i=0;i<Math.ceil((max+1)*1.5);i++){
     const start=i*10,end=start+10,a=Math.floor(start/15),b=Math.floor((end-1)/15);
     const overlapA=Math.min(end,(a+1)*15)-start,overlapB=end-Math.max(start,b*15);
     const old=a===b||overlapA>overlapB||overlapA===overlapB&&occupied(a)?a:b;
     for(const f of Object.keys(mapped))if(source[f][old]!==undefined)mapped[f][i]=structuredClone(source[f][old]);
    }
    Object.assign(d,mapped);
   }
  }
  for(const t of [...(d.tasks||[]),...(d.repeatSnapshot||[])])if(t.startSlot!=null)t.startSlot=Math.floor(t.startSlot*1.5);
 }
 for(const t of [...(data.repeat||[]),...(data.taskInbox||[])])if(t.startSlot!=null)t.startSlot=Math.floor(t.startSlot*1.5);
 data.slotMinutes=10;
 return true;
}
function validate(start,end,first){if(!Number.isInteger(start)||!Number.isInteger(end)||start<first||end>first+144||end<=start)throw Error('اختر وقت نهاية بعد البداية داخل هذا اليوم.');}
function apply(day,start,end,kind,action,note,first=0,array=false,task=null){validate(start,end,first);if(!['actual','planned'].includes(kind)||typeof note!=='string'||note.length>1000)throw Error('بيانات غير صالحة');note=note.trim();for(let n=start;n<end;n++){const i=((n%144)+144)%144;if(kind==='actual'){if(task)(day.actualTasks??={})[i]={id:task.id,name:task.name,actionId:action,...(task.parentName?{parentName:task.parentName}:{})};else if(day.actualTasks)delete day.actualTasks[i];}if(array){const s=day.slots[i];s[kind]=action||null;s[kind+'Note']=note;}else{if(kind==='planned')for(const field of ['taskSlotOwners','taskSlotValues','taskSlotNotes'])if(day[field])delete day[field][i];const actions=kind==='actual'?day.slots:(day.planned??={}),notes=(day[kind+'Notes']??={});if(action)actions[i]=action;else delete actions[i];if(note)notes[i]=note;else delete notes[i];}}}
function actionChoices(o){const selected=o.action||'';
const groups=[];for(const c of o.categories||[])groups.push({id:c.id,name:c.name,description:c.description,color:c.color,actions:[]});
for(const a of o.actions){let group=groups.find(c=>c.id===a.categoryId);if(!group){const name=o.category(a);group=groups.find(c=>c.name===name);if(!group){group={name,actions:[]};groups.push(group);}}group.actions.push(a);}
const colorText=c=>{const rgb=/^#([0-9a-f]{6})$/i.exec(c||'');if(!rgb)return '#20372e';const n=parseInt(rgb[1],16);return (((n>>16)&255)*299+((n>>8)&255)*587+(n&255)*114)/1000>145?'#18251f':'#ffffff';};
return `<div class="slot-action-groups" role="group" aria-label="اختيار الفعل">${groups.filter(g=>g.actions.length).map(g=>`<section class="slot-action-group"><h3>${g.color?`<i style="background:${esc(g.color)}"></i>`:''}${esc(g.name)}</h3><div class="slot-action-grid">${g.actions.map(a=>{const color=o.color?o.color(a):g.color||'#eff4ed';return `<button type="button" class="slot-action-choice" data-action-choice="${esc(a.id)}" aria-pressed="${a.id===selected}" style="background:${esc(color)};color:${colorText(color)}" title="${esc(a.description||a.name)}">${esc(a.name)}</button>`;}).join('')}</div></section>`).join('')}</div><button type="button" class="slot-action-choice slot-action-empty" data-action-choice="" aria-pressed="${!selected}">بدون فعل</button>`;
}
function open(o){const q=s=>document.querySelector(s),first=o.first,last=first+144;let selected=o.action||'',selectedTask=o.task||null;
const options=(from,to,value)=>Array.from({length:to-from+1},(_,j)=>{let n=from+j;return `<option value="${n}" ${n===value?'selected':''}>${esc(o.time(n))}${n===last?' · نهاية اليوم':''}</option>`}).join('');
const choices=`<input type="hidden" id="slotAction" value="${esc(selected)}">${actionChoices(o)}`;
o.root.innerHTML=`<div class="slot-editor"><div class="dialog-head"><h2>${o.bulk?'تسجيل عدة خانات':'الفعل والملاحظة'}</h2><button id="close" type="button" aria-label="إغلاق">×</button></div><form id="slotForm">${o.bulk?`<div class="range-fields"><label>من<select id="slotFrom">${options(first,last-1,o.start)}</select></label><label>إلى<select id="slotTo">${options(first+1,last,o.end)}</select></label><label>التسجيل<select id="slotKind"><option value="actual" ${o.kind==='actual'?'selected':''}>ما فعلته</option><option value="planned" ${o.kind==='planned'?'selected':''}>المطلوب</option></select></label></div><p id="slotCount" class="hint" role="status"></p>`:`<input type="hidden" id="slotFrom" value="${o.start}"><input type="hidden" id="slotTo" value="${o.end}"><input type="hidden" id="slotKind" value="${o.kind}"><p class="hint slot-summary">${o.kind==='actual'?'ما فعلته':'المطلوب'} · ${esc(o.time(o.start))} – ${esc(o.time(o.end))}</p><span id="slotCount" hidden></span>`}<div id="slotTasks"></div>${choices}<p id="slotActionHint" class="hint"></p><label class="slot-field">ملاحظة<textarea id="slotNote" maxlength="1000" rows="3" placeholder="اكتب ملاحظة لهذه الخانة أو الفترة…">${esc(o.note||'')}</textarea></label><p class="hint">${o.bulk?'نفس الفعل والملاحظة لكل الخانات من البداية حتى وقت النهاية. الحفظ يستبدل التسجيل في الجزء المختار فقط.':'اضغط الفعل لحفظه مباشرة. لتعديل الملاحظة فقط، اكتبها ثم اضغط حفظ الملاحظة.'}</p><p id="slotError" role="alert"></p><div class="slot-editor-actions"><button class="primary btn" type="submit">${o.bulk?'حفظ التسجيل':'حفظ الملاحظة'}</button><button id="clearSlot" class="secondary btn" type="button">إفراغ الفعل والملاحظة</button></div></form></div>`;
q('#slotFrom').value=String(o.start);q('#slotTo').value=String(o.end);q('#slotKind').value=o.kind;q('#slotAction').value=selected;q('#slotNote').value=o.note||'';o.root.onkeydown=e=>{if(e.key==='Escape')o.close();};
const taskChoices=()=>{
 const root=q('#slotTasks');root.hidden=q('#slotKind').value!=='actual';
 const tasks=o.tasks?o.tasks(+q('#slotFrom').value):[];
 root.innerHTML=`<section class="slot-action-group"><h3>المهام</h3><p class="hint">مهام هذه الفترة · اختر المهمة لتسجيل ما فعلته بالفعل.</p><div class="slot-action-grid">${tasks.map(t=>{const a=o.actions.find(a=>a.id===t.actionId),color=a&&o.color?o.color(a):'#eff4ed';return `<button type="button" class="slot-action-choice" data-task-choice="${esc(t.id)}" aria-pressed="${selectedTask?.id===t.id}" ${a?'':'disabled'} style="background:${esc(color)};color:${a&&o.color?colorText(color):'#20372e'}">${t.parentName?`<small class="slot-task-parent">${esc(t.parentName)}</small>`:''}<strong>${esc(t.name)}</strong><small>${esc(a?.name||'اربط المهمة بفعل أولًا')}</small></button>`;}).join('')||'<p class="hint">لا توجد مهام لهذه الفترة.</p>'}</div></section>`;
 root.querySelectorAll('[data-task-choice]').forEach(b=>b.onclick=()=>{const t=tasks.find(t=>t.id===b.dataset.taskChoice);selectedTask={id:t.id,name:t.name,actionId:t.actionId,...(t.parentName?{parentName:t.parentName}:{})};q('#slotAction').value=t.actionId;refresh();if(!o.bulk)commit(false);});
};
const colorText=c=>{const n=parseInt(c.slice(1),16);return (((n>>16)&255)*299+((n>>8)&255)*587+(n&255)*114)/1000>145?'#18251f':'#ffffff';};
const refresh=()=>{taskChoices();let s=+q('#slotFrom').value,e=+q('#slotTo').value;try{validate(s,e,first);q('#slotCount').textContent=`${e-s} خانة · ${(e-s)*SlotTools.minutes} دقيقة`;q('#slotError').textContent='';}catch(err){q('#slotCount').textContent='';q('#slotError').textContent=err.message;}o.root.querySelectorAll?.('[data-action-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.actionChoice===q('#slotAction').value)));let a=o.actions.find(a=>a.id===q('#slotAction').value);q('#slotActionHint').textContent=a?.description||'';};
q('#slotFrom').onchange=q('#slotTo').onchange=q('#slotAction').onchange=refresh;o.root.querySelectorAll?.('[data-action-choice]').forEach(b=>b.onclick=()=>{selectedTask=null;q('#slotAction').value=b.dataset.actionChoice;refresh();if(!o.bulk)commit(false);});
q('#slotKind').onchange=()=>{if(!o.bulk){let v=o.read(+q('#slotFrom').value,q('#slotKind').value);selectedTask=v.task||null;q('#slotAction').value=v.action||'';q('#slotNote').value=v.note||'';}refresh();};
const commit=clear=>{try{let s=+q('#slotFrom').value,e=+q('#slotTo').value;validate(s,e,first);o.commit(s,e,q('#slotKind').value,clear?null:q('#slotAction').value,clear?'':q('#slotNote').value,clear||q('#slotKind').value!=='actual'?null:selectedTask);o.close();}catch(err){q('#slotError').textContent=err.message;}};
q('#slotForm').onsubmit=e=>{e.preventDefault();commit(false);};q('#clearSlot').onclick=()=>commit(true);q('#close').onclick=o.close;refresh();if(o.show)o.show();
}
return{minutes:10,perDay:144,migrate,apply,validate,open,actionChoices};})();
