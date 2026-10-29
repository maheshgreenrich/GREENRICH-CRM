'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
const markup=read('attendance-v3.html');
const client=read('greenrich-attendance-inline.js');
const css=read('attendance-v3.css');
const controller=read('supabase/functions/attendance-api/controllers/attendance.controller.ts');
const service=read('supabase/functions/attendance-api/services/attendance.service.ts');
const report=read('supabase/functions/attendance-api/services/report.service.ts');
new vm.Script(client);
for(const id of ['monthlyReportsSection','monthlyEmployeeList','monthlyEmployeeDialog','monthlyEmployeeMonth',
 'monthlyEmployeeCalendar','monthlyEmployeeCounts','monthlyEmployeeTimeSheet','downloadAllMonthlyExcel',
 'allMonthlyReportMonth','monthlyEmployeeClose']){
 assert.match(markup,new RegExp('id="'+id+'"'),'Missing '+id);
}
for(const type of ['csv','xls','pdf'])assert.match(markup,new RegExp('data-monthly-export="'+type+'"'));
assert.match(client,/monthlyEmployeeDialog'\)\.showModal/);
assert.match(client,/monthlyEmployeeMonth'\)\.onchange/);
assert.match(client,/\/admin\/reports\/employee\?/);
assert.match(client,/\/admin\/reports\/employee\/download\?/);
assert.match(client,/\/admin\/reports\/monthly-summary\/download\?/);
assert.match(css,/\.av-monthly-dialog\{width:min\(1000px/);
assert.match(controller,/route==='\/admin\/reports\/employee'/);
assert.match(controller,/route==='\/admin\/reports\/monthly-summary'/);
assert.match(controller,/route==='\/admin\/reports\/monthly-summary\/download'/);
assert.match(controller,/requireAction\(actor,'export'\)/);
assert.match(service,/is\('deleted_at',null\)/);
assert.match(service,/case 'LATE':counts\.present\+\+;counts\.late\+\+/);
assert.match(service,/case 'PERMISSION':counts\.permissions\+\+/);
const summary=report.slice(report.indexOf('export function buildMonthlySummaryExcel('));
for(const col of ['Employee Name','Present Days','Absent Days','Paid Leave','Unpaid Leave','Late Days','Permission Days'])assert.ok(summary.includes("'"+col+"'"));
assert.doesNotMatch(summary,/\['Date','Employee','Status'/,'Summary should not have detailed log columns');
assert.match(summary,/ss:Type="Number"/);
console.log('PASS monthly employee popup, month switching, 3 individual export formats, count-only summary Excel and protected API');
