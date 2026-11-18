(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const state={records:[],index:new Map(),connected:false,stream:null,worker:null,timer:null,starting:false,frame:0,busy:false,paused:false,last:'',seen:{text:'',at:0},sound:true,torch:false,zoom:1,apiUrl:'',accessKey:'',loadedAt:'',requestId:0,generation:0,dataGeneration:0,missingScan:null,displayedIsn:"",lastHadLabel:false,adding:false,checking:false,lastRefresh:0,name:'',lastRaw:'',logQueue:[],logInflight:null,logBusy:false,nextLogResult:''};
  const storage={get:(key,session=false)=>{try{return(session?sessionStorage:localStorage).getItem(key)||'';}catch{return'';}},set:(key,value,session=false)=>{try{(session?sessionStorage:localStorage).setItem(key,value);}catch{}},remove:(key,session=false)=>{try{(session?sessionStorage:localStorage).removeItem(key);}catch{}}};
  const DATA=window.RollScanData; const norm=DATA.norm;
  const candidates=raw=>DATA.parseScan(raw).codes;
  function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
  function apiUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/(?:macros|a\/macros\/[A-Za-z0-9.-]+)\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url.pathname))throw new Error('ใช้ URL เว็บแอป Apps Script ที่ลงท้าย /exec เท่านั้น');url.search='';url.hash='';return url.href;}
  const ERROR_MESSAGES={UNAUTHORIZED:'คีย์ไม่ถูกต้อง กรุณาตรวจ Access key',SHEET_NOT_FOUND:'ไม่พบชีต ตรวจ Script properties และเรียก setupRollScan ก่อน',INVALID_HEADERS:'หัวตารางต้องมี isn, meter, diameter และ kgs และไม่ซ้ำกัน',DUPLICATE_ISN:'ISN นี้มีอยู่แล้ว กรุณาโหลดข้อมูลล่าสุดและค้นหารายการเดิม',INVALID_RECORD:'ข้อมูลไม่ถูกต้อง กรุณาตรวจ ISN และตัวเลข',SERVER_ERROR:'Apps Script อ่านชีตไม่สำเร็จ กรุณาตรวจสิทธิ์และการตั้งค่า'};
  function request(action,extra={},raw=false){
    return new Promise((resolve,reject)=>{
      const callback='rollscan_'+crypto.randomUUID().replaceAll('-','');const script=document.createElement('script');
      const url=new URL(state.apiUrl);Object.entries({action,key:state.accessKey,callback,...extra,_t:Date.now()}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
      const cleanup=()=>{clearTimeout(timeout);script.remove();window[callback]=()=>{};setTimeout(()=>delete window[callback],60000);};
      const timeout=setTimeout(()=>{cleanup();reject(new Error('เชื่อมต่อหมดเวลา ตรวจ URL /exec และการ Deploy ให้ผู้ใช้ที่มีคีย์เรียกได้'));},25000);
      window[callback]=body=>{cleanup();if(raw&&body)resolve(body);else if(!body||body.ok!==true)reject(new Error(ERROR_MESSAGES[body?.error]||'เซิร์ฟเวอร์ส่งข้อมูลไม่สำเร็จ'));else resolve(body);};
      script.onerror=()=>{cleanup();reject(new Error('ติดต่อ Apps Script ไม่สำเร็จ ตรวจการ Deploy และอินเทอร์เน็ต'));};
      script.referrerPolicy='no-referrer';script.src=url.href;document.head.append(script);
    });
  }
  function validateRecords(rows){
    if(!Array.isArray(rows)||rows.length>100000)throw new Error('รูปแบบข้อมูลจากชีตไม่ถูกต้อง');
    const index=new Map(),records=[],seen=new Set();let duplicates=0;
    for(const row of rows){const clean={};for(const field of ['isn','meter','diameter','kgs','newisn']){const value=row?.[field];if(value!==undefined&&typeof value!=='string'&&typeof value!=='number')throw new Error('รูปแบบข้อมูลจากชีตไม่ถูกต้อง');clean[field]=String(value??'').trim();}clean.isn=norm(clean.isn);clean.newisn=norm(clean.newisn);if(!clean.isn)continue;if(seen.has(clean.isn)){duplicates++;continue;}seen.add(clean.isn);records.push(clean);for(const code of new Set([clean.isn,clean.newisn].filter(Boolean)))index.set(code,[...(index.get(code)||[]),clean]);}
    return {records,index,duplicates};
  }
  async function connect(event){event?.preventDefault();$('settings-error').textContent='';const old={apiUrl:state.apiUrl,accessKey:state.accessKey};
    try{const pasted=$('api-url').value.trim().match(/#connect=([A-Za-z0-9_-]+)/);if(pasted){const data=JSON.parse(b64url.dec(pasted[1]));$('api-url').value=String(data.u||'');$('access-key').value=String(data.k||'');}state.apiUrl=apiUrl($('api-url').value.trim());state.accessKey=$('access-key').value.trim();if(state.accessKey.length<32)throw new Error('Access key ต้องมีอย่างน้อย 32 ตัวอักษร');$('connect-button').disabled=true;$('connect-button').textContent='กำลังโหลดข้อมูล…';await refresh(true);storage.set('rollscan-api-url',state.apiUrl);storage.set('rollscan-key',state.accessKey);storage.remove('rollscan-key',true);renderShare();message('เชื่อมต่อแล้ว — เครื่องนี้จำไว้แล้ว ครั้งต่อไปไม่ต้องใส่อีก');}
    catch(error){state.apiUrl=old.apiUrl;state.accessKey=old.accessKey;$('settings-error').textContent=error.message;}
    finally{$('connect-button').disabled=false;$('connect-button').textContent='เชื่อมต่อและโหลดข้อมูล';}
  }
  async function refresh(fromSettings=false,silent=false){
    if(!state.apiUrl||!state.accessKey){openSettings();return;}
    $('refresh-button').disabled=true;const generation=state.dataGeneration;
    try{const body=await request('index');if(generation!==state.dataGeneration)return;const data=validateRecords(body.records);state.records=data.records;state.index=data.index;state.connected=true;state.lastRefresh=Date.now();state.loadedAt=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});saveIndexCache(state.records);$('connection-dot').classList.add('connected');$('connection-label').textContent='เชื่อมต่อ Google Sheets';$('data-summary').textContent=`${state.records.length.toLocaleString()} รายการ · โหลดล่าสุด ${state.loadedAt}`;const dup=body.duplicates||[];if(dup.length)message(`พบ ISN ซ้ำในชีต ${dup.length} แถว (ใช้แถวแรก) เช่น ${dup.slice(0,3).map(d=>d.isn+' แถว '+d.row).join(', ')} — ควรแก้ในชีต`,true);else if(!fromSettings&&!silent)message('โหลดข้อมูลล่าสุดแล้ว พร้อมสแกน');flushLog();}
    catch(error){if(silent){$('connection-label').textContent=state.connected?'ออฟไลน์ · ใช้ข้อมูลในเครื่อง':'ยังไม่ได้เชื่อมต่อ';$('connection-dot').classList.remove('connected');}else if(!fromSettings)message(error.message+' • ข้อมูลที่โหลดไว้ก่อนหน้ายังใช้ได้',true);throw error;}
    finally{$('refresh-button').disabled=!state.connected;}
  }
  function openSettings(){$('api-url').value=state.apiUrl||storage.get('rollscan-api-url')||window.ROLLSCAN_CONFIG?.apiUrl||'';$('access-key').value=state.accessKey||storage.get('rollscan-key')||storage.get('rollscan-key',true);$('scanner-name').value=state.name;$('settings-error').textContent='';renderShare();$('settings-dialog').showModal();}
  function disconnect(){stopCamera();state.dataGeneration++;state.generation++;state.requestId++;state.records=[];state.index.clear();state.connected=false;state.apiUrl='';state.accessKey='';storage.remove('rollscan-key',true);storage.remove('rollscan-key');storage.remove('rollscan-api-url');storage.remove('rollscan-index');renderShare();$('access-key').value='';$('connection-dot').classList.remove('connected');$('connection-label').textContent='ยังไม่ได้เชื่อมต่อ';$('data-summary').textContent='เชื่อมต่อเพื่อโหลดข้อมูลก่อนเริ่มสแกน';$('refresh-button').disabled=true;$('history-body').replaceChildren();$('history-count').textContent='0';$('history-empty').hidden=false;clearResult();$('settings-dialog').close();message('ตัดการเชื่อมต่อแล้ว');}
  function feedback(found){try{navigator.vibrate?.(found?70:[60,70,60]);if(!state.sound)return;state.audio||=(new(window.AudioContext||window.webkitAudioContext)());const audio=state.audio;audio.resume();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=found?1046:330;gain.gain.setValueAtTime(0.05,audio.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.17);oscillator.start();oscillator.stop(audio.currentTime+0.18);}catch{}}
  function clearResult(){state.paused=false;state.last='';state.displayedIsn='';state.lastHadLabel=false;$('qr-comparison').hidden=true;$('empty-result').hidden=false;$('found-result').hidden=true;$('missing-result').hidden=true;$('match-status').textContent='รอการสแกน';$('match-status').className='tag';$('code-input').value='';$('scan-hint').textContent='กำลังค้นหารหัส…';}
  function showResult(record,raw,label=null){
    state.missingScan=label||{isn:raw};state.displayedIsn=record?.isn||'';state.lastHadLabel=!!label;renderComparison(record,label);
    $('empty-result').hidden=true;$('found-result').hidden=!record;$('missing-result').hidden=!!record;
    $('match-status').textContent=record?'พบข้อมูล':'ไม่พบข้อมูล';$('match-status').className='tag '+(record?'found':'missing');
    if(record){for(const field of ['isn','meter','diameter','kgs'])$('result-'+field).textContent=record[field]===''?'—':record[field];$('result-source').textContent=`ข้อมูลที่โหลดจากชีตเวลา ${state.loadedAt} · กดโหลดข้อมูลล่าสุดเมื่อแก้ไขชีต`;}
    else $('missing-code').textContent=raw;
    addHistory(record,raw);enqueueLog(record,raw,label);feedback(!!record);if(!$('continuous').checked){state.paused=true;$('scan-hint').textContent='พักอ่านรหัส — กดสแกนถัดไป';}if(innerWidth<=760)$('result-panel').scrollIntoView({behavior:'smooth',block:'start'});
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
    const scan=DATA.parseScan(raw);state.lastRaw=raw;const hits=[...new Map(scan.codes.flatMap(k=>state.index.get(k)||[]).map(r=>[r.isn,r])).values()];message('');
    if(!hits.length){recheck(scan);return;}
    if(hits.length>1)choose(hits.map(record=>({label:record.isn,record})),entry=>showResult(entry.record,scan.isn,scan.label));else showResult(hits[0]||null,scan.isn,scan.label);
  }
  function accept(hits,photo=false){
    if(!hits.length||state.paused||state.checking||$('settings-dialog').open||$('add-dialog').open)return;
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
    for(const[title,fields]of groups){const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;fieldset.append(legend);const grid=document.createElement('div');grid.className='add-field-grid';for(const field of fields){const label=document.createElement('label');label.textContent=field+(['isn','meter','diameter','kgs'].includes(field)?' *':'');const input=document.createElement('input');input.name=field;input.type='text';if(DATA.NUMERIC.has(field)){input.inputMode='decimal';input.autocomplete='off';}input.value=initial[field]||'';input.required=['isn','meter','diameter','kgs'].includes(field);input.maxLength=1000;label.append(input);grid.append(label);}fieldset.append(grid);container.append(fieldset);}$('add-dialog').showModal();
  }
  async function saveAdd(event){
    event.preventDefault();$('add-error').textContent='';
    try{
      const data=DATA.cleanRecord(Object.fromEntries(new FormData($('add-form'))));state.adding=true;$('add-submit').disabled=true;$('add-cancel').disabled=true;$('add-close').disabled=true;$('add-submit').textContent='กำลังบันทึก…';
      const id=crypto.randomUUID();
      await fetch(state.apiUrl,{method:'POST',mode:'no-cors',credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'add',key:state.accessKey,id,data,by:state.name})});
      let saved=null;for(let attempt=0;attempt<16;attempt++){const result=await request('operation',{id});if(result.done){saved=result.record;break;}await new Promise(resolve=>setTimeout(resolve,750));}
      if(!saved)throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลล่าสุดและค้นหา ISN นี้ก่อนลองอีกครั้ง');
      const updated=validateRecords([...state.records.filter(r=>r.isn!==saved.isn),saved]);state.records=updated.records;state.index=updated.index;$('data-summary').textContent=state.records.length.toLocaleString()+' รายการ · มีรายการเพิ่มล่าสุด';$('add-dialog').close();saveIndexCache(state.records);state.nextLogResult='เพิ่มใหม่';showResult(saved,saved.isn,state.missingScan?.meter?state.missingScan:null);message('เพิ่มรายการลง Google Sheets แล้ว');
    }catch(error){$('add-error').textContent=error.message||'บันทึกไม่สำเร็จ กรุณาค้นหารหัสก่อนลองใหม่';if(error.message===ERROR_MESSAGES.DUPLICATE_ISN)refresh(false,true).catch(()=>{});}
    finally{state.adding=false;$('add-submit').disabled=false;$('add-cancel').disabled=false;$('add-close').disabled=false;$('add-submit').textContent='บันทึกลง Google Sheets';}
  }

  /* ---------- 1.2: เชื่อมครั้งเดียว / แชร์ให้เครื่องอื่น ---------- */
  const b64url={enc:text=>btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''),dec:text=>{const t=text.replaceAll('-','+').replaceAll('_','/');return atob(t+'='.repeat((4-t.length%4)%4));}};
  function shareLink(){return location.origin+location.pathname+'#connect='+b64url.enc(JSON.stringify({u:state.apiUrl,k:state.accessKey}));}
  function renderShare(){
    const box=$('share-box');if(!box)return;const ready=state.connected&&state.apiUrl&&state.accessKey;box.hidden=!ready;$('share-qr').replaceChildren();if(!ready||typeof qrcode!=='function')return;
    const qr=qrcode(0,'M');qr.addData(shareLink());qr.make();$('share-qr').innerHTML=qr.createSvgTag({cellSize:4,margin:4,scalable:true});
  }
  function readConnectLink(){
    const match=location.hash.match(/^#connect=([A-Za-z0-9_-]+)$/);if(!match)return false;
    history.replaceState(null,'',location.pathname+location.search); // เอาคีย์ออกจากแถบที่อยู่ทันที
    try{const data=JSON.parse(b64url.dec(match[1]));const url=apiUrl(String(data.u||''));const key=String(data.k||'');if(key.length<32)throw new Error();
      if(url!==storage.get('rollscan-api-url'))storage.remove('rollscan-index');storage.set('rollscan-api-url',url);storage.set('rollscan-key',key);return true;}
    catch{message('ลิงก์เชื่อมต่อไม่ถูกต้อง ขอลิงก์ใหม่จากเครื่องที่เชื่อมต่อแล้ว',true);return false;}
  }
  function askName(){if(state.name||storage.get('rollscan-name-asked'))return;storage.set('rollscan-name-asked','1');const name=prompt('ชื่อผู้สแกน (บันทึกในชีตประวัติสแกน) — เว้นว่างได้','');if(name&&name.trim()){state.name=name.trim().slice(0,60);storage.set('rollscan-name',state.name);}}

  /* ---------- 1.2: เก็บข้อมูลไว้ในเครื่อง เปิดแล้วใช้ได้ทันที ---------- */
  function saveIndexCache(records){try{localStorage.setItem('rollscan-index',JSON.stringify({u:state.apiUrl,at:Date.now(),records}));}catch{}}
  function loadIndexCache(){
    try{const cache=JSON.parse(localStorage.getItem('rollscan-index')||'null');if(!cache||cache.u!==state.apiUrl||!Array.isArray(cache.records))return false;
      const data=validateRecords(cache.records);state.records=data.records;state.index=data.index;state.connected=true;state.lastRefresh=0;
      state.loadedAt=new Date(cache.at).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      $('connection-label').textContent='ใช้ข้อมูลในเครื่อง · กำลังอัปเดต…';$('data-summary').textContent=`${state.records.length.toLocaleString()} รายการ · ข้อมูลในเครื่องเมื่อ ${state.loadedAt}`;$('refresh-button').disabled=false;return true;}
    catch{return false;}
  }
  function autoRefresh(maxAge){if(!state.connected||document.hidden||state.adding||state.checking||$('add-dialog').open||$('settings-dialog').open)return;if(Date.now()-state.lastRefresh<maxAge)return;state.lastRefresh=Date.now();refresh(false,true).catch(()=>{});}

  /* ---------- 1.2: ไม่เจอในเครื่อง → ถามชีตล่าสุดก่อนขึ้นว่าไม่พบ ---------- */
  async function recheck(scan){
    state.checking=true;state.paused=true;$('scan-hint').textContent='กำลังตรวจในชีตล่าสุด…';$('match-status').textContent='กำลังตรวจในชีต…';$('match-status').className='tag';
    try{const code=scan.isn;if(code&&code.length<=160){const body=await request('lookup',{code,fresh:1});const found=(body.records||[]).filter(r=>r&&r.isn);
      if(found.length){const keep=new Set(found.map(r=>norm(r.isn)));const updated=validateRecords([...state.records.filter(r=>!keep.has(r.isn)),...found]);state.records=updated.records;state.index=updated.index;saveIndexCache(state.records);}}}
    catch(error){message('ตรวจกับชีตล่าสุดไม่ได้ ('+error.message+') — ผลนี้มาจากข้อมูลในเครื่อง',true);}
    finally{state.checking=false;state.paused=false;}
    const hits=[...new Map(scan.codes.flatMap(k=>state.index.get(k)||[]).map(r=>[r.isn,r])).values()];
    if(hits.length>1)choose(hits.map(record=>({label:record.isn,record})),entry=>showResult(entry.record,scan.isn,scan.label));else showResult(hits[0]||null,scan.isn,scan.label);
  }

  /* ---------- 1.2: ประวัติสแกนลงชีต (ส่งเป็นชุด, เน็ตหลุดก็ไม่หาย) ---------- */
  function updateLogBadge(){const n=state.logQueue.length+(state.logInflight?.entries.length||0);$('log-status').textContent=n?`ประวัติรอส่ง ${n}`:'';}
  function saveLogQueue(){storage.set('rollscan-logq',JSON.stringify(state.logQueue));storage.set('rollscan-loginflight',state.logInflight?JSON.stringify(state.logInflight):'null');updateLogBadge();}
  function enqueueLog(record,raw,label){
    const checks=record&&label?DATA.compareLabel(record,label):null;
    const qr=checks?(checks.every(c=>c.match)?'ตรง':'ต่าง: '+checks.filter(c=>!c.match).map(c=>`${c.field} ${c.sheet||'—'}→${c.printed||'—'}`).join(', ')):'';
    state.logQueue.push({t:new Date().toISOString(),by:state.name,isn:record?.isn||raw,result:state.nextLogResult||(record?'พบ':'ไม่พบ'),qr_check:qr,meter_qr:label?.meter||'',diameter_qr:label?.diameter||'',kgs_qr:label?.kgs||'',raw:String(state.lastRaw||raw||'').slice(0,300)});
    state.nextLogResult='';if(state.logQueue.length>5000)state.logQueue.splice(0,state.logQueue.length-5000);saveLogQueue();setTimeout(flushLog,1200);
  }
  async function flushLog(){
    if(state.logBusy||!state.apiUrl||!state.accessKey||!navigator.onLine)return;
    if(!state.logInflight&&state.logQueue.length){state.logInflight={id:crypto.randomUUID(),entries:state.logQueue.splice(0,100)};saveLogQueue();}
    if(!state.logInflight)return;
    state.logBusy=true;const batch=state.logInflight;let confirmed=false;
    try{
      await fetch(state.apiUrl,{method:'POST',mode:'no-cors',credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'log',key:state.accessKey,id:batch.id,entries:batch.entries})});
      for(let attempt=0;attempt<8&&!confirmed;attempt++){await new Promise(r=>setTimeout(r,attempt?900:500));const result=await request('operation',{id:batch.id},true);if(result.done)confirmed=result.ok||result.error==='INVALID_RECORD'||result.error==='INVALID_ACTION';if(result.done&&!confirmed)break;}
    }catch{}
    finally{state.logBusy=false;}
    if(confirmed&&state.logInflight===batch){state.logInflight=null;saveLogQueue();}
    if(state.logInflight||state.logQueue.length)setTimeout(flushLog,confirmed?300:15000);
  }

  /* ---------- 1.2.1: มือถือ iOS / Android ---------- */
  function unlockAudio(){try{state.audio||=(new(window.AudioContext||window.webkitAudioContext)());state.audio.resume();const buffer=state.audio.createBuffer(1,1,22050),source=state.audio.createBufferSource();source.buffer=buffer;source.connect(state.audio.destination);source.start(0);}catch{}}
  const NATIVE_FORMATS={qr_code:'QRCode',data_matrix:'DataMatrix',pdf417:'PDF417',aztec:'Aztec',code_128:'Code128',code_39:'Code39',code_93:'Code93',ean_13:'EAN13',ean_8:'EAN8',itf:'ITF',upc_a:'UPCA',upc_e:'UPCE',codabar:'Codabar'};
  async function startNativeDetector(generation){
    // Chrome บน Android มีตัวอ่านบาร์โค้ดในเครื่อง (เร็วมาก) ใช้คู่กับ ZXing; iPhone ไม่มีจะข้ามไปเอง
    if(!('BarcodeDetector' in window))return;let detector;
    try{const supported=await BarcodeDetector.getSupportedFormats();const formats=Object.keys(NATIVE_FORMATS).filter(f=>supported.includes(f));if(!formats.length)return;detector=new BarcodeDetector({formats});}catch{return;}
    let busy=false;$('camera-status').textContent='พร้อมอ่าน · 2 ตัวอ่าน';
    const loop=()=>{if(!state.stream||generation!==state.generation)return;
      if(!busy&&!state.paused&&!state.checking&&!$('settings-dialog').open&&!$('add-dialog').open&&$('video').readyState>=2){busy=true;
        detector.detect($('video')).then(list=>{if(list.length&&state.stream&&generation===state.generation)accept(list.filter(b=>b.rawValue).map(b=>({text:b.rawValue,format:NATIVE_FORMATS[b.format]||b.format})));}).catch(()=>{}).finally(()=>{busy=false;});}
      setTimeout(loop,100);};
    loop();
  }
  function stopCamera(){state.generation++;if(state.timer)clearTimeout(state.timer);state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;state.worker?.terminate();state.worker=null;state.busy=false;$('video').srcObject=null;$('viewfinder').classList.remove('active');$('camera-placeholder').hidden=false;$('stop-camera').hidden=true;$('camera-controls').hidden=true;$('scan-hint').hidden=true;$('camera-status').textContent='ปิดอยู่';state.torch=false;}
  async function startCamera(deviceId=''){
    if(state.starting)return;if(!state.connected){openSettings();return;}askName();stopCamera();state.starting=true;$('start-camera').disabled=true;$('start-camera').textContent='กำลังเปิดกล้อง…';const generation=state.generation;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('เปิดผ่าน HTTPS และใช้ Edge ที่รองรับกล้อง');
      const constraints=id=>({audio:false,video:{...(id?{deviceId:{exact:id}}:{facingMode:{ideal:'environment'}}),width:{ideal:1920},height:{ideal:1080}}});let stream;try{stream=await navigator.mediaDevices.getUserMedia(constraints(deviceId));}catch(error){if(!deviceId||error.name==='NotAllowedError')throw error;storage.remove('rollscan-camera');stream=await navigator.mediaDevices.getUserMedia(constraints(''));}
      if(generation!==state.generation){stream.getTracks().forEach(t=>t.stop());return;}state.stream=stream;$('video').srcObject=stream;await $('video').play();
      const track=stream.getVideoTracks()[0],caps=typeof track.getCapabilities==='function'?(track.getCapabilities()||{}):{};
      if(caps.focusMode?.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
      $('torch-button').hidden=!caps.torch;$('torch-button').textContent='ไฟฉาย';$('zoom-control').hidden=!caps.zoom;
      if(caps.zoom){$('zoom-slider').min=caps.zoom.min;$('zoom-slider').max=Math.min(caps.zoom.max,5);$('zoom-slider').step=caps.zoom.step||0.1;$('zoom-slider').value=track.getSettings().zoom||caps.zoom.min;$('zoom-label').textContent=Number($('zoom-slider').value).toFixed(1)+'×';}
      const cameras=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');$('camera-select').replaceChildren();for(const camera of cameras){const option=document.createElement('option');option.value=camera.deviceId;option.textContent=camera.label||'กล้อง';$('camera-select').append(option);}$('camera-select').value=track.getSettings().deviceId||deviceId;$('camera-select').hidden=cameras.length<2;
      $('camera-controls').hidden=!caps.torch&&!caps.zoom&&cameras.length<2;$('viewfinder').classList.add('active');$('camera-placeholder').hidden=true;$('stop-camera').hidden=false;$('scan-hint').hidden=false;$('camera-status').textContent='พร้อมอ่าน';state.paused=false;state.last='';
      const worker=new Worker('./scanner-worker.js?v=1.2.1');state.worker=worker;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      const tick=()=>{if(!state.stream||generation!==state.generation)return;if(state.paused||$('settings-dialog').open||$('add-dialog').open||$('video').readyState<2){state.timer=setTimeout(tick,150);return;}state.frame++;const video=$('video'),ratio=Math.min(1,(state.frame%4===0?1920:1280)/video.videoWidth);canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);ctx.drawImage(video,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height);worker.postMessage({id:state.frame,pixels:image.data.buffer,width:image.width,height:image.height},[image.data.buffer]);};
      worker.onmessage=event=>{if(!state.stream||generation!==state.generation)return;if(event.data.error){message(event.data.error,true);stopCamera();return;}accept(event.data.results||[]);state.timer=setTimeout(tick,90);};worker.onerror=()=>{message('โหลดตัวอ่านไม่สำเร็จ ลองโหลดหน้าเว็บใหม่แล้วเปิดกล้องอีกครั้ง',true);stopCamera();};tick();message('');startNativeDetector(generation);
    }catch(error){stopCamera();message(error.name==='NotAllowedError'?'ยังไม่ได้รับอนุญาตกล้อง กรุณาอนุญาตกล้องให้เว็บไซต์นี้ใน Edge':error.message,true);}
    finally{state.starting=false;$('start-camera').disabled=false;$('start-camera').textContent='เปิดกล้องสแกน';}
  }
  async function readPhoto(file){
    if(!state.connected){openSettings();return;}if(file.size>20*1024*1024){message('เลือกรูปขนาดไม่เกิน 20 MB',true);return;}
    const wasPaused=state.paused;let completed=false;state.paused=true;message('กำลังอ่านรหัสจากรูป…');const worker=new Worker('./scanner-worker.js?v=1.2.1');let timeout;
    try{const bitmap=await createImageBitmap(file);const ratio=Math.min(1,3000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const image=ctx.getImageData(0,0,canvas.width,canvas.height);
      const hits=await new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('อ่านรูปหมดเวลา กรุณาลองรูปที่ชัดขึ้น')),20000);worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.results||[]);worker.onerror=()=>reject(new Error('โหลดตัวอ่านรูปไม่สำเร็จ'));worker.postMessage({id:0,photo:true,pixels:image.data.buffer,width:image.width,height:image.height},[image.data.buffer]);});
      state.paused=false;if(hits.length){completed=true;message('');accept(hits,true);}else message('ยังอ่านรหัสจากรูปนี้ไม่ได้ ลองถ่ายให้รหัสครบและชัดขึ้น',true);
    }catch(error){message(error.message||'เปิดรูปไม่สำเร็จ',true);}finally{clearTimeout(timeout);worker.terminate();if(!$('choices-dialog').open&&!completed)state.paused=wasPaused;}
  }
  $('add-record-button').onclick=openAdd;$('add-form').onsubmit=saveAdd;for(const id of ['add-close','add-cancel'])$(id).onclick=()=>{if(!state.adding)$('add-dialog').close();};$('add-dialog').oncancel=event=>{if(state.adding)event.preventDefault();};
  $('settings-button').onclick=openSettings;$('settings-form').onsubmit=connect;document.querySelector('.dialog-close').onclick=()=>$('settings-dialog').close();$('disconnect-button').onclick=disconnect;
  $('refresh-button').onclick=()=>refresh().catch(()=>{});$('search-form').onsubmit=event=>{event.preventDefault();lookup($('code-input').value);};
  $('start-camera').onclick=()=>{unlockAudio();startCamera(storage.get('rollscan-camera'));};$('stop-camera').onclick=stopCamera;$('camera-select').onchange=()=>{storage.set('rollscan-camera',$('camera-select').value);startCamera($('camera-select').value);};
  $('torch-button').onclick=async()=>{try{await state.stream.getVideoTracks()[0].applyConstraints({advanced:[{torch:!state.torch}]});state.torch=!state.torch;$('torch-button').textContent=state.torch?'ปิดไฟฉาย':'ไฟฉาย';}catch{message('กล้องนี้เปิดไฟฉายไม่ได้',true);}};
  $('zoom-slider').oninput=async()=>{try{const zoom=Number($('zoom-slider').value);await state.stream.getVideoTracks()[0].applyConstraints({advanced:[{zoom}]});$('zoom-label').textContent=zoom.toFixed(1)+'×';}catch{message('กล้องนี้ปรับซูมไม่ได้',true);}};
  $('sound-button').onclick=()=>{state.sound=!state.sound;$('sound-button').textContent='เสียง: '+(state.sound?'เปิด':'ปิด');};$('continuous').onchange=()=>{if($('continuous').checked){state.paused=false;state.last='';}};
  $('photo-input').onchange=event=>{if(event.target.files[0])readPhoto(event.target.files[0]);event.target.value='';};
  $('next-scan').onclick=clearResult;$('missing-next').onclick=clearResult;$('choices-close').onclick=()=>{$('choices-dialog').close();state.paused=false;state.last='';};$('choices-dialog').oncancel=()=>{state.paused=false;state.last='';};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else{autoRefresh(60000);flushLog();}});window.addEventListener('online',()=>{autoRefresh(0);flushLog();});setInterval(()=>autoRefresh(180000),30000);window.addEventListener('pagehide',stopCamera);
  const fromLink=readConnectLink();
  state.apiUrl=storage.get('rollscan-api-url')||window.ROLLSCAN_CONFIG?.apiUrl||'';state.accessKey=storage.get('rollscan-key')||storage.get('rollscan-key',true);state.name=storage.get('rollscan-name');
  try{state.logQueue=JSON.parse(storage.get('rollscan-logq')||'[]');state.logInflight=JSON.parse(storage.get('rollscan-loginflight')||'null');}catch{state.logQueue=[];state.logInflight=null;}
  $('api-url').addEventListener('input',()=>{const pasted=$('api-url').value.trim().match(/#connect=([A-Za-z0-9_-]+)/);if(!pasted)return;try{const data=JSON.parse(b64url.dec(pasted[1]));$('api-url').value=String(data.u||'');$('access-key').value=String(data.k||'');$('settings-error').textContent='';}catch{$('settings-error').textContent='ลิงก์เชื่อมต่อไม่ถูกต้อง';}});
  $('scanner-name').onchange=event=>{state.name=event.target.value.trim().slice(0,60);storage.set('rollscan-name',state.name);};
  $('share-copy').onclick=async()=>{try{await navigator.clipboard.writeText(shareLink());$('share-copy').textContent='คัดลอกแล้ว ✓';setTimeout(()=>$('share-copy').textContent='คัดลอกลิงก์',1800);}catch{prompt('คัดลอกลิงก์นี้',shareLink());}};
  $('share-native').hidden=!navigator.share;$('share-native').onclick=()=>navigator.share({title:'RollScan — เชื่อมต่อ',url:shareLink()}).catch(()=>{});
  updateLogBadge();
  if(state.apiUrl&&state.accessKey){try{state.apiUrl=apiUrl(state.apiUrl);const cached=loadIndexCache();refresh(false,cached).then(()=>{if(fromLink)message('เชื่อมต่อด้วยลิงก์แล้ว — เครื่องนี้จำไว้แล้ว พร้อมสแกน');}).catch(()=>{if(!cached)openSettings();});}catch{openSettings();}}
  else message('ตั้งค่าการเชื่อมต่อครั้งแรก เพื่อโหลดข้อมูลจาก Google Sheets');
})();
