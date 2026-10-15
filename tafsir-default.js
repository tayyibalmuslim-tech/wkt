/* Built-in tafsir plan: 604-page Madinah mushaf, 30 ajzaa, 8 rub al-hizb per juz. */
const TAFSIR_PROJECT_NAME='قراءة تفسير المصحف';
const TAFSIR_PROJECT_ID='wkt-core-tafsir-v1';
const TAFSIR_PROJECT_DESCRIPTION='خطة قراءة تفسير القرآن الكريم: 30 جزءًا، وكل جزء مقسم إلى ثمانية أرباع. أرقام الصفحات وفق مصحف المدينة (604 صفحات)، وقد تشترك الأرباع المتجاورة في صفحة لوقوع الحد داخلها.';
const TAFSIR_JUZ_PAGES=[1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];
const TAFSIR_RUB_PAGES=[1,5,7,9,11,14,17,19,22,24,27,29,32,34,37,39,42,44,46,49,51,54,56,59,62,64,67,69,72,74,77,79,82,84,87,89,92,94,97,100,102,104,106,109,112,114,117,119,121,124,126,129,132,134,137,140,142,144,146,148,151,154,156,158,162,164,167,170,173,175,177,179,182,184,187,189,192,194,196,199,201,204,206,209,212,214,217,219,222,224,226,228,231,233,236,238,242,244,247,249,252,254,256,259,262,264,267,270,272,275,277,280,282,284,287,289,292,295,297,299,302,304,306,309,312,315,317,319,322,324,326,329,332,334,336,339,342,344,347,350,352,354,356,359,362,364,367,369,371,374,377,379,382,384,386,389,392,394,396,399,402,404,407,410,413,415,418,420,422,425,426,429,431,433,436,439,442,444,446,449,451,454,456,459,462,464,467,469,472,474,477,479,482,484,486,488,491,493,496,499,502,505,507,510,513,515,517,519,522,524,526,529,531,534,536,539,542,544,547,550,553,554,558,560,562,564,566,569,572,575,577,579,582,585,587,589,591,594,596,599];
const TAFSIR_JUZ_NAMES=["الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع","العاشر","الحادي عشر","الثاني عشر","الثالث عشر","الرابع عشر","الخامس عشر","السادس عشر","السابع عشر","الثامن عشر","التاسع عشر","العشرون","الحادي والعشرون","الثاني والعشرون","الثالث والعشرون","الرابع والعشرون","الخامس والعشرون","السادس والعشرون","السابع والعشرون","الثامن والعشرون","التاسع والعشرون","الثلاثون"];
const TAFSIR_QUARTER_NAMES=["الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن"];
// The marker is intentionally retained after deletion, so a removed default never reappears.
function installDefaultTafsir(target){
 if(target.tafsirDefaultInstalled===true)return false;
 target.tafsirDefaultInstalled=true;
 if((target.projects||[]).some(p=>p.id===TAFSIR_PROJECT_ID||p.name===TAFSIR_PROJECT_NAME))return true;
 const roots=[],tasks=[];
 for(let n=0;n<30;n++){
  const parentId='core-tafsir-'+crypto.randomUUID();
  const parent={id:parentId,name:'الجزء '+TAFSIR_JUZ_NAMES[n],description:'من '+TAFSIR_JUZ_PAGES[n]+' إلى '+((TAFSIR_JUZ_PAGES[n+1]||605)-1),projectId:TAFSIR_PROJECT_ID,priority:3,expectedSlots:0,completedSlotCount:0,showInMonthlyCalendar:true,prayers:[]};
  tasks.push(parent);roots.push(JSON.stringify([parentId,'']));
  for(let q=0;q<8;q++){
   const pos=n*8+q,start=TAFSIR_RUB_PAGES[pos],end=q===7?(TAFSIR_JUZ_PAGES[n+1]||605)-1:TAFSIR_RUB_PAGES[pos+1];
   tasks.push({id:'core-tafsir-'+crypto.randomUUID(),name:'الربع '+TAFSIR_QUARTER_NAMES[q]+' ج'+(n+1),description:'من '+start+' إلى '+end,parentId,parentDate:'',parentName:parent.name,projectId:TAFSIR_PROJECT_ID,priority:3,expectedSlots:0,completedSlotCount:0,showInMonthlyCalendar:true,prayers:[]});
  }
 }
 (target.projects??=[]).push({id:TAFSIR_PROJECT_ID,name:TAFSIR_PROJECT_NAME,description:TAFSIR_PROJECT_DESCRIPTION,taskOrder:roots});
 (target.taskInbox??=[]).push(...tasks);
 return true;
}
