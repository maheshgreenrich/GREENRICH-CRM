'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('secure.html'),app=read('greenrich-one.js'),crm=read('greenrich-crm-inline.js'),
 contacts=read('greenrich-contacts.js'),styles=read('greenrich-contacts.css'),sources=read('greenrich-sources.js'),
 admin=read('greenrich-company-admin.js'),sql=read('supabase/migrations/20261030153000_shared_crm_sources.sql');
for(const [name,src] of [['CRM',crm],['contacts',contacts],['sources',sources],['admin',admin],['app',app]])
 new vm.Script(src,{filename:name});
const sandbox={window:{},crypto:{randomUUID:()=>'uuid'},Date,Intl,Number,Object,Array,Map,Set};
vm.runInNewContext(contacts,sandbox);
const api=sandbox.window.GreenRichContacts;
assert.ok(api,'Contact manager must mount');
assert.equal(api.phone('9876543210'),'+919876543210');
assert.equal(api.phone('+91 9876543210'),'+919876543210');
assert.equal(api.phone('919876543210'),'+919876543210');
assert.equal(api.phone('999'),'', 'Invalid mobile must not export as +91');
assert.equal(api.phone(''),'');
assert.equal(api.columns.length,24,'Both contact types use all 24 Excel fields');
for(const label of ['Mobile 1','Mobile 2','Email','Company name','Tags','Customer type','Address line 1','Address line 2',
 'City','State','PIN code','GSTIN','Customer source','Products','Enquiry related details','Customer notes / history',
 'GreenRich company','Created date']) assert.ok(api.columns.includes(label),label);
for(const marker of ['data-contact-add="customer"','data-contact-add="lead"','data-contact-import="customer"',
 'data-contact-import="lead"','data-contact-export="customer"','data-contact-export="lead"',
 'data-contact-template="customer"','data-contact-template="lead"','gr-contact-from','gr-contact-to',
 'gr-contact-source','gr-contact-tag','gr-contact-kind','gr-contact-search'])
 assert.ok(contacts.includes(marker),'Missing form/filter: '+marker);
assert.ok(contacts.includes('gr-contact-phone'),'Both phone fields should use a +91 prefix control');
assert.ok(contacts.includes("['mobile','mobile2'].includes(key)"),'Excel must not prefix +91 numbers with apostrophes');
assert.ok(contacts.includes('gr_crm_records'),'Leads should save to the shared company-restricted cloud table');
assert.ok(contacts.includes('GreenRichSharedCustomers.saveCustomer'),'Customers must stay in global shared table');
assert.ok(contacts.includes("if(duplicateCustomer(row,'',collection))"),'Import must skip duplicates');
assert.ok(contacts.includes('tag_ids'),'Contacts and leads must support shared tags');
assert.ok(contacts.includes('no existing records')===false);
assert.ok(html.includes('id="gr-contact-management"')&&html.includes('id="gr-customer-profile"'),
 'Unified customer view must preserve Customer 360 profile');
assert.ok(html.includes('id="gr-customer-legacy" hidden'),'Legacy customer selectors should remain for other CRM modules');
assert.ok(/greenrich-contacts\\.js\\?v=[^"']+/.test(html));
assert.ok(html.includes('greenrich-contacts.css?v=20261030-contacts-1'));
assert.ok(html.includes('greenrich-sources.js?v=20261030-contacts-1'));
assert.ok(crm.includes('window.GreenRichContacts.mount'),'CRM must initialize unified page');
assert.ok(crm.includes("if(page==='customers'){window.GreenRichContacts?.render()"),'Sync customer view with cloud data');
assert.ok(crm.includes("window.GreenRichContacts?.openForm('lead')"),'Leads Add action must use complete lead form');
assert.ok(app.includes("openSources:host=>window.GreenRichSources.mount"),'Settings should open sources manager');
assert.ok(admin.includes("['sources','Lead Sources']"),'Sources settings tab must exist');
assert.ok(admin.includes("if(tab==='sources')"),'Sources settings must render');
assert.ok(sources.includes('gr_crm_sources')&&sources.includes('data-source-edit'),'Admin should manage sources');
assert.ok(sql.includes('enable row level security'));
assert.ok(sql.includes('gr_is_admin()')&&sql.includes('gr_crm_active_employee()'),'Source access should be role-controlled');
assert.ok(!sql.includes('alter table public.gr_attendance'),'Attendance must remain unchanged');
assert.ok(styles.includes('.gr-contact-filters')&&styles.includes('.gr-contact-kind.lead'));
console.log('PASS: unified customers/leads, +91 phones, Excel templates and imports, filters, source RLS, history preserved');
