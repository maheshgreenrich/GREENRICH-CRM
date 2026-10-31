'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const builder=read('greenrich-form-builder.js'),settings=read('greenrich-company-admin.js'),one=read('greenrich-one.js'),
 contacts=read('greenrich-contacts.js'),pipeline=read('greenrich-lead-pipeline.js'),crm=read('greenrich-crm-inline.js'),
 html=read('secure.html'),css=read('greenrich-form-builder.css'),
 sql=read('supabase/migrations/20261031200000_admin_form_builder.sql');
for(const [file,src] of [['builder',builder],['settings',settings],['app',one],['contacts',contacts],
 ['leads',pipeline],['crm',crm]])new vm.Script(src,{filename:file});
const sandbox={window:{}};vm.runInNewContext(builder,sandbox);
const form=sandbox.window.GreenRichFormBuilder;
assert.deepEqual(Array.from(form.KEYS),['lead_create','lead_stage','customer','sales_order']);
for(const key of form.KEYS){const defs=form.defaults(key);assert.ok(defs.length>=8);assert.ok(form.validate(key,defs));}
const native=form.defaults('lead_create');
native.find(f=>f.id==='title').visible=false;
assert.throws(()=>form.validate('lead_create',native),/System-required field/);
const stage=form.defaults('lead_stage');
stage.find(f=>f.id==='due').required=false;
assert.throws(()=>form.validate('lead_stage',stage),/System-required field/);
const title=form.defaults('customer');
const custom={id:'custom_service_type',label:'Service type',type:'select',system:false,protected:false,
 required:true,visible:true,layout:'half',options:['Installation','AMC'],when:{field:'type',operator:'equals',equals:'Business'}};
title.push(custom);assert.ok(form.validate('customer',title));
const duplicate=form.defaults('customer');duplicate.push({...duplicate[0]});
assert.throws(()=>form.validate('customer',duplicate),/unique field key/);
const cyc=form.defaults('lead_create');cyc.push({...custom,id:'custom_loopa',when:{field:'custom_loopb',operator:'equals',equals:'Yes'}},
 {...custom,id:'custom_loopb',when:{field:'custom_loopa',operator:'equals',equals:'Yes'}});
assert.throws(()=>form.validate('lead_create',cyc),/loops/);
const rls=[
 "gr_form_schemas enable row level security",
 "gr_form_answers enable row level security",
 "form schema admin insert",
 "form schema admin update",
 "form answers private reader",
 "created_by=auth.uid()",
 "revoke all on public.gr_form_schemas,public.gr_form_answers from public,anon,authenticated"
];
for(const marker of rls)assert.ok(sql.includes(marker),'Missing secure storage: '+marker);
assert.ok(settings.includes("['forms','Form Builder']")&&settings.includes("tab==='forms'"));
assert.ok(one.includes('openFormBuilder:host=>window.GreenRichFormBuilder.mount'));
assert.ok(html.includes('greenrich-form-builder.js?v=')&&html.includes('greenrich-form-builder.css?v='));
assert.ok(html.indexOf('greenrich-form-builder.js?v=')<html.indexOf('greenrich-lead-pipeline.js?v='));
assert.ok(contacts.includes("GreenRichFormBuilder.decorate(form,co,'customer')"));
assert.ok(contacts.includes("GreenRichFormBuilder.saveAnswers(co,'customer',saved.id,extra)"));
assert.ok(contacts.includes("!k.startsWith('custom_')"),'Never send arbitrary columns to customers');
assert.ok(pipeline.includes("GreenRichFormBuilder?.decorate?.(d.querySelector('form'),l.company_id,'lead_stage')"));
assert.ok(pipeline.includes("GreenRichFormBuilder?.decorate?.(d.querySelector('form'),comp.value,'lead_create')"));
assert.ok(pipeline.includes("GreenRichFormBuilder.saveAnswers(l.company_id,'lead_stage'"));
assert.ok(pipeline.includes("GreenRichFormBuilder.saveAnswers(fd.get('company'),'lead_create'"));
assert.ok(crm.includes("window.GreenRichFormBuilder.decorate($('#editor-form'),co,formKey)"));
assert.ok(crm.includes("GreenRichFormBuilder.saveAnswers(targetId,'sales_order',row.id,fbExtra)"));
assert.ok(crm.includes("!key.startsWith('custom_')"),'Never mix new questions into Sale Order native columns');
assert.ok(css.includes('.grfb-row')&&css.includes('.grfb-preview-form'));
const customCfg=form.defaults('customer');
customCfg[0].visible=false; // intentionally malicious override; should protect at runtime
customCfg.push({...custom});
const fakeDb={from:()=>({select:()=>({in:async()=>({data:[{company_id:'grow-india',form_key:'customer',fields:customCfg,version:1}],error:null})})})};
(async()=>{
 await form.ready(fakeDb,['grow-india']);
 const actual=form.schema('grow-india','customer');
 assert.equal(actual.find(f=>f.id==='name').visible,true,'Cannot hide locked name in loaded settings');
 assert.ok(actual.some(f=>f.id==='custom_service_type'),'Shared custom question must load');
 console.log('PASS Admin Form Builder: 4 form types, protected system fields, custom choices, conditions, schema cloud cache, RLS and CRM integration.');
})().catch(err=>{console.error(err);process.exitCode=1});
