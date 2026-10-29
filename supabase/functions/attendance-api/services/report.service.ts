// CSV, Excel 2003 XML (.xls), and paginated PDF report generators.
const headings=['Date','Employee','Status','Check In (UTC)','Check Out (UTC)','Hours','Remarks'];
const xmlChars:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
const xml=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>xmlChars[c]||c);
const safeCsv=(v:unknown)=>{
 let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
};
const toText=(rows:unknown[][])=>[headings,...rows].map(r=>r.map(safeCsv).join(',')).join('\r\n');
const excel=(rows:unknown[][])=>{
 const all=[headings,...rows];
 return '<?xml version="1.0" encoding="UTF-8"?>'+
 '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+
 '<Worksheet ss:Name="Attendance"><Table>'+all.map(row=>'<Row>'+row.map(cell=>'<Cell><Data ss:Type="String">'+xml(cell)+'</Data></Cell>').join('')+'</Row>').join('')+'</Table></Worksheet></Workbook>';
};
export async function buildReport(month:string,format:string,rows:unknown[][]):Promise<Response>{
 let bytes:Uint8Array|string;let media:string;let extension:string;
 if(format==='csv'){bytes='\ufeff'+toText(rows);media='text/csv; charset=utf-8';extension='csv'}
 else if(format==='xls'){bytes=excel(rows);media='application/vnd.ms-excel; charset=utf-8';extension='xls'}
 else if(format==='pdf'){
  const {PDFDocument,StandardFonts,rgb}=await import('npm:pdf-lib@1.17.1');
  if(rows.length>5000)throw Object.assign(new Error('PDF export limited to 5000 rows; use CSV or Excel'),{status:413});
  const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
  const headers=['Date','Employee','Status','In UTC','Out UTC','Hours','Remarks'];
  const widths=[73,116,76,105,105,44,104],size=8;
  const normalized=(v:unknown,max:number)=>String(v??'').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?').slice(0,max);
  let page:any,cur=0;
  const newPage=()=>{
   page=pdf.addPage([842,595]);cur=550;
   page.drawText('GreenRich ONE Attendance Report — '+month.replace(/[^0-9-]/g,''),{x:26,y:567,size:14,font,color:rgb(0.10,0.24,0.56)});
   let x=26;headers.forEach((h,i)=>{page.drawText(h,{x,y:cur,size,font});x+=widths[i]});cur-=18;
  };
  newPage();
  for(const row of rows){
   if(cur<42)newPage();let x=26;
   row.forEach((v,i)=>{page.drawText(normalized(v,[10,19,12,17,17,8,17][i]),{x,y:cur,size:7,font});x+=widths[i]});
   cur-=14;
  }
  bytes=await pdf.save();media='application/pdf';extension='pdf';
 }else throw Object.assign(new Error('format must be csv, xls or pdf'),{status:400});
 return new Response(bytes as BodyInit,{status:200,headers:{
  'Content-Type':media,'Content-Disposition':'attachment; filename="greenrich-attendance-'+month+'.'+extension+'"',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
 }});
}
