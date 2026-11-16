'use strict';
/* GreenRich ONE — read-only sales order material planning engine.
   It does not post stock, purchasing, work orders, accounting or reservations. */
(function(factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(typeof window!=='undefined')window.GreenRichMaterialPlanner=api;
})(function(){
 const SCALE=1000000n,TYPES=new Set(['FG','SFG','IM','RM']);
 function parseQty(v,allowZero=true){
  const s=String(v??'').trim();
  if(!/^\d+(?:\.\d{1,6})?$/.test(s))throw Error('Invalid precise quantity: '+s);
  const [whole,part='']=s.split('.');
  const n=BigInt(whole)*SCALE+BigInt(part.padEnd(6,'0'));
  if(!allowZero&&n===0n)throw Error('Quantity must be positive');
  return n;
 }
 function qtyString(n){
  if(n<0n)return '-'+qtyString(-n);
  const whole=n/SCALE,part=(n%SCALE).toString().padStart(6,'0').replace(/0+$/,'');
  return part?String(whole)+'.'+part:String(whole);
 }
 function mult(a,b){
  const x=a*b;if(x%SCALE!==0n)throw Error('BOM multiplication exceeds six decimal places');
  return x/SCALE;
 }
 function reconcileJobWork({issued,net_used,scrap,unused_at_vendor,returned}){
  const a=parseQty(issued),b=parseQty(net_used),c=parseQty(scrap),d=parseQty(unused_at_vendor),e=parseQty(returned);
  return {issued:qtyString(a),net_used:qtyString(b),scrap:qtyString(c),unused_at_vendor:qtyString(d),returned:qtyString(e),variance:qtyString(a-b-c-d-e),balanced:a===b+c+d+e};
 }
 function plan({order,items,bom,stock}){
  if(!order||order.status!=='RELEASED')throw Error('Only an approved/released Sales Order can be planned');
  if(!order.company_id||!order.item_code)throw Error('Company and FG code are required');
  if(![items,bom,stock].every(Array.isArray))throw Error('Item, BOM and stock arrays are required');
  const company=order.company_id,ordered=parseQty(order.quantity,false);
  const byCode=new Map(),links=new Map(),balance=new Map(),warnings=new Set(),results=new Map();
  for(const x of items){
   if(x.company_id!==company)continue;
   if(!TYPES.has(x.type)||!x.code)throw Error('Invalid material level or code');
   if(byCode.has(x.code))throw Error('Duplicate item code '+x.code);
   byCode.set(x.code,x);
  }
  const fg=byCode.get(order.item_code);
  if(!fg||fg.type!=='FG')throw Error('FG does not belong to this company');
  for(const x of bom){
   if(x.company_id!==company)continue;
   if(!links.has(x.parent_code))links.set(x.parent_code,[]);
   links.get(x.parent_code).push(x);
  }
  for(const x of stock){
   if(x.company_id!==company)continue;
   if(!byCode.has(x.item_code))throw Error('Unknown stock item '+x.item_code);
   if(!['WAREHOUSE','VENDOR','WIP','TRANSIT','SCRAP'].includes(x.location_type))throw Error('Invalid location category');
   const qty=parseQty(x.on_hand),reserved=parseQty(x.reserved||'0'),hold=parseQty(x.qc_hold||'0');
   if(reserved+hold>qty)throw Error('Reserved/QC-held stock exceeds on-hand '+x.item_code);
   if(x.location_type==='WAREHOUSE'&&x.quality_status==='ACCEPTED')
    balance.set(x.item_code,(balance.get(x.item_code)||0n)+qty-reserved-hold);
  }
  function expand(code,required,path=[]){
   if(path.length>20||path.includes(code)){warnings.add('BOM cycle/depth exceeded: '+[...path,code].join(' → '));return}
   const item=byCode.get(code);
   if(!item){warnings.add('Unknown material '+code);return}
   if(item.status!=='Validated')warnings.add('Material master not validated: '+code);
   const prev=results.get(code)||{code,type:item.type,name:item.name||code,uom:item.uom,required:0n,allocated:0n,missing:0n,unknown:false};
   prev.required+=required;
   if(!balance.has(code)){
    prev.unknown=true;warnings.add('Missing accepted warehouse stock snapshot: '+code);
    results.set(code,prev);return;
   }
   const current=balance.get(code),used=required<current?required:current,short=required-used;
   balance.set(code,current-used);prev.allocated+=used;prev.missing+=short;results.set(code,prev);
   if(!short)return;
   const children=links.get(code)||[];
   if(!children.length){if(item.type!=='RM')warnings.add('No BOM for short '+item.type+' '+code);return}
   if(new Set(children.map(x=>x.revision)).size!==1)warnings.add('Mixed BOM revisions for '+code);
   for(const link of children){
    if(link.status!=='Validated'){warnings.add('Unapproved BOM '+code+' → '+link.child_code);continue}
    const child=byCode.get(link.child_code);
    if(!child){warnings.add('Unrecognized BOM child '+link.child_code);continue}
    if(child.uom!==link.uom){warnings.add('UOM mismatch '+code+' → '+link.child_code);continue}
    try{expand(link.child_code,mult(short,parseQty(link.qty,false)),[...path,code])}
    catch(error){warnings.add(code+' → '+link.child_code+': '+error.message)}
   }
  }
  expand(fg.code,ordered);
  const lines=[...results.values()].map(x=>({code:x.code,type:x.type,name:x.name,uom:x.uom,required:qtyString(x.required),
   stock_allocated:qtyString(x.allocated),shortage:x.unknown?null:qtyString(x.missing),stock_verified:!x.unknown}))
   .sort((a,b)=>a.code.localeCompare(b.code));
  const fgLine=lines.find(x=>x.code===fg.code),errors=[...warnings].sort();
  const status=errors.length?'BLOCKED':fgLine.shortage==='0'?'FG_AVAILABLE':'MATERIAL_PLAN_READY';
  return {status,company_id:company,order_id:String(order.id||''),fg_code:fg.code,ordered_qty:qtyString(ordered),
   fg_to_build:fgLine.shortage,warnings:errors,lines,
   purchase_demands:status==='MATERIAL_PLAN_READY'?lines.filter(x=>x.type==='RM'&&x.shortage!=='0'):[],
   production_demands:status==='MATERIAL_PLAN_READY'?lines.filter(x=>['SFG','IM'].includes(x.type)&&x.shortage!=='0'):[],
   read_only:true};
 }
 return Object.freeze({plan,reconcileJobWork,parseQty,qtyString});
});
