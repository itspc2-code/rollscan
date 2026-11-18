(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const state={records:[],index:new Map(),connected:false,stream:null,worker:null,timer:null,starting:false,frame:0,busy:false,paused:false,last:'',seen:{text:'',at:0},sound:true,torch:false,zoom:1,apiUrl:'',accessKey:'',loadedAt:'',requestId:0,generation:0,dataGeneration:0,missingScan:null,displayedIsn:"",lastHadLabel:false,adding:false};
  const storage={get:(key,session=false)=>{try{return(session?sessionStorage:localStorage).getItem(key)||'';}catch{return'';}},set:(key,value,session=false)=>{try{(session?sessionStorage:localStorage).setItem(key,value);}catch{}},remove:(key,session=false)=>{try{(session?sessionStorage:localStorage).removeItem(key);}catch{}}};
  const DATA=window.RollScanData; const norm=DATA.norm;
  const candidates=raw=>DATA.parseScan(raw).codes;
  function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
  function apiUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/(?:macros|a\/macros\/[A-Za-z0-9.-]+)\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url.pathname))throw new Error('ใช้ URL เว็บแอป Apps Script ที่ลงท้าย /exec เท่านั้น');url.search='';url.hash='';return url.href;}
  const ERROR_MESSAGES={UNAUTHORIZED:'คีย์ไม่ถูกต้อง กรุณาตรวจ Access key',SHEET_NOT_FOUND:'ไม่พบชีต ตรวจ Script properties และเรียก setupRollScan ก่อน',INVALID_HEADERS:'หัวตารางต้องมี isn, meter, diameter และ kgs และไม่ซ้ำกัน',DUPLICATE_ISN:'ISN นี้มีอยู่แล้ว กรุณาโหลดข้อมูลล่าสุดและค้นหารายการเดิม',INVALID_RECORD:'ข้อมูลไม่ถูกต้อง กรุณาตรวจ ISN และตัวเลข',SERVER_ERROR:'Apps Script อ่านชีตไม่สำเร็จ กรุณาตรวจสิทธิ์และการตั้งค่า'};
  function request(action,extra={}){
    return new Promise((resolve,reject)=>{
      const callback='rollscan_'+crypto.randomUUID().replaceAll('-','');const script=document.createElement('script');
      const url=new URL(state.apiUrl);Object.entries({action,key:state.accessKey,callback,...extra,_t:Date.now()}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
      const cleanup=()=>{clearTimeout(timeout);script.remove();window[callback]=()=>{};setTimeout(()=>delete window[callback],60000);};
      const timeout=setTimeout(()=>{cleanup();reject(new Error('เชื่อมต่อหมดเวลา ตรวจ URL /exec และการ Deploy ให้ผู้ใช้ที่มีคีย์เรียกได้'));},25000);
      window[callback]=body=>{cleanup();if(!body||body.ok!==true)reject(new Error(ERROR_MESSAGES[body?.error]||'เซิร์ฟเวอร์ส่งข้อมูลไม่สำเร็จ'));else resolve(body);};
      script.onerror=()=>{cleanup();reject(new Error('ติดต่อ Apps Script ไม่สำเร็จ ตรวจการ Deploy และอินเทอร์เน็ต'));};
      script.referrerPolicy='no-referrer';script.src=url.href;document.head.append(script);
    });
  }
  function validateRecords(rows){
    if(!Array.isArray(rows)||rows.length>100000)throw new Error('รูปแบบข้อมูลจากชีตไม่ถูกต้อง');
    const index=new Map(),records=[],seen=new Set();
    for(const row of rows){const clean={};for(const field of ['isn','meter','diameter','kgs','newisn']){const value=row?.[field];if(value!==undefined&&typeof value!=='string'&&typeof value!=='number')throw new Error('รูปแบบข้อมูลจากชีตไม่ถูกต้อง');clean[field]=String(value??'').trim();}clean.isn=norm(clean.isn);clean.newisn=norm(clean.newisn);if(!clean.isn)continue;if(seen.has(clean.isn))throw new Error('พบ ISN ซ้ำในข้อมูลที่โหลด');seen.add(clean.isn);records.push(clean);for(const code of new Set([clean.isn,clean.newisn].filter(Boolean)))index.set(code,[...(index.get(code)||[]),clean]);}
    return {records,index};
  }
  async function connect(event){event?.preventDefault();$('settings-error').textContent='';const old={apiUrl:state.apiUrl,accessKey:state.accessKey};
    try{state.apiUrl=apiUrl($('api-url').value.trim());state.accessKey=$('access-key').value.trim();if(state.accessKey.length<32)throw new Error('Access key ต้องมีอย่างน้อย 32 ตัวอักษร');$('connect-button').disabled=true;$('connect-button').textContent='กำลังโหลดข้อมูล…';await refresh(true);storage.set('rollscan-api-url',state.apiUrl);storage.set('rollscan-key',state.accessKey,true);$('settings-dialog').close();message('เชื่อมต่อแล้ว พร้อมสแกน');}
    catch(error){state.apiUrl=old.apiUrl;state.accessKey=old.accessKey;$('settings-error').textContent=error.message;}
    finally{$('connect-button').disabled=false;$('connect-button').textContent='เชื่อมต่อและโหลดข้อมูล';}
  }
  async function refresh(fromSettings=false){
    if(!state.apiUrl||!state.accessKey){openSettings();return;}
    $('refresh-button').disabled=true;const generation=state.dataGeneration;
    try{const body=await request('index');if(generation!==state.dataGeneration)return;const data=validateRecords(body.records);state.records=data.records;state.index=data.index;state.connected=true;state.loadedAt=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});$('connection-dot').classList.add('connected');$('connection-label').textContent='เชื่อมต่อ Google Sheets';$('data-summary').textContent=`${state.records.length.toLocaleString()} รายการ · โหลดล่าสุด ${state.loadedAt}`;if(!fromSettings)message('โหลดข้อมูลล่าสุดแล้ว พร้อมสแกน');}
    catch(error){if(!fromSettings)message(error.message+' • ข้อมูลที่โหลดไว้ก่อนหน้ายังใช้ได้',true);throw error;}
    finally{$('refresh-button').disabled=!state.connected;}
  }
  function openSettings(){$('api-url').value=state.apiUrl||storage.get('rollscan-api-url')||window.ROLLSCAN_CONFIG?.apiUrl||'';$('access-key').value=state.accessKey||storage.get('rollscan-key',true);$('settings-error').textContent='';$('settings-dialog').showModal();}
  function disconnect(){stopCamera();state.dataGeneration++;state.generation++;state.requestId++;state.records=[];state.index.clear();state.connected=false;state.apiUrl='';state.accessKey='';storage.remove('rollscan-key',true);storage.remove('rollscan-api-url');$('access-key').value='';$('connection-dot').classList.remove('connected');$('connection-label').textContent='ยังไม่ได้เชื่อมต่อ';$('data-summary').textContent='เชื่อมต่อเพื่อโหลดข้อมูลก่อนเริ่มสแกน';$('refresh-button').disabled=true;$('history-body').replaceChildren();$('history-count').textContent='0';$('history-empty').hidden=false;clearResult();$('settings-dialog').close();message('ตัดการเชื่อมต่อแล้ว');}
  function feedback(found){try{navigator.vibrate?.(found?70:[60,70,60]);if(!state.sound)return;state.audio||=(new(window.AudioContext||window.webkitAudioContext)());const audio=state.audio;audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=found?1046:330;gain.gain.setValueAtTime(0.05,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.17);oscillator.start();oscillator.stop(audio.currentTime+0.18);}catch{}}
  function clearResult(){state.paused=false;state.last='';state.displayedIsn='';state.lastHadLabel=false;$('qr-comparison').hidden=true;$('empty-result').hidden=false;$('found-result').hidden=true;$('missing-result').hidden=true;$('match-status').textContent='รอการสแกน';$('match-status').className='tag';$('code-input').value='';$('scan-hint').textContent='กำลังค้นหารหัส…';}
  function showResult(record,raw,label=null){
    state.missingScan=label||{isn:raw};state.displayedIsn=record?.isn||'';state.lastHadLabel=!!label;renderComparison(record,label);
    $('empty-result').hidden=true;$('found-result').hidden=!record;$('missing-result').hidden=!!record;
    $('match-status').textContent=record?'พบข้อมูล':'ไม่พบข้อมูล';$('match-status').className='tag '+(record?'found':'missing');
    if(record){for(const field of ['isn','meter','diameter','kgs'])$('result-'+field).textContent=record[field]===''?'—':record[field];$('result-source').textContent=`ข้อมูลที่โหลดจากชีตเวลา ${state.loadedAt} · กดโหลดข้อมูลล่าสุดเมื่อแก้ไขชีต`;}
    else $('missing-code').textContent=raw;
    addHistory(record,raw);feedback(!!record);if(!$('continuous').checked){state.paused=true;$('scan-hint').textContent='พักอ่านรหัส — กดสแกนถัดไป';}if(innerWidth<=760)$('result-panel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function addHistory(record,raw){const row=document.createElement('tr');for(const text of [new Date().toLocaleTimeString('th-TH'),record?.isn||raw,record?.meter??'—',record?.diameter??'—',record?.kgs??'—',record?'พบข้อมูล':'ไม่พบข้อมูล']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}$('history-body').prepend(row);while($('history-body').children.length>50)$('history-body').lastChild.remove();$('history-count').textContent=String($('history-body').children.length);$('history-empty').hidden=true;}
  function choose(entries,onChoose){state.paused=true;const list=$('choices-list');list.replaceChildren();for(const entry of entries){const button=document.createElement('button');button.textContent=entry.label;button.onclick=()=>{$('choices-dialog').close();state.paused=false;onChoose(entry);};list.append(button);}$('choices-dialog').showModal();}
  function renderComparison(record,label){
    const container=$('qr-comparison');container.replaceChildren();container.hidden=!record||!label;if(container.hidden)return;
    const checks=DATA.compareLabel(record,label),allMatch=checks.every(c=>c.match);container.className=allMatch?'qr-comparison same':'qr-comparison different';
    const heading=document.createElement('strong');heading.textContent=allMatch?'ค่าจาก QR ตรงกับ Google Sheets':'ค่าจาก QR ไม่ตรงกับ Google Sheets';container.append(heading);
    const table=document.createElement('table');const header=document.createElement('tr');for(const text of ['ช่อง','ในชีต','บน QR','ผล']){const cell=document.createElement('th');cell.textContent=text;header.append(cell);}table.append(header);
    for(const check of checks){const row=document.createElement('tr');for(const text of [check.field,check.sheet||'—',check.printed||'—',check.match?'ตรง':'ต่าง']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}table.append(row);}container.append(table);
  }
  function lookup(raw){
    if(!raw.trim())return;if(!state.connected){openSettings();message('เชื่อมต่อข้อมูลก่อนค้นหา',true);return;}
    const scan=DATA.parseScan(raw);const hits=[...new Map(scan.codes.flatMap(k=>state.index.get(k)||[]).map(r=>[r.isn,r])).values()];message('');
    if(hits.length>1)choose(hits.map(record=>({label:record.isn,record})),entry=>showResult(entry.record,scan.isn,scan.label));else showResult(hits[0]||null,scan.isn,scan.label);
  }
  function accept(hits,photo=false){
    if(!hits.length||state.paused||$('settings-dialog').open||$('add-dialog').open)return;
    const unique=DATA.groupHits(hits),signature=unique.map(h=>h.scan.isn).sort().join('|');
    if(!photo&&signature===state.last){const richer=unique.find(h=>h.scan.label&&h.scan.isn===state.displayedIsn);if(richer&&!state.lastHadLabel){const record=state.records.find(r=>r.isn===state.displayedIsn);renderComparison(record,richer.scan.label);state.lastHadLabel=true;}return;}
    const repeat=!photo&&unique.some(h=>!['QRCode','DataMatrix','PDF417'].includes(h.format));const now=Date.now();
    if(repeat&&(state.seen.text!==signature||now-state.seen.at>2500)){state.seen={text:signature,at:now};return;}
    state.last=signature;
    if(unique.length>1)choose(unique.map(h=>({label:h.scan.isn,code:h.text})),entry=>lookup(entry.code));else lookup(unique[0].text);
  }
  function openAdd(){
    const initial=state.missingScan||{isn:$('missing-code').textContent};const container=$('add-fields');container.replaceChildren();$('add-error').textContent='';
    const groups=[['ข้อมูลหลัก',['isn','meter','diameter','kgs']],['ผู้จำหน่ายและการสั่งซื้อ',['supplier_code','supplier_name','po_no','dp_no','po_grade','po_width','po_quality','supplier_grade']],['ราคาและเอกสาร',['price_per_kgs','disc','current_price','total_amount','docno','newisn','status']],['ค่าที่วัดจริง',['meter_actual','diameter_actual','kgs_actual']]];
    for(const[title,fields]of groups){const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;fieldset.append(legend);const grid=document.createElement('div');grid.className='add-field-grid';for(const field of fields){const label=document.createElement('label');label.textContent=field+(['isn','meter','diameter','kgs'].includes(field)?' *':'');const input=document.createElement('input');input.name=field;input.type=DATA.NUMERIC.has(field)?'number':'text';input.value=initial[field]||'';input.required=['isn','meter','diameter','kgs'].includes(field);input.maxLength=1000;if(DATA.NUMERIC.has(field)){input.min='0';input.step='any';}label.append(input);grid.append(label);}fieldset.append(grid);container.append(fieldset);}$('add-dialog').showModal();
  }
  async function saveAdd(event){
    event.preventDefault();$('add-error').textContent='';
    try{
      const data=DATA.cleanRecord(Object.fromEntries(new FormData($('add-form'))));state.adding=true;$('add-submit').disabled=true;$('add-cancel').disabled=true;$('add-close').disabled=true;$('add-submit').textContent='กำลังบันทึก…';
      const id=crypto.randomUUID();
      await fetch(state.apiUrl,{method:'POST',mode:'no-cors',credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'add',key:state.accessKey,id,data})});
      let saved=null;for(let attempt=0;attempt<16;attempt++){const result=await request('operation',{id});if(result.done){saved=result.record;break;}await new Promise(resolve=>setTimeout(resolve,750));}
      if(!saved)throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลล่าสุดและค้นหา ISN นี้ก่อนลองอีกครั้ง');
      const updated=validateRecords([...state.records.filter(r=>r.isn!==saved.isn),saved]);state.records=updated.records;state.index=updated.index;$('data-summary').textContent=state.records.length.toLocaleString()+' รายการ · มีรายการเพิ่มล่าสุด';$('add-dialog').close();showResult(saved,saved.isn,state.missingScan?.meter?state.missingScan:null);message('เพิ่มรายการลง Google Sheets แล้ว');
    }catch(error){$('add-error').textContent=error.message||'บันทึกไม่สำเร็จ กรุณาค้นหารหัสก่อนลองใหม่';}
    finally{state.adding=false;$('add-submit').disabled=false;$('add-cancel').disabled=false;$('add-close').disabled=false;$('add-submit').textContent='บันทึกลง Google Sheets';}
  }
  function stopCamera(){state.generation++;if(state.timer)clearTimeout(state.timer);state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;state.worker?.terminate();state.worker=null;state.busy=false;$('video').srcObject=null;$('viewfinder').classList.remove('active');$('camera-placeholder').hidden=false;$('stop-camera').hidden=true;$('camera-controls').hidden=true;$('scan-hint').hidden=true;$('camera-status').textContent='ปิดอยู่';state.torch=false;}
  async function startCamera(deviceId=''){
    if(state.starting)return;if(!state.connected){openSettings();return;}stopCamera();state.starting=true;$('start-camera').disabled=true;$('start-camera').textContent='กำลังเปิดกล้อง…';const generation=state.generation;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('เปิดผ่าน HTTPS และใช้ Edge ที่รองรับกล้อง');
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}}),width:{ideal:1920},height:{ideal:1080}}});
      if(generation!==state.generation){stream.getTracks().forEach(t=>t.stop());return;}state.stream=stream;$('video').srcObject=stream;await $('video').play();
      const track=stream.getVideoTracks()[0],caps=track.getCapabilities();
      if(caps.focusMode?.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
      $('torch-button').hidden=!caps.torch;$('torch-button').textContent='ไฟฉาย';$('zoom-control').hidden=!caps.zoom;
      if(caps.zoom){$('zoom-slider').min=caps.zoom.min;$('zoom-slider').max=Math.min(caps.zoom.max,5);$('zoom-slider').step=caps.zoom.step||0.1;$('zoom-slider').value=track.getSettings().zoom||caps.zoom.min;$('zoom-label').textContent=Number($('zoom-slider').value).toFixed(1)+'×';}
      const cameras=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');$('camera-select').replaceChildren();for(const camera of cameras){const option=document.createElement('option');option.value=camera.deviceId;option.textContent=camera.label||'กล้อง';$('camera-select').append(option);}$('camera-select').value=track.getSettings().deviceId||deviceId;$('camera-select').hidden=cameras.length<2;
      $('camera-controls').hidden=!caps.torch&&!caps.zoom&&cameras.length<2;$('viewfinder').classList.add('active');$('camera-placeholder').hidden=true;$('stop-camera').hidden=false;$('scan-hint').hidden=false;$('camera-status').textContent='พร้อมอ่าน';state.paused=false;state.last='';
      const worker=new Worker('./scanner-worker.js?v=1.1.0');state.worker=worker;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      const tick=()=>{if(!state.stream||generation!==state.generation)return;if(state.paused||$('settings-dialog').open||$('add-dialog').open||$('video').readyState<2){state.timer=setTimeout(tick,150);return;}state.frame++;const video=$('video'),ratio=Math.min(1,(state.frame%4===0?1920:1280)/video.videoWidth);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);ctx.drawImage(video,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height);worker.postMessage({id:state.frame,pixels:image.data.buffer,width:image.width,height:image.height},[image.data.buffer]);};
      worker.onmessage=event=>{if(!state.stream||generation!==state.generation)return;if(event.data.error){message(event.data.error,true);stopCamera();return;}accept(event.data.results||[]);state.timer=setTimeout(tick,90);};worker.onerror=()=>{message('โหลดตัวอ่านไม่สำเร็จ ลองโหลดหน้าเว็บใหม่แล้วเปิดกล้องอีกครั้ง',true);stopCamera();};tick();message('');
    }catch(error){stopCamera();message(error.name==='NotAllowedError'?'ยังไม่ได้รับอนุญาตกล้อง กรุณาอนุญาตกล้องให้เว็บไซต์นี้ใน Edge':error.message,true);}
    finally{state.starting=false;$('start-camera').disabled=false;$('start-camera').textContent='เปิดกล้องสแกน';}
  }
  async function readPhoto(file){
    if(!state.connected){openSettings();return;}if(file.size>20*1024*1024){message('เลือกรูปขนาดไม่เกิน 20 MB',true);return;}
    const wasPaused=state.paused;let completed=false;state.paused=true;message('กำลังอ่านรหัสจากรูป…');const worker=new Worker('./scanner-worker.js?v=1.1.0');let timeout;
    try{const bitmap=await createImageBitmap(file);const ratio=Math.min(1,3000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const image=ctx.getImageData(0,0,canvas.width,canvas.height);
      const hits=await new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('อ่านรูปหมดเวลา กรุณาลองรูปที่ชัดขึ้น')),20000);worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.results||[]);worker.onerror=()=>reject(new Error('โหลดตัวอ่านรูปไม่สำเร็จ'));worker.postMessage({id:0,photo:true,pixels:image.data.buffer,width:image.width,height:image.height},[image.data.buffer]);});
      state.paused=false;if(hits.length){completed=true;message('');accept(hits,true);}else message('ยังอ่านรหัสจากรูปนี้ไม่ได้ ลองถ่ายให้รหัสครบและชัดขึ้น',true);
    }catch(error){message(error.message||'เปิดรูปไม่สำเร็จ',true);}finally{clearTimeout(timeout);worker.terminate();if(!$('choices-dialog').open&&!completed)state.paused=wasPaused;}
  }
  $('add-record-button').onclick=openAdd;$('add-form').onsubmit=saveAdd;for(const id of ['add-close','add-cancel'])$(id).onclick=()=>{if(!state.adding)$('add-dialog').close();};$('add-dialog').oncancel=event=>{if(state.adding)event.preventDefault();};
  $('settings-button').onclick=openSettings;$('settings-form').onsubmit=connect;document.querySelector('.dialog-close').onclick=()=>$('settings-dialog').close();$('disconnect-button').onclick=disconnect;
  $('refresh-button').onclick=()=>refresh().catch(()=>{});$('search-form').onsubmit=event=>{event.preventDefault();lookup($('code-input').value);};
  $('start-camera').onclick=()=>startCamera();$('stop-camera').onclick=stopCamera;$('camera-select').onchange=()=>startCamera($('camera-select').value);
  $('torch-button').onclick=async()=>{try{await state.stream.getVideoTracks()[0].applyConstraints({advanced:[{torch:!state.torch}]});state.torch=!state.torch;$('torch-button').textContent=state.torch?'ปิดไฟฉาย':'ไฟฉาย';}catch{message('กล้องนี้เปิดไฟฉายไม่ได้',true);}};
  $('zoom-slider').oninput=async()=>{try{const zoom=Number($('zoom-slider').value);await state.stream.getVideoTracks()[0].applyConstraints({advanced:[{zoom}]});$('zoom-label').textContent=zoom.toFixed(1)+'×';}catch{message('กล้องนี้ปรับซูมไม่ได้',true);}};
  $('sound-button').onclick=()=>{state.sound=!state.sound;$('sound-button').textContent='เสียง: '+(state.sound?'เปิด':'ปิด');};$('continuous').onchange=()=>{if($('continuous').checked){state.paused=false;state.last='';}};
  $('photo-input').onchange=event=>{if(event.target.files[0])readPhoto(event.target.files[0]);event.target.value='';};
  $('next-scan').onclick=clearResult;$('missing-next').onclick=clearResult;$('choices-close').onclick=()=>{$('choices-dialog').close();state.paused=false;state.last='';};$('choices-dialog').oncancel=()=>{state.paused=false;state.last='';};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});window.addEventListener('pagehide',stopCamera);
  state.apiUrl=storage.get('rollscan-api-url')||window.ROLLSCAN_CONFIG?.apiUrl||'';state.accessKey=storage.get('rollscan-key',true);
  if(state.apiUrl&&state.accessKey){try{state.apiUrl=apiUrl(state.apiUrl);refresh().catch(()=>{});}catch{openSettings();}}
  else message('ตั้งค่าการเชื่อมต่อครั้งแรก เพื่อโหลดข้อมูลจาก Google Sheets');
})();
