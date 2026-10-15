const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
process.chdir(require('node:path').resolve(__dirname,'..'));
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://test.local',runScripts:'outside-only'}),w=dom.window;
w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.confirm=()=>true;
w.eval(['vendor/adhan.js','calendar.js','categories.js','slots.js','task-engine.js','dashboard.js','projects.js','app.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n')+`\n
state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[{id:'bench',name:'اختبار'}];
for(let i=0;i<60;i++){const key=addDate(date,-i),d=taskDay(key);d.tasks=Array.from({length:4},(_,j)=>({id:'t-'+i+'-'+j,name:'مهمة '+j,prayer:0,priority:3,projectId:'bench',expectedSlots:4,...(j?{parentId:'t-'+i+'-0',parentDate:key}:{})}));}
state.taskHistoryStart=date;state.taskHistoryThrough=addDate(date,-1);
let scans=0,days=0;state.sunsetDays=new Proxy(state.sunsetDays,{ownKeys(target){scans++;return Reflect.ownKeys(target)}});
const origDay=activeDay;activeDay=function(...args){days++;return origDay(...args)};
window.bench=()=>{const results={};for(const name of ['day','projects','month']){view=name==='month'?'dashboard':name;plannerTab='month';selectedProject='bench';scans=days=0;const start=performance.now();render();results[name]={ms:Math.round(performance.now()-start),historyScans:scans,activeDayCalls:days};}return results};
window.checkFreshness=()=>{
 const root=allTasksOn(date)[0],child=allTasksOn(date)[1];
 taskReadScope(()=>{progressEntries();taskDay(date).taskProgress={[child.id]:2};save();assertEqual(taskCompletion(root),100/6)})();
 // A new render must read edits even if no save occurred (e.g. a newly applied snapshot).
 taskDay(date).done[child.id]=true;view='projects';render();assertEqual(taskCompletion(root),100/3);
 const serialized=JSON.stringify(state);state=JSON.parse(serialized);render();assertEqual(taskCompletion(allTasksOn(date)[0]),100/3);
 // No scope survives a failed render; subsequent reads must see new data.
 try{taskReadScope(()=>{progressEntries();throw Error('test')})()}catch{}
 taskDay(date).done={};assertEqual(taskCompletion(allTasksOn(date)[0]),100/6);
 assertEqual(taskReadCache,null);
 // The current day can roll over between reads; yesterday uses its saved snapshot.
 const realActiveDay=activeDay,key=date;
 taskDay(key).repeatSnapshot=[{id:'historic',name:'قديم',prayer:0}];
 state.repeat=[{id:'live',name:'حالي',prayer:0,days:[0,1,2,3,4,5,6]}];
 activeDay=()=>key;
 taskReadScope(()=>assertEqual(allTasksOn(key).some(t=>t.id==='live'),true))();
 activeDay=()=>addDate(key,1);
 taskReadScope(()=>{assertEqual(allTasksOn(key).some(t=>t.id==='historic'),true);assertEqual(allTasksOn(key).some(t=>t.id==='live'),false)})();
 activeDay=realActiveDay;
 const zone=state.location.zone,instant=new Date('2026-01-01T00:30:00Z');
 state.location.zone='Africa/Cairo';assertEqual(zonedDate(instant),'2026-01-01');
 state.location.zone='America/New_York';assertEqual(zonedDate(instant),'2025-12-31');
 state.location.zone=zone;
};
function assertEqual(actual,expected){if(actual!==expected&&!(typeof actual==='number'&&typeof expected==='number'&&Math.abs(actual-expected)<1e-9))throw Error(actual+' != '+expected)}
`);
try{
 const results=w.bench();
 for(const [name,result] of Object.entries(results)){
  assert.ok(result.historyScans<=3,name+': repeated full history scans '+result.historyScans);
  assert.ok(result.activeDayCalls<=5,name+': repeated current-day calculation '+result.activeDayCalls);
 }
 w.checkFreshness();
 // Indexed reads preserve the legacy matching rules for recurring IDs on different dates.
 w.eval(`taskReadScope(()=>{
  const entries=[{id:'same',date:'2026-01-01'},{id:'same',date:'2026-01-02'},{id:'child',date:'2026-01-02',parentId:'same',parentDate:'2026-01-02'},{id:'legacy',parentId:'same'}];
  if(parentTask(entries[2],entries)!==entries[1]||parentTask(entries[3],entries)!==entries[0])throw Error('parent date matching');
  if(childTasks(entries[0],entries).length!==1||childTasks(entries[1],entries).length!==2)throw Error('child date matching');
 })()`);
 console.log('PASS: bounded history scans, per-view caches, save/import freshness, exception cleanup and dated parent indexes');
 console.log(JSON.stringify(results));
}finally{w.close()}
