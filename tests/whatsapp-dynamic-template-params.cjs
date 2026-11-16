'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const ui=read('greenrich-whatsapp-crm-workflows.js'),backend=read('supabase/functions/greenrich-whatsapp-send/index.ts');
assert.doesNotThrow(()=>new vm.Script(ui),'CRM marketing script must parse');
const start=ui.indexOf('function templateRequirements(t){'),stop=ui.indexOf('function drawTemplateRequirements(form){',start);
assert.ok(start>=0&&stop>start,'Template inspector must be callable');
const templateRequirements=vm.runInNewContext('('+ui.slice(start,stop).trim()+')');
const template={provider_preview:{components:[
 {type:'HEADER',format:'IMAGE'},
 {type:'BODY',text:'Hi {{1}}, order {{orderid}} is ready. Coupon {{coupon}}.'},
 {type:'BUTTONS',buttons:[{type:'COPY_CODE',text:'Copy offer code'},
 {type:'URL',url:'https://example.com/product/{{1}}',text:'Buy Now'},
 {type:'QUICK_REPLY',text:'Thanks'}]}
]}};
const spec=templateRequirements(template);
assert.equal(spec.format,'IMAGE');
assert.deepEqual(Array.from(spec.fields,x=>x.key),['body:1','body:orderid','body:coupon','coupon:0','url:1']);
assert.ok(spec.fields.some(x=>x.key==='body:1'),'Numeric variable must be displayed so user can choose CRM name/order field');
assert.equal(templateRequirements({provider_preview:{components:[
 {type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Hi {{clientname}}'},
 {type:'BUTTONS',buttons:[{type:'QUICK_REPLY',text:'Hello'}]}]}}).fields.length,1);
for(const k of ['data-wa-required-fields','drawTemplateRequirements(form)',
 'data-wa-field','template_fields:templateFields','campaignParamValues','clientname',
 'accept="image/png,image/jpeg"'])assert.ok(ui.includes(k),'Missing dynamic form integration '+k);
for(const k of ['function templateSpecs(template:any)','function components(template:any,person:Person,image:string,fields:Record<string,string>={})',
 'type:"button",sub_type:"copy_code"','type:"coupon_code",coupon_code:code',
 'type:"button",sub_type:"url"','coupon:'+String(),'campaign.audience?.template_fields||{}',
 'input.template_fields||{}','if(!["image/png","image/jpeg"].includes(campaign.attachment_mime))'])
 assert.ok(backend.includes(k),'Missing required send and preflight handling '+k);
assert.ok(backend.includes('template.provider_preview'),'Approved metadata must remain intact');
assert.ok(read('secure.html').includes('greenrich-whatsapp-crm-workflows.js?v=20261116-zero-repeat-sync-1'));
console.log('PASS: template-derived dynamic BODY, HEADER, COPY_CODE and URL fields; backend sending/preflight and JPEG/PNG safety');
