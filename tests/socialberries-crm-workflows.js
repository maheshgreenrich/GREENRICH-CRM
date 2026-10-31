'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const get=p=>fs.readFileSync(p,'utf8');
const app=get('greenrich-one.js'),admin=get('greenrich-company-admin.js'),
 lead=get('greenrich-lead-pipeline.js'),sheet=get('greenrich-sheet-manager.js'),
 customer=get('greenrich-customer-profile.js'),wa=get('greenrich-whatsapp-crm-workflows.js'),
 html=get('secure.html'),
 schema=get('supabase/migrations/20261031120000_socialberries_crm_led_workflow.sql'),
 hook=get('supabase/migrations/20261031121500_wa_sheet_welcome_hook.sql');
for(const [name,script] of Object.entries({app,admin,lead,sheet,customer,wa}))new vm.Script(script,{filename:name});
assert.ok(app.includes('GreenRichWhatsAppWorkflows.mountMarketing'),'Marketing menu must display CRM-only handoff');
assert.ok(admin.includes("['whatsapp','WhatsApp Integration']"),'Admin Settings must include WhatsApp');
assert.ok(app.includes('openWhatsAppSettings:host=>'),'WhatsApp Settings must be actionable');
assert.ok(html.includes('greenrich-whatsapp-crm-workflows.js?v='),'Load WhatsApp CRM module in live site');
assert.ok(html.indexOf('greenrich-whatsapp-crm-workflows.js?v=')<html.indexOf('greenrich-one.js?v='),'Module loads before CRM shell');
assert.ok(lead.includes("Welcome WhatsApp template (optional)"),'New Lead and Excel/CSV must include optional welcome template');
assert.ok(lead.includes("if(leadId&&fd.get('welcome'))"),'Blank welcome selection must create no welcome preference');
assert.ok(lead.includes("lead.welcome_template"),'Excel/CSV row can override template by name or ID');
assert.ok(lead.includes("saveLeadWelcome(ctx.db"),'Save welcome template against returned lead ID');
assert.ok(sheet.includes('gr_wa_set_sheet_welcome'),'Google Sheet must store template default independently');
assert.ok(sheet.includes("form.elements.welcome_template.innerHTML"),'Google Sheet company change updates template choices');
assert.ok(customer.includes("WhatsApp service follow-up"),'Customer 360 must have per-customer repeat option');
assert.ok(customer.includes("GreenRichWhatsAppWorkflows.openCustomerRule"),'Customer button must open rule editor');
assert.ok(wa.includes("scope==='all'||x.company_id===scope"),'Audience must filter authorized company');
assert.ok(wa.includes("kind==='all'||x.type===kind"),'Audience must filter lead vs customer');
assert.ok(wa.includes("source==='all'||x.source===source"),'Audience must filter source');
assert.ok(wa.includes("tag==='all'||x.tags.includes(tag)"),'Audience must filter tags');
assert.ok(wa.includes("owner==='all'||x.owner===owner"),'Audience must filter salesperson');
assert.ok(wa.includes("status:'draft'"),'Campaign execution stays draft without provider auth');
assert.ok(wa.includes("The server checks marketing permission and sending readiness automatically.")&&wa.includes("secureSend('check_campaign'")&&wa.includes("data-send-campaign"),'Direct send must validate marketing eligibility and provider readiness');
assert.ok(wa.includes("Auto-sync Templates (provider endpoint needed)"),'Surface disabled sync action instead of fake templates');
assert.ok(wa.includes('gr_wa_inbound_rules'),'Inbound mapping must have database storage');
assert.ok(wa.includes('interval_days'),'Support custom recurrent service intervals');
assert.ok(schema.includes('enable row level security'),'Protect new user data');
assert.ok(schema.includes("status='draft'"),'Protect recurring rules from sending');
assert.ok(hook.includes('after insert or update of lead_id'),'Google Sheet importer must capture lead welcome default');
assert.ok(!wa.includes('fetch("https://whatsapp.socialberries.in'),'Never guess provider API endpoint');
const ctx={window:{},document:{},console,Date,Math,Array,Object,Number,String,Intl,Set,Map};
vm.runInNewContext(wa,ctx);
assert.equal(typeof ctx.window.GreenRichWhatsAppWorkflows.mountMarketing,'function');
assert.equal(typeof ctx.window.GreenRichWhatsAppWorkflows.mountSettings,'function');
assert.equal(typeof ctx.window.GreenRichWhatsAppWorkflows.saveLeadWelcome,'function');
assert.equal(typeof ctx.window.GreenRichWhatsAppWorkflows.sendMessage,'undefined','Do not invent live message delivery');
console.log('PASS: SocialBerries CRM-only marketing, optional welcome, Sheet defaults, repeated customer service, role-guarded settings, and safe unconnected provider status');
