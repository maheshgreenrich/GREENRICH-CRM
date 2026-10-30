'use strict';
window.GreenRichSheetManager=(function(){
 const F=[['name','Name'],['phone','Mobile'],['email','Email'],['city','City'],['requirement','Product requirement'],
 ['product_interest','Product interest'],['household_size','Household size'],['composting_status','Composting experience'],
 ['buying_timeline','Buying timeline'],['remarks','Remarks'],['external_id','Platform lead ID'],['campaign','Campaign'],
 ['form_name','Form name'],['created_time','Lead submitted at']];
 const preset={
  simple:{name:'A',phone:'B',email:'C',product_interest:'D'},
  home:{name:'G',phone:'H',email:'F',city:'I',requirement:'B',household_size:'C',composting_status:'D',buying_timeline:'E',remarks:'J'}
 };
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const day=x=>x?new Date(x).toLocaleString('en-IN'):'Never';
 const coName=c=>c==='grow-india'?'GreenRich Grow India':'GreenRich Enviro Solutions';
 const style='.gsi{font:13px/1.5 Inter,system-ui,sans-serif;color:#244463}.gsi *{box-sizing:border-box}.gsi h2{font-size:21px;margin:0}.gsi h3{font-size:16px;margin:0 0 12px}.gsi .panel{background:white;border:1px solid #d7e4f2;border-radius:12px;margin:12px 0;padding:17px}.gsi .muted{color:#61758b;font-size:12px}.gsi .bar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}.gsi .actions{display:flex;gap:8px;flex-wrap:wrap}.gsi button{width:auto!important;padding:9px 12px!important;min-height:33px!important;font-size:12px!important;border-radius:8px!important;cursor:pointer}.gsi .primary{background:#2657ae;color:white;border:1px solid #2657ae}.gsi .secondary{background:white;color:#2657ae;border:1px solid #c5d5ea}.gsi .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gsi .mapping{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gsi label{display:block;margin:7px 0;font-size:12px}.gsi input,.gsi textarea,.gsi select{font:inherit;width:100%;border:1px solid #cbd8e8;border-radius:8px;padding:9px;background:#fff;color:#16324e}.gsi textarea{min-height:65px}.gsi table{width:100%;border-collapse:collapse;font-size:12px}.gsi th,.gsi td{padding:9px;border-bottom:1px solid #e7edf5;text-align:left;vertical-align:top}.gsi .scroll{overflow:auto}.gsi .warning{background:#fff5e6;padding:9px;border-radius:8px;color:#7e5b23}.gsi .tile{padding:12px;border:1px solid #d9e4f0;border-radius:9px;margin:9px 0}.gsi dialog{width:min(760px,95vw);max-height:89vh;overflow:auto;border:1px solid #d0deed;border-radius:14px;padding:20px}.gsi dialog::backdrop{background:#1327478c}@media(max-width:720px){.gsi .grid,.gsi .mapping{grid-template-columns:1fr}}';
 const option=(list,sel)=>list.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(sel)?'selected':'')+'>'+esc(t)+'</option>').join('');
 const input=(label,name,value='',type='text')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'"></label>';
 const select=(label,name,list,val)=>'<label>'+label+'<select name="'+name+'">'+option(list,val)+'</select></label>';
 const heading=()=>'<style>'+style+'</style>';
 async function data(ctx){
  const cs=ctx.companyIds||[];
  if(!cs.length)throw Error('No working companies available');
  const auth=await ctx.db.rpc('gr_meta_sheet_status',{p_company:cs[0]});
  if(auth.error)throw Error('Company Admin access required: '+auth.error.message);
  const r=await Promise.all([
   ctx.db.from('gr_sheet_connections').select('*').in('company_id',cs).order('created_at',{ascending:false}),
   ctx.db.from('gr_sheet_import_rows').select('*').in('company_id',cs).order('created_at',{ascending:false}).limit(700),
   ctx.db.from('gr_crm_records').select('company_id,record_id,payload').in('company_id',cs).eq('kind','products').limit(500),
   ctx.db.from('gr_crm_sources').select('name').eq('active',true).order('name')
  ]);
  r.forEach(x=>{if(x.error)throw x.error});
  let staff=ctx.staff||[];
  if(!staff.length){const p=await Promise.all(cs.map(async company_id=>{
   const q=await ctx.db.rpc('gr_pipeline_staff',{p_company:company_id});
   if(q.error)throw q.error;return (q.data||[]).map(x=>({...x,company_id}));
  }));staff=p.flat()}
  return {sources:r[0].data||[],imports:r[1].data||[],products:r[2].data||[],approvedSources:r[3].data||[],staff};
 }
 function mount(root,ctx){
  const st={root,ctx,tab:'sources',data:null};
  st.refresh=async()=>{
   try{st.data=await data(ctx);draw(st)}
   catch(e){root.innerHTML=heading()+'<div class="gsi"><div class="panel warning">'+esc(e.message)+'</div></div>'}
  };
  root.innerHTML=heading()+'<div class="gsi"><div class="panel">Loading integration settings…</div></div>';
  void st.refresh();return st;
 }
 function draw(st){
  const d=st.data,dupes=d.imports.filter(x=>x.duplicate_type!=='none'),err=d.imports.filter(x=>x.import_error);
  const head='<div class="bar"><div><h2>Google Sheet Lead Integrations</h2><span class="muted">Connect Meta, Google Ads, TradeIndia, IndiaMART and other lead sources</span></div>'+
   '<div class="actions"><button class="primary" data-act="add">+ Add Google Sheet</button>'+
   '<button class="secondary" data-act="credentials">Connection token</button><button class="secondary" data-act="refresh">Refresh</button></div></div>'+
   '<div class="panel"><b>'+d.sources.filter(x=>x.enabled).length+' active sources</b> · '+dupes.length+' possible duplicates · '+err.length+' skipped rows'+
   '<p class="muted">Separate enquiries are retained even if phone/email matches. Same sheet-row retries are not duplicated.</p>'+
   '<div class="actions">'+[['sources','Connected Sheets'],['leads','Duplicate Leads'],['contacts','Duplicate Contacts'],['errors','Skipped Rows']].map(([id,label])=>'<button class="'+(st.tab===id?'primary':'secondary')+'" data-act="tab-'+id+'">'+label+'</button>').join('')+'</div></div>';
  st.root.innerHTML=heading()+'<div class="gsi">'+head+(st.tab==='sources'?sources(st):st.tab==='errors'?skipped(st):st.tab==='history'?history(st):duplicates(st))+
   '<div class="panel muted">Run the updated central Apps Script in your existing Google Apps Script project. The Google account running it needs access to every connected Sheet. Sync runs about every five minutes after the trigger is authorized.</div></div>';
  st.root.querySelectorAll('[data-act]').forEach(el=>el.onclick=()=>void act(st,el.dataset.act,el.dataset.id));
 }
 function sources(st){
  if(!st.data.sources.length)return '<div class="panel">No sheets connected. Click <b>Add Google Sheet</b>.</div>';
  return '<div class="panel"><h3>Connected Google Sheets</h3><div class="scroll"><table><thead><tr><th>Sheet</th><th>Company / Brand</th><th>Source / Owner</th><th>Sync status</th><th>Manage</th></tr></thead><tbody>'+
   st.data.sources.map(s=>'<tr><td><b>'+esc(s.tab_name)+'</b><br><a target="_blank" rel="noopener noreferrer" href="https://docs.google.com/spreadsheets/d/'+encodeURIComponent(s.sheet_id)+'/edit">Open Sheet</a></td>'+
    '<td>'+esc(coName(s.company_id))+'<br><span class="muted">'+esc(s.brand||'No brand')+' · '+esc(s.product_interest||'Product not confirmed')+'</span></td>'+
    '<td>'+esc(s.source_name)+'<br>'+esc(st.data.staff.find(p=>p.id===s.assigned_to)?.full_name||'Unassigned')+'</td>'+
    '<td><b>'+(s.enabled?'Active':'Paused')+'</b><br><span class="muted">Last sync: '+esc(day(s.last_sync_at))+'<br>Processed row: '+s.cursor_row+'</span>'+
    (s.last_error?'<p class="warning">'+esc(s.last_error)+'</p>':'')+'</td>'+
    '<td><button class="secondary" data-act="edit" data-id="'+s.id+'">Edit mapping</button> '+
    '<button class="secondary" data-act="pause" data-id="'+s.id+'">'+(s.enabled?'Pause':'Resume')+'</button> '+
    '<button class="secondary" data-act="history" data-id="'+s.id+'">History</button></td></tr>').join('')+
   '</tbody></table></div></div>';
 }
 function history(st){
  const source=st.data.sources.find(x=>x.id===st.selectedSource);
  const rows=st.data.imports.filter(x=>x.connection_id===st.selectedSource);
  return '<div class="panel"><div class="bar"><h3>Import History — '+esc(source?.tab_name||'')+'</h3><button class="secondary" data-act="tab-sources">Back to sheets</button></div>'+
    '<div class="scroll"><table><thead><tr><th>Row</th><th>Outcome</th><th>Customer / Lead</th><th>Imported</th><th>Details</th></tr></thead><tbody>'+
    rows.map(x=>'<tr><td>'+x.row_number+'</td><td>'+(x.import_error?esc(x.import_error):x.duplicate_type==='none'?'New lead':'Duplicate '+esc(x.duplicate_type))+
     '</td><td>'+esc(x.normalized_answers?.name||'—')+'<br><span class="muted">'+esc(x.normalized_answers?.phone||'')+'</span></td><td>'+esc(day(x.created_at))+
     '</td><td><button class="secondary" data-act="original" data-id="'+x.id+'">Original answers</button></td></tr>').join('')+
    '</tbody></table></div>'+(rows.length?'':'No imported rows recorded for this sheet yet.')+'</div>';
 }
  function duplicates(st){
  const wants=st.tab==='leads'?['lead','both']:['contact','both'];
  const rows=st.data.imports.filter(x=>wants.includes(x.duplicate_type));
  return '<div class="panel"><h3>'+(st.tab==='leads'?'Duplicate Leads':'Duplicate Contacts')+'</h3>'+
   '<p class="muted">All enquiries remain separate. Mark a warning as reviewed, keep separate or not duplicate. No merge occurs automatically.</p>'+
   rows.slice(0,250).map(x=>'<div class="tile"><b>'+esc(x.normalized_answers?.name||'Imported enquiry')+'</b> · '+esc(x.normalized_answers?.phone||'')+
     '<p class="muted">Sheet row '+x.row_number+' · '+esc(x.duplicate_type)+' · '+esc(x.review_status)+
     ' · Existing leads: '+(x.duplicate_lead_ids||[]).length+' · Existing contacts: '+(x.duplicate_contact_ids||[]).length+'</p>'+
     (x.review_note?'<p>'+esc(x.review_note)+'</p>':'')+
     '<div class="actions"><button class="secondary" data-act="original" data-id="'+x.id+'">View form answers</button> '+
     '<button class="secondary" data-act="review" data-id="'+x.id+'">Manage duplicate</button></div></div>').join('')+
   (rows.length?'':'No potential duplicates in this category.')+'</div>';
 }
 function skipped(st){
  const rows=st.data.imports.filter(x=>x.import_error);
  return '<div class="panel"><h3>Invalid rows and report headings</h3><p class="muted">Rejected rows remain in the audit log; no false lead was created.</p>'+
   rows.slice(0,200).map(x=>'<div class="tile">Sheet row '+x.row_number+' · '+esc(x.import_error)+
    ' <button class="secondary" data-act="original" data-id="'+x.id+'">View original</button></div>').join('')+
   (rows.length?'':'No skipped rows found.')+'</div>';
 }
 function modal(st,title,html,submit){
  const d=document.createElement('dialog');d.className='gsi';d.innerHTML=heading()+'<h3>'+esc(title)+'</h3><form>'+html+
   '<div class="actions"><button type="button" class="secondary" id="gsmCancel">Cancel</button>'+
   '<button type="submit" class="primary">Save</button></div></form>';
  document.body.append(d);d.onclose=()=>d.remove();d.querySelector('#gsmCancel').onclick=()=>d.close();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;
   try{await submit(new FormData(e.target));d.close();await st.refresh()}
   catch(ex){alert('Not saved: '+ex.message)}finally{b.disabled=false}};
  d.showModal();return d;
 }
 function edit(st,s){
  const ctx=st.ctx,company=s?.company_id||ctx.companyIds[0],m=s?.mapping||preset.simple;
  const companyOpts=ctx.companyIds.map(c=>[c,coName(c)]);
  const people=st.data.staff,products=st.data.products;
  const peopleOpts=c=>[['','Common — all Sales users'],...people.filter(p=>p.company_id===c).map(p=>[p.id,p.full_name])];
  const productOpts=c=>[['','Not confirmed'],...products.filter(p=>p.company_id===c).map(p=>[p.record_id,p.payload?.name||p.record_id])];
  const html='<p class="muted">Each Sheet/tab gets its own CRM field mapping and source. All original answers are retained even if not mapped.</p>'+
   '<div class="grid">'+select('Company','company',companyOpts,company)+
   input('Google Sheet URL','sheet_url',s?'https://docs.google.com/spreadsheets/d/'+s.sheet_id+'/edit':'')+
   input('Tab name','tab',s?.tab_name||'Sheet1')+
   select('Lead source','source',st.data.approvedSources.map(x=>[x.name,x.name]).concat(s&&!st.data.approvedSources.some(x=>x.name===s.source_name)?[[s.source_name,s.source_name+' (legacy source)']]:[]),s?.source_name||'Meta')+
   input('Brand','brand',s?.brand||'')+input('Product interest','product_interest',s?.product_interest||'')+
   select('Assign to employee','assignee',peopleOpts(company),s?.assigned_to)+
   select('CRM product (optional)','product',productOpts(company),s?.product_id||'')+
   input('Header row','header',s?.header_row||1,'number')+
   input('First data row','first',s?.first_data_row||2,'number')+
   select('Initial import behavior','mode',[['new_only','New rows only'],['historical','Import existing history']],s?.import_mode||'new_only')+
   select('Status','enabled',[['true','Active'],['false','Paused']],String(s?.enabled??true))+'</div>'+
   '<div class="panel"><h3>Map Sheet columns to CRM</h3>'+
   select('Use a template','template',[['custom','Custom'],['simple','Simple A–D'],['home','Home Composter actual report B–J']],'custom')+
   '<div class="mapping">'+F.map(([key,label])=>input(label+' — Sheet column', 'map_'+key,m[key]||'')).join('')+'</div>'+
   '<p class="muted">Required: Name and Mobile. Examples: G, H. Leave optional fields empty. Existing data is not removed when mapping changes.</p></div>';
  const d=modal(st,s?'Edit Sheet Integration':'Add Google Sheet',html,async f=>{
   const map={};F.forEach(([key])=>{const v=String(f.get('map_'+key)||'').trim().toUpperCase();if(v)map[key]=v});
   if(!map.name||!map.phone)throw Error('Please map Name and Mobile');
   const p={p_id:s?.id||null,p_company:f.get('company'),p_sheet_url:f.get('sheet_url'),p_tab:f.get('tab'),
    p_source:f.get('source'),p_brand:f.get('brand'),p_product_interest:f.get('product_interest'),
    p_product_id:f.get('product')||null,p_assignee:f.get('assignee'),p_mapping:map,
    p_header_row:Number(f.get('header')),p_first_row:Number(f.get('first')),
    p_import_mode:f.get('mode'),p_enabled:f.get('enabled')==='true'};
   const r=await ctx.db.rpc('gr_sheet_admin_upsert',{...p,p_assignee:p.p_assignee||null});if(r.error)throw r.error;
  });
  const form=d.querySelector('form');
  form.elements.template.onchange=e=>{const p=preset[e.target.value];if(p)F.forEach(([key])=>form.elements['map_'+key].value=p[key]||'')};
  form.elements.company.onchange=e=>{
   form.elements.assignee.innerHTML=option(peopleOpts(e.target.value));
   form.elements.product.innerHTML=option(productOpts(e.target.value));
  };
 }
 function original(st,id){
  const x=st.data.imports.find(r=>String(r.id)===id);if(!x)return;
  const values=x.raw_answers?.values||x.raw_values||[],headers=x.raw_answers?.headers||[];
  const rows=values.map((v,i)=>'<tr><td>'+esc(i<26?String.fromCharCode(65+i):'A'+String.fromCharCode(65+i-26))+
   '</td><td>'+esc(headers[i])+'</td><td>'+esc(v)+'</td></tr>').join('');
  const d=document.createElement('dialog');d.className='gsi';
  d.innerHTML=heading()+'<h3>Original form answers · row '+x.row_number+'</h3>'+
   '<div class="scroll"><table><thead><tr><th>Column</th><th>Question</th><th>Answer</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '<button class="secondary" id="gsmClose">Close</button>';
  document.body.append(d);d.onclose=()=>d.remove();d.querySelector('#gsmClose').onclick=()=>d.close();d.showModal();
 }
 async function act(st,a,id){
  if(a==='refresh'){await st.refresh();return}
  if(a.startsWith('tab-')){st.tab=a.slice(4);draw(st);return}
  if(a==='add'){edit(st);return}
  if(a==='edit'){edit(st,st.data.sources.find(x=>x.id===id));return}
  if(a==='credentials'){await window.GreenRichMetaSync.open(st.ctx);return}
  if(a==='history'){st.selectedSource=id;st.tab='history';draw(st);return}
  if(a==='original'){original(st,id);return}
  if(a==='pause'){
   const s=st.data.sources.find(x=>x.id===id);
   if(!s)return;
   const r=await st.ctx.db.rpc('gr_sheet_admin_upsert',{
    p_id:s.id,p_company:s.company_id,p_sheet_url:'https://docs.google.com/spreadsheets/d/'+s.sheet_id+'/edit',
    p_tab:s.tab_name,p_source:s.source_name,p_brand:s.brand,p_product_interest:s.product_interest,
    p_product_id:s.product_id,p_assignee:s.assigned_to||null,p_mapping:s.mapping,
    p_header_row:s.header_row,p_first_row:s.first_data_row,p_import_mode:s.import_mode,p_enabled:!s.enabled
   });if(r.error)alert(r.error.message);else await st.refresh();return;
  }
  if(a==='review'){
   const x=st.data.imports.find(r=>String(r.id)===id);if(!x)return;
   modal(st,'Manage duplicate warning',select('Decision','decision',[
     ['keep_separate','Keep separate enquiry'],['reviewed','Reviewed, follow-up required'],['not_duplicate','Not the same contact']
    ],x.review_status==='pending'?'keep_separate':x.review_status)+
    '<label>Reason / review note<textarea name="note" required></textarea></label>',async f=>{
     const r=await st.ctx.db.rpc('gr_sheet_admin_review',{
      p_import_id:x.id,p_decision:f.get('decision'),p_note:f.get('note')
     });if(r.error)throw r.error;
    });return;
  }
 }
 function open(ctx){
  const d=document.createElement('dialog');d.className='gsi';d.style.cssText='width:min(1180px,96vw);max-height:95vh;overflow:auto';
  const content=document.createElement('section');
  const b=document.createElement('button');b.className='secondary';b.textContent='Close integrations';b.onclick=()=>d.close();
  d.append(content,b);document.body.append(d);d.onclose=()=>d.remove();
  mount(content,ctx);d.showModal();return Promise.resolve();
 }
 return {mount,open};
})();