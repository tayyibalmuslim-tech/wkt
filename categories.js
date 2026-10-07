/* Category colors are canonical; action.color is a derived compatibility value. */
const ActionCategories=(()=>{
function starter(){
const categories=[
['worship','العبادات','#00fbff','الصلاة والقيام والذكر وسائر العبادات.'],
['quran','القرآن','#00ffee','حفظ القرآن ومراجعته وتفسيره ومدارسته.'],
['learning','العلم الشرعي','#13acae','دراسة العلم الشرعي والبناء المنهجي وحفظ الحديث والمتون.'],
['work','العمل والكسب','#0010f0','الوظيفة والمشروع وأعمال الكسب.'],
['health','الصحة والرياضة','#bcfda0','التمرين والأنشطة التي تعتني بها بصحتك.'],
['social','الأسرة والعلاقات','#99ff00','الوقت الذي تعطيه لأهلك وأصدقائك وصلة الرحم.'],
['life','شؤون الحياة','#fff82e','التنظيم والطلبات المنزلية والمشاوير والإصلاحات.'],
['personal','الاحتياجات الشخصية','#e1ff00','الأكل والشرب والحمام والعناية الشخصية.'],
['rest','النوم والراحة','#adafb3','النوم والراحة المقصودة لاستعادة النشاط.'],
['wasted','وقت ضائع','#f99201','وقت ذهب في التشتت أو الاستخدام غير المقصود.'],
['prohibited','محظورات','#ff0000','أفعال تريد محاسبة نفسك عليها والابتعاد عنها.']
].map(([id,name,color,description])=>({id:'cat-'+id,name,color,description}));
const rows=[
['العمل','work','الوقت الذي تقضيه في عملك أو مشروعك وكسب رزقك.'],
['حمام','personal','الحمام وقضاء الحاجة.'],
['اكل','personal','تناول الطعام والشراب.'],
['قيام الليل','worship','صلاة قيام الليل.'],
['تمرين','health','التمرين الرياضي والمشي والنشاط البدني.'],
['تعلم','learning','دراسة العلم الشرعي؛ يمكنك تغيير القسم حسب نوع تعلمك.'],
['حفظ قرآن','quran','حفظ آيات أو سور جديدة من القرآن.'],
['مراجعة قرآن','quran','مراجعة وتثبيت ما حفظته من القرآن.'],
['فيس بوك','wasted','تصفح فيس بوك دون هدف محدد.'],
['فعل محرم','prohibited','تسجيل فعل محرم تريد تركه ومحاسبة نفسك عليه.'],
['تنظيم','life','ترتيب يومك ومهامك وأعمالك.'],
['صلاة','worship','الصلاة والاستعداد لها والذهاب للمسجد.'],
['جلوس مع الاصدقاء','social','الوقت الذي تقضيه مع أصدقائك.'],
['الاسرة','social','الوقت الذي تعطيه لأهلك.'],
['المنزل','life','الطلبات المنزلية واحتياجات المنزل.'],
['نوم','rest','النوم لاستعادة الراحة والنشاط.'],
['ريلز','wasted','مشاهدة المقاطع القصيرة والريلز.'],
['سرحان','wasted','الشرود والتشتت عن الفعل المقصود.']
];
return {categories,actions:rows.map(([name,cat,description],i)=>({id:'starter-action-'+i,name,categoryId:'cat-'+cat,color:categories.find(c=>c.id==='cat-'+cat).color,description})),starterIntroPending:true,wastedActionsVersion:1};
}
function showIntro(d,changed){if(!document.body?.appendChild)return;const previous=document.getElementById('ac-welcome');if(previous&&previous._data!==d)previous.remove();if(!d.starterIntroPending||document.getElementById('ac-welcome'))return;const modal=document.createElement('dialog');modal.id='ac-welcome';modal._data=d;modal.className='ac-welcome';modal.setAttribute('aria-labelledby','ac-welcome-title');modal.innerHTML=`<h2 id="ac-welcome-title">ابدأ بأقسام جاهزة ليومك</h2><p>جهزنا لك ${d.actions.filter(a=>!a.archived).length} فعلًا موزعة على هذه الأقسام. تقدر تغيّر الأسماء والألوان والشروح من «الأقسام والأفعال».</p><div class="ac-welcome-list">${d.categories.map(c=>`<div><i style="background:${c.color}"></i><span><b>${escape(c.name)}</b><small>${escape(c.description||'')}</small></span></div>`).join('')}</div><button id="ac-start">ابدأ يومي</button>`;document.body.appendChild(modal);const dismiss=()=>{if(!modal.isConnected)return;d.starterIntroPending=false;modal.remove();changed()};modal.querySelector('#ac-start').onclick=()=>modal.close();modal.addEventListener('close',dismiss,{once:true});modal.showModal()}

const fallbackId='category-unassigned';
const validColor=c=>/^#[0-9a-f]{6}$/i.test(c);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normalize(d){
const migrating=!Array.isArray(d.categories);if(migrating)d.categories=[];
d.categories=d.categories.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&validColor(c.color));
function fallback(){let c=d.categories.find(c=>c.id===fallbackId);if(!c){c={id:fallbackId,name:'بدون قسم',color:'#e5e7eb'};d.categories.push(c)}return c}
for(const a of d.actions||[]){let c=d.categories.find(c=>c.id===a.categoryId);if(!c&&migrating){let color=validColor(a.color)?a.color.toLowerCase():'#e5e7eb';c=d.categories.find(c=>c.color===color);if(!c){c={id:'category-'+color.slice(1),name:a.name||'قسم',color};d.categories.push(c)}}if(!c)c=fallback();a.categoryId=c.id;a.color=c.color}
if(!d.categories.length)fallback();
if(d.wastedActionsVersion!==1){
const c=d.categories.find(c=>c.id==='cat-wasted'||c.name.trim()==='وقت ضائع');
if(c){for(const a of d.actions||[])if(a.categoryId===c.id&&a.name.trim()==='وقت ضائع')a.archived=true;
for(const [id,name,description] of [['facebook','فيس بوك','تصفح فيس بوك دون هدف محدد.'],['reels','ريلز','مشاهدة المقاطع القصيرة والريلز.'],['daydream','سرحان','الشرود والتشتت عن الفعل المقصود.']]){
if(!d.actions.some(a=>!a.archived&&a.categoryId===c.id&&a.name===name))d.actions.push({id:'wasted-'+id+'-v1',name,description,categoryId:c.id,color:c.color});}}
d.wastedActionsVersion=1;
}return d}
function category(d,a){return d.categories?.find(c=>c.id===a?.categoryId)}
function color(d,a){return category(d,a)?.color||'#e5e7eb'}
function rename(d,id,name,newColor,description){if(!name.trim()||!validColor(newColor))return false;let c=d.categories.find(c=>c.id===id);if(!c)return false;c.name=name.trim();c.color=newColor;if(description!==undefined)c.description=description.trim();normalize(d);return true}
function remove(d,id){if(id===fallbackId)return false;d.categories=d.categories.filter(c=>c.id!==id);normalize(d);return true}
function mount(root,d,changed,deleteAction){normalize(d);let categoryEdit=null,actionEdit=null;
function draw(){root.innerHTML=`<div class="ac-root"><h2>الأقسام والأفعال</h2><p>اختَر لونًا لكل قسم، ثم اربط الأفعال به. تغيير لون القسم يحدّث كل أفعاله في المطلوب والفعلي.</p><section class="ac-panel"><h3>${categoryEdit?'تعديل القسم':'أضف قسمًا'}</h3><form id="ac-category-form" class="ac-form"><label>اسم القسم<input name="categoryName" required maxlength="60" placeholder="مثلًا: عمل، دين، صحة" value="${escape(categoryEdit?.name||'')}"></label><label class="ac-description-field">شرح القسم <small>اختياري</small><textarea name="categoryDescription" maxlength="300" rows="2">${escape(categoryEdit?.description||'')}</textarea></label><label>لون القسم<input name="categoryColor" type="color" value="${categoryEdit?.color||'#d5e5ce'}"></label><button class="ac-primary">${categoryEdit?'حفظ التعديل':'إضافة القسم'}</button>${categoryEdit?'<button type="button" id="ac-category-cancel">إلغاء</button>':''}</form><div class="ac-list">${d.categories.map(c=>`<div class="ac-row"><i style="background:${c.color}"></i><span>${escape(c.name)} <small>(${d.actions.filter(a=>!a.archived&&a.categoryId===c.id).length} فعل)</small><small class="ac-description">${escape(c.description||'')}</small></span><button data-cat-edit="${escape(c.id)}">تعديل</button>${c.id!==fallbackId?`<button data-cat-delete="${escape(c.id)}">حذف</button>`:''}</div>`).join('')}</div><p class="ac-note">حذف قسم ينقل أفعاله إلى «بدون قسم» ولا يحذف الأفعال أو الخانات.</p></section><section class="ac-panel"><h3>${actionEdit?'تعديل الفعل':'أضف فعلًا'}</h3><form id="ac-action-form" class="ac-form"><label>اسم الفعل<input name="actionName" required maxlength="50" placeholder="مثلًا: تعبئة العطور" value="${escape(actionEdit?.name||'')}"></label><label class="ac-description-field">شرح الفعل <small>اختياري</small><textarea name="actionDescription" maxlength="300" rows="2">${escape(actionEdit?.description||'')}</textarea></label><label>القسم<select name="categoryId">${d.categories.map(c=>`<option value="${escape(c.id)}" ${actionEdit?.categoryId===c.id?'selected':''}>${escape(c.name)}</option>`).join('')}</select></label><button class="ac-primary">${actionEdit?'حفظ الفعل':'إضافة الفعل'}</button>${actionEdit?'<button type="button" id="ac-action-cancel">إلغاء</button>':''}</form><div class="ac-list">${d.categories.map(c=>{let actions=d.actions.filter(a=>!a.archived&&a.categoryId===c.id);return actions.length?`<h4><i style="background:${c.color}"></i>${escape(c.name)}</h4>${actions.map(a=>`<div class="ac-row"><i style="background:${c.color}"></i><span>${escape(a.name)}<small class="ac-description">${escape(a.description||'')}</small></span><button data-action-edit="${escape(a.id)}">تعديل / نقل</button><button data-action-delete="${escape(a.id)}">حذف</button></div>`).join('')}`:''}).join('')||'<p>أضف أول فعل واختر قسمه.</p>'}</div></section></div>`;
const q=s=>root.querySelector(s),all=s=>root.querySelectorAll(s);
q('#ac-category-form').onsubmit=e=>{e.preventDefault();let f=e.target.elements,name=f.categoryName.value.trim(),newColor=f.categoryColor.value,description=f.categoryDescription.value.trim();if(!name)return;if(categoryEdit)rename(d,categoryEdit.id,name,newColor,description);else d.categories.push({id:crypto.randomUUID(),name,color:newColor,description});categoryEdit=null;normalize(d);changed();draw()};
all('[data-cat-edit]').forEach(b=>b.onclick=()=>{categoryEdit=d.categories.find(c=>c.id===b.dataset.catEdit);draw();q('[name=categoryName]').focus()});
all('[data-cat-delete]').forEach(b=>b.onclick=()=>{if(!confirm('حذف القسم ونقل أفعاله إلى «بدون قسم»؟'))return;remove(d,b.dataset.catDelete);categoryEdit=null;changed();draw()});
if(q('#ac-category-cancel'))q('#ac-category-cancel').onclick=()=>{categoryEdit=null;draw()};
q('#ac-action-form').onsubmit=e=>{e.preventDefault();let f=e.target.elements,name=f.actionName.value.trim(),categoryId=f.categoryId.value,description=f.actionDescription.value.trim();if(!name||!d.categories.some(c=>c.id===categoryId))return;if(actionEdit){actionEdit.name=name;actionEdit.categoryId=categoryId;actionEdit.description=description}else d.actions.push({id:crypto.randomUUID(),name,categoryId,description});normalize(d);actionEdit=null;changed();draw()};
all('[data-action-edit]').forEach(b=>b.onclick=()=>{actionEdit=d.actions.find(a=>a.id===b.dataset.actionEdit);draw();q('[name=actionName]').focus()});
all('[data-action-delete]').forEach(b=>b.onclick=()=>{if(!confirm('حذف الفعل وإفراغ خاناته من المطلوب والفعلي؟'))return;let id=b.dataset.actionDelete;d.actions=d.actions.filter(a=>a.id!==id);deleteAction(id);actionEdit=null;changed();draw()});
if(q('#ac-action-cancel'))q('#ac-action-cancel').onclick=()=>{actionEdit=null;draw()};
}draw()}
return {normalize,category,color,rename,remove,mount,starter,showIntro};
})();
