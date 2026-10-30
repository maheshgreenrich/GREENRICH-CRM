'use strict';
/* FG-001 material/vendor mapping from uploaded Sheet1 rows 4-94.
   DRAFT ONLY: parent links and all quantities must be verified. */
(()=>{
 const DATA='FG-001|COMPOSTER - MGB100, FRP, CAP. 2000 LTR|01 nos|FRP moulding & assembly|VBK / Akshaya|4;SFG-001|Composter-top door hinge, SS, SIZE:475mm+100mm|01 nos|Welding|Greenrich (internal)|4;IM-001|Top door hinge plate,SS, SIZE: 475mm|01 nos|laser cutting & folding|Sivaji Enterprises|4;RM-001|Plain sheet, SS, SIZE: 2500 X 1250 X 2 mm|50 kg|Direct purchase|Manisha Steel|4;RM-002|Hinge - Lorry, SS, heavy duty, 100mm x 50mm||Direct purchase|Balaji Fastners|9;SFG-002|Composter-front door hinge, SS, SIZE:600mm+100mm|01 nos|Welding|Greenrich (internal)|15;IM-002|Front door hinge plate,SS, SIZE: 600mm|01 nos|laser cutting & folding|Sivaji Enterprises|15;RM-003|Plain sheet, SS, SIZE: 2500 X 1250 X 2 mm||Direct purchase|Manisha Steel|15;RM-004|Hinge - Lorry, SS, heavy duty, 100mm x 50mm||Direct purchase|Balaji Fastners|20;SFG-003|Composter - stayrod, SS, SIZE: 6mm x 600mm|01 nos|bending|Royal spring|25;RM-005|Bar - round, SS , 6 mm|0.14 kg|Direct purchase|Manisha Steel|25;SFG-004|Composter - L angle for Stayrod , SS,SIZE:2mm|02 nos|laser cutting & folding|Sivaji Enterprises|30;RM-006|Plain sheet, SS, SIZE: 2500 X 1250 X 2 mm|0.04 kg|Direct purchase|Manisha Steel|30;SFG-005|Composter - Side bin handles, SS, SIZE: 250mm|02 nos|welding|Greenrich (internal)|35;IM-003|side bin handle plate,SS|02 nos|laser cutting & folding|Sivaji Enterprises|35;RM-007|Plain sheet, SS, SIZE: 2500 X 1250 X 2 mm|0.08 kg|Direct purchase|Manisha Steel|35;RM-008|Pipe, SS, SIZE:thickness. 1.5mm x 19 mm|0.04 kg|Direct purchase|Manisha Steel|40;RM-009|Fastners - Bolt,SS, SIZE: M10 X25mm||Direct purchase|Apex Bolta|45;RM-010|Fastners - Bolt,SS, SIZE: M10 X50mm|02 nos|welding|Apex Bolta|50;RM-011|Fastners - Nut,SS, SIZE: M10|02 nos|welding|Apex Bolta|55;SFG-006|Composter - top door hinge (400 litr), SS, SIZE:100 mm|02 nos|welding|Sivaji Enterprises|60;RM-012|Hinge - Lorry, SS, heavy duty, 100mm x 50mm|02 nos|welding|Balaji Fastners|60;SFG-007|Composter - nipple, SS, SIZE: 20 mm(dia)x 30 mm|02 nos|welding|Greenrich (internal)|65;IM-004|threaded pipe for nipple, SS, SIZE: 20mm(dia)x 30mm|02 nos|welding|SM Engineering|65;RM-013|Pipe, SS, SIZE:thickness. 1.5mm x 19 mm|02 nos|welding|Manisha Steel|65;IM-005|flat plate for support of nipple, SS, SIZE: 2mm|02 nos|laser cutting & folding|Sivaji Enterprises|70;RM-014|Plain sheet, SS, SIZE: 2500 X 1250 X 2 mm|0.01 kg|Direct purchase|Manisha Steel|70;RM-015|Composter - Top door handles, Al, SIZE: 150mm|01 nos|Direct purchase|Bakkim Steel|75;RM-016|Composter - powder coat handle ( drain plate)|03 nos|Direct purchase|Bakkim Steel|80;RM-017|Pop rivet, Al, 25mm x 5mm|15 nos|Direct purchase|Balaji Fastners|85;RM-018|Beading, Natural rubber, 25 x 6mm thk|02 mtr|Direct purchase|Bakkim Steel|91';
 const LINKS='FG-001>SFG-001,FG-001>SFG-002,FG-001>SFG-003,FG-001>SFG-004,FG-001>SFG-005,FG-001>SFG-006,FG-001>SFG-007,SFG-001>IM-001,SFG-001>RM-002,IM-001>RM-001,SFG-002>IM-002,SFG-002>RM-004,IM-002>RM-003,SFG-003>RM-005,SFG-004>RM-006,SFG-005>IM-003,SFG-005>RM-009,SFG-005>RM-010,SFG-005>RM-011,IM-003>RM-007,IM-003>RM-008,SFG-006>RM-012,SFG-007>IM-004,SFG-007>IM-005,IM-004>RM-013,IM-005>RM-014,FG-001>RM-015,FG-001>RM-016,FG-001>RM-017,FG-001>RM-018';
 const materials=DATA.split(';').map(line=>{
  const [id,name,amount,operation,source,row]=line.split('|');
  const match=amount.match(/^([\d.]+)\s*(nos|kg|mtr)$/i);
  return {id,code:id,name,type:id.split('-')[0],qty:match?Number(match[1]):null,uom:match?match[2]:'',source_qty:amount||'Not specified',
    operation,preferred_vendor:source.startsWith('Greenrich')?'':source,
    source_type:source.startsWith('Greenrich')?'Make':/direct purchase/i.test(operation)?'Buy':'Job work / verify',
    source_row:Number(row),status:'Draft',needs_review:true,source:'FG-001 workbook Sheet1',notes:''};
 });
 const vendors=[...new Set(materials.map(m=>m.preferred_vendor).filter(Boolean))].map(name=>{
  const id='vendor-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  return {id,name,status:'Draft',source:'FG-001 workbook',notes:'Supplier details and approval to be confirmed.'};
 });
 const lookup=new Map(materials.map(m=>[m.id,m]));
 const bom=LINKS.split(',').map(pair=>{
  const [parent_code,child_code]=pair.split('>'),child=lookup.get(child_code);
  return {id:'FG001-'+parent_code+'-'+child_code,parent_code,child_code,qty:child.qty,uom:child.uom,
    revision:'Draft 0',status:'Draft',source_row:child.source_row,needs_review:true,
    notes:'Proposed link from workbook visual alignment; verify hierarchy and quantity before release.'};
 });
 const records=[...materials.map(payload=>({kind:'material',record_id:payload.id,payload})),
  ...vendors.map(payload=>({kind:'vendor',record_id:payload.id,payload})),
  ...bom.map(payload=>({kind:'bom',record_id:payload.id,payload}))];
 window.GreenRichOperationsSeed={materials,vendors,bom,records};
})();
