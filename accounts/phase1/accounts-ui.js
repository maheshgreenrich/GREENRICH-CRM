'use strict';
/* Integrated Accounts workspace within GreenRich ONE. Read-only Phase 1 financial data.
   Other workflows are visibly marked as not enabled rather than simulating postings. */
window.GreenRichAccounts = {
 async mount(root,{db,companyId}){
  root.replaceChildren();
  const tabs=[
   ['overview','Overview'],['sales','Sales & Receipts'],['purchases','Purchases & Bills'],
   ['petty','Petty Cash & Expenses'],['banking','Banking'],
   ['ledger','General Ledger'],['reports','Reports'],['approvals','Approvals']
  ];
  const styles=document.createElement('style');
  styles.textContent=`
   .acc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
   .acc-head h2{margin:0 0 5px;font-size:23px;color:#132c50}
   .acc-sub{margin:0;color:#64748b;font-size:13px}
   .acc-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
   .acc-tab{width:auto!important;flex:0 0 auto!important;padding:10px 13px!important;border:1px solid #d6e1ee!important;border-radius:9px!important;background:#fff!important;color:#335170!important;font-size:13px!important;font-weight:600!important;cursor:pointer}
   .acc-tab[aria-selected="true"]{background:#254f95!important;color:#fff!important;border-color:#254f95!important}
   .acc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px;margin:15px 0}
   .acc-metric{background:#fff;border:1px solid #dce5f0;border-radius:12px;padding:18px}
   .acc-metric small{display:block;color:#64748b;font-size:12px;margin-bottom:10px}
   .acc-metric strong{display:block;font-size:22px;color:#172f50}
   .acc-panel{background:#fff;border:1px solid #dce5f0;border-radius:12px;padding:18px;margin-bottom:16px}
   .acc-panel h3{font-size:16px;margin:0 0 12px;color:#172f50}
   .acc-note{font-size:13px;color:#5d6f88;margin:8px 0}
   .acc-table-wrap{overflow-x:auto}.acc-table{border-collapse:collapse;width:100%;font-size:13px}
   .acc-table th,.acc-table td{border-bottom:1px solid #e7edf5;padding:11px;text-align:left;white-space:nowrap}
   .acc-table th{color:#64748b;font-weight:600}
   .acc-empty{padding:30px 15px;color:#64748b;text-align:center}
   .acc-state{display:inline-flex;align-items:center;background:#f0f4fb;color:#34547d;border-radius:20px;font-size:11px;padding:5px 10px}
   .acc-warning{padding:12px 15px;border:1px solid #f3d99c;border-radius:10px;background:#fff9eb;color:#875c10;margin:12px 0;font-size:13px}
   .acc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
   .acc-actions button{width:auto!important;padding:9px 14px!important;font-size:13px!important}
   @media(max-width:600px){.acc-tab{font-size:12px!important;padding:9px!important}.acc-head h2{font-size:20px}}
  `;
  root.append(styles);
  const header=document.createElement('div');header.className='acc-head';
  header.innerHTML='<div><h2>Accounts & Finance</h2><p class="acc-sub">Manage the accounting activities of GreenRich ONE from one workspace.</p></div><span class="acc-state">Integrated CRM / ERP</span>';
  root.append(header);
  const nav=document.createElement('nav');nav.className='acc-tabs';nav.setAttribute('aria-label','Accounts sections');
  const area=document.createElement('div');root.append(nav,area);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n||0);
  const panel=(heading)=>{const el=document.createElement('section');el.className='acc-panel';const h=document.createElement('h3');h.textContent=heading;el.append(h);area.append(el);return el};
  const note=(el,s,cls='acc-note')=>{const p=document.createElement('p');p.className=cls;p.textContent=s;el.append(p)};
  const table=(el,cols,rows)=>{const wrap=document.createElement('div');wrap.className='acc-table-wrap';const t=document.createElement('table');t.className='acc-table';
   const thead=document.createElement('thead'),tr=document.createElement('tr');
   cols.forEach(([,label])=>{const th=document.createElement('th');th.textContent=label;tr.append(th)});thead.append(tr);t.append(thead);
   const body=document.createElement('tbody');
   if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=cols.length;td.className='acc-empty';td.textContent='No records available';tr.append(td);body.append(tr);}
   rows.forEach(r=>{const tr=document.createElement('tr');cols.forEach(([k])=>{const td=document.createElement('td');td.textContent=String(r[k]??'');tr.append(td)});body.append(tr)});
   t.append(body);wrap.append(t);el.append(wrap);
  };
  let data=null;
  async function load(){
   if(companyId==='all')return {error:'Select one company at the top to view its separate accounting ledger.'};
   const names=[
    db.from('acc_accounts').select('id,code,name,type,is_active').eq('company_id',companyId).order('code'),
    db.from('acc_journals').select('id,number,date,memo,source_type').eq('company_id',companyId).order('date',{ascending:false}).limit(100),
    db.from('acc_trial_balance').select('code,name,type,total_debit,total_credit,net').eq('company_id',companyId).order('code')
   ];
   const [accounts,journals,trial]=await Promise.all(names);
   const error=[accounts,journals,trial].find(r=>r.error)?.error;
   return error?{error:'The accounting database has not been configured or permission is missing: '+error.message}:{accounts:accounts.data||[],journals:journals.data||[],trial:trial.data||[]};
  }
  async function view(tab){
   nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
   area.replaceChildren();
   if(tab==='overview'){
    const metrics=document.createElement('div');metrics.className='acc-grid';area.append(metrics);
    const items=[['Cash & Bank','—'],['Receivables','—'],['Payables','—'],['Monthly Income','—'],['Monthly Expenses','—'],['Pending Approvals','—']];
    items.forEach(([k,v])=>{const card=document.createElement('div');card.className='acc-metric';const small=document.createElement('small');small.textContent=k;const strong=document.createElement('strong');strong.textContent=v;card.append(small,strong);metrics.append(card)});
    note(panel('Financial Dashboard'),'Balances will appear after the posting workflows and database migrations are activated. Blank values are intentional; no financial totals have been fabricated.');
    const p=panel('General Ledger Status');note(p,data?.error||'Chart of Accounts: '+data.accounts.length+' accounts. Posted journals: '+data.journals.length+'.');
    return;
   }
   if(tab==='ledger'){
    if(data?.error){note(panel('Accounting connection'),data.error,'acc-warning');return}
    table(panel('Chart of Accounts'),[['code','Code'],['name','Account'],['type','Type'],['is_active','Active']],data.accounts);
    table(panel('Trial Balance'),[['code','Code'],['name','Account'],['debit','Debit'],['credit','Credit'],['net_display','Net']],data.trial.map(r=>({...r,debit:money(r.total_debit),credit:money(r.total_credit),net_display:money(r.net)})));
    table(panel('Recent Journal Entries'),[['number','Journal'],['date','Date'],['source_type','Source'],['memo','Description']],data.journals);
    return;
   }
   if(tab==='reports'){
    const p=panel('Accounting Reports');
    note(p,'Profit & Loss, Balance Sheet, Trial Balance, General Ledger, Receivables & Payables Aging, Tax Reports and Cash / Bank Books will be available here after their underlying posting modules are implemented.');
    if(!data?.error)table(panel('Current Trial Balance (preview)'),[['code','Code'],['name','Account'],['debit','Debit'],['credit','Credit']],data.trial.map(r=>({...r,debit:money(r.total_debit),credit:money(r.total_credit)})));
    else note(p,data.error,'acc-warning');return;
   }
   const details={
    sales:['Sales, Invoices & Receipts','Quotations → Sales Orders → Tax Invoices → Receipts → Credit Notes','Create invoice, record payment, allocate receipts, send PDF and view customer statements.'],
    purchases:['Purchases, Bills & Payments','Purchase Requests → Purchase Orders → Goods Receipts → Bills → Supplier Payments','Three-way matching, vendor bills, debit notes and payment allocation.'],
    petty:['Petty Cash & Employee Expenses','Requests → Approval → Voucher → Payment → Replenishment','Fund balances, expense receipts, reimbursement and monthly reconciliation.'],
    banking:['Banking & Reconciliation','Bank Accounts → Transactions → Reconciliation','CSV import, payment matching, transfers and unreconciled items.'],
    approvals:['Approvals & Financial Controls','Approval Inbox → Period Locks → Audit Log','Role-specific approval limits, self-approval restrictions and protected financial periods.']
   };
   const [heading,flow,description]=details[tab],p=panel(heading);
   note(p,flow);note(p,description);
   note(p,'This workflow is not active yet. Financial transactions cannot be created or posted until its secure server-side validations and database tables are installed.','acc-warning');
  }
  tabs.forEach(([key,label])=>{const b=document.createElement('button');b.type='button';b.className='acc-tab';b.dataset.tab=key;b.textContent=label;b.setAttribute('aria-selected',String(key==='overview'));b.onclick=()=>view(key);nav.append(b)});
  data=await load();await view('overview');
 }
};
