# RollScan — Google Sheets + Apps Script + GitHub Pages

หน้าสแกนภาษาไทยแบบอ่านข้อมูลอย่างเดียวสำหรับ Microsoft Edge และเบราว์เซอร์มือถือ รองรับกล้อง QR/บาร์โค้ด รูปภาพ และเครื่องยิง USB/Bluetooth แบบแป้นพิมพ์

## โครงสร้าง

```text
กล้อง / เครื่องยิง → GitHub Pages → Apps Script → Google Sheets
```

- โฟลเดอร์รากของ repository คือเว็บไซต์พร้อมเผยแพร่ ไม่ต้อง npm install หรือ build
- `Code.gs` คือ API สำหรับอ่านข้อมูลเท่านั้น ไม่มีคำสั่งเพิ่ม แก้ไข หรือลบแถว
- `appsscript.json` คือการตั้งค่าโครงการ Apps Script
- ไม่มีไฟล์ข้อมูล Book1 หรือ access key ในชุดโค้ด GitHub

เว็บไซต์โหลด `isn`, `meter`, `diameter`, `kgs`, `newisn` เข้าหน่วยความจำเพื่อจับคู่ตรงตัวได้เร็ว ไม่มีราคาหรือข้อมูลผู้จำหน่ายในผล API รายละเอียด 22 คอลัมน์คงอยู่ในชีต

## 1. เตรียม Google Sheets

ใช้ Google Sheet ที่นำเข้าจาก Book1.xlsx แล้ว โดยแถวแรกมีหัวคอลัมน์เดิมอย่างน้อย `isn`, `meter`, `diameter`, `kgs` และ `newisn` ถ้ามี

- เก็บ ISN และ newisn เป็นข้อความเพื่อรักษาเลขศูนย์นำหน้า
- ISN แต่ละรายการต้องไม่ซ้ำ ถ้าซ้ำ API จะแจ้งให้แก้ข้อมูลแทนการเลือกแถวแรกเอง
- เพิ่มหรือแก้รายการได้ในชีต โดยใช้คอลัมน์เดิม
- ไม่ต้องเปิด Google Sheet เป็นสาธารณะ

## 2. ติดตั้ง Apps Script

1. เปิด Google Sheet ของงานนี้ แล้วเลือก **Extensions → Apps Script**
2. แทนโค้ดใน `Code.gs` ด้วยไฟล์ `Code.gs`
3. ใน Project Settings เปิด **Show appsscript.json manifest file in editor** แล้วใช้เนื้อหา `appsscript.json`
4. บันทึก เลือกฟังก์ชัน `setupRollScan` แล้วกด Run ให้เจ้าของบัญชีอนุญาต Google ด้วยตัวเอง
5. ไปที่ **Project Settings → Script properties** จะได้ `SPREADSHEET_ID`, `SHEET_NAME` และ `ACCESS_KEY` อัตโนมัติ คีย์ยาว 64 ตัวอักษร
6. เลือก **Deploy → New deployment → Web app** โดย Execute as = **Me** และ Who has access = **Anyone** เพื่อให้หน้า GitHub เรียก API ได้ การอ่านข้อมูลยังต้องมี ACCESS_KEY
7. คัดลอก Web app URL ที่ลงท้าย `/exec` ไปใส่ในการตั้งค่าหน้าสแกน

ถ้านโยบายบัญชีองค์กรไม่ให้เลือก Anyone ให้หยุดที่ขั้น Deploy และใช้วิธีโฮสต์ภายในองค์กรแทน โค้ดชุดนี้ไม่ได้ข้ามข้อจำกัดของ Google Workspace

ตัวโครงการ Apps Script ต้องขอสิทธิ์ Google Sheets ตามที่ SpreadsheetApp รองรับ แต่โค้ดอ่านเฉพาะ spreadsheet ID และชื่อแท็บที่ตั้งไว้ ไม่มีการค้นหาหรือแก้ไฟล์อื่น

## 3. เปิด GitHub Pages

