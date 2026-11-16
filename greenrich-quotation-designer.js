'use strict';
/* GREENRICH quotation visual design: company letterheads and 50+ product/category templates.
 * Editable HTML project is GrapesJS project JSON stored in Supabase; quotation print output
 * is sanitized and contains no script execution. PdfCraft Rust/WASM remains separate. */
(()=>{
const G='https://cdn.jsdelivr.net/npm/grapesjs@0.23.2/dist/grapes.min.js';
const GC='https://cdn.jsdelivr.net/npm/grapesjs@0.23.2/dist/css/grapes.min.css';
const D='https://cdn.jsdelivr.net/npm/dompurify@3.2.7/dist/purify.min.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;':'&quot;',"'":'&#39;'}[c]));
const safeCss=x=>String(x||'').replace(/@import[^;]*;|url\s*\([^)]*\)|expression\s*\([^)]*\)|<\/?style[^>]*>/gi,'');
const load=(url,test)=>test()?Promise.resolve():new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=url;el.onload=resolve;el.onerror=()=>reject(Error('Could not load visual editor dependency'));document.head.append(el)});
const withAssets=async()=>{if(!document.querySelector('[data-grqd-grapes-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href=GC;l.dataset.grqdGrapesCss='1';document.head.append(l)}await Promise.all([load(G,()=>!!window.grapesjs),load(D,()=>!!window.DOMPurify)])};
const cleanse=x=>window.DOMPurify?window.DOMPurify.sanitize(x,{FORBID_TAGS:['script','iframe','object','embed','form','svg','math','style'],FORBID_ATTR:['onload','onclick','onerror','srcdoc'] }):'';
const samplePage=(body)=>'<section class="grq-print-page">'+body+'</section>';
const sample=()=>[
samplePage('<h1 style="text-align:center;color:#28734a">TECHNICAL &amp; COMMERCIAL PROPOSAL</h1><h2 style="text-align:center">{{product_name}}</h2><table><tbody><tr><th>Proposal particulars</th><th>Details</th></tr><tr><td>Reference</td><td>{{quotation_no}}</td></tr><tr><td>Date</td><td>{{quotation_date}}</td></tr><tr><td>Prepared for</td><td>{{customer_name}}</td></tr><tr><td>Validity</td><td>{{valid_until}}</td></tr></tbody></table><h2>1. Client details</h2><table><tbody><tr><th>Contact</th><th>Details</th></tr><tr><td>Name</td><td>{{customer_name}}</td></tr><tr><td>Location</td><td>{{customer_address}}</td></tr><tr><td>Phone</td><td>{{customer_phone}}</td></tr><tr><td>Email</td><td>{{customer_email}}</td></tr></tbody></table><h2>2. About our company</h2><p>Replace this section with your GreenRich company introduction.</p>'),
samplePage('<h2>A. TECHNICAL PROPOSAL</h2><h3>A1. Proposed solution</h3><p>Enter product specifications, daily capacity, and system recommendations here.</p><div class="grqd-image-guide">Drag product photos here</div><table><tbody><tr><th>Design item</th><th>Proposed specification</th></tr><tr><td>Waste requirement</td><td>50 kg/day</td></tr><tr><td>Installed capacity</td><td>50 kg/day</td></tr><tr><td>Configuration</td><td>Dual-bin system</td></tr></tbody></table><h3>A2. Parts included</h3><p>Describe bin parts and included consumables.</p>'),
samplePage('<h2>System benefits</h2><table><tbody><tr><th>Benefit</th><th>Customer value</th></tr><tr><td>Low operating effort</td><td>Convenient daily use</td></tr><tr><td>Natural composting</td><td>Organic-waste processing</td></tr></tbody></table><h2>Certifications and registrations</h2><p>Insert verified certification details for the selected product.</p><h3>Operating cycle</h3><p>Describe product operating method and required maintenance.</p>'),
samplePage('<h2>Technical configuration</h2><table><tbody><tr><th>Model</th><th>Qty</th><th>Capacity</th><th>Dimensions</th></tr><tr><td>{{product_name}}</td><td>1 set</td><td>50 kg/day</td><td>To be confirmed</td></tr></tbody></table><h2>Process / operating cycle</h2><p>Add step-by-step tables, site diagrams, images, and installation requirements.</p>'),
samplePage('<h2>B. COMMERCIAL PROPOSAL</h2><h3>Pricing and total</h3><p>Product: {{product_name}}</p><div class="grqd-pricing-placeholder">{{pricing_table}}</div><h3>Bank details</h3><p>{{bank_details}}</p><h3>Commercial terms</h3><table><tbody><tr><th>Payment</th><td>As agreed</td></tr><tr><th>Delivery</th><td>To be confirmed</td></tr><tr><th>Validity</th><td>{{valid_until}}</td></tr></tbody></table>'),
samplePage('<h2>Warranty</h2><p>Add product-specific warranty coverage and exclusions.</p><h2>Operating assumptions</h2><p>Specify the intended operating conditions and client obligations.</p><h2>Acceptance / next step</h2><p>Please confirm your billing and delivery address.</p><p style="margin-top:60px">With warm regards<br>For {{company_name}}<br>Authorised Signatory</p>')
].join('');
const starter=()=>samplePage('<h1 style="text-align:center;color:#28734a">PRICE QUOTATION</h1><h2>{{product_name}}</h2><p>Prepared for: {{customer_name}}</p><p>Quotation: {{quotation_no}} · {{quotation_date}}</p><p>Add text, images, tables and sections by dragging elements from the left panel.</p><div>{{pricing_table}}</div><p>Bank details: {{bank_details}}</p>');
const letterDefault=(name,zone)=>zone==='header'?
 '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #417757;height:97px"><div style="width:80px;text-align:center;color:#39704c">LEFT<br>LOGO</div><div style="text-align:center;font-size:20px;font-weight:700">'+esc(name)+'</div><div style="width:80px;text-align:center;color:#39704c">RIGHT<br>LOGO</div></div>':
 '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #48754b;padding:12px 20px;height:95px"><div style="width:75px;color:#51805a">LOGO</div><div style="text-align:center;font-size:12px">{{company_address}}<br>{{company_contact}}</div><div style="width:75px;color:#51805a">CERT.</div></div>';
const pageCss='.grq-print-page{box-sizing:border-box;width:794px;min-height:1123px;background:#fff;padding:150px 72px 130px;page-break-after:always;break-after:page;position:relative;font-family:Georgia,serif;color:#283649;font-size:14px;line-height:1.5}.grq-print-page:last-child{page-break-after:auto;break-after:auto}.grq-print-page h1,.grq-print-page h2,.grq-print-page h3{color:#267347}.grq-print-page h1{font-size:23px}.grq-print-page h2{font-size:18px}.grq-print-page h3{font-size:15px}.grq-print-page table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px}.grq-print-page th{background:#e5f0e5}.grq-print-page td,.grq-print-page th{border:1px solid #9fae9f;padding:7px;text-align:left;vertical-align:top}.grqd-image-guide{height:180px;background:#eff4ee;display:flex;align-items:center;justify-content:center;color:#778675}';
const tokenData=(quote,seller,customer)=>({
 company_name:seller?.legal_name||'GREENRICH',company_address:[seller?.address,seller?.city_state_pincode].filter(Boolean).join(', '),
 company_contact:[seller?.phone,seller?.email].filter(Boolean).join(' · '),
 customer_name:customer?.name||quote?.customer_name||'',customer_address:[customer?.address1,customer?.city,customer?.state,customer?.pincode].filter(Boolean).join(', '),
 customer_phone:customer?.mobile||'',customer_email:customer?.email||'',quotation_no:quote?.quotation_no||'Draft',
 quotation_date:quote?.quotation_date||'',valid_until:quote?.valid_until||'',product_name:(quote?.lines||[]).map(l=>l.description).filter(Boolean).join(', '),
 bank_details:[seller?.bank_name,seller?.bank_account,seller?.bank_ifsc].filter(Boolean).join(' · ')
});
function pricingTable(q){
 let subtotal=0,gst=0;
 const rows=(q?.lines||[]).map((l,i)=>{const gross=Number(l.qty||0)*Number(l.rate||0),rate=Number(l.tax||0);let base=l.inclusive?gross/(1+rate/100):gross;subtotal+=base;gst+=l.inclusive?gross-base:base*rate/100;return '<tr><td>'+(i+1)+'</td><td>'+esc(l.description)+'</td><td>'+esc(l.qty)+'</td><td>₹'+Number(l.rate||0).toLocaleString('en-IN')+'</td><td>'+esc(rate)+'%</td><td>₹'+gross.toLocaleString('en-IN',{maximumFractionDigits:2})+'</td></tr>'}).join('');
 return '<table><tbody><tr><th>#</th><th>Particulars</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr>'+rows+'<tr><td colspan="5">Taxable subtotal</td><td>₹'+subtotal.toLocaleString('en-IN',{maximumFractionDigits:2})+'</td></tr><tr><td colspan="5">GST</td><td>₹'+gst.toLocaleString('en-IN',{maximumFractionDigits:2})+'</td></tr><tr><th colspan="5">Grand total</th><th>₹'+(subtotal+gst+Number(q?.freight||0)-Number(q?.discount||0)).toLocaleString('en-IN',{maximumFractionDigits:2})+'</th></tr></tbody></table>';
}
function renderHtml(config,letterhead,quotation,seller,customer){
 const layout=config||{},head=letterhead?.header||{},foot=letterhead?.footer||{},token=tokenData(quotation,seller,customer);
 const raw=layout.designerHtml||starter();
 const tmp=document.createElement('template');tmp.innerHTML=cleanse(raw);const sheets=[...tmp.content.querySelectorAll('.grq-print-page')];
 const items=sheets.length?sheets:[tmp.content];
 const expand=(str,index)=>String(str).replace(/\{\{([a-z_]+)\}\}/gi,(_,key)=>{
  if(key==='page')return String(index+1);if(key==='pages')return String(items.length);
  if(key==='pricing_table')return 'GRQ_PRICING_RENDER_TOKEN';
  return esc(token[key]||'');
 }).replace(/GRQ_PRICING_RENDER_TOKEN/g,pricingTable(quotation));
 const body=items.map((p,i)=>{
  const top=expand(cleanse(head.html||letterDefault(seller?.legal_name,'header')),i);
  const bottom=expand(cleanse(foot.html||letterDefault(seller?.legal_name,'footer')),i);
  return '<div class="paper grqd-export-page grq-print-page" style="position:relative">'+
  '<header class="grqd-repeat-head" style="position:absolute;top:0;left:0;width:100%;height:110px;padding:0 25px;overflow:hidden">'+top+'</header>'+
  '<main>'+expand(cleanse(p.innerHTML),i)+'</main>'+
  '<footer class="grqd-repeat-foot" style="position:absolute;bottom:0;left:0;width:100%;height:115px;padding:0 25px;overflow:hidden">'+bottom+'</footer></div>';
 }).join('');
 const css=safeCss(layout.designerCss)+'\n'+safeCss(head.css)+'\n'+safeCss(foot.css);
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Quotation</title><style>body{margin:0;background:#f1f4f8}'+pageCss+css+'@media print{@page{size:A4;margin:0}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.grq-print-page{width:210mm;height:297mm;min-height:297mm}}</style></head><body>'+body+'</body></html>';
}
let host,opts,editor,zone='body',selected=null,template=null,templates=[],letterheads={};
const notice=(msg,type)=>opts?.notify?.(msg,type);
const company=()=>opts.company,all=()=>templates.filter(t=>t.company_id===company());
const products=()=>opts.products.filter(p=>p.company_id===company());
const categories=()=>[...new Set(products().map(p=>String(p.category||'').trim()).filter(Boolean))].sort();
const html=x=>String(x??'');
const opt=(v,label,chosen)=>'<option value="'+esc(v)+'"'+(v===chosen?' selected':'')+'>'+esc(label)+'</option>';
function updateChoice(){
 const rec=template;
 host.querySelector('#grqd-name').value=rec?.name||'New proposal template';
 host.querySelector('#grqd-scope').value=rec?.product_id?'product':rec?.config?.scope||'company';
 host.querySelector('#grqd-category').value=rec?.config?.category||'';
 host.querySelector('#grqd-product').value=rec?.product_id||'';
}
function initializeBlocks(){
 const add=(key,label,content)=>editor.BlockManager.add(key,{label,category:'Proposal elements',content});
 add('heading','Heading','<h2 style="font-size:20px;color:#28734a">Section heading</h2>');
 add('paragraph','Text / description','<p style="font-size:14px;line-height:1.5">Double-click to type your text.</p>');
 add('image','Image / logo',{type:'image',style:{width:'220px',height:'150px'}});
 add('table','Table','<table><tbody><tr><th>Heading A</th><th>Heading B</th></tr><tr><td>Click to edit</td><td>Click to edit</td></tr></tbody></table>');
 add('columns','Two columns','<div style="display:flex;gap:18px"><div style="flex:1">Left column text</div><div style="flex:1">Right column text</div></div>');
 add('quotation','Pricing table','<div>{{pricing_table}}</div>');
 add('field','Customer / dynamic field','<p>Prepared for: {{customer_name}} · {{quotation_no}}</p>');
 add('rule','Divider','<hr style="border:0;border-top:2px solid #377951;margin:10px 0">');
 add('signature','Signature','<p>For {{company_name}}<br>Authorized signatory</p>');
 add('page','New A4 page','<section class="grq-print-page"><h2>New page heading</h2><p>Drag elements here.</p></section>');
}
function editorContainer(){
 host.innerHTML='<div class="grqd-studio"><header><div><h2>Visual Quotation & Proposal Builder</h2><p>Drag text, tables, images and columns onto A4 pages. Double-click to edit, use Styles to change font, width, colour, spacing and borders.</p></div><div class="grqd-buttons"><button id="grqd-sample">Load 6-page MGB example</button><button id="grqd-blank">Blank design</button><button id="grqd-save" class="primary"'+(!opts.admin?' disabled':'')+'>Save design</button><button id="grqd-preview">Preview quotation PDF</button></div></header>'+
 '<div class="grqd-controls"><label>Design to edit<select id="grqd-template">'+opt('','New template',!template)+all().map(t=>opt(t.id,t.name,template?.id===t.id)).join('')+'</select></label>'+
 '<label>Template name<input id="grqd-name" maxlength="120" placeholder="e.g. MGB 50 Proposal"></label>'+
 '<label>Apply to<select id="grqd-scope">'+[['company','Entire company'],['category','Product category'],['product','Individual product']].map(x=>opt(x[0],x[1],'company')).join('')+'</select></label>'+
 '<label>Category<select id="grqd-category">'+opt('','Choose category',false)+categories().map(v=>opt(v,v,false)).join('')+'</select></label>'+
 '<label>Product<select id="grqd-product">'+opt('','Choose product',false)+products().map(p=>opt(p.id,p.name,false)).join('')+'</select></label></div>'+
 '<nav class="grqd-modes"><button data-zone="body">Proposal pages</button><button data-zone="header">Company header · both logos</button><button data-zone="footer">Company footer</button><small>Header and footer are shared by every quotation for this company.</small></nav>'+
 '<div class="grqd-editor-grid"><aside><h3>Drag elements</h3><div id="grqd-blocks"></div></aside><div id="grqd-canvas"></div><aside><h3>Styles & layers</h3><div id="grqd-styles"></div><div id="grqd-layers"></div><label>Upload selected image<input type="file" id="grqd-image" accept="image/png,image/jpeg,image/webp"></label><small>Max 400 KB per image. Keep quotation images optimised.</small></aside></div></div>';
}
function switchZone(next){
 if(editor?.getDirtyCount()>0&&!window.confirm('Unsaved design changes will be lost. Continue?'))return;
 zone=next;const data=zone==='body'?template?.config?.designerProject:letterheads[company()]?.config?.[zone]?.project;
 const fallback=zone==='body'?starter():letterDefault(opts.companyNames?.[company()]||'GREENRICH',zone);
 if(data)editor.loadProjectData(data);else {editor.setComponents(fallback);editor.setStyle(zone==='body'?pageCss:'')}
 host.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone===zone));
 editor.clearDirtyCount();
}
async function save(){
 if(!opts.admin)throw Error('Only Admin can save shared quotation templates');
 const project=editor.getProjectData(),h=editor.getHtml(),css=safeCss(editor.getCss());
 if(JSON.stringify(project).length>2_500_000)throw Error('Design exceeds 2.5 MB. Resize images before saving.');
 if(zone!=='body'){
  const existing=letterheads[company()]?.config||{};
  const config={...existing,[zone]:{project,html:cleanse(h),css}};
  const body={company_id:company(),config,updated_by:opts.userId,updated_at:new Date().toISOString()};
  const {data,error}=await opts.db.from('gr_quotation_letterheads').upsert(body,{onConflict:'company_id'}).select().single();
  if(error)throw Error(error.message);
  letterheads[company()]={config:data.config};
  editor.clearDirtyCount();notice('Company '+zone+' saved. It will repeat on every proposal page.');opts.onSaved?.();return;
 }
 const name=host.querySelector('#grqd-name').value.trim();
 const scope=host.querySelector('#grqd-scope').value,category=host.querySelector('#grqd-category').value,product=host.querySelector('#grqd-product').value;
 if(!name)throw Error('Enter the template name');
 if(scope==='category'&&!category)throw Error('Choose a category');
 if(scope==='product'&&!product)throw Error('Choose a product');
 const config={designerVersion:1,designerProject:project,designerHtml:cleanse(h),designerCss:css,scope,category:scope==='category'?category:''};
 const body={company_id:company(),name,product_id:scope==='product'?product:null,config,updated_at:new Date().toISOString()};
 const query=template?.id?opts.db.from('gr_quotation_templates').update(body).eq('company_id',company()).eq('id',template.id).select().single():opts.db.from('gr_quotation_templates').insert({...body,created_by:opts.userId}).select().single();
 const {data,error}=await query;if(error)throw Error(error.message);
 template=data;templates=await opts.reloadTemplates();editor.clearDirtyCount();notice('Quotation template saved for '+scope+'.');opts.onSaved?.();editorContainer();setupEditor(data.config.designerProject);updateChoice();
}
function setupEditor(project){
 if(editor)editor.destroy();
 editor=window.grapesjs.init({
  container:host.querySelector('#grqd-canvas'),height:'830px',fromElement:false,storageManager:false,showOffsets:true,
  panels:{defaults:[]},blockManager:{appendTo:host.querySelector('#grqd-blocks')},
  styleManager:{appendTo:host.querySelector('#grqd-styles'),sectors:[{name:'Typography',open:true,buildProps:['font-family','font-size','font-weight','color','text-align','line-height','letter-spacing']},{name:'Dimensions',open:true,buildProps:['width','height','min-height','padding','margin','display']},{name:'Decoration',open:false,buildProps:['background-color','border','border-radius','box-shadow']} ]},
  layerManager:{appendTo:host.querySelector('#grqd-layers')},
  canvas:{styles:[GC]},assetManager:{upload:false,autoAdd:false},
  components:zone==='body'?starter():letterDefault(opts.companyNames?.[company()]||'GREENRICH',zone),
  style:zone==='body'?pageCss:'',
  deviceManager:{devices:[{name:'A4',width:'794px'}]}
 });
 initializeBlocks();
 editor.on('asset:upload:response',()=>{});
 if(project)editor.loadProjectData(project);
 editor.on('component:selected',m=>{selected=m});
 editor.clearDirtyCount();
}
function bind(){
 host.addEventListener('click',e=>{
  const t=e.target;
  if(t.id==='grqd-save')void save().catch(x=>notice(x.message,'error'));
  if(t.id==='grqd-preview'){const config=zone==='body'?{designerVersion:1,designerHtml:editor.getHtml(),designerCss:editor.getCss()}:template?.config;const lh=letterheads[company()]?.config||{};if(zone==='header'||zone==='footer')lh[zone]={html:editor.getHtml(),css:editor.getCss()};opts.onPreview?.(renderHtml(config,lh,opts.quotation,opts.seller,opts.customer))}
  if(t.id==='grqd-blank'){if(window.confirm('Replace current unsaved design with a blank A4 page?')){editor.setComponents(starter());editor.setStyle(pageCss)}}
  if(t.id==='grqd-sample'){if(window.confirm('Replace current unsaved design with editable 6-page sample?')){zone='body';editor.setComponents(sample());editor.setStyle(pageCss);host.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone==='body'))}}
  const z=t.closest('[data-zone]');if(z)switchZone(z.dataset.zone);
 });
 host.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='grqd-template'){template=templates.find(x=>x.id===t.value)||null;zone='body';editor.loadProjectData(template?.config?.designerProject||{});if(!template?.config?.designerProject){editor.setComponents(starter());editor.setStyle(pageCss)}updateChoice();editor.clearDirtyCount()}
  if(t.id==='grqd-image'&&t.files?.[0]){const file=t.files[0];if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>400000)return notice('Choose PNG/JPEG/WebP below 400 KB','error');const reader=new FileReader();reader.onload=()=>{const m=editor.getSelected();if(!m||m.get('type')!=='image')return notice('Select an image element first','error');m.addAttributes({src:reader.result});m.set('src',reader.result)};reader.readAsDataURL(file)}
 });
}
async function mount(target,params){
 await withAssets();
 host=target;opts=params;templates=params.templates||[];letterheads=params.letterheads||{};template=params.template||null;zone='body';selected=null;
 editorContainer();setupEditor(template?.config?.designerProject);updateChoice();bind();
}
window.GreenRichQuotationDesigner={mount,renderHtml,starter,sample,letterDefault};
})();