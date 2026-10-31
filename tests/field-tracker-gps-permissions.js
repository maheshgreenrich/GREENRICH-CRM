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
 "\nthis.helpers={locationError,locate,testGPS,getGPS:()=>gpsState};",context);
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
 console.log('PASS: explicit GPS test handles system permission denial, good GPS and low accuracy; no database writes.');
})().catch(err=>{console.error(err);process.exitCode=1;});