1. สร้าง repository ใหม่ชื่อ `rollscan` และเพิ่มไฟล์ชุดนี้ตามโครงสร้างเดิม
2. เข้า **Settings → Pages → Build and deployment**
3. เลือก Source = **Deploy from a branch**, Branch = **main**, Folder = **/ (root)** แล้ว Save
4. รอจน GitHub แสดง URL ของ Pages แล้วเปิดลิงก์นั้นใน Edge

GitHub Free ต้องใช้ repository สาธารณะสำหรับ Pages ดังนั้นใส่เฉพาะโค้ด ห้ามเพิ่ม Book1.xlsx, ไฟล์ CSV, export ข้อมูล หรือ ACCESS_KEY ลง repository

## 4. เชื่อมต่อและสแกน

1. กด **ตั้งค่าการเชื่อมต่อ** ใส่ URL `/exec` และ ACCESS_KEY
2. กด **เชื่อมต่อและโหลดข้อมูล** จะเห็นจำนวนรายการและเวลาโหลด
3. กด **เปิดกล้องสแกน** แล้วอนุญาตกล้องใน Edge ด้วยตัวเอง หรือใช้ช่องค้นหา/เครื่องยิงที่ส่ง Enter ปิดท้าย
4. เมื่อพบ จะแสดง ISN, meter, diameter, kgs เมื่อไม่พบจะแจ้งชัดเจน ไม่เดารหัสใกล้เคียง
5. เมื่อแก้ชีต กด **โหลดข้อมูลล่าสุด** แคชฝั่ง Apps Script มีอายุไม่เกิน 30 วินาที หากยังเห็นค่าเดิมให้รอครบช่วงแล้วโหลดอีกครั้ง

คีย์เก็บเฉพาะ sessionStorage ของแท็บ ส่วน URL เก็บเป็นการตั้งค่าในเครื่อง ข้อมูลรายการอยู่ในหน่วยความจำ ไม่ได้เขียนลง localStorage กดตัดการเชื่อมต่อเพื่อล้างคีย์และข้อมูลจากหน้านี้

API ใช้ JSONP สำหรับการอ่านข้ามโดเมนตามรูปแบบ Content Service ของ Google คีย์จึงอยู่ใน URL คำขอ HTTPS และใช้เป็นคีย์ร่วมของผู้ใช้ ไม่ใช่การยืนยันตัวตนรายคน เก็บคีย์ไว้เฉพาะผู้ที่ควรอ่านข้อมูล และเปลี่ยนค่า ACCESS_KEY ใน Script properties หากต้องการเพิกถอนคีย์เก่า ห้ามนำคีย์ไปวางใน config.js หรือโค้ด GitHub

## ตัวอ่านรหัส

ใช้ ZXing-C++ WebAssembly แบบ self-hosted ใน Web Worker ตรวจทั้งภาพ ลองหมุนเพิ่มเมื่ออ่านไม่ได้ รองรับ QR, Code128, Code39, Code93, EAN, ITF, DataMatrix และ PDF417 บาร์โค้ดแบบเส้นต้องอ่านได้ตรงกันสองครั้งก่อนแสดงผล

กล้องต้องเห็นรายละเอียดรหัสเพียงพอ รหัสจางหรือเสียหายมากอาจยังอ่านไม่ได้ มีไฟฉาย ซูม เลือกกล้อง และอ่านจากรูปเมื่ออุปกรณ์รองรับ ภาพกล้องไม่ได้ถูกอัปโหลดเข้า Google หรือ GitHub

## การอัปเดต

ถ้าแก้ `Code.gs` ให้ Deploy เวอร์ชันใหม่จาก Manage deployments ก่อน หน้า GitHub จะใช้ URL เดิมได้เมื่อแก้ deployment เดิม การแก้ไฟล์ใน โฟลเดอร์รากของ repository จะเผยแพร่ผ่าน GitHub Pages ตาม branch ที่ตั้งไว้

ไฟล์ JS และ wasm ใน โฟลเดอร์รากของ repository ต้องมาจาก zxing-wasm เวอร์ชันเดียวกัน

## เอกสารอ้างอิง

- Google Apps Script Content Service: https://developers.google.com/apps-script/guides/content
- Google Apps Script Web Apps: https://developers.google.com/apps-script/guides/web
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- ZXing WASM: https://github.com/Sec-ant/zxing-wasm
