'use strict';
/* GreenRich ONE Form Builder v1: shared per-company admin schemas.
   Native mandatory database fields and permission checks are never replaced.
   Custom answers are saved separately and are not silently discarded. */
window.GreenRichFormBuilder=(()=>{
 const KEYS=['lead_create','lead_stage','customer','sales_order'];
 const TITLES={lead_create:'New Lead Capture',lead_stage:'Lead Stage Movement',customer:'Customer Add / Edit',sales_order:'Sales Order'};
 const TYPES=['text','textarea','number','email','tel','date','datetime-local','select','radio','checkbox','heading'];
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
   fixed('email','Email address','email',true,true),fixed('tag_ids','Customer tags','checkbox'),fixed('company','Company name'),fixed('type','Customer type','select'),
   fixed('address1','Address line 1','textarea',true,true),fixed('address2','Address line 2'),fixed('city','City'),fixed('state','State'),fixed('pincode','PIN code'),
   fixed('country','Country'),fixed('gstin','GSTIN'),fixed('source','Customer source'),fixed('owner','Account owner'),fixed('notes','Customer notes','textarea')];
  const sale=[fixed('date','Order date','date',true,true),fixed('internal_order_id','Sales Order number','text',true,true),
   fixed('company_id','Company','select',true,true),fixed('channel_id','Sales channel','select',true,true),
   fixed('customer_picker','Lead / Customer selection','select',true,true),fixed('product_id','Product','select',true,true),fixed('qty','Quantity','number',true,true),
   fixed('unit_price','Unit price','number',true,true),fixed('tax_rate','Product GST','number',true,true),fixed('inclusive','Includes GST','select',true,true),
   fixed('shipping_charge','Shipping charge','number'),fixed('shipping_gst_rate','Shipping GST rate','number'),fixed('payment_terms','Payment terms'),
   fixed('dispatched_through','Courier / dispatch'),fixed('delivery_note','Delivery note'),fixed('invoice_reference','Invoice reference'),
   fixed('terms_of_delivery','Terms of delivery'),fixed('status','Sales Order status','select',true,true),fixed('notes','Order notes','textarea')];
  for(const group of [lead,stage,customer,sale])for(const f of group){if(['note','notes','address1'].includes(f.id))f.layout='wide';}
  return {lead_create:lead,lead_stage:stage,customer, sales_order:sale};
 };
 const DEFAULTS=buildDefaults();
 let db=null,companies=[],cache=new Map(),loading=null;
 const token=(company,key)=>company+'|'+key;
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
   return {...base,...x,id:base.id,system:true,type:base.type,
    required:base.protected?true:!!x.required,visible:base.protected?true:x.visible!==false,
    when:base.protected?null:x.when||null};
  });
  for(const base of DEFAULTS[key])if(!fields.some(x=>x.id===base.id))fields.push(cloning(base));
  return fields;
 }
 async function ready(client,ids){
  if(client&&db!==client){db=client;cache=new Map();loading=null}
  companies=[...new Set((ids||[]).filter(Boolean))];
  if(!db)throw Error('CRM login is required for Form Builder');
  if(loading)return loading;
  loading=(async()=>{
   const q=db.from('gr_form_schemas').select('company_id,form_key,fields,version').in('company_id',companies);
   const {data,error}=await q;if(error)throw Error('Form Builder settings could not load: '+error.message);
   for(const row of data||[])if(KEYS.includes(row.form_key)&&Array.isArray(row.fields))cache.set(token(row.company_id,row.form_key),row.fields);
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
   if(!TYPES.includes(f.type)||native&&native.type!==f.type)throw Error('Changing a built-in field type is not supported. Add a custom question instead.');
   if(native?.protected&&(f.required!==true||f.visible!==true||f.when))throw Error('System-required field '+native.label+' cannot be hidden, conditional or optional.');
   if(f.when?.field&&(f.when.field===f.id||!fields.some(other=>other.id===f.when.field)))throw Error('Conditional field references an invalid or identical question');
   if(String(f.when?.equals||'').length>100)throw Error('Condition value too long');
   if(['select','checkbox','radio'].includes(f.type)&&!native){
    if(!Array.isArray(f.options)||f.options.length<1||f.options.length>30||f.options.some(o=>typeof o!=='string'||!o.trim()||o.length>100))throw Error('Choice questions need 1–30 options, up to 100 characters each.');
   }
  }
  for(const sys of system.values())if(!ids.has(sys.id))throw Error('Built-in question '+sys.label+' cannot be removed.');
  // No cycles among conditional questions.
  for(const item of fields){const seen=new Set();let current=item;while(current?.when?.field){
   if(seen.has(current.id))throw Error('Conditional questions cannot contain loops.');
   seen.add(current.id);current=fields.find(f=>f.id===current.when.field);
  }}
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
  const label=document.createElement('label');label.dataset.grfbField=f.id;
  label.className='grfb-custom '+(f.layout==='wide'?'wide':'');
  const text=document.createElement('span');text.textContent=f.label+(f.required?' *':'');label.append(text);
  let control;
  if(f.type==='textarea'){control=document.createElement('textarea');control.rows=3}
  else if(f.type==='select'){control=document.createElement('select');control.append(new Option('Choose an option',''));
   for(const val of f.options||[])control.append(new Option(val,val));
  }else if(f.type==='radio'||f.type==='checkbox'){
   control=document.createElement('div');control.className='grfb-options';
   for(const val of f.options||[]){
    const option=document.createElement('label');option.className='grfb-option';
    const input=document.createElement('input');input.type=f.type;input.name=f.id;input.value=val;
    option.append(input,document.createTextNode(val));control.append(option);
   }
  }else{control=document.createElement('input');control.type=f.type;}
  if(f.type!=='radio'&&f.type!=='checkbox'){
   control.name=f.id;control.placeholder=f.placeholder||'';
   if(f.required)control.required=true;
  }
  label.append(control);
  return label;
 };
 function showConditions(form,fields){
  const visibleField=id=>{
   const wrap=form.querySelector('[data-grfb-field="'+id+'"]');
   if(!wrap||wrap.hidden)return '';
   const nodes=[...wrap.querySelectorAll('[name]')].filter(e=>e.name===id&&!e.disabled);
   if(nodes.some(e=>e.type==='checkbox'||e.type==='radio'))return nodes.filter(e=>e.checked).map(e=>e.value).join(',');
   return nodes[0]?.value||'';
  };
  for(const field of fields){
   const wrap=form.querySelector('[data-grfb-field="'+field.id+'"]');if(!wrap)continue;
   let show=field.visible!==false;
   if(show&&field.when?.field){
    // Conditions may depend on built-in questions (e.g. Lead priority Hot).
    const src=form.querySelector('[name="'+field.when.field+'"]');
    const current=visibleField(field.when.field)||(src?.value||'');
    show=field.when.operator==='not_equals'?current!==field.when.equals:current===field.when.equals;
   }
   wrap.hidden=!show;wrap.classList.toggle('grfb-hidden',!show);
   for(const control of wrap.querySelectorAll('input,select,textarea')){
    if(control.name!==field.id||control.dataset.grfbReadOnly==='1')continue;
    control.disabled=!show;
    if(field.type==='radio'||field.type==='checkbox'){continue}
    // Never lower built-in backend requirements.
    if(!field.protected)control.required=show&&!!field.required;
   }
  }
 }
 function decorate(form,company,key,values={}){
  if(!form||!db)return;
  const fields=schema(company,key),target=key==='customer'||key==='sales_order'?form.querySelector('#editor-fields')||form:form;
  if(!target)return;
  // Keep existing native application handlers. Only add layout & custom field nodes.
  target.querySelectorAll('[data-grfb-field]').forEach(el=>{if(el.dataset.grfbCustom==='yes')el.remove();else el.removeAttribute('data-grfb-field')});
  const wrapFor=new Map();
  for(const f of fields){
   let wrap=f.system?nativeWrap(form,f.id):customTag(f);
   if(!wrap)continue;
   if(!f.system){wrap.dataset.grfbCustom='yes';}
   // Never pull elements out of nested customer selection or first-interests widgets.
   if(f.system&&wrap.parentElement!==target){
    if(f.id==='products'||f.id==='tags'||wrap.closest('.gr-customer-picker')||wrap.closest('.gr-invoice-extra-fields'))continue;
    if(wrap.parentElement!==target)continue;
   }
   wrap.dataset.grfbField=f.id;
   wrap.classList.toggle('grfb-full',f.layout==='wide');
   if(key==='customer'||key==='sales_order')wrap.classList.toggle('wide',f.layout==='wide');
   const title=wrap.querySelector(':scope > span');
   if(f.system&&title&&f.label)title.textContent=f.label+(f.required?' *':'');
   if(f.system&&!f.protected){
    const inputs=[...wrap.querySelectorAll('input,select,textarea')].filter(el=>el.name===f.id);
    for(const input of inputs)if(f.placeholder&&'placeholder'in input)input.placeholder=f.placeholder;
   }
   wrapFor.set(f.id,wrap);
  }
  const anchor=target.querySelector('.actions,.modal-actions');
  for(const field of fields){
   const wrap=wrapFor.get(field.id);if(!wrap)continue;
   if(anchor?.parentElement===target)target.insertBefore(wrap,anchor);
   else target.append(wrap);
  }
  const addValue=(id,value)=>{
   const wrap=wrapFor.get(id);if(!wrap)return;
   const nodes=[...wrap.querySelectorAll('[name]')].filter(el=>el.name===id);
   for(const el of nodes){
    if(el.type==='checkbox'||el.type==='radio')el.checked=Array.isArray(value)?value.includes(el.value):String(value)===el.value;
    else if(value!=null)el.value=value;
   }
  };
  for(const [id,value] of Object.entries(values||{}))if(fields.some(f=>f.id===id&&!f.system))addValue(id,value);
  const apply=()=>showConditions(form,fields);
  if(form._grfbHandler)form.removeEventListener('change',form._grfbHandler);
  form._grfbHandler=apply;form.addEventListener('change',apply);
  apply();
  return {fields,refresh:apply};
 }
 function collect(form,company,key){
  const fields=schema(company,key).filter(onlyCustom),out={};
  if(!fields.length)return out;
  for(const f of fields){
   if(f.type==='heading')continue;
   const wrap=form.querySelector('[data-grfb-field="'+f.id+'"]');
   if(!wrap||wrap.hidden)continue;
   const inputs=[...wrap.querySelectorAll('[name]')].filter(el=>el.name===f.id&&!el.disabled);
   let value;
   if(f.type==='checkbox')value=inputs.filter(el=>el.checked).map(el=>el.value);
   else if(f.type==='radio')value=inputs.find(el=>el.checked)?.value||'';
   else value=inputs[0]?.value?.trim?.()||'';
   if(f.required&&(Array.isArray(value)?!value.length:!String(value).trim()))throw Error('Please answer required question: '+f.label);
   if((Array.isArray(value)?value.length:!!value))out[f.id]=value;
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
  const q=await db.from('gr_form_answers').select('answers').eq('company_id',company).eq('form_key',key)
   .eq('entity_id',String(entityId)).order('created_at',{ascending:false}).limit(1);
  return q.error?{}:q.data?.[0]?.answers||{};
 }
 const input=(name,value='',type='text')=>'<input data-edit="'+name+'" type="'+type+'" value="'+esc(value)+'">';
 const optionsList=arr=>arr.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
 function mount(root,{client,companyIds,notify}={}){
  if(!root)return Promise.resolve();
  return (async()=>{
   await ready(client,companyIds);
   let company=companyIds[0],key=KEYS[0],draft=schema(company,key),dirty=false;
   const message=notify||(()=>{});
   root.innerHTML='<div class="grfb"><div class="panel"><h2>Admin Form Builder</h2>'+
    '<p>Design lead capture, lead stage updates, customer and Sales Order questions yourself. Employee forms use the saved company-specific configuration.</p>'+
    '<div class="grfb-top"><label>Company<select id="grfb-company">'+optionsList(companyIds)+'</select></label>'+
    '<label>Form<select id="grfb-form">'+KEYS.map(k=>'<option value="'+k+'">'+esc(TITLES[k])+'</option>').join('')+'</select></label>'+
    '<button type="button" data-grfb="new">+ Add Question</button>'+
    '<button type="button" data-grfb="save" class="grfb-primary">Save & Publish</button></div>'+
    '<p class="grfb-instruction">Reorder using ↑ ↓ or drag-and-drop. Edit question labels, visibility, required status, layout and rules. System-required questions are locked to protect live sales and CRM data. New questions are saved in the secure custom answers history.</p></div>'+
    '<div class="grfb-layout"><div class="grfb-editor panel"><div class="grfb-heading"><h3>Configure questions</h3><span id="grfb-unsaved"></span></div><div id="grfb-fields"></div></div>'+
    '<div class="grfb-preview panel"><h3>Live form preview</h3><p>Preview shows the visual layout and conditions; actual CRM records are unchanged until Save & Publish.</p><div id="grfb-preview"></div>'+
    '<button type="button" data-grfb="reset">Reset unsaved edits</button></div></div></div>';
   const $=q=>root.querySelector(q),els=$('#grfb-fields'),preview=$('#grfb-preview');
   $('#grfb-company').value=company;$('#grfb-form').value=key;
   const mark=()=>{dirty=true;$('#grfb-unsaved').textContent='Unsaved changes';drawPreview()};
   const drawPreview=()=>{
    const previewForm=document.createElement('form');previewForm.className='grfb-preview-form';
    for(const f of draft){
     if(!f.visible)continue;
     const el=customTag({...f,system:false});
     if(f.system&&['select','radio','checkbox'].includes(f.type)&&!f.options?.length){
      el.querySelector('select')?.append(new Option('System-provided choices','sample'));
     }
     el.dataset.grfbField=f.id;previewForm.append(el);
    }
    preview.replaceChildren(previewForm);
    try{showConditions(previewForm,draft)}catch{/* preview cannot modify employee data */}
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
     '<label>Field type <select data-edit="type" '+(f.system?'disabled':'')+'>'+optionsList(TYPES).replace('value="'+esc(f.type)+'"','value="'+esc(f.type)+'" selected')+'</select></label>'+
     '<label>Width <select data-edit="layout">'+optionsList(['half','wide']).replace('value="'+esc(f.layout||'half')+'"','value="'+esc(f.layout||'half')+'" selected')+'</select></label>'+
     '<label>Placeholder '+input('placeholder',f.placeholder||'')+'</label>'+
     '<label class="grfb-switch"><input type="checkbox" data-edit="visible" '+(f.visible!==false?'checked':'')+(f.protected?' disabled':'')+'> Show this field</label>'+
     '<label class="grfb-switch"><input type="checkbox" data-edit="required" '+(f.required?'checked':'')+(f.protected?' disabled':'')+'> Required</label>'+
     (!f.system&&['select','radio','checkbox'].includes(f.type)?
      '<label class="grfb-full">Dropdown / choice options (one option per line)<textarea data-edit="options" rows="3">'+esc((f.options||[]).join('\n'))+'</textarea></label>':'')+
     (f.protected?'<p class="grfb-full grfb-core">Required by the GreenRich workflow. Cannot be hidden or conditional.</p>':
      '<label>Show only when <select data-edit="when_field"><option value="">Always visible</option>'+
      draft.filter(x=>x.id!==f.id&&x.type!=='heading').map(x=>'<option value="'+esc(x.id)+'" '+(f.when?.field===x.id?'selected':'')+'>'+esc(x.label)+'</option>').join('')+'</select></label>'+
      '<label>Condition <select data-edit="when_operator"><option value="equals" '+(f.when?.operator!=='not_equals'?'selected':'')+'>Equals</option><option value="not_equals" '+(f.when?.operator==='not_equals'?'selected':'')+'>Does not equal</option></select></label>'+
      '<label>Value to match '+input('when_equals',f.when?.equals||'')+'</label>')+
     '</div></article>').join('');
    drawPreview();
   };
   const switchTo=()=>{
    if(dirty&&!confirm('Discard unsaved Form Builder edits?')){ $('#grfb-company').value=company;$('#grfb-form').value=key;return}
    company=$('#grfb-company').value;key=$('#grfb-form').value;draft=schema(company,key);dirty=false;redraw();
   };
   $('#grfb-company').addEventListener('change',switchTo);$('#grfb-form').addEventListener('change',switchTo);
   els.addEventListener('input',event=>{
    const row=event.target.closest('[data-index]'),field=row&&draft[Number(row.dataset.index)];if(!field)return;
    const id=event.target.dataset.edit;if(!id)return;
    const value=event.target.type==='checkbox'?event.target.checked:event.target.value;
    if(id==='label'||id==='placeholder'||id==='layout')field[id]=value;
    else if(id==='visible'||id==='required'){if(!field.protected)field[id]=value}
    else if(id==='options')field.options=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    else if(id==='when_field'){field.when=value?{field:value,equals:field.when?.equals||'',operator:field.when?.operator||'equals'}:null}
    else if(id==='when_equals'||id==='when_operator'){field.when=field.when||null;if(field.when)field.when[id==='when_equals'?'equals':'operator']=value}
    else if(id==='type'&&!field.system){field.type=value;if(['select','radio','checkbox'].includes(value)&&!field.options?.length)field.options=['Option 1','Option 2'];}
    mark();
   });
   els.addEventListener('change',event=>{if(event.target.dataset.edit==='type')redraw()});
   const reorder=(from,to)=>{
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=draft.length||to>=draft.length||from===to)return;
    const [moved]=draft.splice(from,1);draft.splice(to,0,moved);mark();redraw();
   };
   els.addEventListener('click',e=>{
    const b=e.target.closest('[data-op]');if(!b)return;
    const i=Number(b.dataset.index),op=b.dataset.op;
    if(op==='up')reorder(i,i-1);if(op==='down')reorder(i,i+1);
    if(op==='delete'&&!draft[i].system){draft.splice(i,1);mark();redraw()}
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
   root.querySelector('[data-grfb=save]').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{
     validate(key,draft);
     const user=await db.auth.getUser();if(user.error||!user.data.user)throw Error('Sign in again to publish form settings.');
     const row={company_id:company,form_key:key,fields:draft,updated_by:user.data.user.id,updated_at:new Date().toISOString()};
     const {error}=await db.from('gr_form_schemas').upsert(row,{onConflict:'company_id,form_key'});
     if(error)throw Error(error.message);
     cache.set(token(company,key),cloning(draft));dirty=false;redraw();message('Form configuration published to '+company+'. Employees will see it when they open a new form.');
    }catch(err){message('Form Builder could not save: '+err.message)}finally{button.disabled=false}
   };
   redraw();
  })();
 }
 return {KEYS,TITLES,TYPES,defaults,schema,ready,mount,decorate,collect,saveAnswers,recentAnswers,validate};
})();
