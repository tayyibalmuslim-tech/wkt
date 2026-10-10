// Adhan 4.4.6 (MIT), bundled locally. Dates are logical Islamic days,
// labelled by their daytime Gregorian date; e.g. Friday starts Thursday sunset.
const prayerOrder=[3,4,0,1,2], prayerFields=['fajr','dhuhr','asr','maghrib','isha'];
const cairoLocation={name:'القاهرة',lat:30.0444,lon:31.2357,zone:'Africa/Cairo'};
const prayerCache=new Map();
function addDate(s,n){let d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function zonedDate(now=new Date()){let parts=new Intl.DateTimeFormat('en-CA',{timeZone:state.location.zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);let v=t=>parts.find(p=>p.type===t).value;return `${v('year')}-${v('month')}-${v('day')}`}
function clockAt(d){return new Intl.DateTimeFormat('en-GB',{timeZone:state.location.zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d)}
function solar(civil){let key=JSON.stringify([civil,state.location,state.method,state.offsets]);if(prayerCache.has(key))return prayerCache.get(key);let [y,m,d]=civil.split('-').map(Number),c=new adhan.Coordinates(state.location.lat,state.location.lon),params=adhan.CalculationMethod[state.method]();params.highLatitudeRule=adhan.HighLatitudeRule.recommended(c);for(let i=0;i<5;i++)params.adjustments[prayerFields[i]]=state.offsets[i];let p=new adhan.PrayerTimes(c,new Date(y,m-1,d,12),params);if(prayerFields.some(f=>!Number.isFinite(+p[f])))throw Error('تعذر حساب المواقيت لهذا الموقع؛ اختر موقعًا آخر.');prayerCache.set(key,p);return p}
function activeDay(now=new Date()){let civil=zonedDate(now);return +now>=+solar(civil).maghrib?addDate(civil,1):civil}
function timesFor(logical){let prev=solar(addDate(logical,-1)),today=solar(logical);return prayerFields.map((f,i)=>clockAt((i===3||i===4?prev:today)[f]))}
// Choose the latest prayer whose ten-minute preparation window has begun.
function currentPrayer(now=new Date()){
const civil=zonedDate(now);let chosen=4,latest=-Infinity;
for(const day of [addDate(civil,-1),civil]){const p=solar(day);for(let i=0;i<prayerFields.length;i++){const boundary=+p[prayerFields[i]]-10*60*1000;if(boundary<=+now&&boundary>latest){chosen=i;latest=boundary;}}}
return chosen;
}
function prayerTimes(){return timesFor(date)}
function hijriLabel(logical){let d=new Date(addDate(logical,state.hijriOffset)+'T12:00:00Z');return new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}
function gregorianLabel(){return new Intl.DateTimeFormat('ar-EG',{timeZone:state.location.zone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())}
function dayRangeLabel(){return `من مغرب ${addDate(date,-1)} (${displayTime(prayerTimes()[3])}) إلى مغرب ${date} (${displayTime(clockAt(solar(date).maghrib))})`}
function emptyDay(){return {slots:{},checks:{},tasks:[],done:{}}}
function setupCalendar(){state.location??={...cairoLocation};state.method??='Egyptian';state.offsets??=[0,0,0,0,0];state.hijriOffset??=0;
 if(!state.sunsetDays){state.sunsetDays={};let target=k=>state.sunsetDays[k]??=emptyDay();
 for(let [oldDate,d] of Object.entries(state.days||{})){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(oldDate))continue;
  for(let [key,value] of Object.entries(d.checks||{})){let p=+key.split('-')[0];target(p===3||p===4?addDate(oldDate,1):oldDate).checks[key]=value}
  for(let t of d.tasks||[]){let dest=target(t.prayer===3||t.prayer===4?addDate(oldDate,1):oldDate);dest.tasks.push(t);if(d.done?.[t.id])dest.done[t.id]=true}
  for(let t of state.repeat||[]){if(d.done?.[t.id])target(t.prayer===3||t.prayer===4?addDate(oldDate,1):oldDate).done[t.id]=true}
  for(let [key,value] of Object.entries(d.slots||{})){let n=+key,civil=addDate(oldDate,Math.floor(n/96)),wall=((n%96)+96)%96,dest=wall*15>=minute(clockAt(solar(civil).maghrib))?addDate(civil,1):civil;target(dest).slots[wall]=value}
 }save();}
}
function goDay(d,live=false){date=d;plannerMonth=d.slice(0,7);plannerWeek=addDate(d,-new Date(d+'T12:00:00').getDay());followToday=live;if(live)prayer=currentPrayer();render()}
function tickCalendar(){let nowDay=activeDay(),civil=zonedDate();if(nowDay!==lastActiveDay){let wasLive=followToday;lastActiveDay=nowDay;if(wasLive){date=nowDay;prayer=3;$('#prayerDialog').close();$('#picker').close();render();toast('بدأ يوم هجري جديد مع المغرب')}}if(civil!==lastCivilDay){lastCivilDay=civil;let label=$('#civilToday');if(label)label.textContent=gregorianLabel()} }

function displayTime(value){let [h,m]=value.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"ص":"م"}`}
