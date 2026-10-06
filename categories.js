/* Category colors are canonical; action.color is a derived compatibility value. */
const ActionCategories=(()=>{
const fallbackId='category-unassigned';
const validColor=c=>/^#[0-9a-f]{6}$/i.test(c);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normalize(d){
const migrating=!Array.isArray(d.categories);if(migrating)d.categories=[];
d.categories=d.categories.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&validColor(c.color));
function fallback(){let c=d.categories.find(c=>c.id===fallbackId);if(!c){c={id:fallbackId,name:'بدون قسم',color:'#e5e7eb'};d.categories.push(c)}return c}
for(const a of d.actions||[]){let c=d.categories.find(c=>c.id===a.categoryId);if(!c&&migrating){let color=validColor(a.color)?a.color.toLowerCase():'#e5e7eb';c=d.categories.find(c=>c.color===color);if(!c){c={id:'category-'+color.slice(1),name:a.name||'قسم',color};d.categories.push(c)}}if(!c)c=fallback();a.categoryId=c.id;a.color=c.color}
if(!d.categories.length)fallback();return d}
function category(d,a){return d.categories?.find(c=>c.id===a?.categoryId)}
function color(d,a){return category(d,a)?.color||'#e5e7eb'}
function rename(d,id,name,newColor){if(!name.trim()||!validColor(newColor))return false;let c=d.categories.find(c=>c.id===id);if(!c)return false;c.name=name.trim();c.color=newColor;normalize(d);return true}
function remove(d,id){if(id===fallbackId)return false;d.categories=d.categories.filter(c=>c.id!==id);normalize(d);return true}
function mount(root,d,changed,deleteAction){normalize(d);let categoryEdit=null,actionEdit=null;
function draw(){root.innerHTML=`<div class="ac-root"><h2>الأقسام والأفعال</h2><p>اختَر لونًا لكل قسم، ثم اربط الأفعال به. تغيير لون القسم يحدّث كل أفعاله في المطلوب والفعلي.</p><section class="ac-panel"><h3>${categoryEdit?'تعديل القسم':'أضف قسمًا'}</h3><form id="ac-category-form" class="ac-form"><label>اسم القسم<input name="categoryName" required maxlength="60" placeholder="مثلًا: عمل، دين، صحة" value="${escape(categoryEdit?.name||'')}"></label><label>لون القسم<input name="categoryColor" type="color" value="${categoryEdit?.color||'#d5e5ce'}"></label><button class="ac-primary">${categoryEdit?'حفظ التعديل':'إضافة القسم'}</button>${categoryEdit?'<button type="button" id="ac-category-cancel">إلغاء</button>':''}</form><div class="ac-list">${d.categories.map(c=>`<div class="ac-row"><i style="background:${c.color}"></i><span>${escape(c.name)} <small>(${d.actions.filter(a=>a.categoryId===c.id).length} فعل)</small></span><button data-cat-edit="${escape(c.id)}">تعديل</button>${c.id!==fallbackId?`<button data-cat-delete="${escape(c.id)}">حذف</button>`:''}</div>`).join('')}</div><p class="ac-note">حذف قسم ينقل أفعاله إلى «بدون قسم» ولا يحذف الأفعال أو الخانات.</p></section><section class="ac-panel"><h3>${actionEdit?'تعديل الفعل':'أضف فعلًا'}</h3><form id="ac-action-form" class="ac-form"><label>اسم الفعل<input name="actionName" required maxlength="50" placeholder="مثلًا: تعبئة العطور" value="${escape(actionEdit?.name||'')}"></label><label>القسم<select name="categoryId">${d.categories.map(c=>`<option value="${escape(c.id)}" ${actionEdit?.categoryId===c.id?'selected':''}>${escape(c.name)}</option>`).join('')}</select></label><button class="ac-primary">${actionEdit?'حفظ الفعل':'إضافة الفعل'}</button>${actionEdit?'<button type="button" id="ac-action-cancel">إلغاء</button>':''}</form><div class="ac-list">${d.categories.map(c=>{let actions=d.actions.filter(a=>a.categoryId===c.id);return actions.length?`<h4><i style="background:${c.color}"></i>${escape(c.name)}</h4>${actions.map(a=>`<div class="ac-row"><i style="background:${c.color}"></i><span>${escape(a.name)}</span><button data-action-edit="${escape(a.id)}">تعديل / نقل</button><button data-action-delete="${escape(a.id)}">حذف</button></div>`).join('')}`:''}).join('')||'<p>أضف أول فعل واختر قسمه.</p>'}</div></section></div>`;
const q=s=>root.querySelector(s),all=s=>root.querySelectorAll(s);
q('#ac-category-form').onsubmit=e=>{e.preventDefault();let f=e.target.elements,name=f.categoryName.value.trim(),newColor=f.categoryColor.value;if(!name)return;if(categoryEdit)rename(d,categoryEdit.id,name,newColor);else d.categories.push({id:crypto.randomUUID(),name,color:newColor});categoryEdit=null;normalize(d);changed();draw()};
all('[data-cat-edit]').forEach(b=>b.onclick=()=>{categoryEdit=d.categories.find(c=>c.id===b.dataset.catEdit);draw();q('[name=categoryName]').focus()});
all('[data-cat-delete]').forEach(b=>b.onclick=()=>{if(!confirm('حذف القسم ونقل أفعاله إلى «بدون قسم»؟'))return;remove(d,b.dataset.catDelete);categoryEdit=null;changed();draw()});
if(q('#ac-category-cancel'))q('#ac-category-cancel').onclick=()=>{categoryEdit=null;draw()};
q('#ac-action-form').onsubmit=e=>{e.preventDefault();let f=e.target.elements,name=f.actionName.value.trim(),categoryId=f.categoryId.value;if(!name||!d.categories.some(c=>c.id===categoryId))return;if(actionEdit){actionEdit.name=name;actionEdit.categoryId=categoryId}else d.actions.push({id:crypto.randomUUID(),name,categoryId});normalize(d);actionEdit=null;changed();draw()};
all('[data-action-edit]').forEach(b=>b.onclick=()=>{actionEdit=d.actions.find(a=>a.id===b.dataset.actionEdit);draw();q('[name=actionName]').focus()});
all('[data-action-delete]').forEach(b=>b.onclick=()=>{if(!confirm('حذف الفعل وإفراغ خاناته من المطلوب والفعلي؟'))return;let id=b.dataset.actionDelete;d.actions=d.actions.filter(a=>a.id!==id);deleteAction(id);actionEdit=null;changed();draw()});
if(q('#ac-action-cancel'))q('#ac-action-cancel').onclick=()=>{actionEdit=null;draw()};
}draw()}
return {normalize,category,color,rename,remove,mount};
})();
