/** RollScan lookup and append-only API. Never put ACCESS_KEY in GitHub source. */
const ROLLSCAN_VERSION = '1.1.0';
const ROLLSCAN_FIELDS = ['supplier_code','supplier_name','po_no','dp_no','po_grade','po_width','po_quality','supplier_grade','isn','meter','diameter','kgs','price_per_kgs','disc','current_price','total_amount','docno','newisn','status','meter_actual','diameter_actual','kgs_actual'];
const ROLLSCAN_NUMERIC = ['po_width','meter','diameter','kgs','price_per_kgs','disc','current_price','total_amount','meter_actual','diameter_actual','kgs_actual'];

function setupRollScan() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheet) throw new Error('เปิด Apps Script จาก Extensions ของ Google Sheets ที่นำเข้า Book1 ก่อน');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', sheet.getId());
  if (!props.getProperty('SHEET_NAME')) props.setProperty('SHEET_NAME', sheet.getSheets()[0].getName());
  if (!props.getProperty('ACCESS_KEY')) props.setProperty('ACCESS_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  console.log('ตั้งค่าเรียบร้อย ดู ACCESS_KEY ได้ใน Project Settings → Script properties');
  return { ready: true, sheet: props.getProperty('SHEET_NAME') };
}

function doGet(e) {
  const params = e && e.parameter || {};
  const callback = String(params.callback || '');
  if (callback && !/^rollscan_[A-Za-z0-9_]{8,90}$/.test(callback)) return jsonOutput_({ ok: false, error: 'INVALID_CALLBACK' });
  let body;
  try {
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('ACCESS_KEY') || '';
    if (secret.length < 32 || !equalKey_(String(params.key || ''), secret)) throw new Error('UNAUTHORIZED');
    const action = String(params.action || 'lookup');
    if (action === 'ping') body = { ok: true, version: ROLLSCAN_VERSION };
    else if (action === 'index') body = { ok: true, records: readRecords_(), updatedAt: new Date().toISOString() };
    else if (action === 'operation') {
      const id = String(params.id || '');
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('INVALID_CODE');
      const status = CacheService.getScriptCache().get('rollscan-op:' + id);
      body = status ? JSON.parse(status) : { ok: true, pending: true };
    }
    else if (action === 'lookup') {
      const code = normalize_(params.code);
      if (!code || code.length > 160) throw new Error('INVALID_CODE');
      body = { ok: true, records: readRecords_(params.fresh === '1').filter(r => normalize_(r.isn) === code || normalize_(r.newisn) === code), updatedAt: new Date().toISOString() };
    } else throw new Error('INVALID_ACTION');
  } catch (error) {
    const known = ['UNAUTHORIZED', 'INVALID_CODE', 'INVALID_ACTION', 'SHEET_NOT_FOUND', 'INVALID_HEADERS', 'DUPLICATE_ISN','INVALID_RECORD'];
    const reason = error && error.message || '';
    body = { ok: false, error: known.indexOf(reason) >= 0 ? reason : 'SERVER_ERROR' };
  }
  return jsonOutput_(body, callback);
}

