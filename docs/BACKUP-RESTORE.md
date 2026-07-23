# دليل النسخ الاحتياطي والاستعادة — Albinaa Platform v0.1 Alpha

## المحتويات

1. [نظرة عامة](#نظرة-عامة)
2. [النسخ الاحتياطي لقاعدة البيانات](#النسخ-الاحتياطي-لقاعدة-البيانات)
3. [النسخ الاحتياطي للملفات المرفوعة](#النسخ-الاحتياطي-للملفات-المرفوعة)
4. [الاستعادة من النسخة الاحتياطية](#الاستعادة-من-النسخة-الاحتياطية)
5. [الجدول الزمني للنسخ الاحتياطي التلقائي](#الجدول-الزمني-للنسخ-الاحتياطي-التلقائي)
6. [التحقق من سلامة النسخة الاحتياطية](#التحقق-من-سلامة-النسخة-الاحتياطية)
7. [استعادة الكوارث](#استعادة-الكوارث)

---

## نظرة عامة

تحتوي المنصة على نوعين من البيانات تحتاج نسخًا احتياطيًا:

| نوع البيانات | الموقع | الحجم المتوقع |
|-------------|--------|---------------|
| قاعدة البيانات PostgreSQL | `/var/lib/postgresql/data` داخل الحاوية | 10-100 MB |
| الملفات المرفوعة (Excel) | `backend/uploads/` | 1-50 MB |
| ملفات التحليل (JSON) | `backend/uploads/*.parsed.json` | 1-10 MB |

---

## النسخ الاحتياطي لقاعدة البيانات

### الطريقة اليدوية

```bash
# داخل حاوية PostgreSQL أو على الخادم المضيف
docker exec albinaa-postgres pg_dump -U albinaa albinaa > backup_$(date +%Y%m%d_%H%M%S).sql
```

### الطريقة مع Docker Compose

```bash
cd /opt/albinaa-platform
docker compose exec postgres pg_dump -U albinaa albinaa > ./backups/db/backup_$(date +%Y%m%d_%H%M%S).sql
```

### نسخة احتياطية مضغوطة

```bash
docker exec albinaa-postgres pg_dump -U albinaa albinaa | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### استخراج نسخة مضغوطة

```bash
gunzip < backup_20260722_150000.sql.gz | docker exec -i albinaa-postgres psql -U albinaa -d albinaa
```

---

## النسخ الاحتياطي للملفات المرفوعة

### جميع الملفات

```bash
# نسخ uploads/ بالكامل
tar czf uploads_$(date +%Y%m%d_%H%M%S).tar.gz backend/uploads/

# على الخادم
tar czf /opt/albinaa-backups/uploads_$(date +%Y%m%d_%H%M%S).tar.gz /opt/albinaa-platform/backend/uploads/
```

### فقط ملفات Excel الأصلية (بدون ملفات JSON المؤقتة)

```bash
tar czf uploads_excel_$(date +%Y%m%d_%H%M%S).tar.gz \
  --include='*.xlsx' \
  --include='*.xls' \
  backend/uploads/
```

### نسخة احتياطية كاملة (قاعدة + ملفات)

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/albinaa-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

# 1. قاعدة البيانات
docker compose exec postgres pg_dump -U albinaa albinaa \
  | gzip > "$BACKUP_DIR/db/backup_${TIMESTAMP}.sql.gz"

# 2. الملفات المرفوعة
tar czf "$BACKUP_DIR/uploads/uploads_${TIMESTAMP}.tar.gz" \
  -C /opt/albinaa-platform backend/uploads/

# 3. حذف النسخ القديمة (الاحتفاظ بآخر 7 أيام)
find "$BACKUP_DIR/db" -name "*.sql.gz" -mtime +7 -delete
find "$BACKUP_DIR/uploads" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $TIMESTAMP"
```

---

## الاستعادة من النسخة الاحتياطية

### استعادة قاعدة البيانات

```bash
# ⚠️ تحذير: سيؤدي هذا إلى حذف جميع البيانات الحالية
docker compose down
docker compose up -d postgres

# انتظار تشغيل PostgreSQL
sleep 10

# الاستعادة
gunzip < /opt/albinaa-backups/db/backup_20260722_150000.sql.gz \
  | docker exec -i albinaa-postgres psql -U albinaa -d albinaa

# إعادة تشغيل الخدمات
docker compose up -d
```

### استعادة الملفات المرفوعة

```bash
cd /opt/albinaa-platform
tar xzf /opt/albinaa-backups/uploads/uploads_20260722_150000.tar.gz
```

### الاستعادة الكاملة (كوارث)

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/albinaa-backups"
TIMESTAMP=$1  # مثال: 20260722_150000

echo "=== بدء الاستعادة الكاملة: $TIMESTAMP ==="

# 1. إيقاف الخدمات
cd /opt/albinaa-platform
docker compose down

# 2. حذف البيانات القديمة
docker volume rm albinaa-platform_postgres_data

# 3. إعادة التشغيل
docker compose up -d postgres
sleep 15

# 4. استعادة قاعدة البيانات
gunzip < "$BACKUP_DIR/db/backup_${TIMESTAMP}.sql.gz" \
  | docker exec -i albinaa-postgres psql -U albinaa -d albinaa

# 5. استعادة الملفات
tar xzf "$BACKUP_DIR/uploads/uploads_${TIMESTAMP}.tar.gz"

# 6. تشغيل كل شيء
docker compose up -d
sleep 5

# 7. التحقق
curl -sf http://localhost:3000/health || echo "WARNING: Backend not healthy"
echo "=== اكتملت الاستعادة ==="
```

---

## الجدول الزمني للنسخ الاحتياطي التلقائي

### إعداد cron على الخادم المضيف

```bash
# فتح محرر crontab
sudo crontab -e

# إضافة: نسخة يومية الساعة 2:00 صباحًا
0 2 * * * /opt/albinaa-platform/scripts/backup.sh >> /var/log/albinaa-backup.log 2>&1

# إضافة: نسخة كل 6 ساعات
0 */6 * * * /opt/albinaa-platform/scripts/backup.sh >> /var/log/albinaa-backup.log 2>&1
```

### ملف السكربت

```bash
#!/bin/bash
# /opt/albinaa-platform/scripts/backup.sh
set -euo pipefail

BACKUP_DIR="/opt/albinaa-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG="/var/log/albinaa-backup.log"

{
  echo "[$TIMESTAMP] Starting backup..."

  mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

  # Database
  docker exec albinaa-postgres pg_dump -U albinaa albinaa \
    | gzip > "$BACKUP_DIR/db/backup_${TIMESTAMP}.sql.gz"

  # Uploads
  tar czf "$BACKUP_DIR/uploads/uploads_${TIMESTAMP}.tar.gz" \
    -C /opt/albinaa-platform backend/uploads/

  # Cleanup (>7 days)
  find "$BACKUP_DIR/db" -name "*.sql.gz" -mtime +7 -delete 2>/dev/null
  find "$BACKUP_DIR/uploads" -name "*.tar.gz" -mtime +7 -delete 2>/dev/null

  echo "[$TIMESTAMP] Backup completed successfully."
} >> "$LOG" 2>&1
```

```bash
chmod +x /opt/albinaa-platform/scripts/backup.sh
```

---

## التحقق من سلامة النسخة الاحتياطية

### التحقق من ملف SQL

```bash
# فتح الملف والتحقق من البنية
gunzip -t backup_20260722_150000.sql.gz

# عرض أول 20 سطر للتأكد من الصيغة
zcat backup_20260722_150000.sql.gz | head -20
```

### التحقق من الملفات

```bash
tar tzf uploads_20260722_150000.tar.gz | head -20
```

### اختبار الاستعادة على بيئة تجريبية

```bash
# إنشاء قاعدة بيانات مؤقتة للاختبار
docker exec albinaa-postgres createdb -U albinaa albinaa_test

# الاستعادة
gunzip < backup_20260722_150000.sql.gz \
  | docker exec -i albinaa-postgres psql -U albinaa -d albinaa_test

# التحقق من عدد السجلات
docker exec albinaa-postgres psql -U albinaa -d albinaa_test \
  -c "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC"

# حذف قاعدة الاختبار
docker exec albinaa-postgres dropdb -U albinaa albinaa_test
```

---

## استعادة الكوارث

### السيناريو 1: فقدان قاعدة البيانات فقط

```bash
# 1. إيقاف Backend فقط
docker compose stop backend

# 2. إعادة قاعدة البيانات
gunzip < backup_latest.sql.gz \
  | docker exec -i albinaa-postgres psql -U albinaa -d albinaa

# 3. إعادة تشغيل Backend
docker compose start backend
```

### السيناريو 2: فقدان خادم كامل

```bash
# 1. تثبيت Docker و Docker Compose على الخادم الجديد
apt update && apt install -y docker.io docker-compose-plugin

# 2. نسخ ملفات المشروع
scp -r user@old-server:/opt/albinaa-platform /opt/albinaa-platform

# 3. نسخ النسخ الاحتياطية
scp -r user@old-server:/opt/albinaa-backups /opt/albinaa-backups

# 4. تشغيل و استعادة
cd /opt/albinaa-platform
docker compose up -d postgres
sleep 15
gunzip < /opt/albinaa-backups/db/backup_*.sql.gz \
  | docker exec -i albinaa-postgres psql -U albinaa -d albinaa
docker compose up -d
```

### السيناريو 3: ترقية PostgreSQL

```bash
# 1. نسخ احتياطي
docker exec albinaa-postgres pg_dump -U albinaa albinaa | gzip > pre_upgrade.sql.gz

# 2. تعديل Docker Compose: تغيير صورة PostgreSQL
# postgres:16 → postgres:17 (مثلاً)

# 3. تشغيل جديد
docker compose down
docker volume rm albinaa-platform_postgres_data
docker compose up -d postgres
sleep 15

# 4. الاستعادة
gunzip < pre_upgrade.sql.gz \
  | docker exec -i albinaa-postgres psql -U albinaa -d albinaa
```

---

## ملاحظات أمنية

1. **تشفير النسخ الاحتياطية**: استخدم GPG لتشفير الملفات المحفوظة خارج الخادم:
   ```bash
   gpg --symmetric --cipher-algo AES256 backup_*.sql.gz
   ```

2. **نقل آمن**: استخدم SCP أو RSYNC مع SSH للنقل بين الخوادم:
   ```bash
   rsync -avz -e ssh /opt/albinaa-backups/ user@backup-server:/backups/albinaa/
   ```

3. **صلاحيات الملفات**: تأكد من أن النسخ الاحتياطية محمية بصلاحيات مقيدة:
   ```bash
   chmod 600 /opt/albinaa-backups/db/*.sql.gz
   chmod 700 /opt/albinaa-backups/
   ```
