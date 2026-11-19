importScripts('./zxing-reader.js');
ZXingWASM.prepareZXingModule({overrides:{locateFile:path=>new URL('./'+path,self.location.href).href}});
const OPTIONS={formats:['QRCode','Code128','Code39','Code93','EAN13','EAN8','ITF','DataMatrix','PDF417','UPCA','UPCE'],tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,maxNumberOfSymbols:6};
const makeImage=(data,width,height)=>typeof ImageData==='function'?new ImageData(data,width,height):{data,width,height};
function adaptive(image){
  const {width:w,height:h,data}=image,pitch=w+1,gray=new Uint8Array(w*h),sum=new Uint32Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x,j=i*4;gray[i]=(data[j]*77+data[j+1]*150+data[j+2]*29)>>8;row+=gray[i];sum[(y+1)*pitch+x+1]=sum[y*pitch+x+1]+row;}}
  const output=new Uint8ClampedArray(w*h*4),radius=10;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1),mean=(sum[b*pitch+r]-sum[t*pitch+r]-sum[b*pitch+l]+sum[t*pitch+l])/((r-l)*(b-t));const value=gray[y*w+x]<mean-8?0:255,j=(y*w+x)*4;output[j]=output[j+1]=output[j+2]=value;output[j+3]=255;}
  return makeImage(output,w,h);
}
self.onmessage=async event=>{
  const {id,pixels,width,height,photo}=event.data;
  try {
    const image=makeImage(new Uint8ClampedArray(pixels),width,height);
    let results=(await ZXingWASM.readBarcodes(image,OPTIONS)).filter(r=>r.isValid);
    const useful=hits=>hits.some(r=>r.format==='QRCode'||/^[A-Z][A-Z0-9]{9}$/.test(r.text.trim()));
    if(!useful(results)&&typeof OffscreenCanvas!=='undefined'&&typeof ImageData==='function'){
      const source=new OffscreenCanvas(width,height);source.getContext('2d').putImageData(image,0,0);
      const target=new OffscreenCanvas(1,1);
      // tile = [grid, col, row]: ขยายทีละส่วนของภาพ ช่วยให้โค้ดเล็ก/อยู่ไกล อ่านออก
      const tiles=g=>{const out=[];for(let j=0;j<g;j++)for(let i=0;i<g;i++)out.push({tile:[g,i,j],scale:2,angle:0});return out;};
      const passes=photo?[
        {crop:.8,scale:1,angle:0},{crop:.8,scale:1,angle:0,adaptive:true},{crop:.8,scale:2,angle:0},{crop:1,scale:.75,angle:0},
        ...tiles(2),...tiles(3),
        {crop:1,scale:1,angle:-15},{crop:1,scale:1,angle:15},
        ...[-7,7,-15,15,-30,30].map(angle=>({crop:.8,scale:2,angle}))
      ]:[tiles(2)[id%4],{crop:.8,scale:id%2===0?2:1,angle:0,adaptive:id%4===3},{crop:1,scale:1,angle:[7,-7,15,-15][id%4]}];
      for(const pass of passes){
        const degrees=pass.angle;let sw,sh,sx,sy;
        if(pass.tile){const [g,i,j]=pass.tile;sw=Math.min(width,Math.floor(width/g*1.35));sh=Math.min(height,Math.floor(height/g*1.35));sx=g>1?Math.floor(i*(width-sw)/(g-1)):0;sy=g>1?Math.floor(j*(height-sh)/(g-1)):0;}
        else{sw=Math.floor(width*pass.crop);sh=Math.floor(height*pass.crop);sx=Math.floor((width-sw)/2);sy=Math.floor((height-sh)/2);}
        const scale=Math.min(pass.scale,3000/Math.max(sw,sh)),w=Math.round(sw*scale),h=Math.round(sh*scale);
        const angle=degrees*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
        target.width=Math.ceil(w*c+h*s);target.height=Math.ceil(w*s+h*c);const ctx=target.getContext('2d');
        ctx.fillStyle='white';ctx.fillRect(0,0,target.width,target.height);ctx.translate(target.width/2,target.height/2);ctx.rotate(angle);ctx.drawImage(source,sx,sy,sw,sh,-w/2,-h/2,w,h);
        const pixels=ctx.getImageData(0,0,target.width,target.height);
        const found=(await ZXingWASM.readBarcodes(pass.adaptive?adaptive(pixels):pixels,pass.adaptive?{...OPTIONS,binarizer:'FixedThreshold'}:OPTIONS)).filter(r=>r.isValid);
        if(found.length)results=[...new Map([...results,...found].map(r=>[r.text,r])).values()];
        if(useful(found))break;
      }
    }
    self.postMessage({id,results:results.map(r=>({text:r.text,format:r.format}))});
  }catch(error){self.postMessage({id,error:'ตัวอ่านรหัสทำงานไม่สำเร็จ'});}
};
