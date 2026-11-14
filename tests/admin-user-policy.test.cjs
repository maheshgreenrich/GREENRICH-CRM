'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const backend=read('supabase/functions/greenrich-admin-users/index.ts');
const frontend=read('greenrich-one.js');
test('Admin reset is server-side and does not email a link',()=>{
 assert.match(backend,/\['create','edit','delete','reset'\]\.includes\(action\)/);
 const reset=backend.slice(backend.indexOf("if(action==='reset')"));
 assert.match(reset,/admin\.auth\.admin\.updateUserById\(id,\{password\}\)/);
 assert.doesNotMatch(reset,/resetPasswordForEmail/);
 assert.match(frontend,/employeeAction\(\{action:'reset',userId:p\.id,password\}\)/);
});
test('delete action preserves user identity and history',()=>{
 const start=backend.indexOf("if(action==='delete')");
 const end=backend.indexOf("if(action==='reset')",start);
 const code=backend.slice(start,end);
 assert.match(code,/active:false/);
 assert.match(code,/ban_duration/);
 assert.doesNotMatch(code,/\.deleteUser\(/);
});
test('service-role secret is accessed only in server function',()=>{
 assert.match(backend,/Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
 assert.doesNotMatch(frontend,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('legacy CRM business data still uses localStorage and requires migration',()=>{
 const cloud=read('greenrich-crm-cloud.js');
 assert.match(cloud,/localStorage\.setItem/);
});
