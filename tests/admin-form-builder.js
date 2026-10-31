'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const builder=read('greenrich-form-builder.js'),settings=read('greenrich-company-admin.js'),one=read('greenrich-one.js'),
 contacts=read('greenrich-contacts.js'),pipeline=read('greenrich-lead-pipeline.js'),crm=read('greenrich-crm-inline.js'),
 html=read('secure.html'),css=read('greenrich-form-builder.css'),
 sql=read('supabase/migrations/20261031200000_admin_form_builder.sql');
for(const [file,src] of [['builder',builder],['settings',settings],['app',one],['contacts',contacts],
 ['leads',pipeline],['crm',crm]])new vm.Script(src,{filename:file});
const ops=read('greenrich-operations.js');
new vm.Script(ops,{filename:'greenrich-operations.js'});
const sandbox={window:{}};vm.runInNewContext(ops,sandbox);vm.runInNewContext(builder,sandbox);
const form=sandbox.window.GreenRichFormBuilder;
assert.deepEqual(Array.from(form.KEYS).slice(0,4),['lead_create','lead_stage','customer','sales_order']);
assert.equal(form.KEYS.length,16,'All 12 live ERP Operations forms must be configurable');
assert.ok(form.KEYS.includes('ops_purchase_order')&&form.KEYS.includes('ops_bom')&&form.KEYS.includes('ops_service'));
for(const key of form.KEYS){const defs=form.defaults(key);assert.ok(defs.length>=8);assert.ok(form.validate(key,defs));}
const native=form.defaults('lead_create');
native.find(f=>f.id==='title').type='textarea';
assert.ok(form.validate('lead_create',native),'Admin can change a built-in field control type');
native.find(f=>f.id==='title').visible=false;
assert.ok(form.validate('lead_create',native),'Admin can choose visibility; backend still validates data contracts');
const stage=form.defaults('lead_stage');
stage.find(f=>f.id==='due').required=false;
assert.ok(form.validate('lead_stage',stage),'Admin can configure required status without changing the server rules');
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
assert.ok(contacts.includes("GreenRichFormBuilder.decorate(form,co,'customer',saved)"));
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
assert.ok(builder.includes('data-grfb="answers"')&&builder.includes('gr_form_answers'), 'Admin should be able to review saved custom answers');
assert.ok(builder.includes("previewForm.addEventListener('change',update)"),'Preview must respond to selected stage or other conditions');
assert.ok(crm.includes('await window.GreenRichCRMCloud.whenSynced(targetId);'),'Custom answers follow cloud-synchronized order');
assert.ok(ops.includes("window.GreenRichFormBuilder?.decorate?.(form,co,'ops_'+kind)"),'ERP editor must apply Admin-designed form');
assert.ok(ops.includes("GreenRichFormBuilder.saveAnswers(company,'ops_'+k,payload.id,extra)"),'ERP must store custom answers');
assert.ok(builder.includes("data-op=\"add-rule\"")&&builder.includes("data-edit=\"rules_match\""),'AND/OR UI controls');
assert.ok(builder.includes("applyNativeDisplay(form,wrap,f)"),'Admin field type changes must reach native forms');
assert.ok(builder.includes("proxy.dataset.grfbProxy='1'"),'CRM should preserve its original data control when changing the visual field type');
assert.ok(builder.includes('matchesCondition(field,read)'),'Employee forms must use the ALL/ANY condition evaluator');
const equals={operator:'equals',value:'Yes'};
assert.equal(form.matchesRule('Yes',equals),true);
assert.equal(form.matchesRule('No',equals),false);
assert.equal(form.matchesRule('300',{operator:'greater',value:'250'}),true);
assert.equal(form.matchesRule('Additional service',{operator:'contains',value:'service'}),true);
assert.equal(form.matchesRule('',{operator:'empty',value:''}),true);
assert.equal(form.matchesRule('A',{operator:'in_list',value:'A,B,C'}),true);
const ruleGroup={conditions:{match:'all',rules:[{field:'a',operator:'equals',value:'Yes'},{field:'b',operator:'greater_equal',value:'2'}]}};
assert.equal(form.matchesCondition(ruleGroup,id=>({a:'Yes',b:'3'})[id]),true);
assert.equal(form.matchesCondition(ruleGroup,id=>({a:'Yes',b:'1'})[id]),false);
ruleGroup.conditions.match='any';
assert.equal(form.matchesCondition(ruleGroup,id=>({a:'No',b:'3'})[id]),true);
ruleGroup.conditions.rules[0].operator='filled';
assert.equal(form.matchesCondition(ruleGroup,id=>({a:null,b:'1'})[id]),false,'Hidden prerequisite cannot satisfy condition');
const multi=form.defaults('lead_create');multi.push({
 ...custom,id:'custom_multi_rule',when:null,
 conditions:{match:'all',rules:[{field:'source',operator:'filled',value:''},{field:'product',operator:'equals',value:'A'}]}
});
assert.ok(form.validate('lead_create',multi));
multi[multi.length-1].conditions.rules.push({field:'custom_multi_rule',operator:'equals',value:'Yes'});
assert.throws(()=>form.validate('lead_create',multi),/missing or identical/);
const customCfg=form.defaults('customer');
customCfg[0].visible=false; // intentionally malicious override; should protect at runtime
customCfg.push({...custom});
const fakeDb={from:table=>({select:()=>table==='gr_shared_form_schemas'?Promise.resolve({data:[{form_key:'customer',fields:customCfg,version:1}],error:null}):({order:async()=>({data:[],error:null})})})};
(async()=>{
 await form.ready(fakeDb,['grow-india']);
 const actual=form.schema('grow-india','customer');
 assert.equal(JSON.stringify(actual),JSON.stringify(form.schema('enviro-solutions','customer')),'Both companies use the same layout');
 assert.equal(actual.find(f=>f.id==='name').visible,false,'Admin changes to built-in fields should persist');
 assert.ok(actual.some(f=>f.id==='custom_service_type'),'Shared custom question must load');
 console.log('PASS Admin Form Builder: 16 forms, native visibility/type controls, shared schemas, cloud cache, RLS and CRM/ERP wiring.');
})().catch(err=>{console.error(err);process.exitCode=1});
