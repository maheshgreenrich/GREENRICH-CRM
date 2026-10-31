'use strict';
/* GreenRich ONE Form Builder: one shared admin schema per form for all companies.
   Native mandatory database fields and permission checks are never replaced.
   Custom answers are saved separately and are not silently discarded. */
window.GreenRichFormBuilder=(()=>{
 const OPS=window.GreenRichOperations?.TYPES||{};
 const KEYS=['lead_create','lead_stage','customer','sales_order',...Object.keys(OPS).map(k=>'ops_'+k)];
 const TITLES={lead_create:'New Lead Capture',lead_stage:'Lead Stage Movement',customer:'Customer Add / Edit',sales_order:'Sales Order',
  ...Object.fromEntries(Object.entries(OPS).map(([key,val])=>['ops_'+key,'ERP · '+val.label]))};
 const TYPES=['text','textarea','number','email','tel','date','datetime-local','time','url','select','radio','checkbox','multiselect','heading','button'];
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fixed=(id,label,type='text',required=false,protectedField=false)=>({id,label,type,required,visible:true,system:true,protected:protectedField,layout:'half',options:[],when:null,placeholder:''});
 const buildDefaults=()=>{
  const lead=[fixed('company','Company','select',true,true),fixed('assignee','Salesperson','select'),fixed('welcome','Welcome WhatsApp template','select'),fixed('title','Lead / enquiry title','text',true,true),
   fixed('contact','Contact name'),fixed('mobile','Mobile number','tel'),fixed('email','Email','email'),fixed('source','Lead source','select'),fixed('product','Product enquiry','select'),fixed('customer','Existing customer','select'),
   fixed('value','Expected order value','number'),fixed('tags','Tags','checkbox'),fixed('note','Enquiry / discussion notes','textarea')];
  const stage=[fixed('stage','Move to stage','select',true,true),fixed('products','Interested products','checkbox'),fixed('tags','Approved tags','checkbox'),
   fixed('note','Conversation details / reason','textarea',true,true),fixed('heat','Lead priority','select'),
   fixed('due','Next follow-up date & time','datetime-local',true,true),fixed('order_search','Find Sales Order','text'),fixed('order','Confirmed Sales Order','select',true,true)];
  const customer=[fixed('name','Customer full name','text',true,true),fixed('mobile','Primary mobile','tel',true,true),fixed('mobile2','Second mobile','tel'),
   fixed('email','Email address','email'),fixed('tag_ids','Customer tags','checkbox'),fixed('company','Company name'),fixed('type','Customer type','select'),
   fixed('address1','Address line 1','textarea',true,true),fixed('address2','Address line 2'),fixed('city','City'),fixed('state','State'),fixed('pincode','PIN code'),
   fixed('country','Country'),fixed('gstin','GSTIN'),fixed('source','Customer source','select'),fixed('owner','Account owner'),fixed('notes','Customer notes','textarea')];
  const sale=[fixed('date','Order date','date',true,true),fixed('internal_order_id','Sales Order number','text',true,true),
   fixed('company_id','Company','select',true,true),fixed('channel_id','Sales channel','select',true,true),
   fixed('customer_picker','Lead / Customer selection','select',true,true),fixed('product_id','Product','select',true,true),fixed('qty','Quantity','number',true,true),
   fixed('unit_price','Unit price','number',true,true),fixed('tax_rate','Product GST','number',true,true),fixed('inclusive','Includes GST','select',true,true),
   fixed('shipping_charge','Shipping charge','number'),fixed('shipping_gst_rate','Shipping GST rate','number'),fixed('payment_terms','Payment terms'),
   fixed('dispatched_through','Courier / dispatch'),fixed('delivery_note','Delivery note'),fixed('invoice_reference','Invoice reference'),
   fixed('terms_of_delivery','Terms of delivery'),fixed('status','Sales Order status','select',true,true),fixed('notes','Order notes','textarea')];
  for(const group of [lead,stage,customer,sale])for(const f of group){if(['note','notes','address1'].includes(f.id))f.layout='wide';}
  const operations=Object.fromEntries(Object.entries(OPS).map(([k,v])=>['ops_'+k,[
   fixed('company_id','Company','select',true,true),...v.fields.map(([id,label,raw,required])=>{
    const f=fixed(id,label,raw.startsWith('select:')?'select':raw,Boolean(required),Boolean(required));
    if(raw.startsWith('select:'))f.options=raw.slice(7).split(',');
    if(raw==='textarea')f.layout='wide';return f;
   })
  ]]));
  return {lead_create:lead,lead_stage:stage,customer,sales_order:sale,...operations};
 };
 const DEFAULTS=buildDefaults();
 let db=null,companies=[],cache=new Map(),loading=null;
 const catalogs={customer_sources:[],customer_tags:[],companies:[]};
 const SOURCES={custom:'Custom choices',customer_sources:'Settings · Customer sources',customer_tags:'Settings · Customer tags',customer_types:'Customer types',companies:'Available Companies'};
 const resolved=f=>({...f,options:f.optionSource&&f.optionSource!=='custom'?(f.optionSource==='customer_types'?['Individual','Retailer','Distributor','Business']:catalogs[f.optionSource]||[]):f.options||[]});
 async function loadChoices(){
  for(const [key,table] of [['customer_sources','gr_crm_sources'],['customer_tags','gr_crm_tags'],['companies','gr_companies']]){
   const {data,error}=await db.from(table).select('*').order('name');
   if(error)throw Error('Could not load Settings choices: '+error.message);
   catalogs[key]=(data||[]).filter(x=>x.active!==false).map(x=>x.name);
  }
 }
 // Company remains an argument for caller compatibility; layout is shared.
 const token=(company,key)=>key;
 const cloning=x=>JSON.parse(JSON.stringify(x));
 const defaults=key=>cloning(DEFAULTS[key]||[]);
 function schema(company,key){
  if(!KEYS.includes(key))throw Error('Unknown Form Builder form');
  const override=cache.get(token(company,key));
  if(!override)return defaults(key);
  // Guarantee that protected fields exist regardless of a stale/malformed schema.
  const system=new Map(DEFAULTS[key].map(x=>[x.id,x]));
  const fields=override.filter(x=>x&&typeof x.id==='string'&&(system.has(x.id)||/^custom_[a-z0-9_]{4,50}$/.test(x.id))).map(x=>{
   const base=system.get(x.id);
   if(!base)return {...x,system:false,protected:false};
   return {...base,...x,id:base.id,system:true,
    required:x.required===undefined?base.required:x.required===true,visible:x.visible!==false,
    when:x.when||null};
  });
  for(const base of DEFAULTS[key])if(!fields.some(x=>x.id===base.id))fields.push(cloning(base));
  return fields;
 }
 async function ready(client,ids,refresh=false){
  if(client&&db!==client){db=client;cache=new Map();loading=null}
  companies=[...new Set((ids||[]).filter(Boolean))];
  if(!db)throw Error('CRM login is required for Form Builder');
  if(loading&&!refresh)return loading;
  loading=(async()=>{
   const q=db.from('gr_shared_form_schemas').select('form_key,fields,version');
   const {data,error}=await q;if(error)throw Error('Form Builder settings could not load: '+error.message);
   for(const row of data||[])if(KEYS.includes(row.form_key)&&Array.isArray(row.fields))cache.set(row.form_key,row.fields);
   await loadChoices();
   return true;
  })();
  try{return await loading}catch(e){loading=null;throw e}
 }
 const latest=(company,key)=>schema(company,key);
 const onlyCustom=f=>!f.system;
 function validate(key,fields){
  if(!KEYS.includes(key)||!Array.isArray(fields)||fields.length>75)throw Error('Invalid form or too many questions (maximum 75).');
  const system=new Map(DEFAULTS[key].map(f=>[f.id,f]));
  const ids=new Set();
  for(const f of fields){
   if(!f||typeof f.id!=='string'||ids.has(f.id))throw Error('Each form question needs a unique field key');
   ids.add(f.id);
   const native=system.get(f.id);
   if(!native&&!/^custom_[a-z0-9_]{4,50}$/.test(f.id))throw Error('Invalid custom field identifier');
   if(String(f.label||'').trim().length<2||String(f.label).length>110)throw Error('Question labels must be 2–110 characters');
   if(!TYPES.includes(f.type))throw Error('Unknown field type '+f.type);
   // Admin controls layout; backend CRM/ERP validations still protect transactions.
   if(f.when?.field&&(f.when.field===f.id||!fields.some(other=>other.id===f.when.field)))throw Error('Conditional field references an invalid or identical question');
   if(String(f.when?.equals||'').length>100)throw Error('Condition value too long');
   const rules=f.conditions?.rules||[];
   if(!Array.isArray(rules)||rules.length>10)throw Error('Maximum 10 rules per question');
   if(rules.length&& !['all','any'].includes(f.conditions?.match))throw Error('Choose ALL or ANY for multi-rule conditions');
   for(const rule of rules){
    if(!fields.some(other=>other.id===rule.field&&other.id!==f.id))throw Error('Rule references missing or identical field');
    if(!['equals','not_equals','contains','not_contains','filled','empty','greater','less','greater_equal','less_equal','in_list'].includes(rule.operator))
     throw Error('Unknown conditional operator');
    if(String(rule.value||'').length>250)throw Error('Condition value too long');
   }
   if(f.optionSource&&!Object.hasOwn(SOURCES,f.optionSource))throw Error('Unknown Settings choice source');
   if(['select','checkbox','radio','multiselect'].includes(f.type)&&(!f.optionSource||f.optionSource==='custom')&&(!native||f.options?.length)){
    if(!Array.isArray(f.options)||f.options.length<1||f.options.length>30||f.options.some(o=>typeof o!=='string'||!o.trim()||o.length>100))throw Error('Choice questions need 1–30 options, up to 100 characters each.');
   }
  }
  for(const sys of system.values())if(!ids.has(sys.id))throw Error('Built-in question '+sys.label+' cannot be removed.');
  // No conditional dependency cycles, including ALL/ANY rule branches.
  const deps=item=>(Array.isArray(item.conditions?.rules)&&item.conditions.rules.length?
   item.conditions.rules.map(r=>r.field):item.when?.field?[item.when.field]:[]).filter(Boolean);
  const visit=(id,seen=new Set())=>{
   if(seen.has(id))throw Error('Conditional questions cannot contain loops.');
   const next=new Set(seen);next.add(id);
   for(const source of deps(fields.find(f=>f.id===id)||{}))visit(source,next);
  };
  for(const item of fields)visit(item.id);
  return fields;
 }
 const nativeWrap=(form,id)=>{
  if(id==='customer_picker')return form.querySelector('.gr-customer-picker');
  const element=[...form.querySelectorAll('[name]')].find(el=>el.name===id);
  if(!element)return null;
  if(id==='tag_ids')return element.closest('.gr-tag-field')||element.closest('fieldset')||element.closest('label');
  if(id==='products'||id==='tags')return element.closest('fieldset')||element.closest('label');
  return element.closest('label,fieldset');
 };
 const customTag=f=>{
  if(f.type==='heading'){
   const header=document.createElement('h4');header.textContent=f.label;header.className='grfb-section-heading';
   header.dataset.grfbField=f.id;return header;
  }
  if(f.type==='button'){
   const button=document.createElement('button');button.type='button';button.textContent=f.label;
   button.className='grfb-design-button';button.dataset.grfbField=f.id;
   button.title='Visual button. App actions require their own workflow integration.';return button;
  }
  const label=document.createElement(['checkbox','radio','multiselect'].includes(f.type)?'div':'label');label.dataset.grfbField=f.id;
  label.className='grfb-custom '+(f.layout==='wide'?'wide':'');
  if(label.tagName==='DIV'){label.setAttribute('role','group');label.setAttribute('aria-label',f.label)}
  const text=document.createElement('span');text.textContent=f.label+(f.required?' *':'');label.append(text);
  let control;
  if(f.type==='textarea'){control=document.createElement('textarea');control.rows=3}
  else if(f.type==='select'){control=document.createElement('select');control.append(new Option('Choose an option',''));
   for(const val of f.options||[])control.append(new Option(val,val));
  }else if(['radio','checkbox','multiselect'].includes(f.type)){
   control=document.createElement('div');control.className='grfb-options';
   for(const val of f.options||[]){
    const option=document.createElement('label');option.className='grfb-option';
    const input=document.createElement('input');input.type=f.type==='multiselect'?'checkbox':f.type;input.name=f.id;input.value=val;
    option.append(input,document.createTextNode(val));control.append(option);
   }
  }else{control=document.createElement('input');control.type=f.type;}
  if(f.type==='multiselect'){
   const details=document.createElement('details');details.className='grfb-multiselect';
   const summary=document.createElement('summary');summary.textContent='Select options';
   details.append(summary,control);control=details;
   details.addEventListener('change',()=>{const n=details.querySelectorAll('input:checked').length;summary.textContent=n?n+' selected':'Select options'});
  }
  if(!['radio','checkbox','multiselect'].includes(f.type)){
   control.name=f.id;control.placeholder=f.placeholder||'';
   if(f.required)control.required=true;
  }
  label.append(control);
  return label;
 };
 const keyForForm=new WeakMap();
 // WordPress-style multi-rule conditional engine, deliberately no eval/JS.
 const OPERATORS=['equals','not_equals','contains','not_contains','filled','empty','greater','less','greater_equal','less_equal','in_list'];
 function matchesRule(value,rule){
  const original=String(value??'').trim(),compare=String(rule.value??'').trim(),v=original.toLowerCase(),t=compare.toLowerCase();
  if(rule.operator==='filled')return !!original;
  if(rule.operator==='empty')return !original;
  if(rule.operator==='equals')return v===t;
  if(rule.operator==='not_equals')return v!==t;
  if(rule.operator==='contains')return v.includes(t);
  if(rule.operator==='not_contains')return !v.includes(t);
  if(rule.operator==='in_list')return compare.split(',').map(x=>x.trim().toLowerCase()).includes(v);
  const x=Number(original),y=Number(compare);
  if(!original||!compare||!Number.isFinite(x)||!Number.isFinite(y))return false;
  return rule.operator==='greater'?x>y:rule.operator==='less'?x<y:
   rule.operator==='greater_equal'?x>=y:rule.operator==='less_equal'?x<=y:false;
 }
 const rulesFor=f=>Array.isArray(f.conditions?.rules)&&f.conditions.rules.length?f.conditions.rules:
  f.when?.field?[{field:f.when.field,operator:f.when.operator||'equals',value:f.when.equals||''}]:[];
 function matchesCondition(field,read){
  const rules=rulesFor(field);if(!rules.length)return true;
  const results=rules.map(rule=>{
   const current=read(rule.field);if(current===null)return false;
   if(Array.isArray(current)){
    if(rule.operator==='filled')return current.length>0;
    if(rule.operator==='empty')return current.length===0;
    return current.some(v=>matchesRule(v,rule));
   }
   return matchesRule(current,rule);
  });
  return field.conditions?.match==='any'?results.some(Boolean):results.every(Boolean);
 }
 function showConditions(form,fields){
  const read=id=>{
   const wrap=form.querySelector('[data-grfb-field="'+id+'"]');
   if(wrap?.hidden)return null;
   const nodes=[...((wrap||form).querySelectorAll('[name]'))].filter(x=>x.name===id);
   if(!nodes.length)return '';
   if(nodes.some(x=>x.type==='checkbox'||x.type==='radio'))return nodes.filter(x=>x.checked).map(x=>x.value);
   return nodes[0].value||'';
  };
  for(let pass=0;pass<=fields.length;pass++){
   let changed=false;
   for(const field of fields){
    const wrap=form.querySelector('[data-grfb-field="'+field.id+'"]');if(!wrap)continue;
    let show=field.visible!==false;
    if(keyForForm.get(form)==='lead_stage'){
     const stage=form.querySelector('[name=stage]')?.value||'';
     if(field.id==='due'||field.id==='heat')show=show&&!['Won','Lost'].includes(stage);
     if(field.id==='order'||field.id==='order_search')show=show&&stage==='Won';
    }
    show=show&&matchesCondition(field,read);
    if(wrap.hidden!==!show){changed=true;wrap.hidden=!show}
    wrap.classList.toggle('grfb-hidden',!show);
    for(const input of wrap.querySelectorAll('input,select,textarea')){
     if(input.name!==field.id||input.dataset.grfbReadOnly==='1')continue;
     input.disabled=!show;
     if(!['radio','checkbox'].includes(input.type))input.required=show&&field.required===true&&!wrap.querySelector('[data-grfb-proxy]');
    }
   }
   if(!changed)break;
  }
 }
 // Preserve native field names/IDs so existing CRM and ERP saves still
 // receive their normal values. Composite pickers and script-bound controls
 // are not replaced with incompatible widgets.
 function applyNativeDisplay(form,wrap,field){
  const nodes=[...wrap.querySelectorAll('input,select,textarea')].filter(e=>e.name===field.id);
  if(nodes.length!==1||field.id==='customer_picker'||field.id==='tag_ids')return;
  const original=nodes[0];
  // Buttons/headings are visual-only until attached to an approved workflow.
  const simple=['text','email','tel','number','date','datetime-local','time','url'];
  if(original.tagName==='INPUT'&&simple.includes(field.type)){
   if(original.type!==field.type)try{original.type=field.type}catch{}
   if(field.placeholder)original.placeholder=field.placeholder;
   return;
  }
  if(original.tagName==='SELECT'&&field.type==='select'){
   if(field.options?.length){
    const selected=original.value;
    original.replaceChildren(new Option('Choose',''),...field.options.map(v=>new Option(v,v)));
    if(selected&&!field.options.includes(selected))original.append(new Option(selected,selected));
    original.value=selected;
   }
   return;
  }
  // ERP Operations forms use delegated handlers, so switching native controls
  // here is safe; CRM-specific composite controls keep their original bindings.
  if(form.id!=='gr-ops-form'||['button','heading'].includes(field.type)){
   // CRM scripts can hold direct references to their inputs. Keep the native
   // control and use a display proxy instead of replacing its identity.
   wrap.querySelectorAll('[data-grfb-proxy]').forEach(n=>n.remove());
   original.style.display='';
   const current=original.value||'',possible=field.options?.length?field.options:
    original.tagName==='SELECT'?[...original.options].filter(o=>o.value).map(o=>o.value):[];
   let proxy;
   if(field.type==='heading'||field.type==='button'){
    proxy=document.createElement(field.type==='button'?'button':'h4');
    if(field.type==='button'){proxy.type='button';proxy.disabled=true;proxy.title='Display-only: connect a workflow before using a custom action button.'}
    proxy.textContent=field.label;
   }else if(field.type==='textarea'){proxy=document.createElement('textarea');proxy.value=current}
   else if(field.type==='select'&&possible.length){
    proxy=document.createElement('select');proxy.append(new Option('Choose',''));
    possible.forEach(v=>proxy.append(new Option(v,v)));proxy.value=current;
   }else if(['radio','checkbox'].includes(field.type)&&possible.length){
    proxy=document.createElement('span');proxy.className='grfb-native-choices';
    possible.forEach(v=>{
     const item=document.createElement('span');item.className='grfb-option';
     const toggle=document.createElement('input');toggle.type=field.type;toggle.value=v;
     toggle.checked=v===current;
     if(field.type==='radio')toggle.addEventListener('change',()=>{if(toggle.checked)proxy.querySelectorAll('input').forEach(n=>{if(n!==toggle)n.checked=false})});
     item.append(toggle,document.createTextNode(v));proxy.append(item);
    });
   }else if(simple.includes(field.type)){
    proxy=document.createElement('input');proxy.type=field.type;proxy.value=current;
   }
   if(!proxy)return;
   proxy.dataset.grfbProxy='1';
   const update=()=>{
    const value=['radio','checkbox'].includes(field.type)?
     [...proxy.querySelectorAll('input:checked')].map(n=>n.value).join(','):
     ('value'in proxy?proxy.value:'');
    if(original.value!==value){
     if(original.tagName==='SELECT'&&value&&![...original.options].some(o=>o.value===value))original.append(new Option(value,value));
     original.value=value;original.dispatchEvent(new Event('input',{bubbles:true}));
     original.dispatchEvent(new Event('change',{bubbles:true}));
    }
   };
   proxy.addEventListener('input',update);proxy.addEventListener('change',update);
   original.style.display='none';wrap.append(proxy);
   Promise.resolve().then(()=>{if(!proxy.isConnected)return;
    if('value'in proxy)proxy.value=original.value;
    else proxy.querySelectorAll('input').forEach(el=>el.checked=original.value===el.value);
   });
   return;
  }
  const prev=original.value||'',identity={id:original.id,name:original.name};
  let next;
  if(field.type==='textarea'){
   next=document.createElement('textarea');next.rows=3;next.value=prev;
  }else if(field.type==='select'&&field.options?.length){
   next=document.createElement('select');next.append(new Option('Choose',''));
   for(const v of field.options)next.append(new Option(v,v));next.value=field.options.includes(prev)?prev:'';
  }else if(['radio','checkbox'].includes(field.type)&&field.options?.length){
   next=document.createElement('span');next.className='grfb-native-choices';
   field.options.forEach((val,i)=>{
    const item=document.createElement('span');item.className='grfb-option';
    const el=document.createElement('input');el.type=field.type;el.name=identity.name;
    if(i===0&&identity.id)el.id=identity.id;
    el.value=val;el.checked=prev===val;
    const name=document.createElement('span');name.textContent=val;
    item.append(el,name);next.append(item);
   });
  }else if(simple.includes(field.type)){
   next=document.createElement('input');next.type=field.type;next.value=prev;
  }
  if(!next)return;
  if(next.tagName!=='SPAN'){next.name=identity.name;if(identity.id)next.id=identity.id;}
  original.replaceWith(next);
 }
 function decorate(form,company,key,values={}){
  if(!form||!db)return;
  const previous={};
  form.querySelectorAll('[data-grfb-custom=yes]').forEach(w=>{const nodes=[...w.querySelectorAll('[name]')];previous[w.dataset.grfbField]=nodes.some(n=>['checkbox','radio'].includes(n.type))?nodes.filter(n=>n.checked).map(n=>n.value):nodes[0]?.value||''});
  values={...previous,...values};
  const fields=schema(company,key).map(resolved),target=key==='customer'||key==='sales_order'?form.querySelector('#editor-fields,.gr-contact-fields')||form:form;
  keyForForm.set(form,key);
  if(!target)return;
  // Keep existing native application handlers. Only add layout & custom field nodes.
  target.querySelectorAll('[data-grfb-field]').forEach(el=>{if(el.dataset.grfbCustom==='yes')el.remove();else el.removeAttribute('data-grfb-field')});
  const wrapFor=new Map();
  for(const f of fields){
   let wrap=f.system?nativeWrap(form,f.id):customTag(f);
   if(!wrap)continue;
   if(f.system){
    wrap.querySelectorAll('[data-grfb-proxy]').forEach(el=>el.remove());
    [...wrap.querySelectorAll('[name]')].filter(n=>n.name===f.id).forEach(n=>{n.style.display=''});
   }
   if(!f.system){wrap.dataset.grfbCustom='yes';}
   // Composite controls retain their CRM layout container, but their
   // visibility and conditions must still respond to Admin settings.
   if(f.system&&wrap.parentElement!==target&&!target.contains(wrap))continue;
   wrap.dataset.grfbField=f.id;
   wrap.classList.toggle('grfb-full',f.layout==='wide');
   if(key==='customer'||key==='sales_order')wrap.classList.toggle('wide',f.layout==='wide');
   if(key==='customer'){wrap.classList.toggle('gr-contact-wide',f.layout==='wide');wrap.style.gridColumn=f.layout==='wide'?'1 / -1':'auto';}
   const title=wrap.querySelector(':scope > span');
   if(f.system&&f.label){
    const labelText=f.label+(f.required?' *':'');
    if(title)title.textContent=labelText;
    else if(wrap.tagName==='LABEL'){
     const firstText=[...wrap.childNodes].find(n=>n.nodeType===3);
     if(firstText)firstText.textContent=labelText;
     else wrap.insertBefore(document.createTextNode(labelText),wrap.firstChild);
    }
   }
   if(f.system)applyNativeDisplay(form,wrap,f);
   if(f.system){
    const inputs=[...wrap.querySelectorAll('input,select,textarea')].filter(el=>el.name===f.id);
    for(const input of inputs)if(f.placeholder&&'placeholder'in input)input.placeholder=f.placeholder;
   }
   wrapFor.set(f.id,wrap);
  }
  const anchor=target.querySelector('.actions,.modal-actions');
  for(const field of fields){
   const wrap=wrapFor.get(field.id);if(!wrap)continue;
   if(field.system&&wrap.parentElement!==target)continue; // Keep composite native widgets intact.
   if(anchor?.parentElement===target)target.insertBefore(wrap,anchor);
   else target.append(wrap);
  }
  const addValue=(id,value)=>{
   const wrap=wrapFor.get(id);if(!wrap)return;
   const nodes=[...wrap.querySelectorAll('[name]')].filter(el=>el.name===id);
   for(const el of nodes){
    if(el.type==='checkbox'||el.type==='radio')el.checked=Array.isArray(value)?value.includes(el.value):String(value)===el.value;
    else if(value!=null){if(el.tagName==='SELECT'&&value&&![...el.options].some(o=>o.value===String(value)))el.append(new Option(String(value),String(value)));el.value=value;}
   }
  };
  for(const [id,value] of Object.entries(values||{}))if(fields.some(f=>f.id===id&&!f.system))addValue(id,value);
  form.querySelectorAll('.grfb-multiselect').forEach(el=>el.dispatchEvent(new Event('change')));
  const apply=()=>showConditions(form,fields);
  if(form._grfbHandler){form.removeEventListener('change',form._grfbHandler);form.removeEventListener('input',form._grfbHandler)}
  form._grfbHandler=apply;form.addEventListener('change',apply);form.addEventListener('input',apply);
  apply();
  return {fields,refresh:apply};
 }
 function collect(form,company,key){
  const all=schema(company,key);
  for(const f of all.filter(f=>f.system&&f.required&& !['heading','button'].includes(f.type))){
   const w=form.querySelector('[data-grfb-field="'+f.id+'"]');if(!w||w.hidden)continue;
   const nodes=[...w.querySelectorAll('[name]')].filter(n=>n.name===f.id&&!n.disabled);
   if(nodes.length&&!nodes.some(n=>['checkbox','radio'].includes(n.type)?n.checked:String(n.value||'').trim()))throw Error('Please answer required question: '+f.label);
  }
  const fields=all.filter(onlyCustom),out={};
  if(!fields.length)return out;
  for(const f of fields){
   if(f.type==='heading'||f.type==='button')continue;
   const wrap=form.querySelector('[data-grfb-field="'+f.id+'"]');
   if(!wrap||wrap.hidden)continue;
   const inputs=[...wrap.querySelectorAll('[name]')].filter(el=>el.name===f.id&&!el.disabled);
   let value;
   if(f.type==='checkbox'||f.type==='multiselect')value=inputs.filter(el=>el.checked).map(el=>el.value);
   else if(f.type==='radio')value=inputs.find(el=>el.checked)?.value||'';
   else value=inputs[0]?.value?.trim?.()||'';
   if(f.required&&(Array.isArray(value)?!value.length:!String(value).trim()))throw Error('Please answer required question: '+f.label);
   out[f.id]=value;
  }
  return out;
 }
 async function saveAnswers(company,key,entityId,answers){
  if(!entityId||!answers||!Object.keys(answers).length)return;
  if(!db)throw Error('Form Builder database not ready');
  const {data:userInfo,error:userError}=await db.auth.getUser();
  if(userError||!userInfo?.user?.id)throw Error('Employee session unavailable for form answers');
  const result=await db.from('gr_form_answers').insert({
   company_id:company,form_key:key,entity_id:String(entityId),answers,created_by:userInfo.user.id
  });
  if(result.error)throw Error('Custom answers could not save: '+result.error.message);
 }
 async function recentAnswers(company,key,entityId){
  if(!db||!entityId)return {};
  let query=db.from('gr_form_answers').select('answers').eq('form_key',key).eq('entity_id',String(entityId));
  if(key!=='customer')query=query.eq('company_id',company);
  const q=await query.order('created_at',{ascending:false}).limit(1);
  return q.error?{}:q.data?.[0]?.answers||{};
 }
 const input=(name,value='',type='text')=>'<input data-edit="'+name+'" type="'+type+'" value="'+esc(value)+'">';
 const optionsList=arr=>arr.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
 function mount(root,{client,companyIds,notify}={}){
  if(!root)return Promise.resolve();
  return (async()=>{
   await ready(client,companyIds,true);
   let company=companyIds[0],key=KEYS[0],draft=schema(company,key),dirty=false;
   const message=notify||(()=>{});
   root.innerHTML='<div class="grfb"><div class="panel"><h2>Admin Form Builder</h2>'+
    '<p>Design CRM and ERP Operations questions yourself, including native field appearance and multiple conditional rules. One saved configuration is used across all companies. Customer details are shared; choose the billing company when creating a transaction.</p>'+
    '<div class="grfb-top">'+
    '<label>Form<select id="grfb-form">'+KEYS.map(k=>'<option value="'+k+'">'+esc(TITLES[k])+'</option>').join('')+'</select></label>'+
    '<button type="button" data-grfb="new">+ Add Question</button>'+
    '<button type="button" data-grfb="save" class="grfb-primary">Save & Publish</button></div>'+
    '<p class="grfb-instruction">Reorder using ↑ ↓ or drag-and-drop. Edit question labels, visibility, required status, layout and rules. Fields are design-editable by Admin. Core ERP/CRM data rules (stock, identity, required sales data, approvals) still apply at save time. New questions are saved in the secure custom answers history.</p></div>'+
    '<div class="grfb-layout"><div class="grfb-editor panel"><div class="grfb-heading"><h3>Configure questions</h3><span id="grfb-unsaved"></span></div><div id="grfb-fields"></div></div>'+
    '<div class="grfb-preview panel"><h3>Live form preview</h3><p>Preview shows the visual layout and conditions; actual CRM records are unchanged until Save & Publish.</p><div id="grfb-preview"></div>'+
    '<button type="button" data-grfb="reset">Reset unsaved edits</button></div></div>'+
    '<div class="panel grfb-history"><div class="grfb-heading"><h3>Saved custom question answers</h3>'+
    '<button type="button" data-grfb="answers">Refresh Answers</button></div>'+
    '<p>Admin can review the last 50 answers recorded for this form across companies. Answers are not part of the default customer/order columns.</p>'+
    '<div id="grfb-answers">Select Refresh Answers to review recorded responses.</div></div></div>';
   const $=q=>root.querySelector(q),els=$('#grfb-fields'),preview=$('#grfb-preview');
   $('#grfb-form').value=key;
   const mark=()=>{dirty=true;$('#grfb-unsaved').textContent='Unsaved changes';drawPreview()};
   const drawPreview=()=>{
    const previewForm=document.createElement('form');previewForm.className='grfb-preview-form';
    for(const raw of draft){
     const f=resolved(raw);
     if(!f.visible)continue;
     const el=customTag({...f,system:false});
     if(f.system&&['select','radio','checkbox','multiselect'].includes(f.type)&&!f.options?.length){
      const values={stage:['New','Contacted','Qualified','Quotation','Won','Lost'],
       heat:['Hot','Warm','Cold'],type:['Individual','Retailer','Distributor','Business'],
       status:['Pending','Completed','Cancelled','Returned']}[f.id]||['System-provided choices'];
      const select=el.querySelector('select');
      if(select)values.forEach(value=>select.append(new Option(value,value)));
      else if(f.type==='checkbox')el.append(document.createTextNode('Choices loaded from GreenRich CRM'));
     }
     el.dataset.grfbField=f.id;previewForm.append(el);
    }
    preview.replaceChildren(previewForm);
    keyForForm.set(previewForm,key);
    const update=()=>showConditions(previewForm,draft);
    previewForm.addEventListener('change',update);previewForm.addEventListener('input',update);
    try{update()}catch{/* preview cannot modify employee data */}
   };
   const ruleMarkup=(field,idx)=>{
    const rules=rulesFor(field);
    const opLabels=[['equals','Equals'],['not_equals','Does not equal'],['contains','Contains'],['not_contains','Does not contain'],
     ['filled','Has a value'],['empty','Is empty'],['greater','Greater than'],['less','Less than'],['greater_equal','At least'],
     ['less_equal','At most'],['in_list','One of comma-separated values']];
    return '<div class="grfb-condition grfb-full"><div class="grfb-condition-head"><strong>IF / THEN Conditional Logic</strong>'+
      '<label>Show when <select data-edit="rules_match"><option value="all" '+(field.conditions?.match!=='any'?'selected':'')+'>ALL rules match (AND)</option>'+
      '<option value="any" '+(field.conditions?.match==='any'?'selected':'')+'>ANY rule matches (OR)</option></select></label></div>'+
      (rules.length?rules.map((r,i)=>'<div class="grfb-rule"><span>IF</span>'+
       '<select data-rule-index="'+i+'" data-rule-part="field"><option value="">Choose another question</option>'+
       draft.filter(q=>q.id!==field.id&&q.type!=='heading'&&q.type!=='button').map(q=>
        '<option value="'+esc(q.id)+'" '+(r.field===q.id?'selected':'')+'>'+esc(q.label)+'</option>').join('')+'</select>'+
       '<select data-rule-index="'+i+'" data-rule-part="operator">'+opLabels.map(([v,t])=>
        '<option value="'+v+'" '+(r.operator===v?'selected':'')+'>'+t+'</option>').join('')+'</select>'+
       '<input type="text" data-rule-index="'+i+'" data-rule-part="value" value="'+esc(r.value||'')+'" placeholder="Expected value" '+(['filled','empty'].includes(r.operator)?'disabled':'')+'>'+
       '<button type="button" data-op="remove-rule" data-index="'+idx+'" data-rule-index="'+i+'" title="Remove this condition">×</button></div>').join(''):
       '<p>Always visible until you add a rule.</p>')+
       '<button type="button" data-op="add-rule" data-index="'+idx+'">+ Add condition</button></div>';
   };
   const redraw=()=>{
    $('#grfb-unsaved').textContent=dirty?'Unsaved changes':'Saved configuration';
    els.innerHTML=draft.map((f,index)=>'<article class="grfb-row" draggable="true" data-index="'+index+'">'+
     '<div class="grfb-rowhead"><b>↕ '+(index+1)+'. '+esc(f.label)+'</b><span class="grfb-chip '+(f.system?'locked':'')+'">'+(f.system?'System field':'Custom question')+'</span>'+
     '<div class="grfb-rowmoves"><button type="button" data-op="up" data-index="'+index+'" title="Move up">↑</button>'+
     '<button type="button" data-op="down" data-index="'+index+'" title="Move down">↓</button>'+
     (!f.system?'<button type="button" data-op="delete" data-index="'+index+'" title="Delete custom field">Delete</button>':'')+'</div></div>'+
     '<div class="grfb-rowfields">'+
     '<label>Question label '+input('label',f.label)+'</label>'+
     '<label>Field type <select data-edit="type">'+optionsList(TYPES).replace('>multiselect<','>Checkbox dropdown (multiple choices)<').replace('value="'+esc(f.type)+'"','value="'+esc(f.type)+'" selected')+'</select></label>'+
     '<label>Width <select data-edit="layout">'+optionsList(['half','wide']).replace('value="'+esc(f.layout||'half')+'"','value="'+esc(f.layout||'half')+'" selected')+'</select></label>'+
     '<label>Placeholder '+input('placeholder',f.placeholder||'')+'</label>'+
     '<label class="grfb-switch"><input type="checkbox" data-edit="visible" '+(f.visible!==false?'checked':'')+'> Show this field</label>'+
     '<label class="grfb-switch"><input type="checkbox" data-edit="required" '+(f.required?'checked':'')+'> Required</label>'+
     (['select','radio','checkbox','multiselect'].includes(f.type)?
      '<label class="grfb-full">Options source<select data-edit="optionSource">'+Object.entries(SOURCES).map(([v,t])=>'<option value="'+v+'" '+((f.optionSource||'custom')===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      ((!f.optionSource||f.optionSource==='custom')?'<label class="grfb-full">Choices (one option per line)<textarea data-edit="options" rows="3">'+esc((f.options||[]).join('\n'))+'</textarea></label>':'<p class="grfb-full">Choices are loaded from Settings when the form opens.</p>'):'')+
     (f.system?'<p class="grfb-full grfb-core">Native CRM/ERP field: Admin can edit design and visibility. Original data requirements, approvals, GST/stock calculations and server validations still apply.</p>':'')+
     ruleMarkup(f,index)+
     '</div></article>').join('');
    drawPreview();
   };
   const switchTo=()=>{
    if(dirty&&!confirm('Discard unsaved Form Builder edits?')){ $('#grfb-form').value=key;return}
    key=$('#grfb-form').value;draft=schema(company,key);dirty=false;
    $('#grfb-answers').textContent='Select Refresh Answers to review recorded responses.';redraw();
   };
   $('#grfb-form').addEventListener('change',switchTo);
   els.addEventListener('input',event=>{
    const ruleInput=event.target.closest('[data-rule-part]');
    if(ruleInput){
     const row=ruleInput.closest('[data-index]'),field=row&&draft[Number(row.dataset.index)];
     const index=Number(ruleInput.dataset.ruleIndex),part=ruleInput.dataset.rulePart;
     if(!field?.conditions?.rules?.[index])return;
     field.conditions.rules[index][part]=ruleInput.value;
     field.when=null;mark();return;
    }
    const row=event.target.closest('[data-index]'),field=row&&draft[Number(row.dataset.index)];if(!field)return;
    const id=event.target.dataset.edit;if(!id)return;
    const value=event.target.type==='checkbox'?event.target.checked:event.target.value;
    if(id==='label'||id==='placeholder'||id==='layout'||id==='optionSource')field[id]=value;
    else if(id==='visible'||id==='required')field[id]=value
    else if(id==='options')field.options=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    else if(id==='rules_match'){field.conditions=field.conditions||{match:'all',rules:[]};field.conditions.match=value}
    else if(id==='type'){field.type=value;if(['select','radio','checkbox','multiselect'].includes(value)&&!field.options?.length&&!field.system)field.options=['Option 1','Option 2'];}
    mark();
   });
   els.addEventListener('change',event=>{
    if(event.target.dataset.rulePart==='operator')redraw();
    else if(['type','optionSource'].includes(event.target.dataset.edit))redraw();
   });
   const reorder=(from,to)=>{
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=draft.length||to>=draft.length||from===to)return;
    const [moved]=draft.splice(from,1);draft.splice(to,0,moved);mark();redraw();
   };
   els.addEventListener('click',e=>{
    const b=e.target.closest('[data-op]');if(!b)return;
    const i=Number(b.dataset.index),op=b.dataset.op;
    if(op==='up')reorder(i,i-1);if(op==='down')reorder(i,i+1);
    if(op==='delete'&&!draft[i].system){draft.splice(i,1);mark();redraw()}
    if(op==='add-rule'){
     const f=draft[i];if(!f)return;
     f.conditions=f.conditions||{match:'all',rules:[]};
     if(!f.conditions.rules.length&&f.when?.field){
      f.conditions.rules.push({field:f.when.field,operator:f.when.operator||'equals',value:f.when.equals||''});f.when=null;
     }
     if(f.conditions.rules.length>=10){message('Maximum 10 conditions per question');return}
     f.conditions.rules.push({field:'',operator:'equals',value:''});mark();redraw();
    }
    if(op==='remove-rule'){
     const f=draft[i],n=Number(b.dataset.ruleIndex);if(!f)return;
     if(!f.conditions?.rules?.length&&f.when?.field){f.conditions={match:'all',rules:rulesFor(f)};f.when=null}
     if(f.conditions?.rules?.[n]){f.conditions.rules.splice(n,1);mark();redraw()}
    }
   });
   let dragging=-1;els.addEventListener('dragstart',e=>{const item=e.target.closest('[data-index]');dragging=item?Number(item.dataset.index):-1});
   els.addEventListener('dragover',e=>{if(e.target.closest('[data-index]'))e.preventDefault()});
   els.addEventListener('drop',e=>{const item=e.target.closest('[data-index]');if(!item)return;e.preventDefault();reorder(dragging,Number(item.dataset.index));dragging=-1});
   root.querySelector('[data-grfb=new]').onclick=()=>{
    draft.push({id:'custom_'+Math.random().toString(36).slice(2,12),label:'New question',type:'text',
     system:false,protected:false,required:false,visible:true,layout:'half',options:[],when:null,placeholder:''});
    mark();redraw();els.lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});
   };
   root.querySelector('[data-grfb=reset]').onclick=()=>{if(dirty&&!confirm('Discard all unsaved edits?'))return;draft=schema(company,key);dirty=false;redraw()};
   root.querySelector('[data-grfb=answers]').onclick=async event=>{
    const button=event.currentTarget,out=$('#grfb-answers');button.disabled=true;
    out.textContent='Loading saved answers…';
    try{
     const {data,error}=await db.from('gr_form_answers').select('entity_id,answers,created_at')
      .in('company_id',companyIds).eq('form_key',key).order('created_at',{ascending:false}).limit(50);
     if(error)throw Error(error.message);
     const labels=new Map(schema(company,key).map(f=>[f.id,f.label]));
     out.innerHTML=(data||[]).length?(data||[]).map(row=>
      '<details class="grfb-answer"><summary>'+esc(new Date(row.created_at).toLocaleString('en-IN'))+
      ' · Record '+esc(row.entity_id)+'</summary><dl>'+
      Object.entries(row.answers||{}).map(([id,val])=>'<dt>'+esc(labels.get(id)||id)+'</dt><dd>'+
       esc(Array.isArray(val)?val.join(', '):typeof val==='object'?JSON.stringify(val):String(val))+'</dd>').join('')+
      '</dl></details>').join(''):'No custom answers saved for this form yet.';
    }catch(e){out.textContent='Could not load answers: '+e.message}finally{button.disabled=false}
   };
   root.querySelector('[data-grfb=save]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
     validate(key,draft);
     const user=await db.auth.getUser();if(user.error||!user.data.user)throw Error('Sign in again to publish form settings.');
     const row={form_key:key,fields:draft,updated_by:user.data.user.id,updated_at:new Date().toISOString()};
     const {error}=await db.from('gr_shared_form_schemas').upsert(row,{onConflict:'form_key'});
     if(error)throw Error(error.message);
     cache.set(token(company,key),cloning(draft));dirty=false;redraw();message('Shared form published for all companies. Employees will see it when they open a new form.');
    }catch(err){message('Form Builder could not save: '+err.message)}finally{button.disabled=false}
   };
   redraw();
  })();
 }
 return {KEYS,TITLES,TYPES,defaults,schema,ready,loadChoices,mount,decorate,collect,saveAnswers,recentAnswers,validate,matchesRule,matchesCondition};
})();
