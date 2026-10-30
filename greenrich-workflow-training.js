'use strict';
/* GreenRich ONE — beginner-friendly isolated Operations training interface.
   DEMO ONLY: does not write the live product master, stock, purchase, journal or dispatch. */
window.GreenRichWorkflowTraining=(function(){
 const TYPES={
  SIMPLE_ASSEMBLY:{label:'Simple Assembly · Home Composter',desc:'A few parts → assembly → sticker → QC → stock',steps:['PARTS','ASSEMBLY','STICKER','QC','STOCK']},
  MULTILEVEL:{label:'Multi-level · Community Composter',desc:'SFG → RM → vendor/job work → assembly → sticker → QC → stock',steps:['SFG','RM','VENDOR_PO','JOBWORK','RECEIVE','ASSEMBLY','STICKER','QC','STOCK']},
  VENDOR_MADE:{label:'Vendor Manufactured',desc:'Vendor PO → goods received → sticker → QC → stock',steps:['VENDOR_PO','RECEIVE','STICKER','QC','STOCK']},
  DIRECT_RECEIPT:{label:'Direct Stock · CoolNSafe',desc:'No manufacturing. Confirm goods received → stock',steps:['RECEIVE','STOCK']},
  CUSTOM:{label:'Custom Workflow',desc:'Choose the stages your product needs',steps:['PARTS','ASSEMBLY','STICKER','QC','STOCK']}
 };
 const STAGES={PARTS:'Check Parts',SFG:'Check SFG',RM:'Check Raw Materials',VENDOR_PO:'Vendor PO',JOBWORK:'Job Work / Wastage',RECEIVE:'Receive Material',ASSEMBLY:'Assembly',STICKER:'Stickering',QC:'Quality Control',STOCK:'Finished Stock'};
 const CSS=`
 .gr-training{display:grid;grid-template-columns:minmax(230px,280px) minmax(0,1fr);gap:14px;margin-top:12px}
 .gr-training .tr-card{background:white;border:1px solid #dae5f1;border-radius:12px;padding:16px}
 .gr-training h3,.gr-training h4{font-size:16px;color:#183457;margin:0 0 10px}
 .gr-training p{font-size:13px;color:#64748b;line-height:1.5}
 .gr-training .tr-alert{padding:12px;background:#fff5e7;border:1px solid #f1d49b;border-radius:9px;color:#855b1e}
 .gr-training .tr-good{color:#176e48;font-weight:700}
 .gr-training .tr-btn{width:auto!important;max-width:100%;padding:9px 13px!important;border-radius:8px!important;background:#2755ac!important;color:white!important;font-size:13px!important;cursor:pointer}
 .gr-training .tr-btn[disabled]{opacity:.5;cursor:not-allowed}
 .gr-training .tr-secondary{background:#fff!important;color:#2454a4!important;border:1px solid #ccdbea!important}
 .gr-training .tr-prod{display:block;width:100%;border:1px solid #dae4f1;border-radius:9px;padding:11px;margin:8px 0;text-align:left;background:white;cursor:pointer;color:#233d62}
 .gr-training .tr-prod[aria-selected=true]{border-color:#2454aa;background:#edf4ff}
 .gr-training .tr-prod small{display:block;color:#64748b;margin-top:4px}
 .gr-training .tr-badge{border-radius:20px;background:#edf2f9;color:#234772;font-size:12px;padding:5px 9px;display:inline-block}
 .gr-training .tr-step{display:flex;gap:9px;align-items:start;border-left:3px solid #d6e2f1;margin-left:11px;padding:9px 8px 9px 17px;min-height:24px;color:#49617f;font-size:13px}
 .gr-training .tr-step b{color:#244871}.gr-training .tr-step.active{background:#eaf2ff;border-left-color:#2456b8}.gr-training .tr-step.done{border-left-color:#18935c}
 .gr-training .tr-pill{display:inline-flex;border:1px solid #dce6f1;border-radius:18px;align-items:center;padding:4px 8px;gap:5px;font-size:12px;color:#365479;background:#f7f9fd}
 .gr-training .tr-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
 .gr-training .tr-controls select,.gr-training input,.gr-training select,.gr-training textarea{font:inherit;background:white;color:#17365c;border:1px solid #cad9e9;border-radius:8px;padding:9px;max-width:100%;box-sizing:border-box}
 .gr-training label{display:flex;flex-direction:column;gap:5px;font-size:13px;color:#435b7b;margin:9px 0}
 .gr-training textarea{min-height:88px;width:100%}
 .gr-training .tr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:9px;margin:12px 0}
 .gr-training .tr-stats{background:#f7f9fc;padding:12px;border:1px solid #e1eaf3;border-radius:9px}
 .gr-training .tr-stats small{display:block;font-size:11px;color:#60748d}.gr-training .tr-stats b{display:block;font-size:20px;color:#153a62;margin-top:5px}
 .gr-training table{width:100%;border-collapse:collapse;font-size:12px}.gr-training th,.gr-training td{border-bottom:1px solid #e4ebf5;padding:9px;text-align:left;vertical-align:top}
 .gr-training .tr-scroll{overflow-x:auto;max-height:330px;overflow-y:auto}
 .gr-training .tr-demo-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
 .gr-training .tr-foot{grid-column:1/-1;font-size:12px;color:#80571a;background:#fff7ea;border:1px solid #efd5a6;padding:12px;border-radius:10px}
 .gr-training .tr-history{margin-top:14px;max-height:170px;overflow:auto;font-size:12px}.gr-training .tr-history article{border-bottom:1px solid #e4eaf3;padding:7px 0}
 .gr-training dialog{border:1px solid #d5e2ef;border-radius:12px;padding:22px;max-width:min(590px,92vw);max-height:86vh;overflow:auto}
 .gr-training dialog::backdrop{background:#102a4b85}
 @media(max-width:800px){.gr-training{grid-template-columns:1fr}.gr-training .tr-foot{grid-column:1}}
 `;
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const typeName=t=>TYPES[t]?.label||t;
 const notify=(ctx,message)=>{ctx.host.querySelector('#gr-tr-message').textContent=message;};
 const selected=(ctx)=>ctx.products.find(p=>p.id===ctx.selectedId)||ctx.products[0];
 const runFor=(ctx,product)=>ctx.runs.filter(r=>r.product_id===product.id).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
 const stock=(ctx,product)=>runFor(ctx,product).filter(r=>r.stock_posted).reduce((v,r)=>v+r.qty,0);
 const visible=(ctx)=>ctx.products.filter(p=>ctx.company==='all'||p.company_id===ctx.company);
 const stageText=s=>s.label||STAGES[s.key]||s.key;
 async function load(ctx){
  const [prods,runs]=await Promise.all([
   ctx.db.from('gr_erp_demo_products').select('*').in('company_id',ctx.companies).order('created_at',{ascending:true}),
   ctx.db.from('gr_erp_demo_runs').select('*').in('company_id',ctx.companies).order('updated_at',{ascending:false}).limit(500)
  ]);
  if(prods.error)throw prods.error;if(runs.error)throw runs.error;
  ctx.products=prods.data||[];ctx.runs=runs.data||[];
  if(!selected(ctx)||!visible(ctx).some(p=>p.id===ctx.selectedId))ctx.selectedId=visible(ctx)[0]?.id;
 }
 function draw(ctx){
  if(!ctx.host.isConnected)return;
  const products=visible(ctx),p=selected(ctx),runs=p?runFor(ctx,p):[],r=runs.find(x=>x.id===ctx.runId)||runs.find(x=>!x.stock_posted)||runs[0];
  if(r)ctx.runId=r.id;
  const selectCompanies=ctx.companies.length>1?'<label>Company<select id="gr-tr-company"><option value="all" '+(ctx.company==='all'?'selected':'')+'>Both companies</option>'+ctx.companies.map(c=>'<option '+(c===ctx.company?'selected':'')+' value="'+esc(c)+'">'+esc(c==='grow-india'?'Grow India':'Enviro Solutions')+'</option>').join('')+'</select></label>':'';
  const pageTitle='<div class="tr-demo-header"><div><h3>Learn Manufacturing — Step by Step</h3><p>பொருள் தேர்வு → ஒவ்வொரு படியாக முடிக்கவும் → QC → Demo stock</p></div><span class="tr-badge">TRAINING ONLY · Live stock untouched</span></div>';
  let left='<aside class="tr-card">'+selectCompanies+'<h4>1. Choose a product / பொருள்</h4>'+
   products.map(product=>'<button type="button" class="tr-prod" data-product="'+esc(product.id)+'" aria-selected="'+String(product.id===p?.id)+'"><b>'+esc(product.name)+'</b><small>'+esc(typeName(product.workflow_type))+'</small><small>Demo available stock: '+stock(ctx,product)+' nos</small></button>').join('')+
   '<button type="button" class="tr-btn tr-secondary" data-new-product>+ Create test product</button>'+
   '<p>Each product can have a different manufacturing workflow. Creating a product does not increase stock.</p></aside>';
  if(!p){ctx.host.innerHTML='<style>'+CSS+'</style><div class="gr-training">'+left+'<main class="tr-card">No training products visible for this company.</main><div class="tr-foot">Demo data is separate from live inventory.</div></div>';bind(ctx);return}
  const current=r&&!r.stock_posted?p.steps[r.step_index]:null,summary='<div class="tr-grid">'+
   [['Demo Stock',stock(ctx,p)+' nos'],['Workflow',p.steps.length+' steps'],['Demo runs',runs.length]].map(([k,v])=>'<div class="tr-stats"><small>'+esc(k)+'</small><b>'+esc(v)+'</b></div>').join('')+'</div>';
  let side='<section class="tr-card"><h4>2. Workflow map / செயல்முறை</h4>'+
   p.steps.map((s,i)=>'<div class="tr-step '+(r&&i<r.step_index?'done':r&&i===r.step_index&&!r.stock_posted?'active':'')+'"><span>'+(r&&i<r.step_index?'✓':String(i+1)+'.')+'</span><div><b>'+esc(stageText(s))+'</b>'+(r&&i===r.step_index&&!r.stock_posted?'<small> · CURRENT</small>':'')+'</div></div>').join('')+'</section>';
  let content='<section class="tr-card"><div class="tr-demo-header"><h3>'+esc(p.name)+'</h3><span class="tr-badge">'+esc(p.sku)+'</span></div>'+
   '<p>'+esc(p.description)+'</p>'+summary+
   '<div class="tr-controls"><button class="tr-btn" data-start '+(!ctx.canWrite?'disabled':'')+'>+ Start test production / receipt</button>'+
   '<label>Select run<select id="gr-tr-runs">'+(runs.length?runs.map(x=>'<option value="'+esc(x.id)+'" '+(r?.id===x.id?'selected':'')+'>Run '+esc(x.id.slice(0,8))+' · '+x.qty+' nos · '+(x.stock_posted?'Completed':'Step '+(x.step_index+1))+'</option>').join(''):'<option value="">No runs yet</option>')+'</select></label></div>'+
   (r?'<div class="tr-alert">'+(r.stock_posted?'✓ Finished: '+r.qty+' demo product(s) moved to training stock.': 'Next: '+esc(stageText(current||{})))+'</div>':
    '<div class="tr-alert">New product stock = 0. Start a training production/receipt to see how it becomes 1.</div>')+
   (r&&!r.stock_posted?'<form id="gr-tr-step-form" data-run="'+esc(r.id)+'">'+
     (current?.key==='JOBWORK'?'<p>Example: Issue 50 kg. Net used 8 kg, scrap 2 kg; remaining 40 kg held at vendor.</p><div class="tr-grid">'+
       [['issued','Issued kg','50'],['net_used','Net used kg','8'],['scrap','Scrap kg','2'],['vendor_balance','At vendor kg','40'],['returned','Returned kg','0']]
       .map(([key,label,val])=>'<label>'+label+'<input name="'+key+'" type="number" min="0" step=".001" value="'+val+'" required></label>').join('')+'</div>':
      current?.key==='QC'?'<label>Quality result<select name="qc_result"><option value="PASS">PASS — accepted</option><option value="FAIL">FAIL — do not receive to stock</option></select></label>':
      '<p>Mark this stage complete only after the real-world work is done. In training no physical movement is recorded.</p>')+
     '<label>Work notes / என்ன செய்தீர்கள்?<textarea name="note" required placeholder="Example: Parts checked / assembly completed / sticker applied"></textarea></label>'+
     '<button type="submit" class="tr-btn" '+(!ctx.canWrite?'disabled':'')+'>✓ Complete this step</button></form>':'')+
   '<div class="tr-history"><h4>Step history</h4>'+(r?.history?.length?r.history.slice().reverse().map(h=>'<article><b>'+esc(h.label)+'</b> · '+esc(h.note)+' <small>'+esc(new Date(h.at).toLocaleString('en-IN'))+'</small></article>').join(''):'No steps completed yet.')+'</div></section>';
  const components=p.parts||[];
  content+='<section class="tr-card"><h4>3. Parts, materials & vendors</h4>'+
   '<p>'+components.length+' reference records · Complicated multi-level BOM only when the product needs it.</p>'+
   '<div class="tr-scroll"><table><thead><tr><th>Code</th><th>Part / Material</th><th>Type</th><th>Qty</th><th>Vendor</th></tr></thead><tbody>'+
   (components.length?components.map(x=>'<tr><td>'+esc(x.code||'—')+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.level||'Part')+'</td><td>'+esc(x.qty??'Not confirmed')+' '+esc(x.uom||'')+'</td><td>'+esc(x.vendor||'—')+'</td></tr>').join(''):'<tr><td colspan="5">No manufacturing BOM. This product is directly received.</td></tr>')+'</tbody></table></div></section>';
  ctx.host.innerHTML='<style>'+CSS+'</style><div id="gr-tr-message" class="tr-alert" role="status" hidden></div><div class="gr-training">'+left+'<div style="display:flex;flex-direction:column;gap:12px">'+pageTitle+side+'</div><div style="display:flex;flex-direction:column;gap:12px">'+content+'</div><div class="tr-foot"><b>Training sandbox:</b> Demo stock starts at 0 and changes only when the final stage is completed. This does NOT change actual GreenRich product inventory, sales availability, vendor POs, or Accounts records.</div></div>';
  bind(ctx);
 }
 function show(ctx,s){const e=ctx.host.querySelector('#gr-tr-message');if(e){e.hidden=false;e.textContent=s}}
 async function refresh(ctx){await load(ctx);draw(ctx)}
 function parseParts(s){
  return String(s||'').split('\n').map(t=>t.trim()).filter(Boolean).map((line,i)=>{
   const v=line.split('|').map(t=>t.trim());
   if(!v[1]&&!v[0])throw Error('Enter a part name on line '+(i+1));
   if(v.length<2)throw Error('Use code | name | quantity | unit | vendor for each part');
   const q=v[2]?Number(v[2]):null;
   if(q!==null&&(!Number.isFinite(q)||q<=0))throw Error('Invalid quantity on line '+(i+1));
   return {code:v[0],name:v[1],qty:q,uom:v[3]||'nos',vendor:v[4]||'',level:'Part',verified:false};
  });
 }
 function formNew(ctx){
  const overlay=document.createElement('dialog');overlay.className='gr-tr-modal';
  overlay.style='padding:22px;border:1px solid #cbd9ec;border-radius:13px;max-width:min(640px,92vw);max-height:90vh;overflow:auto';
  overlay.innerHTML='<h3>Create a demo product & its own workflow</h3><p>இதில் real product stock மாற்றப்படாது. Product created → demo stock 0.</p>'+
    '<form id="gr-tr-create-form"><label>Company<select name="company_id">'+ctx.companies.map(c=>'<option value="'+esc(c)+'">'+esc(c==='grow-india'?'Grow India':'Enviro Solutions')+'</option>').join('')+'</select></label>'+
    '<label>Product name<input name="name" required minlength="3" placeholder="Example: Home composter 40L"></label>'+
    '<label>Product code / SKU<input name="sku" required minlength="3" placeholder="DEMO-HOME-40"></label>'+
    '<label>Choose manufacturing type<select name="type">'+Object.entries(TYPES).map(([k,v])=>'<option value="'+esc(k)+'">'+esc(v.label)+'</option>').join('')+'</select></label>'+
    '<p id="gr-tr-type-help"></p><label>Steps (comma-separated stage codes)<textarea name="steps" required></textarea></label>'+
    '<p>Common codes: PARTS, SFG, RM, VENDOR_PO, JOBWORK, RECEIVE, ASSEMBLY, STICKER, QC, STOCK. STOCK must always be last.</p>'+
    '<label>Parts — one per line: code | name | qty | unit | vendor<textarea name="parts" placeholder="PART-01 | Lid | 1 | nos | Internal"></textarea></label>'+
    '<label>Notes<textarea name="description" placeholder="What is needed to manufacture this product?"></textarea></label>'+
    '<div class="tr-controls"><button type="button" class="tr-btn tr-secondary" data-cancel>Cancel</button><button type="submit" class="tr-btn">Save Demo Product</button></div></form>';
  document.body.append(overlay);
  const form=overlay.querySelector('form'),type=form.elements.type,st=form.elements.steps;
  const populate=()=>{st.value=TYPES[type.value].steps.join(', ');overlay.querySelector('#gr-tr-type-help').textContent=TYPES[type.value].desc};
  type.onchange=populate;populate();
  form.elements.company_id.value=ctx.company==='all'?ctx.companies[0]:ctx.company;
  overlay.querySelector('[data-cancel]').onclick=()=>overlay.close();
  overlay.onclose=()=>overlay.remove();
  form.onsubmit=async e=>{
   e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
   try{
    const v=new FormData(form),keys=String(v.get('steps')).split(',').map(t=>t.trim().toUpperCase()).filter(Boolean);
    if(!keys.every(key=>STAGES[key]))throw Error('Invalid stage code; choose codes shown in the form');
    const steps=keys.map(key=>({key,label:STAGES[key]}));
    const {data,error}=await ctx.db.rpc('gr_demo_product_create',{
     p_company:v.get('company_id'),p_name:v.get('name'),p_sku:v.get('sku'),p_type:v.get('type'),
     p_parts:parseParts(v.get('parts')),p_steps:steps,p_description:v.get('description')
    });
    if(error)throw error;
    ctx.selectedId=data;ctx.company=String(v.get('company_id'));ctx.runId=null;
    overlay.close();await refresh(ctx);
   }catch(err){alert(err.message)}finally{submit.disabled=false}
  };
  overlay.showModal();
 }
 function bind(ctx){
  const h=ctx.host;
  h.querySelector('#gr-tr-company')?.addEventListener('change',e=>{ctx.company=e.target.value;ctx.selectedId=visible(ctx)[0]?.id;ctx.runId=null;draw(ctx)});
  h.querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>{ctx.selectedId=b.dataset.product;ctx.runId=null;draw(ctx)});
  h.querySelector('[data-new-product]')?.addEventListener('click',()=>formNew(ctx));
  h.querySelector('#gr-tr-runs')?.addEventListener('change',e=>{ctx.runId=e.target.value;draw(ctx)});
  h.querySelector('[data-start]')?.addEventListener('click',async e=>{
   e.target.disabled=true;
   try{const p=selected(ctx),qty=prompt('How many products for this training run? (1–100)','1');if(qty===null)return;
    if(!/^\d+$/.test(qty)||Number(qty)<1||Number(qty)>100)throw Error('Enter a whole number from 1 to 100');
    const {data,error}=await ctx.db.rpc('gr_demo_run_start',{p_product:p.id,p_qty:Number(qty)});
    if(error)throw error;ctx.runId=data;await refresh(ctx);
   }catch(error){show(ctx,error.message)}finally{e.target.disabled=false}
  });
  h.querySelector('#gr-tr-step-form')?.addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget,rid=form.dataset.run,product=selected(ctx);
   const r=ctx.runs.find(x=>x.id===rid),k=product.steps[r.step_index].key;
   const f=new FormData(form),details=k==='QC'?{result:f.get('qc_result')}:k==='JOBWORK'?
    Object.fromEntries(['issued','net_used','scrap','vendor_balance','returned'].map(key=>[key,String(f.get(key))])):{};
   const b=form.querySelector('[type=submit]');b.disabled=true;
   try{const {error}=await ctx.db.rpc('gr_demo_run_advance',{p_run:rid,p_note:f.get('note'),p_details:details});
    if(error)throw error;await refresh(ctx);
   }catch(err){show(ctx,err.message)}finally{b.disabled=false}
  });
 }
 async function mount(host,{client,companies,selection,canWrite}){
  const ctx={host,db:client,companies,company:selection||'all',canWrite,products:[],runs:[],selectedId:null,runId:null};
  host.innerHTML='<p>Loading training workflows…</p>';
  try{await refresh(ctx)}catch(error){host.textContent='Training unavailable: '+error.message+' (database migration may be missing)'}
 }
 return {mount};
})();
