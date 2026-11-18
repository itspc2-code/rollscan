importScripts('./zxing-reader.js');
ZXingWASM.prepareZXingModule({overrides:{locateFile:path=>new URL('./'+path,self.location.href).href}});
const OPTIONS={formats:['QRCode','Code128','Code39','Code93','EAN13','EAN8','ITF','DataMatrix','PDF417','UPCA','UPCE'],tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,maxNumberOfSymbols:6};
self.onmessage=async event=>{
  const {id,pixels,width,height,photo}=event.data;
  try {
    const image=new ImageData(new Uint8ClampedArray(pixels),width,height);
    let results=(await ZXingWASM.readBarcodes(image,OPTIONS)).filter(r=>r.isValid);
    if(!results.length&&typeof OffscreenCanvas!=='undefined'){
      const source=new OffscreenCanvas(width,height);source.getContext('2d').putImageData(image,0,0);
      const angles=photo?[-15,15,-30,30]:[[15,-15,30,-30][id%4]];
      for(const degrees of angles){
        const angle=degrees*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
        const canvas=new OffscreenCanvas(Math.ceil(width*c+height*s),Math.ceil(width*s+height*c));const ctx=canvas.getContext('2d');
        ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle);ctx.drawImage(source,-width/2,-height/2);
        results=(await ZXingWASM.readBarcodes(ctx.getImageData(0,0,canvas.width,canvas.height),OPTIONS)).filter(r=>r.isValid);
        if(results.length)break;
      }
    }
    self.postMessage({id,results:results.map(r=>({text:r.text,format:r.format}))});
  }catch(error){self.postMessage({id,error:'ตัวอ่านรหัสทำงานไม่สำเร็จ'});}
};
