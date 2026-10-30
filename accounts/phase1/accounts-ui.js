'use strict';
/* GreenRich Accounts Phase 1: read-only ledger explorer; browser cannot post financial data. */
window.GreenRichAccounts = {
 async mount(root,{db,companyId}){
  root.replaceChildren();
  const h=document.createElement('section');h.className='panel';
  h.innerHTML='<h2>Accounts · Ledger Foundation</h2><p>Chart of Accounts and posted ledger activity. Invoices, bills, cash movements and reports will be enabled in later phases after server-side validation.</p>';
  root.append(h);
  if(companyId==='all'){const p=document.createElement('p');p.className='notice';p.textContent='Choose one company from the company selector to view a legally separate ledger.';h.append(p);return;}
  const [accounts,journals,trial]=await Promise.all([
   db.from('acc_accounts').select('id,code,name,type,is_active').eq('company_id',companyId).order('code'),
   db.from('acc_journals').select('id,number,date,memo,source_type').eq('company_id',companyId).order('date',{ascending:false}).limit(25),
   db.from('acc_trial_balance').select('code,name,total_debit,total_credit,net').eq('company_id',companyId).order('code')
  ]);
  const error=[accounts,journals,trial].find(x=>x.error)?.error;
  if(error){const p=document.createElement('p');p.className='notice';p.textContent='Accounts tables are not available: '+error.message+'. Ask Admin to apply the Phase 1 SQL migrations.';h.append(p);return;}
  function section(title,columns,rows){
   const card=document.createElement('section');card.className='panel';const heading=document.createElement('h3');heading.textContent=title;card.append(heading);
   const wrapper=document.createElement('div');wrapper.style.overflowX='auto';const table=document.createElement('table');table.style.width='100%';table.style.borderCollapse='collapse';
   const head=document.createElement('thead'),tr=document.createElement('tr');columns.forEach(c=>{const th=document.createElement('th');th.textContent=c[1];th.style.textAlign='left';th.style.padding='10px';tr.append(th)});head.append(tr);table.append(head);
   const body=document.createElement('tbody');rows.forEach(row=>{const tr=document.createElement('tr');columns.forEach(([key])=>{const td=document.createElement('td');td.textContent=String(row[key]??'');td.style.padding='10px';td.style.borderTop='1px solid #e2e8f0';tr.append(td)});body.append(tr)});table.append(body);wrapper.append(table);card.append(wrapper);root.append(card);
  }
  section('Chart of Accounts',[['code','Code'],['name','Account'],['type','Type'],['is_active','Active']],accounts.data||[]);
  const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(n||0);
  section('Trial Balance',[['code','Code'],['name','Account'],['debit_display','Debit'],['credit_display','Credit'],['net_display','Net']],(trial.data||[]).map(r=>({...r,debit_display:money(r.total_debit),credit_display:money(r.total_credit),net_display:money(r.net)})));
  section('Recent Journals',[['number','Journal'],['date','Date'],['source_type','Source'],['memo','Memo']],journals.data||[]);
 }
};