function doPost(e) {
  let input, operationId = '', authorized = false, lock;
  try {
    const text = e && e.postData && e.postData.contents || '';
    if (text.length > 50000) throw new Error('INVALID_RECORD');
    input = JSON.parse(text);
    const props = PropertiesService.getScriptProperties(), secret = props.getProperty('ACCESS_KEY') || '';
    if (secret.length < 32 || !equalKey_(String(input.key || ''), secret)) throw new Error('UNAUTHORIZED');
    authorized = true;
    operationId = String(input.id || '');
    if (!/^[a-f0-9-]{36}$/i.test(operationId) || input.action !== 'add') throw new Error('INVALID_ACTION');
    lock = LockService.getScriptLock();
    lock.waitLock(15000);
    const cache = CacheService.getScriptCache(), previous = cache.get('rollscan-op:' + operationId);
    if (previous) return jsonOutput_(JSON.parse(previous));
    const record = validateRecord_(input.data || {});
    const book = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    const sheet = book.getSheetByName(props.getProperty('SHEET_NAME'));
    if (!sheet) throw new Error('SHEET_NOT_FOUND');
    const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(v => String(v).trim().toLowerCase());
    if (!ROLLSCAN_FIELDS.every(f => headers.indexOf(f) >= 0 && headers.indexOf(f) === headers.lastIndexOf(f))) throw new Error('INVALID_HEADERS');
    const rows = sheet.getLastRow();
    if (rows > 1 && sheet.getRange(2,headers.indexOf('isn')+1,rows-1,1).getDisplayValues().some(row => normalize_(row[0]) === record.isn)) throw new Error('DUPLICATE_ISN');
    const values = headers.map(field => {
      const value = record[field] == null ? '' : record[field];
      if (ROLLSCAN_NUMERIC.indexOf(field) >= 0 && value !== '') return Number(value);
      return /^[=+@-]/.test(value) ? "'" + value : value;
    });
    sheet.appendRow(values);
    SpreadsheetApp.flush();
    cache.remove('rollscan-v1-' + props.getProperty('SPREADSHEET_ID') + '-' + props.getProperty('SHEET_NAME'));
    const summary = {};
    ['isn','meter','diameter','kgs','newisn'].forEach(f => { summary[f] = record[f]; });
    const result = { ok: true, done: true, record: summary };
    cache.put('rollscan-op:' + operationId, JSON.stringify(result), 300);
    return jsonOutput_(result);
  } catch (error) {
    const known = ['UNAUTHORIZED','INVALID_ACTION','INVALID_RECORD','SHEET_NOT_FOUND','INVALID_HEADERS','DUPLICATE_ISN'];
    const result = { ok: false, done: true, error: known.indexOf(error && error.message) >= 0 ? error.message : 'SERVER_ERROR' };
    if (authorized && /^[a-f0-9-]{36}$/i.test(operationId)) CacheService.getScriptCache().put('rollscan-op:' + operationId, JSON.stringify(result), 300);
    return jsonOutput_(result);
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function validateRecord_(raw) {
  const record = {};
  ROLLSCAN_FIELDS.forEach(field => {
    const value = String(raw[field] == null ? '' : raw[field]).trim();
    if (value.length > 1000) throw new Error('INVALID_RECORD');
    const numeric = value.replace(/,/g,'');
    if (ROLLSCAN_NUMERIC.indexOf(field) >= 0 && value !== '' && (!Number.isFinite(Number(numeric)) || Number(numeric) < 0)) throw new Error('INVALID_RECORD');
    record[field] = ROLLSCAN_NUMERIC.indexOf(field) >= 0 && value !== '' ? numeric : value;
  });
  record.isn = normalize_(record.isn);record.newisn = normalize_(record.newisn);
  if (!record.isn || record.isn.length > 160 || /[\s<>]/.test(record.isn)) throw new Error('INVALID_RECORD');
  if (['meter','diameter','kgs'].some(f => record[f] === '')) throw new Error('INVALID_RECORD');
  return record;
}

function readRecords_(fresh) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  const name = props.getProperty('SHEET_NAME');
  if (!id || !name) throw new Error('SHEET_NOT_FOUND');
  const cache = CacheService.getScriptCache();
  const cacheKey = 'rollscan-v1-' + id + '-' + name;
  const metadata = fresh ? null : cache.get(cacheKey);
  if (metadata) {
    try {
      const info = JSON.parse(metadata);
      const names = Array.from({ length: info.chunks }, (_, i) => cacheKey + ':' + info.id + ':' + i);
      const parts = cache.getAll(names);
      if (names.every(n => parts[n] !== undefined)) return JSON.parse(names.map(n => parts[n]).join(''));
    } catch (_) { /* An expired or evicted cache is rebuilt from Sheets. */ }
  }
  const book = SpreadsheetApp.openById(id), sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('SHEET_NOT_FOUND');
  const grid = sheet.getDataRange().getDisplayValues();
  const headers = (grid[0] || []).map(v => String(v).trim().toLowerCase());
  const fields = ['isn', 'meter', 'diameter', 'kgs', 'newisn'];
  if (!['isn', 'meter', 'diameter', 'kgs'].every(f => headers.indexOf(f) >= 0)) throw new Error('INVALID_HEADERS');
  for (const field of fields) if (headers.indexOf(field) !== headers.lastIndexOf(field)) throw new Error('INVALID_HEADERS');
  const positions = fields.map(f => headers.indexOf(f));
  const records = [], seen = Object.create(null);
  for (let row = 1; row < grid.length; row++) {
    const record = {};
    fields.forEach((f, i) => { record[f] = positions[i] < 0 ? '' : String(grid[row][positions[i]] || '').trim(); });
    record.isn = normalize_(record.isn);
    record.newisn = normalize_(record.newisn);
    if (!record.isn) continue;
    if (seen[record.isn]) throw new Error('DUPLICATE_ISN');
    seen[record.isn] = true;
    records.push(record);
  }
  const data = JSON.stringify(records), chunkSize = 20000;
  // 20k UTF-16 characters remain below CacheService's 100KB per-item limit.
  const chunks = Math.ceil(data.length / chunkSize), chunkId = Utilities.getUuid().replace(/-/g, '');
  const values = {};
  for (let i = 0; i < chunks; i++) values[cacheKey + ':' + chunkId + ':' + i] = data.slice(i * chunkSize, (i + 1) * chunkSize);
  if (chunks <= 300) {
    try { cache.putAll(values, 30); cache.put(cacheKey, JSON.stringify({ chunks, id: chunkId }), 30); } catch (_) {}
  }
  return records;
}

function normalize_(value) { return String(value == null ? '' : value).trim().toUpperCase(); }
function equalKey_(provided, expected) {
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
function jsonOutput_(value, callback) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
