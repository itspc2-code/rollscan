# RollScan 1.1 — ติดตั้งต่อ

เว็บ: https://itspc2-code.github.io/rollscan/
Repository: https://github.com/itspc2-code/rollscan
Google Sheet: https://docs.google.com/spreadsheets/d/1L-Lng2sT21rGlo-F6L6RkZAbSctGWhapfPfodkmkHR8/edit

1. แตก ZIP แล้วอัปโหลดไฟล์ข้างในทั้งหมดทับใน repository เดิมที่ Code → Add file → Upload files → Commit changes ห้ามอัปโหลด ZIP ทั้งก้อน GitHub Pages ตั้ง main / (root) ไว้แล้ว
2. ใน Apps Script ของชีตนี้ วางโค้ด Code.gs ล่าสุดไว้และบันทึกแล้ว เลือก setupRollScan → Run → อนุญาต Google จากนั้น Project Settings → Script properties → คัดลอก ACCESS_KEY
3. Deploy → Manage deployments → แก้ไข deployment เดิม → Version: New version → Deploy ให้ Execute as: Me และ Who has access: Anyone ถ้านโยบายองค์กรไม่อนุญาต Anyone จะต้องปรับรูปแบบเชื่อมต่อก่อน
4. เปิดเว็บ → ตั้งค่าการเชื่อมต่อ → ใส่ Web app URL ที่ลงท้าย /exec และ ACCESS_KEY → เชื่อมต่อและโหลดข้อมูล

เวอร์ชัน 1.1 สแกน ISN แล้วค้น Google Sheets ถ้าพบจะแสดง ISN / meter / diameter / kgs ให้ตรวจ ถ้าไม่พบจะมีปุ่มเพิ่มรายการพร้อม 22 ช่อง บันทึกต่อท้ายชีตและกัน ISN ซ้ำ ไม่แก้ไขแถวเดิมหรือไฟล์อื่น

รองรับ QR ฉลากรูปแบบ เกรด|ISN|ความกว้าง|kgs|diameter|meter และบาร์โค้ด Code39 จะใช้ ISN ค้นชีตก่อน ค่าใน QR แสดงแยกเพื่อเทียบ ไม่มีการแทนค่าชีตอัตโนมัติ

ทดสอบภาพนิ่งจริง 20 ภาพ อ่าน ISN ถูก 16 ภาพ ไม่พบรหัสผิดใน 16 ภาพที่อ่านได้ อีก 4 ภาพใช้พิมพ์รหัสเอง ผลนี้ยังไม่ใช่การทดสอบกวาดกล้องสด

คีย์เก็บเฉพาะแท็บที่เปิดอยู่ ห้ามใส่ ACCESS_KEY หรือไฟล์ข้อมูล Excel ลง GitHub คีย์อนุญาตค้นและเพิ่มรายการใหม่

การบันทึกเพิ่มใช้ POST และตรวจผลด้วยหมายเลขคำขอ ถ้ายังยืนยันผลไม่ได้ ให้ค้น ISN ในชีตก่อนลองบันทึกใหม่ ภาพกล้องประมวลผลบนอุปกรณ์
