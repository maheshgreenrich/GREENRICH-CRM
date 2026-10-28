// Run locally: node phase1/attendance-sample-generator.js > attendance-sample.csv
// Synthetic example only: does not import to Supabase or affect browser data.
const names=['Asha','Arun','Bhavya','Deepak','Farah','Hari','Kiran','Meena','Naveen','Priya'];
const roles=['Admin','Director','Sales','Sales','Telecaller','Marketing','Operation','Operation','Accounts','Developer'];
console.log('Attendance ID,Employee,Role,Date,Status,Marked By,Source,Remark');
for(let month of [8,9]) for(let day=1;day<=new Date(2026,month+1,0).getDate();day++){
 const dt=new Date(2026,month,day,12);if(dt.getDay()===0)continue;
 const date=dt.toISOString().slice(0,10);
 names.forEach((name,i)=>{const n=(day*7+i*13+month)%23;const status=n===0?'Absent':n<=3?'Half Day':'Present';const id='ATT-'+date.replaceAll('-','')+'-'+String(i+1).padStart(2,'0');console.log([id,name,roles[i],date,status,'Demo Admin','Admin','Synthetic sample'].join(','))});
}
