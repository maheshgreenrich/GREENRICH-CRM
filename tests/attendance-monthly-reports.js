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
assert.ok(markup.indexOf('id="monthlyEmployeeList"')<markup.indexOf('id="downloadAllMonthlyExcel"'),'Employee list must appear before all-staff Excel download');
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

/* Report grid and page order must be identical in embedded and standalone Attendance. */
const embeddedStart=client.indexOf('container.innerHTML=');
const embeddedEnd=client.indexOf(';await init()',embeddedStart);
assert.ok(embeddedStart>=0&&embeddedEnd>embeddedStart,'Embedded attendance template must be available for layout verification');
const inlineMarkupLiteral=client.slice(embeddedStart+'container.innerHTML='.length,embeddedEnd);
assert.ok(inlineMarkupLiteral,'Embedded attendance template must be available for layout verification');
const inlineMarkup=JSON.parse(inlineMarkupLiteral);
const sectionOrder=[
 'Approval Inbox','Employee Attendance & Reports','Quick Employee Attendance',
 'Monthly Attendance Reports','Download Attendance Report','All Employees · Monthly Summary',
 'Mark / Correct Attendance','Attendance Corrections for Approval','Leave Requests for Approval'
];
for(const [label,html] of [['standalone',markup],['embedded',inlineMarkup]]){
 let last=-1;
 for(const title of sectionOrder){const position=html.indexOf(title);assert.ok(position>last,label+': unexpected section order at '+title);last=position}
 assert.match(html,/class="av-grid av-report-download-grid"/,label+': download cards must sit in one row');
 assert.match(html,/class="panel av-summary-download"/,label+': monthly summary must be a separate panel');
 assert.match(html,/class="panel av-mark-panel"/,label+': preserve Mark/Correct Attendance after downloads');
 assert.equal((html.match(/id="monthlyEmployeeList"/g)||[]).length,1,label+': employee list should exist once');
}
assert.match(css,/#tab-admin \.av-monthly-reports \.av-monthly-employee-list\{[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(css,/#tab-admin \.av-report-download-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);

console.log('PASS monthly employee popup, month switching, 3 individual export formats, count-only summary Excel and protected API');
