(function(root){
  'use strict';
  const FIELDS=['supplier_code','supplier_name','po_no','dp_no','po_grade','po_width','po_quality','supplier_grade','isn','meter','diameter','kgs','price_per_kgs','disc','current_price','total_amount','docno','newisn','status','meter_actual','diameter_actual','kgs_actual'];
  const NUMERIC=new Set(['po_width','meter','diameter','kgs','price_per_kgs','disc','current_price','total_amount','meter_actual','diameter_actual','kgs_actual']);
  const norm=value=>String(value??'').trim().toUpperCase();
  const numeric=value=>Number(String(value).replaceAll(',','').trim());
  function parseScan(raw){
    const text=String(raw??'').trim(),codes=[norm(text)];let label=null;
    const parts=text.split('|').map(v=>v.trim());
    if(parts.length===6&&/^[A-Z][A-Z0-9]{8,15}$/i.test(parts[1])&&parts[0]&&[2,3,4,5].every(i=>parts[i]!==''&&Number.isFinite(numeric(parts[i]))&&numeric(parts[i])>=0)){
      label={isn:norm(parts[1]),po_grade:parts[0],po_width:parts[2],kgs:parts[3],diameter:parts[4],meter:parts[5]};codes.push(label.isn);
    }
    try{const data=JSON.parse(text);if(data&&typeof data==='object')for(const[k,v]of Object.entries(data))if(['isn','newisn'].includes(k.toLowerCase())&&typeof v==='string')codes.push(norm(v));}catch{}
    try{const url=new URL(text);for(const[k,v]of url.searchParams)if(['isn','newisn'].includes(k.toLowerCase()))codes.push(norm(v));}catch{}
    for(const match of text.matchAll(/(?:^|[\s;|,])(?:newisn|isn)\s*[:=]\s*([A-Za-z0-9_-]+)/gi))codes.push(norm(match[1]));
    return {raw:text,codes:[...new Set(codes.filter(Boolean))],label,isn:label?.isn||codes.at(-1)||''};
  }
  function groupHits(hits){
    const groups=new Map();
    for(const hit of hits){const scan=parseScan(hit.text),id=scan.isn;const previous=groups.get(id);if(!previous||(!previous.scan.label&&scan.label))groups.set(id,{...hit,scan});}
    const all=[...groups.values()];const isnLike=all.filter(h=>h.scan.label||/^[A-Z][A-Z0-9]{9}$/.test(h.scan.isn));
    return isnLike.length?isnLike:all;
  }
  function compareLabel(record,label){if(!label)return null;return ['isn','meter','diameter','kgs'].map(field=>{const sheet=String(record[field]??''),printed=String(label[field]??'');return {field,sheet,printed,match:sheet!==''&&printed!==''&&(field==='isn'?norm(sheet)===norm(printed):Number.isFinite(numeric(sheet))&&Number.isFinite(numeric(printed))&&numeric(sheet)===numeric(printed))};});}
  function cleanRecord(raw){const result={};for(const field of FIELDS){const value=String(raw[field]??'').trim();if(value.length>1000)throw new Error(field+': ข้อมูลยาวเกินไป');if(NUMERIC.has(field)&&value!==''&&(!Number.isFinite(numeric(value))||numeric(value)<0))throw new Error(field+': ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');result[field]=NUMERIC.has(field)&&value!==''?value.replaceAll(',',''):value;}result.isn=norm(result.isn);result.newisn=norm(result.newisn);if(!result.isn||result.isn.length>160||/[\s<>]/.test(result.isn))throw new Error('กรุณากรอก ISN ให้ถูกต้อง');for(const field of ['meter','diameter','kgs'])if(result[field]==='')throw new Error('กรุณากรอก '+field);return result;}
  root.RollScanData={FIELDS,NUMERIC,norm,parseScan,groupHits,compareLabel,cleanRecord};
})(typeof self!=='undefined'?self:globalThis);
