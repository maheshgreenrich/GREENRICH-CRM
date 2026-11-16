'use strict';
/* Browser-local PDF viewer and basic PDF edit operations for GreenRich Quotations.
 * Uses pinned pdf-lib and html2canvas browser builds, not the PdfCraft Rust source.
 */
(()=>{
 let host=null,notify=()=>{},html='',filename='quotation.pdf',objectUrl='',blob=null;
 const tell=(message,type)=>notify(message,type);
 const loadScript=(url,check)=>check()?Promise.resolve():new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.async=true;s.onload=()=>check()?resolve():reject(Error('PDF library did not initialize'));s.onerror=()=>reject(Error('PDF library download failed'));document.head.appendChild(s)});
 const pdfLib=()=>loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',()=>!!window.PDFLib).then(()=>window.PDFLib);
 const screenshotLib=()=>loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',()=>!!window.html2canvas);
 function updatePdf(file,name){
  if(objectUrl)URL.revokeObjectURL(objectUrl);
  objectUrl=URL.createObjectURL(file);
  blob=file;filename=name;
  const frame=host?.querySelector('#grq-pdf-frame');if(frame)frame.src=objectUrl;
  const status=host?.querySelector('#grq-pdf-status');if(status)status.textContent=name;
 }
 async function fromHtml(){
  if(!html)throw Error('No quotation to export');
  await Promise.all([pdfLib(),screenshotLib()]);
  const iframe=document.createElement('iframe');
  iframe.title='Temporary quotation renderer';
  iframe.style.cssText='position:fixed;left:-20000px;top:0;width:794px;height:1200px;border:0;visibility:hidden';
  document.body.append(iframe);
  try{
   await new Promise(resolve=>{iframe.onload=resolve;iframe.srcdoc=html});
   const body=iframe.contentDocument.querySelector('.paper')||iframe.contentDocument.body;
   const canvas=await window.html2canvas(body,{backgroundColor:'#fff',scale:1.5,useCORS:true,logging:false});
   const pdf=await window.PDFLib.PDFDocument.create(),pageW=595.28,pageH=841.89,cropH=Math.floor(canvas.width*pageH/pageW);
   for(let y=0;y<canvas.height;y+=cropH){
    const h=Math.min(cropH,canvas.height-y),part=document.createElement('canvas');part.width=canvas.width;part.height=h;
    part.getContext('2d').drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
    const img=await pdf.embedPng(part.toDataURL('image/png'));
    const page=pdf.addPage([pageW,pageH]);const renderedH=pageW*h/canvas.width;
    page.drawImage(img,{x:0,y:pageH-renderedH,width:pageW,height:renderedH});
   }
   updatePdf(new Blob([await pdf.save()],{type:'application/pdf'}),filename.replace(/\.pdf$/i,'')+'.pdf');
   tell('Quotation PDF created and ready to download');
  }finally{iframe.remove()}
 }
 async function update(kind){
  if(!blob)throw Error('Open or generate a PDF first');
  const {PDFDocument,degrees,StandardFonts,rgb}=await pdfLib();
  const doc=await PDFDocument.load(await blob.arrayBuffer());
  if(kind==='rotate'){
   for(const page of doc.getPages())page.setRotation(degrees((page.getRotation().angle+90)%360));
  }else{
   const value=String(host.querySelector('#grq-pdf-stamp')?.value||'').trim();
   if(!value)throw Error('Enter text to stamp on the PDF');
   const font=await doc.embedFont(StandardFonts.HelveticaBold);
   const safe=value.replace(/[^\x20-\x7e]/g,'?').slice(0,80);
   for(const page of doc.getPages()){
    const size=page.getSize();
    page.drawText(safe,{x:35,y:size.height-38,size:11,font,color:rgb(.75,.13,.15)});
   }
  }
  updatePdf(new Blob([await doc.save()],{type:'application/pdf'}),filename.replace(/\.pdf$/i,'')+'-edited.pdf');
  tell('PDF changes applied. Download to keep a copy.');
 }
 function download(){
  if(!objectUrl)throw Error('No PDF is open');
  const a=document.createElement('a');a.href=objectUrl;a.download=filename;document.body.append(a);a.click();a.remove();
 }
 function mount(target,args){
  host=target;notify=args.notify||(()=>{});html=args.documentHtml||'';filename=(args.documentName||'quotation').replace(/[^a-z0-9_-]/gi,'_')+'.pdf';
  host.innerHTML='<h2>PDF viewer & basic editor</h2><p>Generate the quotation PDF, open an existing PDF, rotate pages or add a text stamp. PDF uploads stay in your browser.</p><div class="grq-actions"><button data-pdf="generate">Generate quotation PDF</button><label class="grq-upload">Open existing PDF<input id="grq-pdf-file" type="file" accept="application/pdf,.pdf"></label><button data-pdf="rotate">Rotate pages 90°</button><input id="grq-pdf-stamp" placeholder="Annotation / stamp text" maxlength="80" aria-label="PDF annotation text"><button data-pdf="stamp">Add stamp</button><button class="primary" data-pdf="download">Download PDF</button></div><div id="grq-pdf-status" aria-live="polite">No PDF open</div><iframe title="PDF preview" id="grq-pdf-frame"></iframe><small>Basic editing only: for full PdfCraft PDF editing, its upstream Rust/WebAssembly application must be built separately.</small>';
  if(objectUrl)host.querySelector('#grq-pdf-frame').src=objectUrl;
  host.onclick=e=>{const action=e.target.closest('[data-pdf]')?.dataset.pdf;if(!action)return;void(async()=>{if(action==='generate')await fromHtml();else if(action==='download')download();else await update(action)})().catch(err=>tell(err.message,'error'))};
  host.querySelector('#grq-pdf-file').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))return tell('Choose a PDF file','error');updatePdf(file,file.name)};
 }
 window.GreenRichPDFWorkbench={mount};
})();