'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('field-tracker.js','utf8');
new vm.Script(source,{filename:'field-tracker.js'});
assert.ok(source.includes("if(action==='testgps'){await testGPS();return}"),
 'Explicit GPS test must not run check-in RPC');
assert.ok(source.includes("Test GPS Access (No Check In)"),
 'The pilot must expose a non-recording GPS test');
assert.ok(source.includes("Windows computer:")&&source.includes("Location services"),
 'Windows system and website permission troubleshooting must be displayed');
assert.ok(source.includes("gr_field_clock_in"),'Real check-in must remain available');
assert.ok(source.includes("locateForField('check-in')"),'Coarse GPS must be rejected before a server check-in call');
assert.ok(source.includes("const maxFieldAccuracyM=3000"),'Do not weaken the 3 km accuracy threshold');
const start=source.indexOf(' const isWindows=()=>');
const end=source.indexOf(' function stopTracking(){',start);
assert.ok(start>0&&end>start,'Extract GPS helpers');
const panel={textContent:'',className:''};
const geolocation={getCurrentPosition(){}};
const context={
 navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  geolocation,permissions:{query:async()=>({state:'denied'})}},
 window:{isSecureContext:true},
 $:()=>panel,
 db:{rpc:()=>{throw Error('GPS diagnostic must never write database')}},
};
vm.runInNewContext(
 "let gpsState={level:'info',message:'Not tested'};\n"+source.slice(start,end)+
 "\nthis.helpers={locationError,locate,locateForField,testGPS,getGPS:()=>gpsState};",context);
(async()=>{
 let requestCount=0;
 geolocation.getCurrentPosition=(ok,error)=>{requestCount++;error({code:1})};
 await context.helpers.testGPS();
 assert.equal(requestCount,1,'One explicit location request');
 assert.equal(context.helpers.getGPS().level,'error');
 assert.match(context.helpers.getGPS().message,/Browser location permission is BLOCKED/);
 assert.match(panel.textContent,/Site settings/);
 assert.match(panel.textContent,/Browser permission: Blocked/);
 geolocation.getCurrentPosition=(ok)=>{requestCount++;ok({coords:{latitude:11.05,longitude:76.96,accuracy:30}})};
 context.navigator.permissions.query=async()=>({state:'granted'});
 await context.helpers.testGPS();
 assert.equal(context.helpers.getGPS().level,'success');
 assert.match(panel.textContent,/Location access WORKS/);
 assert.match(panel.textContent,/no check-in or GPS history was saved/);
 geolocation.getCurrentPosition=(ok)=>{requestCount++;ok({coords:{latitude:11.05,longitude:76.96,accuracy:4000}})};
 await context.helpers.testGPS();
 assert.equal(context.helpers.getGPS().level,'error');
 assert.match(panel.textContent,/accuracy is/);
 assert.equal(requestCount,3);
 let fix=0;
 geolocation.getCurrentPosition=(ok)=>{fix++;ok({coords:{latitude:11.05,longitude:76.96,accuracy:fix===1?5200:250}})};
 const good=await context.helpers.locateForField('check-in');
 assert.equal(good.p_accuracy,250,'A second, more precise GPS sample may be used');
 assert.equal(fix,2);
 fix=0;
 geolocation.getCurrentPosition=(ok)=>{fix++;ok({coords:{latitude:11.05,longitude:76.96,accuracy:fix===1?6000:4800}})};
 await assert.rejects(context.helpers.locateForField('check-in'),/4.8 km/);
 assert.equal(fix,2,'Only one retry for coarse GPS');
 assert.match(context.helpers.getGPS().message,/Nothing has been saved/);
 assert.ok(source.includes("locateForField('check-out')")&&source.includes("locateForField('visit completion')"),
 'Photo and shift recording must use the same accuracy validation');
 console.log('PASS: browser permission, GPS accuracy retry, coarse location rejection, no check-in or database writes.');
})().catch(err=>{console.error(err);process.exitCode=1;});
