'use strict';
/* Unified Customers & Leads directory. Customers are global; leads are company-scoped.
 * Keeps original IDs and linked sales/follow-up histories. */
(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=x=>String(x??'').trim();
 const norm=x=>clean(x).replace(/\D/g,'');
 const phone=x=>{const digits=norm(x);return !digits?'':digits.length===10?'+91'+digits:digits.length===12&&digits.startsWith('91')?'+91'+digits.slice(2):''};
 const phoneValid=x=>!clean(x)||Boolean(phone(x));
 const uuid=()=>crypto.randomUUID();
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 const FIELDS=[
  ['name','Name'],['mobile','Mobile 1'],['mobile2','Mobile 2'],['email','Email'],['company','Company name'],
  ['tags','Tags'],['type','Customer type'],['address1','Address line 1'],['address2','Address line 2'],
  ['city','City'],['state','State'],['pincode','PIN code'],['gstin','GSTIN'],['source','Customer source'],
  ['products','Products'],['enquiry_details','Enquiry related details'],['notes','Customer notes / history'],
  ['title','Lead / enquiry title'],['stage','Lead status'],['owner','Assigned to'],['followup','Next follow-up'],
  ['value','Expected value'],['company_id','GreenRich company'],['created_at','Created date']
 ];
 const HEADERS=FIELDS.map(x=>x[1]);
 const types=['Individual','Retailer','Distributor','Business'];
 const stages=['New','Contacted','Qualified','Quotation','Won','Lost'];
 const FILE_TYPES=['.xlsx','.xls','.csv'];
 const headerMap=new Map(FIELDS.flatMap(([key,label])=>[[key.toLowerCase(),key],[label.toLowerCase(),key]]));
 let root=null,db=null,context=null,sources=[],mode='all',search='',tag='all',source='all',start='',end='',countLimit=1000,busy=false;
 let exportSheetPromise=null;
 const notify=s=>{const t=root?.querySelector('#gr-contact-status');if(t){t.hidden=false;t.textContent=s}context?.notify?.(s)};
 const opts=(rows,current='',all='')=>(all?'<option value="all">'+esc(all)+'</option>':'')+rows.map(([v,label])=>'<option value="'+esc(v)+'" '+(String(current)===String(v)?' selected':'')+'>'+esc(label)+'</option>').join('');
 const tags=()=>context?.tags?.()||[];
 const customers=()=>context?.customers?.()||[];
 const leads=()=>context?.leads?.()||[];
 const tagNames=r=>(r.tag_ids||[]).map(id=>tags().find(t=>t.id===id)?.name).filter(Boolean);
 const companyLabel=id=>context?.companyLabel?.(id)||id;
 const mark=kind=>'<span class="gr-contact-kind '+kind+'">'+(kind==='lead'?'Lead':'Customer')+'</span>';
 const safeDate=v=>String(v||'').slice(0,10);
 function allRecords(){
  return [...customers().map(x=>({...x,_kind:'customer',_companyId:''})),
   ...leads().map(x=>({...x,_kind:'lead',_companyId:x._companyId||x.company_id||''}))];
 }
 function visibleRecords(){
  const term=search.toLowerCase();
  return allRecords().filter(row=>{
   if(mode!=='all'&&row._kind!==mode)return false;
   if(source!=='all'&&row.source!==source)return false;
   if(tag!=='all'&&!(row.tag_ids||[]).includes(tag))return false;
   const created=safeDate(row.created_at||row.date);
   if(start&&(!created||created<start))return false;
   if(end&&(!created||created>end))return false;
   return !term||[
    row.name,row.title,row.contact,row.email,row.mobile,row.mobile2,row.company,row.company_id,row.source,
    row.city,row.state,row.pincode,row.gstin,row.products,row.enquiry_details,row.notes,row.address1,
    row.address2,row.owner,...tagNames(row)
   ].some(x=>String(x??'').toLowerCase().includes(term));
  }).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
 }
 async function loadSources(){
  if(!db)return;
  const result=await db.from('gr_crm_sources').select('id,name,active').order('name');
  if(result.error){notify('Unable to load contact sources: '+result.error.message);return}
  sources=result.data||[];
  renderFilters();
 }
 function renderFilters(){
  if(!root)return;
  for(const [id,choices,label,current] of [
   ['#gr-contact-source',[...new Set([...sources.map(x=>x.name),...allRecords().map(x=>x.source)].filter(Boolean))].sort().map(s=>[s,s]),'All sources',source],
   ['#gr-contact-tag',tags().map(t=>[t.id,t.name]),'All tags',tag]
  ]){
   const el=root.querySelector(id);if(!el)continue;
   el.innerHTML=opts(choices,current,label);
   el.value=[...el.options].some(o=>o.value===current)?current:'all';
  }
 }
 function draw(){
  if(!root?.isConnected)return;
  renderFilters();
  const rows=visibleRecords(),customerCount=allRecords().filter(x=>x._kind==='customer').length,
   leadCount=allRecords().filter(x=>x._kind==='lead').length;
  const summary=root.querySelector('#gr-contact-total');
  if(summary)summary.innerHTML='<strong>'+customerCount+'</strong> customers <span>•</span> <strong>'+leadCount+'</strong> leads <span>•</span> '+rows.length+' matching';
  const tbody=root.querySelector('#gr-contact-rows');if(!tbody)return;
  tbody.innerHTML=rows.slice(0,countLimit).map(r=>{
   const id=esc(r.id),owner=esc(r._companyId||'');
   const edit=context.permission(r._kind,'edit'),remove=r._kind==='lead'?false:context.permission(r._kind,'delete');
   const actions='<button type="button" data-contact-edit="'+id+'" data-contact-kind="'+r._kind+'" data-contact-company="'+owner+'" '+(!edit?'disabled':'')+'>Edit</button>'+
    '<button type="button" data-contact-delete="'+id+'" data-contact-kind="'+r._kind+'" data-contact-company="'+owner+'" '+(!remove?'disabled':'')+'>Delete</button>';
   return '<tr><td>'+mark(r._kind)+'</td>'+
    '<td>'+(r._kind==='customer'?'<button type="button" data-contact-profile="'+id+'" class="gr-contact-link">'+esc(r.name||'—')+'</button>':'<strong>'+esc(r.name||r.contact||r.title||'—')+'</strong>')+
    '<small>'+esc(r.company||'')+'</small></td>'+
    '<td>'+esc(phone(r.mobile)||r.mobile||'—')+'<small>'+esc(phone(r.mobile2)||r.mobile2||'')+'</small></td>'+
    '<td>'+esc(r.email||'—')+'</td><td>'+esc(r.source||'—')+'</td>'+
    '<td>'+tagNames(r).map(x=>'<span class="gr-contact-tag">'+esc(x)+'</span>').join('')+'</td>'+
    '<td>'+esc(r._kind==='lead'?(r.stage||'New'):(r.type||'Individual'))+
    '<small>'+(r._kind==='lead'?esc(companyLabel(r._companyId)):'Shared across companies')+'</small></td>'+
    '<td>'+esc(safeDate(r.created_at)||'—')+'</td><td>'+window.GreenRichActionMenu.wrap(actions)+'</td></tr>';
  }).join('')||'<tr><td colspan="9" class="gr-contact-empty">No matching contacts. Change the filters or add a record.</td></tr>';
  const meta=root.querySelector('#gr-contact-meta');if(meta)meta.textContent=rows.length>countLimit?'Showing first '+countLimit+' records. Narrow filters to see the rest.':'Showing '+rows.length+' matching records';
 }
 function render(){
  if(!root)return;
  const kind=root.querySelector('#gr-contact-kind');if(kind)kind.value=mode;
  const q=root.querySelector('#gr-contact-search');if(q&&q.value!==search)q.value=search;
  draw();
 }
 const field=(name,label,required=false,options=null,value='')=>{
  const req=required?' required':'';
  if(options)return '<label>'+esc(label)+(required?' *':'')+'<select name="'+name+'"'+req+'>'+opts(options,value,'')+'</select></label>';
  if(['notes','enquiry_details','address1','address2','products'].includes(name))
   return '<label class="'+(name==='notes'||name==='enquiry_details'?'gr-contact-wide':'')+'">'+esc(label)+(required?' *':'')+'<textarea name="'+name+'" rows="2"'+req+'>'+esc(value)+'</textarea></label>';
  const type=name==='email'?'email':name==='followup'?'date':name==='value'?'number':'text';
  return '<label>'+esc(label)+(required?' *':'')+'<input type="'+type+'" name="'+name+'" value="'+esc(value)+'" '+(name==='value'?'min="0" step="any"':name==='pincode'?'inputmode="numeric" maxlength="6"':name==='gstin'?'maxlength="15"':'')+req+'></label>';
 };
 function phoneField(name,label,val,required){
  return '<label>'+esc(label)+(required?' *':'')+
   '<div class="gr-contact-phone"><span>+91</span><input type="tel" name="'+name+'" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" placeholder="9876543210" value="'+esc(phone(val).slice(3))+'"'+(required?' required':'')+'></div></label>';
 }
 function openForm(kind,id='',owner=''){
  if(kind==='lead'){window.GreenRichCRM?.switchPage?.('leads');window.GreenRichShell?.setPageWithoutRemount?.('leads');notify('Use the Leads & CRM pipeline to create, assign or move leads.');return;}
  const existing=id?allRecords().find(r=>r.id===id&&r._kind===kind&&(kind==='customer'||r._companyId===owner)):null;
  if(id&&!existing)return notify('Record not found. Refresh this page.');
  if(!context.permission(kind,id?'edit':'create'))return notify('Your role does not have permission to '+(id?'edit':'add')+' '+kind+' records.');
  const record=existing||{},dialog=root.querySelector('#gr-contact-dialog'),form=root.querySelector('#gr-contact-form');
  form.dataset.kind=kind;form.dataset.id=id;form.dataset.company=owner;
  root.querySelector('#gr-contact-dialog-title').textContent=(id?'Edit ':'Add ')+(kind==='lead'?'Lead':'Customer');
  const cols=[
   field('name','Name',true,null,record.name||record.contact),
   phoneField('mobile','Mobile number 1',record.mobile,true),
   phoneField('mobile2','Mobile number 2',record.mobile2,false),
   field('email','Email',false,null,record.email),
   field('company','Company name',false,null,record.company),
   field('type','Customer type',false,types.map(x=>[x,x]),record.type||'Individual'),
   field('source','Customer source',false,[[ '', 'Select source'], ...[...new Set([...sources.map(x=>x.name),record.source].filter(Boolean))].map(s=>[s,s])],record.source||''),
   '<fieldset class="gr-contact-tags"><legend>Tags</legend>'+(tags().length?tags().map(t=>'<label><input type="checkbox" name="tag_ids" value="'+esc(t.id)+'" '+((record.tag_ids||[]).includes(t.id)?'checked':'')+'><span>'+esc(t.name)+'</span></label>').join(''):'<p>Admin can add tags in Settings → Customer Tags.</p>')+'</fieldset>',
   ...(kind==='lead'?[
    field('company_id','GreenRich company',true,[['','Select company'],...context.companyIds.map(c=>[c,companyLabel(c)])],owner||(context.selectedCompany()==='all'?'':context.selectedCompany())),
    field('title','Lead / enquiry title',false,null,record.title),
    field('products','Products interested in',false,null,record.products),
    field('enquiry_details','Enquiry-related details',false,null,record.enquiry_details),
    field('stage','Lead status',false,stages.map(s=>[s,s]),record.stage||'New'),
    field('owner','Assigned to',false,null,record.owner),
    field('followup','Next follow-up date',false,null,record.followup),
    field('value','Expected deal value (₹)',false,null,record.value??'')
   ]:[]),
   field('address1','Address line 1',kind==='customer',null,record.address1),
   field('address2','Address line 2',false,null,record.address2),
   field('city','City',false,null,record.city),
   field('state','State',false,null,record.state),
   field('pincode','PIN code',false,null,record.pincode),
   field('gstin','GSTIN',false,null,record.gstin),
   field('notes','Customer notes / history',false,null,record.notes)
  ];
  form.innerHTML='<div class="gr-contact-fields">'+cols.join('')+'</div><div class="gr-contact-dialog-actions">'+
   '<button type="button" data-contact-close>Cancel</button><button class="gr-contact-primary" type="submit">Save '+kind+'</button></div>';
  if(id&&kind==='lead')form.elements.namedItem('company_id').disabled=true;
  dialog.showModal();
 }
 function payloadFromForm(form,kind,old={}){
  const fd=new FormData(form);const fields=Object.fromEntries([...fd.entries()].filter(([k])=>k!=='tag_ids'));
  const result={...old,...fields,tag_ids:fd.getAll('tag_ids')};
  for(const key of ['name','email','company','source','type','notes','address1','address2','city','state','pincode','gstin'])result[key]=clean(result[key]);
  result.mobile=phone(result.mobile);result.mobile2=phone(result.mobile2);
  if(!result.name)throw Error('Enter a customer / lead name.');
  if(!result.mobile||!phoneValid(result.mobile2))throw Error('Enter a valid +91 mobile number (10 digits).');
  if(result.mobile2&&result.mobile===result.mobile2)throw Error('Both mobile fields cannot contain the same number.');
  if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw Error('Enter a valid email address.');
  if(result.pincode&&!/^\d{6}$/.test(result.pincode))throw Error('PIN code must contain 6 digits.');
  if(result.gstin&&!/^[0-9A-Z]{15}$/.test(result.gstin.toUpperCase()))throw Error('GSTIN must have 15 characters.');
  result.gstin=result.gstin.toUpperCase();
  delete result._kind;delete result._companyId;delete result._savedAt;
  if(kind==='customer'){
   if(!result.address1)throw Error('Address line 1 is required for customer records.');
   result.country='India';
   delete result.products;delete result.enquiry_details;delete result.company_id;delete result.title;delete result.stage;delete result.value;delete result.followup;
  }else{
   result.title=clean(result.title)||clean(result.products)||'Website / customer enquiry';
   result.contact=result.name+' · '+result.mobile;
   result.stage=result.stage||'New';result.value=Number(result.value)||0;
   result.company_id=clean(result.company_id);if(!context.companyIds.includes(result.company_id))throw Error('Select an assigned GreenRich company.');
   result.created_at=old.created_at||new Date().toISOString();
  }
  return result;
 }
 const matches=(a,b)=>Boolean(
   a.email&&b.email&&a.email.trim().toLowerCase()===b.email.trim().toLowerCase()
   ||[a.mobile,a.mobile2].filter(Boolean).some(v=>[b.mobile,b.mobile2].filter(Boolean).some(n=>norm(v).slice(-10)===norm(n).slice(-10)))
 );
 function duplicateCustomer(row,id,items=customers()){
  return items.find(c=>c.id!==id&&matches(row,c));
 }
 async function persistCustomer(row,id=''){
  const dupe=duplicateCustomer(row,id);
  if(dupe)throw Error('Duplicate customer: email or mobile matches '+dupe.name+'. Use the existing customer instead.');
  const saved=await window.GreenRichSharedCustomers.saveCustomer({...row,...(id?{id}:{})});
  await window.GreenRichSharedCustomers.refresh();
  context.afterCustomerSave?.();return saved;
 }
 async function persistLead(row,id='',companyId='',optimistic=true){
  const co=companyId||row.company_id;
  if(!context.companyIds.includes(co))throw Error('Selected company is not allowed.');
  if(id){
   const existing=leads().find(l=>l.id===id&&(l._companyId||l.company_id)===co);
   if(!existing)throw Error('Lead was changed on another device. Refresh and retry.');
   const old=await db.from('gr_crm_records').select('updated_at,payload').eq('company_id',co).eq('kind','leads').eq('record_id',id).single();
   if(old.error)throw Error(old.error.message);
   const updated={...old.data.payload,...row,id,company_id:co,created_at:old.data.payload.created_at||row.created_at};
   const result=await db.from('gr_crm_records').update({payload:updated,updated_at:new Date().toISOString()})
    .eq('company_id',co).eq('kind','leads').eq('record_id',id).eq('updated_at',old.data.updated_at).select('record_id');
   if(result.error)throw Error(result.error.message);
   if(!result.data?.length)throw Error('Lead changed elsewhere. Refresh before retrying.');
  }else{
   const newId=uuid(),insert={...row,id:newId,company_id:co};
   const response=await db.from('gr_crm_records').insert({company_id:co,kind:'leads',record_id:newId,payload:insert});
   if(response.error)throw Error(response.error.message);
  }
  if(optimistic)await window.GreenRichCRMCloud?.refresh?.();
 }
 async function submit(event){
  event.preventDefault();if(busy)return;
  const form=event.currentTarget,kind=form.dataset.kind,id=form.dataset.id,owner=form.dataset.company;
  if(!context.permission(kind,id?'edit':'create'))return notify('Not permitted.');
  const existing=id?allRecords().find(r=>r.id===id&&r._kind===kind&&(kind==='customer'||r._companyId===owner)):null;
  try{
   const row=payloadFromForm(form,kind,existing||{});
   busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
   if(kind==='customer')await persistCustomer(row,id);
   else await persistLead(row,id,owner);
   root.querySelector('#gr-contact-dialog').close();notify((kind==='customer'?'Customer':'Lead')+' saved successfully.');
   draw();
  }catch(error){notify('Save failed: '+error.message)}
  finally{busy=false;const button=form.querySelector('[type=submit]');if(button)button.disabled=false}
 }
 async function removeRecord(kind,id,company){
  if(!context.permission(kind,'delete'))return notify('You do not have delete permission.');
  const item=allRecords().find(x=>x._kind===kind&&x.id===id&&(kind==='customer'||x._companyId===company));
  if(!item)return;
  if(!confirm('Delete '+kind+' '+(item.name||item.title)+'? Related sales, quotations and follow-ups may reference this contact.'))return;
  try{
   if(kind==='customer'){await window.GreenRichSharedCustomers.deleteCustomer(id);context.afterCustomerSave?.()}
   else{
    const r=await db.from('gr_crm_records').delete().eq('company_id',company).eq('kind','leads').eq('record_id',id).select('record_id');
    if(r.error)throw Error(r.error.message);
    await window.GreenRichCRMCloud?.refresh?.();
   }
   notify(kind+' deleted.');draw();
  }catch(e){notify('Delete failed: '+e.message)}
 }
 function dataRow(r){
  return {
   name:r.name||r.contact||'',mobile:phone(r.mobile)||r.mobile||'',
   mobile2:phone(r.mobile2)||r.mobile2||'',email:r.email||'',company:r.company||'',
   tags:tagNames(r).join(', '),type:r.type||'Individual',
   address1:r.address1||'',address2:r.address2||'',city:r.city||'',state:r.state||'',pincode:r.pincode||'',
   gstin:r.gstin||'',source:r.source||'',products:r.products||'',enquiry_details:r.enquiry_details||'',
   notes:r.notes||'',title:r.title||'',stage:r.stage||'',owner:r.owner||'',followup:r.followup||'',
   value:r.value??'',company_id:r._companyId||r.company_id||'',created_at:r.created_at||''
  };
 }
 const protect=x=>typeof x==='string'&&/^[\s]*[=+@\-]/.test(x)?"'"+x:x;
 function download(name,rows){
  const jsonRows=rows.map(r=>Object.fromEntries(FIELDS.map(([key,label])=>[label,['mobile','mobile2'].includes(key)?(dataRow(r)[key]??''):protect(dataRow(r)[key]??'')])));
  if(!window.XLSX)throw Error('Excel library not loaded; please refresh and try again.');
  const sheet=window.XLSX.utils.json_to_sheet(jsonRows,{header:HEADERS,skipHeader:false});
  sheet['!cols']=FIELDS.map(([key])=>({wch:['notes','enquiry_details','address1','address2'].includes(key)?35:Math.max(16,key.length+8)}));
  for(const cell of Object.keys(sheet)){if(/^[A-Z]+\d+$/.test(cell)&&sheet[cell]?.t==='n')sheet[cell].z='0.########'}
  const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,sheet,'Contacts');
  window.XLSX.writeFile(book,name+'.xlsx');
 }
 async function excelReady(){
  if(window.XLSX)return;
  if(!exportSheetPromise)exportSheetPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
   script.onload=()=>window.XLSX?resolve():reject(Error('Excel library unavailable'));
   script.onerror=()=>reject(Error('Unable to load Excel importer. Check internet access.'));
   document.head.append(script);
  }).catch(e=>{exportSheetPromise=null;throw e});
  return exportSheetPromise;
 }
 async function readSheet(file){
  if(!FILE_TYPES.some(x=>file.name.toLowerCase().endsWith(x)))throw Error('Choose an Excel (.xlsx, .xls) or CSV file');
  await excelReady();
  const workbook=window.XLSX.read(await file.arrayBuffer(),{type:'array',raw:false,cellDates:false});
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  if(!sheet)throw Error('Excel file contains no worksheet.');
  const rows=window.XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
  if(rows.length>2000)throw Error('Import up to 2,000 rows at a time.');
  return rows.map(raw=>Object.fromEntries(Object.entries(raw).map(([k,v])=>[headerMap.get(clean(k).toLowerCase())||k,clean(v)])));
 }
 function parseImport(raw,kind,companyId){
  const id='';
  const knownTagIds=(raw.tags||'').split(/[,;]+/).map(s=>clean(s).toLowerCase()).filter(Boolean);
  const selectedTags=knownTagIds.map(t=>tags().find(x=>x.name.toLowerCase()===t)?.id).filter(Boolean);
  if(knownTagIds.length!==selectedTags.length)throw Error('Unknown tag: '+knownTagIds.filter(t=>!tags().some(x=>x.name.toLowerCase()===t)).join(', ')+'. Create tags in Settings first.');
  const row={...raw,tag_ids:selectedTags,company_id:companyId,created_at:raw.created_at||new Date().toISOString()};
  if(kind==='lead')row.company_id=clean(raw.company_id)||companyId;
  if(kind==='customer'){row.id=id;delete row.id}
  // Reuse form validations while accepting Excel column names.
  const tmp={getAll:k=>k==='tag_ids'?selectedTags:[],entries:()=>Object.entries(row).filter(([key])=>key!=='tag_ids')};
  const fake={};
  for(const [k,v] of Object.entries(row))fake[k]=v;
  fake.mobile=phone(raw.mobile);fake.mobile2=phone(raw.mobile2);fake.email=clean(raw.email);
  if(!fake.name||!fake.mobile||!phoneValid(fake.mobile2))throw Error('Name and valid +91 Mobile 1 are required.');
  if(fake.mobile2===fake.mobile)throw Error('Mobile numbers must be different.');
  if(fake.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fake.email))throw Error('Invalid email address');
  if(fake.pincode&&!/^\d{6}$/.test(fake.pincode))throw Error('Invalid PIN code');
  if(fake.gstin&&!/^[0-9A-Za-z]{15}$/.test(fake.gstin))throw Error('Invalid GSTIN');
  fake.gstin=clean(fake.gstin).toUpperCase();
  fake.type=types.find(t=>t.toLowerCase()===clean(fake.type).toLowerCase())||'Individual';
  if(kind==='customer'){if(!clean(fake.address1))throw Error('Address line 1 is required.');fake.country='India';delete fake.company_id;delete fake.products;delete fake.enquiry_details;delete fake.title;delete fake.stage;delete fake.value;delete fake.followup}
  else{if(!context.companyIds.includes(fake.company_id))throw Error('Company not assigned');fake.title=fake.title||fake.products||'Imported enquiry';fake.contact=fake.name+' · '+fake.mobile;fake.stage=stages.includes(fake.stage)?fake.stage:'New';fake.value=Number(fake.value)||0}
  delete fake.tags;
  return fake;
 }
 async function importFile(kind,file){
  if(!context.permission(kind,'create'))return notify('You do not have permission to import '+kind+' records.');
  let done=0,skipped=0,failed=0;
  const btn=root.querySelector('[data-contact-import="'+kind+'"]');if(btn)btn.disabled=true;
  try{
   const inputRows=await readSheet(file);
   if(!inputRows.length)throw Error('The spreadsheet is empty.');
   let collection=customers().slice();
   const owner=context.selectedCompany()==='all'?'':context.selectedCompany();
   const leadCollection=leads().slice();
   for(const [index,input] of inputRows.entries()){
    try{
     if(kind==='lead'&&!input.company_id&&!owner)throw Error('Select one working company in the top selector, or provide GreenRich company in Excel.');
     const row=parseImport(input,kind,owner);
     if(kind==='customer'){
      if(duplicateCustomer(row,'',collection)){skipped++;continue}
      const saved=await window.GreenRichSharedCustomers.saveCustomer(row);
      collection.push(saved);
     }else{
      const dup=leadCollection.some(l=>((l._companyId||l.company_id)===row.company_id)&&matches(l,row)&&clean(l.title).toLowerCase()===clean(row.title).toLowerCase());
      if(dup){skipped++;continue}
      await persistLead(row,'','',false);leadCollection.push({...row});
     }
     done++;
    }catch(error){failed++;if(failed<=3)notify('Excel row '+(index+2)+': '+error.message)}
   }
   await window.GreenRichSharedCustomers.refresh();
   await window.GreenRichCRMCloud?.refresh?.();
   context.afterCustomerSave?.();
   notify('Import complete: '+done+' added, '+skipped+' duplicates skipped, '+failed+' invalid / rejected. No existing records were overwritten.');
   draw();
  }catch(error){notify('Import failed: '+error.message)}
  finally{if(btn)btn.disabled=false;const pick=root.querySelector('#gr-contact-file');if(pick)pick.value=''}
 }
 function markup(){
  return '<div class="gr-contact-manager"><div class="gr-contact-top"><div><span>CONTACT MANAGEMENT</span><h2>Customers & Leads</h2><p>One searchable directory · shared customers and company-scoped enquiries</p></div>'+
   '<div class="gr-contact-add">'+
   '<button class="gr-contact-primary" type="button" data-contact-add="customer">+ Add Customer</button>'+
   '<button class="gr-contact-primary alt" type="button" data-contact-add="lead">+ Add Lead (Pipeline)</button></div></div>'+
   '<div class="gr-contact-toolbar"><button type="button" data-contact-import="customer">↑ Import Customers</button>'+
   '<button type="button" data-contact-import="lead">↑ Import Leads (Pipeline)</button>'+
   '<button type="button" data-contact-export="customer">↓ Export Customers</button>'+
   '<button type="button" data-contact-export="lead">↓ Export Leads</button>'+
   '<button type="button" data-contact-template="customer">Customer Excel Template</button>'+
   '<button type="button" data-contact-template="lead">Lead Excel Template</button></div>'+
   '<div class="gr-contact-filters"><label>Search<input id="gr-contact-search" placeholder="Name, mobile, email, company, enquiry…" type="search"></label>'+
   '<label>Record type<select id="gr-contact-kind">'+opts([['all','Customers + leads'],['customer','Customers only'],['lead','Leads only']],mode)+'</select></label>'+
   '<label>Source<select id="gr-contact-source"><option value="all">All sources</option></select></label>'+
   '<label>Tags<select id="gr-contact-tag"><option value="all">All tags</option></select></label>'+
   '<label>From date<input type="date" id="gr-contact-from"></label>'+
   '<label>To date<input type="date" id="gr-contact-to"></label>'+
   '<button type="button" id="gr-contact-clear">Reset filters</button></div>'+
   '<div class="gr-contact-metrics"><span id="gr-contact-total"></span><span id="gr-contact-meta"></span></div>'+
   '<div class="gr-contact-table"><table><thead><tr><th>Record</th><th>Name / Company</th><th>Mobile numbers</th><th>Email</th><th>Source</th><th>Tags</th><th>Type / Status</th><th>Added</th><th>Actions</th></tr></thead><tbody id="gr-contact-rows"></tbody></table></div>'+
   '<p id="gr-contact-status" role="status" class="gr-contact-message" hidden></p>'+
   '<input id="gr-contact-file" type="file" accept=".xlsx,.xls,.csv" hidden>'+
   '<dialog id="gr-contact-dialog"><div class="gr-contact-dialog-head"><h2 id="gr-contact-dialog-title">Add contact</h2><button type="button" data-contact-close aria-label="Close form">×</button></div><form id="gr-contact-form"></form></dialog></div>';
 }
 function mount(container,config){
  db=config.db;context=config;root=container;
  if(!container)return;
  container.innerHTML=markup();
  container.querySelector('#gr-contact-form').onsubmit=submit;
  container.addEventListener('click',async event=>{
   const btn=event.target.closest('button');if(!btn)return;
   if(btn.dataset.contactAdd){openForm(btn.dataset.contactAdd);return}
   if(btn.dataset.contactEdit){openForm(btn.dataset.contactKind,btn.dataset.contactEdit,btn.dataset.contactCompany);return}
   if(btn.dataset.contactDelete){if(btn.dataset.contactKind==='lead')return notify('Lead deletion is disabled; move the lead to Lost in the pipeline.');await removeRecord(btn.dataset.contactKind,btn.dataset.contactDelete,btn.dataset.contactCompany);return}
   if(btn.dataset.contactProfile){context.openProfile(btn.dataset.contactProfile);return}
   if(btn.dataset.contactClose!==undefined){container.querySelector('#gr-contact-dialog').close();return}
   if(btn.dataset.contactImport){if(btn.dataset.contactImport==='lead'){window.GreenRichCRM?.switchPage?.('leads');window.GreenRichShell?.setPageWithoutRemount?.('leads');notify('Import leads in the pipeline after selecting a salesperson.');return;}const file=container.querySelector('#gr-contact-file');file.dataset.kind=btn.dataset.contactImport;file.click();return}
   if(btn.dataset.contactExport){if(!context.permission(btn.dataset.contactExport,'export'))return notify('You do not have export permission.');try{await excelReady();download('greenrich-'+btn.dataset.contactExport+'-'+today(),visibleRecords().filter(r=>r._kind===btn.dataset.contactExport))}catch(e){notify(e.message)}return}
   if(btn.dataset.contactTemplate){try{await excelReady();const example=btn.dataset.contactTemplate==='lead'?{_kind:'lead',name:'Example Lead',mobile:'+919876543210',mobile2:'+919123456780',email:'example@example.com',company:'Sample Business',type:'Retailer',source:'Website',products:'Composter',enquiry_details:'Interested in quote',address1:'Sample address',city:'Coimbatore',state:'Tamil Nadu',pincode:'641001',title:'Composter enquiry',stage:'New',company_id:context.companyIds[0],notes:'Replace or delete sample row'}:{_kind:'customer',name:'Example Customer',mobile:'+919876543210',mobile2:'+919123456780',email:'example@example.com',company:'Sample Business',type:'Business',source:'Direct',address1:'Sample address',city:'Coimbatore',state:'Tamil Nadu',pincode:'641001',notes:'Replace or delete sample row'};download('greenrich-'+btn.dataset.contactTemplate+'-template',[example])}catch(e){notify(e.message)}return}
   if(btn.id==='gr-contact-clear'){mode='all';search='';source='all';tag='all';start='';end='';for(const id of ['#gr-contact-from','#gr-contact-to'])root.querySelector(id).value='';render()}
  });
  const file=container.querySelector('#gr-contact-file');file.onchange=()=>{if(file.files?.[0])void importFile(file.dataset.kind,file.files[0])};
  for(const [key,id] of [['mode','gr-contact-kind'],['source','gr-contact-source'],['tag','gr-contact-tag'],['start','gr-contact-from'],['end','gr-contact-to'],['search','gr-contact-search']]){
   const input=container.querySelector('#'+id);
   input.addEventListener(id==='gr-contact-search'?'input':'change',()=>{if(key==='mode')mode=input.value;else if(key==='source')source=input.value;else if(key==='tag')tag=input.value;else if(key==='start')start=input.value;else if(key==='end')end=input.value;else search=input.value;draw()});
  }
  void loadSources();render();
 }
 function setMode(next){mode=next==='lead'?'lead':next==='customer'?'customer':'all';render()}
 window.GreenRichContacts={mount,render,setMode,openForm,phone,readSheet,parseImport,columns:HEADERS,visibleRecords};
})();
