'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('secure.html','utf8');
const css=fs.readFileSync('greenrich-whatsapp-inbox.css','utf8');
const js=fs.readFileSync('greenrich-whatsapp-inbox.js','utf8');
const dom=new JSDOM('<!doctype html><div id="grwx-inbox-host"></div>',{url:'https://maheshgreenrich.github.io',runScripts:'outside-only'});
const w=dom.window;
w.eval(js);
const template={name:'diwali_offer',company_id:'grow-india',language:'en_US',provider_approval:'not_verified',provider_preview:{
 components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Diwali sale!'},
 {type:'BUTTONS',buttons:[{text:'Copy offer code',type:'QUICK_REPLY'},{text:'Buy Now',type:'URL'}]}]}};
const settings={
 admin:false,companies:['grow-india'],companyName:()=> 'GreenRich Grow India Pvt Ltd',
 getRows:()=>({messages:[{id:'m1',company_id:'grow-india',phone:'919150014040',body:'Marketing template: diwali_offer',direction:'outbound',event_at:'2026-11-17T08:10:00Z',delivery_status:'read'}],connections:[],profiles:[],tags:[],templates:[template]}),
 getTargets:()=>[{id:'L:1',company_id:'grow-india',name:'kumar',mobile:'9150014040',type:'Lead',tags:[],orders:[],products:[]}],
 refresh:async()=>{},notify:()=>{}
};
const mount=w.document.getElementById('grwx-inbox-host');
w.GreenRichInbox.mount(mount,settings);
assert.ok(mount.textContent.includes('Inbox'),'Inbox should render');
assert.ok(mount.textContent.includes('v9'),'New UI build marker must show');
assert.equal(mount.querySelector('.grwx-contact-name')?.textContent,'kumar');
assert.equal(mount.querySelector('.grwx-contact-phone')?.textContent,'+91 9150014040');
assert.ok(mount.querySelector('#grwx-compose'),'Bottom typing textarea absent');
assert.ok(mount.querySelector('.grwx-composer-layout'),'Single-row composer wrapper absent');
assert.equal(mount.querySelectorAll('.grwx-tool-icon').length,4);
assert.equal(mount.querySelector('[data-grwx-action="send-draft"]').disabled,true);
assert.equal(mount.querySelectorAll('.grwx-template-buttons span').length,2,'Approved-template metadata must render CTA labels even while sending is unverified');
assert.ok(mount.textContent.includes('Provider did not supply a public image URL'),'No fabricated image when approved image URL is missing');
assert.ok(css.includes('.grwx-contact-name')&&css.includes('.grwx-composer-layout'),'v6 UI declarations missing');
assert.ok(html.includes('greenrich-whatsapp-inbox.js?v=20261117-inbox-company-v10'),'Version marker missing in HTML');
w.GreenRichInbox.unmount();w.close();
console.log('PASS: real DOM renders name, full phone, compact composer and template CTA fallback; unauthorized user cannot send');
