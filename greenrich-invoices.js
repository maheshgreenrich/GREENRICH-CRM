'use strict';
/* GreenRich ONE invoices: seller profiles shared in Supabase, sales invoices local to their order.
   Based on the company's supplied Sales_1770.pdf invoice layout. Attendance is untouched. */
(()=>{
 const companyIds=['grow-india','enviro-solutions'];
 let client=null,profiles={};
 const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const money=value=>'₹'+new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
 const numeric=value=>Number.isFinite(Number(value))?Number(value):0;
 const amount=value=>Math.round((numeric(value)+Number.EPSILON)*100)/100;
 const blank=value=>String(value??'').trim();
 const fallback={id:'',company_id:'',legal_name:'',address:'',city_state_pincode:'',phone:'',email:'',gstin:'',pan:'',state_name:'',state_code:'',bank_name:'',bank_account:'',bank_ifsc:'',bank_branch:'',default_freight_hsn:'996511',default_declaration:'',signatory:'Authorised Signatory'};
 const stateCodes={'andhra pradesh':'37','arunachal pradesh':'12','assam':'18','bihar':'10','chhattisgarh':'22','goa':'30','gujarat':'24','haryana':'06','himachal pradesh':'02','jharkhand':'20','karnataka':'29','kerala':'32','madhya pradesh':'23','maharashtra':'27','manipur':'14','meghalaya':'17','mizoram':'15','nagaland':'13','odisha':'21','punjab':'03','rajasthan':'08','sikkim':'11','tamil nadu':'33','telangana':'36','tripura':'16','uttar pradesh':'09','uttarakhand':'05','west bengal':'19','delhi':'07','puducherry':'34','chandigarh':'04','jammu and kashmir':'01','ladakh':'38','andaman and nicobar islands':'35','dadra and nagar haveli and daman and diu':'26','lakshadweep':'31'};
 const stateCode=name=>stateCodes[blank(name).toLowerCase()]||'';
 const digits=number=>{const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function hundred(n){if(n<20)return ones[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+hundred(n%100):'')}
  let n=Math.floor(Number(number)||0);if(!n)return 'Zero';
  const result=[];for(const [unit,label] of [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand'],[1,'']]){
   const part=Math.floor(n/unit);if(part){result.push(hundred(part)+(label?' '+label:''));n%=unit}
  }return result.join(' ');
 };
 const words=value=>{const inr=amount(value),rupees=Math.floor(inr),paise=Math.round((inr-rupees)*100);return digits(rupees)+' INR'+(paise?' and '+digits(paise)+' Paise':'')+' Only'};
 const fiscal=onDate=>{const date=new Date((onDate||new Date().toISOString().slice(0,10))+'T12:00:00');const y=date.getFullYear()-(date.getMonth()<3?1:0);return String(y).slice(-2)+'-'+String(y+1).slice(-2)};
 function nextInvoiceId(store,companyId,invoiceDate){
  const code=companyId==='enviro-solutions'?'GRE':'GRG',fy=fiscal(invoiceDate),prefix=code+'/'+fy+'/';
  if(!store.invoiceSequences||typeof store.invoiceSequences!=='object')store.invoiceSequences={};
  const prior=Math.max(Number(store.invoiceSequences[fy])||0,0,...(store.sales||[]).map(s=>String(s.invoice_number||'').startsWith(prefix)?Number(String(s.invoice_number).slice(prefix.length))||0:0));
  store.invoiceSequences[fy]=prior+1;
  return prefix+String(store.invoiceSequences[fy]).padStart(5,'0');
 }
 async function load(db){
  if(db)client=db;
  if(!client)throw Error('Company invoice settings require a signed-in user.');
  const {data,error}=await client.from('gr_invoice_profiles').select('*').in('company_id',companyIds);
  if(error)throw Error('Cannot load company invoice settings: '+error.message);
  profiles=Object.fromEntries((data||[]).map(p=>[p.company_id,p]));
  return profiles;
 }
 const currentProfile=id=>({...fallback,...(profiles[id]||{}),company_id:id});
 const companyTitle=id=>window.GreenRichCompanies?.list?.().find(c=>c.id===id)?.name||({'grow-india':'GreenRich Grow India Pvt Ltd','enviro-solutions':'GreenRich Enviro Solutions Pvt Ltd'}[id])||id;
 function applyProductCodes(store,values){
  if(!store||!Array.isArray(store.products)||!Array.isArray(store.sales))throw Error('Invalid product and sales records.');
  const changed=new Set();
  for(const product of store.products){
   if(!values.has(product.id))continue;
   const value=blank(values.get(product.id));
   if(value&&!/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(value))throw Error('HSN/SAC code must be 4, 6 or 8 digits.');
   if(blank(product.hsn)!==value){product.hsn=value;changed.add(product.id)}
  }
  // Preserve legally issued invoice data; synchronize only unissued drafts.
  for(const sale of store.sales){
   if(changed.has(sale.product_id)&&sale.invoice_status!=='Issued')sale.hsn=values.get(sale.product_id);
  }
  return [...changed];
 }
 async function settings(host,{db,notify}){
  const tell=message=>notify?.(message);
  await load(db);
  const selectable=window.GreenRichCompanies?.allowed?.()||companyIds;
  if(window.GreenRichCRMCloud){
   await window.GreenRichCRMCloud.start({
    client:db,companyIds:selectable,
    onData:null,onNotice:tell
   });
  }
  const currentChoice=window.GreenRichCompanies?.selected?.();
  host.innerHTML='<div class="panel gr-invoice-settings">'+
   '<div class="gr-tax-settings-head"><div><h2>Company Invoice &amp; Tax Details</h2><p>Enter the seller GST information for each company, then assign an HSN/SAC code to each product. These details will be used automatically in draft invoices.</p></div></div>'+
   '<label class="gr-tax-company-picker"><span>Choose company to configure</span><select id="gr-invoice-company" aria-label="Company for invoice and tax configuration"></select></label>'+
   '<div class="gr-tax-company-status" id="gr-tax-status" aria-live="polite"></div>'+
   '<form id="gr-invoice-profile-form" class="gr-invoice-profile-form"></form>'+
   '</div>'+
   '<div class="panel gr-hsn-settings" id="gr-hsn-settings">'+
   '<div class="gr-hsn-heading"><div><h2>Product HSN / SAC Codes</h2><p>Enter a separate HSN or SAC code for each product in the selected company. These codes are used for its draft invoices.</p></div><span class="gr-hsn-count" id="gr-hsn-count"></span></div>'+
   '<p class="gr-hsn-browser-note">Product and sales records are still saved in this browser. HSN/SAC changes here apply to products and unissued drafts in this browser; issued invoices are not changed.</p>'+
   '<form id="gr-hsn-form"><label class="gr-hsn-search-label">Search products<input id="gr-hsn-search" type="search" placeholder="Search product name or SKU"></label><div class="gr-hsn-table-wrap"><table class="gr-hsn-table"><thead><tr><th>Product</th><th>SKU</th><th>GST %</th><th>HSN / SAC code</th></tr></thead><tbody id="gr-hsn-list"></tbody></table></div>'+
   '<div class="gr-hsn-actions"><button type="submit" class="blue" id="gr-hsn-save">Save Product HSN / SAC Codes</button><small id="gr-hsn-summary"></small></div></form>'+
   '</div>';
  const select=host.querySelector('#gr-invoice-company');
  companyIds.filter(id=>selectable.includes(id)).forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=companyTitle(id);select.append(option)});
  if(companyIds.includes(currentChoice))select.value=currentChoice;
  const keyFor=id=>id==='grow-india'?'greenrich-crm-v2':'greenrich-crm-v2::enviro-solutions';
  const getProducts=id=>{
   let store;
   try{store=JSON.parse(localStorage.getItem(keyFor(id))||'null')}
   catch{throw Error('Saved products cannot be read. Restore a valid CRM backup before editing HSN/SAC.')}
   if(!store)store={products:[],sales:[]};
   if(!Array.isArray(store.products)||!Array.isArray(store.sales))throw Error('Saved product data is invalid. Restore a valid CRM backup.');
   return store;
  };
  const sellerFields=[
   ['legal_name','Seller legal company name','text','Official registered company name'],
   ['address','Seller registered address','textarea','Street, building and locality'],
   ['city_state_pincode','City, state and PIN code','text','Example: Ayanambakkam, Chennai - 600095'],
   ['gstin','Seller GSTIN','text','15-character GST registration number'],
   ['state_name','Seller state','text','Example: Tamil Nadu'],
   ['state_code','Seller GST state code','text','Two digits (Tamil Nadu: 33)']
  ];
  const optionalFields=[
   ['pan','Company PAN','text'],['phone','Company phone','tel'],['email','Company email','email'],
   ['bank_name','Bank name','text'],['bank_account','Bank account number','text'],
   ['bank_ifsc','Bank IFSC','text'],['bank_branch','Bank branch','text'],
   ['default_freight_hsn','Shipping / Freight SAC code','text'],
   ['default_declaration','Invoice declaration','textarea'],['signatory','Signatory name or designation','text']
  ];
  const input=(row,value)=>{
   const [id,label,type,hint]=row;
   return '<label class="'+(type==='textarea'?'gr-invoice-wide':'')+'"><span>'+e(label)+
    (hint?'<em class="gr-tax-required">Required for issuing</em>':'')+'</span>'+
    (type==='textarea'?'<textarea name="'+id+'" rows="3" placeholder="'+e(hint||label)+'">'+e(value||'')+'</textarea>':
     '<input name="'+id+'" type="'+type+'" value="'+e(value||'')+'" placeholder="'+e(hint||label)+'" '+(id==='gstin'?'maxlength="15" autocomplete="off"':id==='state_code'?'maxlength="2" inputmode="numeric"':'')+'>')+'</label>';
  };
  function renderSeller(){
   const current=currentProfile(select.value),form=host.querySelector('#gr-invoice-profile-form');
   const missingFields=sellerFields.map(row=>row[0]).filter(key=>!blank(current[key]));
   const status=host.querySelector('#gr-tax-status');
   status.textContent=missingFields.length?'Seller details pending: '+missingFields.length+' required field(s) missing for '+companyTitle(select.value):
    'Seller details complete for '+companyTitle(select.value)+' · Verify official records before issuing invoices.';
   status.classList.toggle('gr-tax-complete',!missingFields.length);
   form.innerHTML='<h3 class="gr-invoice-wide gr-tax-section-title">1. Seller GST &amp; Address Details</h3>'+
    '<p class="gr-invoice-wide gr-tax-help">Complete these for each company. Blank required details prevent issuing a final invoice, but you may save a partial profile.</p>'+
    sellerFields.map(row=>input(row,current[row[0]])).join('')+
    '<details class="gr-invoice-wide gr-tax-extra"><summary>Additional Invoice Details · Bank, PAN, Contact &amp; Declaration</summary><div class="gr-tax-extra-grid">'+optionalFields.map(row=>input(row,current[row[0]])).join('')+'</div></details>'+
    '<div class="gr-invoice-wide gr-tax-save-row"><button class="blue" type="submit">Save Seller Details for '+e(companyTitle(select.value))+'</button><p class="gr-invoice-settings-note">Seller settings are shared for authorized employee logins. Already-issued invoice snapshots stay unchanged.</p></div>';
  }
  function renderHSN(){
   const company=select.value,list=host.querySelector('#gr-hsn-list'),counter=host.querySelector('#gr-hsn-count');
   let stored;
   try{stored=getProducts(company)}
   catch(error){list.innerHTML='<tr><td colspan="4">'+e(error.message)+'</td></tr>';counter.textContent='';host.querySelector('#gr-hsn-save').disabled=true;return}
   const products=[...stored.products].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
   counter.textContent=products.length+' products · '+products.filter(p=>blank(p.hsn)).length+' codes entered';
   host.querySelector('#gr-hsn-save').disabled=!products.length;
   list.innerHTML=products.length?products.map(p=>
    '<tr data-hsn-product="'+e(p.id)+'"><td><strong>'+e(p.name||'Unnamed product')+'</strong></td>'+
    '<td>'+e(p.sku||'—')+'</td><td>'+e(p.tax??'—')+'%</td>'+
    '<td><input class="gr-hsn-input" data-product-id="'+e(p.id)+'" aria-label="HSN or SAC code for '+e(p.name)+'" value="'+e(p.hsn||'')+'" placeholder="4, 6 or 8 digits" inputmode="numeric" maxlength="8" pattern="([0-9]{4}|[0-9]{6}|[0-9]{8})"></td></tr>'
   ).join(''):'<tr><td colspan="4" class="gr-hsn-empty">No products found for this company in this browser. Add products under Stock &amp; Products first, then return here to enter their HSN / SAC codes.</td></tr>';
   host.querySelector('#gr-hsn-summary').textContent=products.length?'Empty codes will continue to block invoice issuance for their products.':'';
   host.querySelector('#gr-hsn-search').value='';
  }
  select.onchange=()=>{renderSeller();renderHSN()};
  host.querySelector('#gr-hsn-search').oninput=event=>{
   const needle=event.target.value.trim().toLowerCase();
   host.querySelectorAll('#gr-hsn-list tr[data-hsn-product]').forEach(row=>{
    row.hidden=!row.textContent.toLowerCase().includes(needle);
   });
  };
  host.querySelector('#gr-hsn-form').onsubmit=event=>{
   event.preventDefault();const company=select.value,form=event.currentTarget;
   const button=form.querySelector('button[type="submit"]');button.disabled=true;
   try{
    const existing=getProducts(company),inputs=[...form.querySelectorAll('[data-product-id]')];
    const values=new Map();
    for(const input of inputs){
     const value=blank(input.value);
     if(value&&!/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(value))throw Error('Use a 4-, 6- or 8-digit numeric HSN/SAC code for each product.');
     values.set(input.dataset.productId,value);
    }
    const changed=applyProductCodes(existing,values);
    if(changed.length){
     localStorage.setItem(keyFor(company),JSON.stringify(existing));
    }
    tell(changed.length?'HSN/SAC saved for '+changed.length+' product(s) in '+companyTitle(company):'No HSN/SAC changes to save.');
    renderHSN();
   }catch(error){tell('Cannot save product HSN/SAC: '+error.message)}
   finally{button.disabled=false}
  };
  host.querySelector('#gr-invoice-profile-form').onsubmit=async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;
   const values=Object.fromEntries(new FormData(form).entries());
   for(const key of Object.keys(values))values[key]=blank(values[key]);
   const fail=message=>{button.disabled=false;tell(message)};
   if(values.gstin&&!/^[0-9]{2}[A-Z0-9]{13}$/i.test(values.gstin))return fail('GSTIN must contain 15 valid letters/numbers.');
   if(values.state_code&&!/^\d{2}$/.test(values.state_code))return fail('GST state code must have 2 digits.');
   if(values.gstin&&values.state_code&&values.gstin.slice(0,2)!==values.state_code)return fail('The GST state code must match the first two digits of this seller GSTIN.');
   if(values.pan&&!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(values.pan))return fail('Enter a valid company PAN.');
   if(values.default_freight_hsn&&!/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(values.default_freight_hsn))return fail('Freight SAC must be 4, 6 or 8 numeric digits.');
   try{
    const record={...values,company_id:select.value,updated_at:new Date().toISOString()};
    const {data,error}=await client.from('gr_invoice_profiles').upsert(record,{onConflict:'company_id'}).select('*').single();
    if(error)throw Error(error.message);
    profiles[select.value]=data;
    tell('Seller invoice details saved for '+companyTitle(select.value));
    renderSeller();
   }catch(error){tell('Unable to save seller details: '+error.message)}
   finally{button.disabled=false}
  };
  renderSeller();renderHSN();
 }
 const valueBlock=(title,name,customer,address,code)=>'<section class="gr-invoice-party"><span class="gr-invoice-cell-label">'+e(title)+'</span><strong>'+e(name||'Not specified')+'</strong><div>'+e(address||'Address not recorded').replace(/\n/g,'<br>')+'</div>'+
  (customer?.mobile?'<div>Phone: '+e(customer.mobile)+'</div>':'')+(customer?.email?'<div>Email: '+e(customer.email)+'</div>':'')+
  (customer?.gstin?'<div>GSTIN: '+e(customer.gstin)+'</div>':'')+
  (customer?.state?'<div>State: '+e(customer.state)+(code?', Code: '+e(code):'')+'</div>':'')+'</section>';
 function modelFor({companyId,sale,product,customer}){
  const seller=currentProfile(companyId),buyer=customer||{},cName=blank(buyer.name)||blank(sale.customer_name);
  const address=[buyer.address1,buyer.address2,buyer.city,buyer.state,buyer.pincode].filter(Boolean).join(', ');
  const ship={...buyer, name:blank(sale.ship_to_name)||cName,address1:blank(sale.ship_to_address)||buyer.address1, mobile:blank(sale.ship_to_phone)||buyer.mobile, state:blank(sale.ship_to_state)||buyer.state};
  const shipAddress=blank(sale.ship_to_address)||address;
  const sellerState=blank(seller.state_code),buyerState=blank(sale.ship_to_state_code)||blank(buyer.state_code)||stateCode(buyer.state);
  const taxMode=sellerState&&buyerState?(sellerState===buyerState?'intra':'inter'):'unknown';
  const productTax=amount(sale.tax_amount),shipCharge=amount(sale.shipping_charge),shippingTax=amount(sale.shipping_tax_amount);
  const productBase=amount(sale.taxable),tax=amount(productTax+shippingTax);
  const total=amount(productBase+productTax+shipCharge+shippingTax),charge=amount(sale.total);
  return {seller,buyer,ship,cName,address,shipAddress,sellerState,buyerState,taxMode,
   productBase,productTax,shipCharge,shippingTax,total:charge,tax,calculatedTotal:total,
   productName:blank(sale.product_name)||blank(product?.name)||'Product',
   hsn:blank(sale.hsn)||blank(product?.hsn)||'',productTaxRate:numeric(sale.tax_rate),
   shippingTaxRate:numeric(sale.shipping_gst_rate),qty:numeric(sale.qty),price:numeric(sale.unit_price),
   sale,companyId};
 }
 function missing(model){
  const s=model.seller,miss=[];
  if(!blank(s.legal_name))miss.push('seller legal name');
  if(!blank(s.address))miss.push('seller address');
  if(!blank(s.gstin))miss.push('seller GSTIN');
  if(!blank(s.state_code))miss.push('seller state code');
  if(!blank(model.cName))miss.push('buyer name');
  if(!blank(model.address))miss.push('buyer address');
  if(!model.buyerState)miss.push('buyer GST state');
  if(!blank(model.hsn))miss.push('product HSN / SAC');
  if(Math.abs(model.calculatedTotal-model.total)>0.02)miss.push('matching invoice and order totals');
  if(blank(model.sale.status)==='Cancelled'||blank(model.sale.status)==='Returned')miss.push('non-cancelled sales order');
  if(!model.sale.invoice_number)miss.push('invoice number');
  if(!model.sale.invoice_date)miss.push('invoice date');
  return miss;
 }
 function renderDocument(model,status){
  const {seller,buyer,ship,cName,address,shipAddress,taxMode,productBase,productTax,
   shipCharge,shippingTax,total,tax,productName,hsn,qty,price,sale}=model;
  const interstate=taxMode==='inter',intrastate=taxMode==='intra';
  const rates=numeric(sale.tax_rate),freightRate=numeric(sale.shipping_gst_rate);
  const label=interstate?'IGST':intrastate?'CGST + SGST':'GST (state not confirmed)';
  const freightHSN=blank(sale.freight_hsn)||blank(seller.default_freight_hsn);
  const entries=[
   ['1',productName,hsn,numFixed(qty)+' Nos',numFixed(price),'Nos','',money(productBase)],
   ...(shipCharge>0?[['', 'Freight Outward'+(freightRate?' @ '+freightRate+'%':''),freightHSN,'', '', '','',''+money(shipCharge)]]:[])
  ];
  const taxes=[['',label+' @ '+rates+'%', '', '', '', '', '',money(productTax)]];
  if(shippingTax>0)taxes.push(['',label+' on freight @ '+freightRate+'%',freightHSN,'','','','',money(shippingTax)]);
  const totalText=money(total);
  const paired=(a,b)=>'<div class="gr-invoice-ref"><span>'+e(a[0])+'</span><strong>'+e(a[1]||'—')+'</strong></div><div class="gr-invoice-ref"><span>'+e(b[0])+'</span><strong>'+e(b[1]||'—')+'</strong></div>';
  const invoiceTable=(labelName,value)=>'<tr><td>'+e(labelName)+'</td><td class="right">'+value+'</td></tr>';
  const detailEntries=[...entries,...taxes].map(c=>'<tr>'+c.map((v,i)=>'<td class="'+(i>=4?'right':'')+'">'+e(v)+'</td>').join('')+'</tr>').join('');
  const taxRateRow=(text,baseValue,rate,taxValue)=>'<tr><td>'+e(text)+'</td><td class="right">'+money(baseValue)+'</td><td class="right">'+e(rate)+'%</td><td class="right">'+money(taxValue)+'</td></tr>';
  let rows;
  if(intrastate){
   rows=taxRateRow(hsn,productBase,rates/2,productTax/2)+taxRateRow(hsn+' · SGST',productBase,rates/2,productTax/2);
   if(shipCharge>0&&shippingTax>0)rows+=taxRateRow(freightHSN,shipCharge,freightRate/2,shippingTax/2)+taxRateRow(freightHSN+' · SGST',shipCharge,freightRate/2,shippingTax/2);
  } else{
   rows=taxRateRow(hsn,productBase,rates,productTax);
   if(shipCharge>0&&shippingTax>0)rows+=taxRateRow(freightHSN,shipCharge,freightRate,shippingTax);
  }
  const isDraft=status!=='Issued';
  return '<article class="gr-invoice-paper" id="gr-invoice-paper">'+
   '<header class="gr-invoice-heading">INVOICE'+(isDraft?'<span class="gr-invoice-draft">DRAFT · NOT ISSUED</span>':'')+'</header>'+
   '<div class="gr-invoice-top"><div class="gr-invoice-left"><section class="gr-invoice-party gr-invoice-seller"><strong>'+e(seller.legal_name||companyTitle(model.companyId))+'</strong><div>'+e([seller.address,seller.city_state_pincode].filter(Boolean).join('\n')).replace(/\n/g,'<br>')+'</div><div>Phone: '+e(seller.phone||'—')+'</div><div>GSTIN/UIN: '+e(seller.gstin||'Not configured')+'</div><div>State: '+e(seller.state_name||'—')+(seller.state_code?', Code: '+e(seller.state_code):'')+'</div><div>Email: '+e(seller.email||'—')+'</div></section>'+
   valueBlock('Consignee (Ship to)',ship.name,ship,shipAddress,model.buyerState)+
   valueBlock('Buyer (Bill to)',cName,buyer,address,model.buyerState)+'</div>'+
   '<div class="gr-invoice-right">'+
   '<div class="gr-invoice-ref-grid">'+
   paired(['Invoice No.',sale.invoice_number],['Dated',sale.invoice_date])+
   paired(['Delivery Note',sale.delivery_note],['Mode/Terms of Payment',sale.payment_terms])+
   paired(['Reference No. & Date',sale.invoice_reference],['Other References',sale.other_references])+
   paired(["Buyer’s Order No.",sale.order_id||sale.internal_order_id],['Order Date',sale.date])+
   paired(['Dispatch Doc No.',sale.dispatch_doc],['Delivery Note Date',sale.delivery_note_date])+
   paired(['Dispatched through',sale.dispatched_through],['Destination',sale.destination||buyer.city])+
   '</div><div class="gr-invoice-terms"><strong>Terms of Delivery</strong><p>'+e(sale.terms_of_delivery||'—')+'</p></div></div></div>'+
   '<table class="gr-invoice-lines"><thead><tr><th>Sl.</th><th>Description of Goods / Services</th><th>HSN/SAC</th><th>Quantity</th><th>Rate</th><th>Per</th><th>Disc. %</th><th>Amount</th></tr></thead><tbody>'+detailEntries+
   '<tr class="gr-invoice-total"><td></td><td>Total</td><td></td><td>'+e(numFixed(qty))+' Nos</td><td></td><td></td><td></td><td>'+totalText+'</td></tr></tbody></table>'+
   '<div class="gr-invoice-words"><span>Amount Chargeable (in words)</span><strong>'+e(words(total))+'</strong></div>'+
   '<table class="gr-invoice-tax"><thead><tr><th>HSN/SAC</th><th>Taxable Value</th><th>Tax Rate</th><th>'+e(label)+' Amount</th></tr></thead><tbody>'+rows+
   '<tr class="gr-invoice-total"><td>Total</td><td class="right">'+money(productBase+shipCharge)+'</td><td></td><td class="right">'+money(tax)+'</td></tr></tbody></table>'+
   '<p class="gr-invoice-tax-words">Tax Amount (in words): <strong>'+e(words(tax))+'</strong></p>'+
   '<div class="gr-invoice-footer"><div><strong>Remarks</strong><p>'+e(sale.notes||'—')+'</p>'+
   '<strong>Our Bank Details</strong><p>'+e([seller.bank_name,seller.bank_account?'A/c: '+seller.bank_account:'',seller.bank_ifsc?'IFSC: '+seller.bank_ifsc:'',seller.bank_branch?'Branch: '+seller.bank_branch:''].filter(Boolean).join(', ')||'Not configured')+'</p>'+
   '<p>Company PAN: '+e(seller.pan||'—')+'</p><strong>Declaration</strong><p>'+e(seller.default_declaration||'—')+'</p></div>'+
   '<div class="gr-invoice-sign"><strong>for '+e(seller.legal_name||companyTitle(model.companyId))+'</strong><span>'+e(seller.signatory||'Authorised Signatory')+'</span></div></div>'+
   '<p class="gr-invoice-computer">This is a Computer Generated Invoice</p></article>';
 }
 const numFixed=n=>new Intl.NumberFormat('en-IN',{minimumFractionDigits:3,maximumFractionDigits:3}).format(numeric(n));
 async function loadLibrary(url,check){
  if(check())return;
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>reject(Error('Unable to load PDF library. Check internet connection.'));document.head.append(script)});
  if(!check())throw Error('PDF library was not loaded.');
 }
 async function savePdf(paper,filename){
  await Promise.all([
   loadLibrary('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',()=>!!window.html2canvas),
   loadLibrary('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF)
  ]);
  if(document.fonts?.ready)await document.fonts.ready;
  const canvas=await window.html2canvas(paper,{scale:2,backgroundColor:'#fff',useCORS:true,logging:false,scrollX:0,scrollY:-window.scrollY});
  const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const maxWidth=190,maxHeight=277,scale=maxWidth/canvas.width,chunkHeight=Math.floor(maxHeight/scale);
  for(let y=0,index=0;y<canvas.height;y+=chunkHeight,index++){
   if(index)pdf.addPage();
   const part=document.createElement('canvas');part.width=canvas.width;part.height=Math.min(chunkHeight,canvas.height-y);
   part.getContext('2d').drawImage(canvas,0,y,part.width,part.height,0,0,part.width,part.height);
   pdf.addImage(part.toDataURL('image/png'),'PNG',10,10,maxWidth,part.height*scale,undefined,'FAST');
  }
  pdf.save(filename.replace(/[^\w.-]/g,'_')+'.pdf');
 }
 async function open({root,companyId,sale,product,customer,onIssue,canIssue=false}){
  if(!companyIds.includes(companyId))throw Error('Unknown company');
  const dialog=root.querySelector('#gr-invoice-dialog');if(!dialog)throw Error('Invoice dialog is not available.');
  if(!profiles[companyId])await load(client);
  const seller=currentProfile(companyId),status=sale.invoice_status||'Draft';
  const current= status==='Issued'&&sale.invoice_snapshot ?sale.invoice_snapshot:modelFor({companyId,sale,product,customer});
  const missingFields=missing(current);
  const banner=missingFields.length?'<div class="gr-invoice-warning">Before issuing, complete: '+e(missingFields.join(', '))+'.</div>':'<div class="gr-invoice-ready">Company and tax information is ready for review.</div>';
  dialog.innerHTML='<div class="gr-invoice-tools"><div><h2>Invoice · '+e(sale.invoice_number||'Draft')+'</h2><p>'+e(companyTitle(companyId))+' · '+e(status==='Issued'?'Issued':'Automatic draft, not issued')+'</p></div><div class="gr-invoice-tool-actions"><button class="btn soft" type="button" id="gr-invoice-close">Close</button><button class="btn soft" type="button" id="gr-invoice-pdf">↓ Download PDF</button><button class="btn primary" type="button" id="gr-invoice-issue" '+(status==='Issued'||missingFields.length||!canIssue?'disabled':'')+'>'+(status==='Issued'?'Already issued':'Issue Invoice')+'</button></div></div>'+banner+'<div class="gr-invoice-paper-scroll">'+renderDocument(current,status)+'</div>'+
   '<p class="gr-invoice-note">Sales records are shared in GreenRich cloud. Invoice numbering still needs a centrally allocated series before simultaneous statutory issuance from multiple devices. This document does not generate a GST e-invoice IRN or e-way bill.</p>';
  dialog.querySelector('#gr-invoice-close').onclick=()=>dialog.close();
  dialog.querySelector('#gr-invoice-pdf').onclick=async event=>{
   const button=event.currentTarget;button.disabled=true;
   try{await savePdf(dialog.querySelector('#gr-invoice-paper'),sale.invoice_number||'GreenRich-Invoice')}
   catch(error){window.alert('Unable to export invoice PDF: '+error.message)}
   finally{button.disabled=false}
  };
  dialog.querySelector('#gr-invoice-issue').onclick=async event=>{
   if(missingFields.length||status==='Issued'||!canIssue)return;
   if(!window.confirm('Issue invoice '+sale.invoice_number+'? Issued invoices will be locked against sales edits. Confirm the invoice, GST treatment, shipping and bank details first.'))return;
   const button=event.currentTarget;button.disabled=true;
   try{await onIssue(current);dialog.close();window.alert('Invoice '+sale.invoice_number+' issued. Download the PDF from the Invoice action.')}
   catch(error){button.disabled=false;window.alert('Could not issue invoice: '+error.message)}
  };
  dialog.showModal();
 }
 window.GreenRichInvoices={load,currentProfile,settings,applyProductCodes,modelFor,missing,renderDocument,nextInvoiceId,words,open};
})();
