# دليل النشر — Albinaa Platform على Ubuntu مع Docker Compose

**الإصدار:** v0.1.0-alpha
**النظام المُوصى به:** Ubuntu 22.04 LTS أو أعلى
**الإصدار الأدنى من Docker:** 24.0+

---

## المحتويات

1. [المتطلبات المسبقة](#المتطلبات-المسبقة)
2. [تثبيت Docker و Docker Compose](#تثبيت-docker-و-docker-compose)
3. [نسخ المشروع](#نسخ-المشروع)
4. [إعداد متغيرات البيئة](#إعداد-متغيرات-البيئة)
5. [تشغيل النظام](#تشغيل-النظام)
6. [التحقق من التشغيل](#التحقق-من-التشغيل)
7. [إعداد reverse proxy (Nginx)](#إعداد-reverse-proxy-nginx)
8. [إعداد SSL](#إعداد-ssl)
9. [النسخ الاحتياطي التلقائي](#النسخ-الاحتياطي-التلقائي)
10. [الترقية والتحديث](#الترقية-والتحديث)
11. [استكشاف الأخطاء وإصلاحها](#استكشاف-الأخطاء-وإصلاحها)

---

## المتطلبات المسبقة

```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت الأدوات الأساسية
sudo apt install -y curl wget git ufw
```

---

## تثبيت Docker و Docker Compose

### Docker Engine

```bash
# إضافة مستودع Docker الرسمي
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# تشغيل Docker بدون sudo
sudo usermod -aG docker $USER
newgrp docker
```

### التحقق

```bash
docker --version          # Docker version 24.0+
docker compose version    # Docker Compose v2.20+
```

---

## نسخ المشروع

```bash
# من Git (إذا كان المشروع على GitHub)
git clone https://github.com/your-org/albinaa-platform.git /opt/albinaa-platform
cd /opt/albinaa-platform

# أو نسخ يدوي
scp -r albinaa-platform/ user@server:/opt/albinaa-platform
```

---

## إعداد متغيرات البيئة

### 1. ملف `.env` الجذري

```bash
cp .env.example .env
nano .env
```

```env
# قاعدة البيانات
DATABASE_URL=postgresql://albinaa:STRONG_PASSWORD_HERE@postgres:5432/albinaa

# JWT Secrets (غيّرها!)
JWT_SECRET=your-random-64-char-secret-here
JWT_REFRESH_SECRET=your-other-random-64-char-secret-here

# رابط الفرونتенд
NEXT_PUBLIC_APP_URL=https://albinaa.yourdomain.com

# بيئة التشغيل
NODE_ENV=production
```

### 2. ملف `backend/.env`

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://albinaa:STRONG_PASSWORD_HERE@postgres:5432/albinaa
JWT_SECRET=same-as-root
JWT_REFRESH_SECRET=same-as-root
NEXT_PUBLIC_API_URL=http://localhost:3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
```

### 3. ملف `frontend/.env.local`

```bash
cp frontend/.env.example frontend/.env.local
nano frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=https://albinaa.yourdomain.com/api
```

### توليد أسرار عشوائية

```bash
# توليد JWT_SECRET
openssl rand -base64 48

# توليد JWT_REFRESH_SECRET
openssl rand -base64 48

# توليد كلمة مرور قوية للقاعدة
openssl rand -base64 32
```

---

## تشغيل النظام

### بناء وتشغيل جميع الخدمات

```bash
cd /opt/albinaa-platform

# بناء الصور
docker compose build

# تشغيل جميع الخدمات
docker compose up -d

# عرض الحالة
docker compose ps
```

### تطبيق قاعدة البيانات

```bash
# انتظار تشغيل PostgreSQL
docker compose exec postgres pg_isready -U albinaa

# تطبيق Prisma Migrations
docker compose exec backend npx prisma migrate deploy

# (اختياري) تعبئة البيانات الأولية
docker compose exec backend npx prisma db seed
```

### إنشاء مستخدم المدير الأول

```bash
docker compose exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { v4: uuid } = require('uuid');
const prisma = new PrismaClient();
(async () => {
  const hash = await argon2.hash('ChangeMe!2026');
  const org = await prisma.organization.create({ data: { name: 'المنظمة الرئيسية', code: 'MAIN' } });
  const branch = await prisma.branch.create({ data: { name: 'الفرع الرئيسي', code: 'HQ', organizationId: org.id } });
  const role = await prisma.role.create({ data: { name: 'مدير النظام', code: 'admin', isSystem: true, organizationId: org.id, permissions: ['all'] } });
  await prisma.user.create({ data: {
    username: 'admin', fullName: 'مدير النظام', passwordHash: hash,
    roleId: role.id, branchId: branch.id, organizationId: org.id,
    isActive: true, mustChangePassword: true
  }});
  console.log('Admin user created successfully');
})();
"
```

---

## التحقق من التشغيل

```bash
# فحص حالة الخدمات
docker compose ps

# فحص سجلات Backend
docker compose logs backend --tail=20

# فحص صحة Backend
curl -f http://localhost:3000/health

# فحص Frontend
curl -f http://localhost:3001

# فحص PostgreSQL
docker compose exec postgres pg_isready -U albinaa
```

### النتائج المتوقعة

```
NAME              STATUS    PORTS
albinaa-backend   running   0.0.0.0:3000->3000/tcp
albinaa-frontend  running   0.0.0.0:3001->3001/tcp
albinaa-postgres  running   0.0.0.0:5432->5432/tcp
```

---

## إعداد reverse proxy (Nginx)

### تثبيت Nginx

```bash
sudo apt install -y nginx
```

### إعداد الموقع

```bash
sudo nano /etc/nginx/sites-available/albinaa
```

```nginx
upstream backend {
    server 127.0.0.1:3000;
}

upstream frontend {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name albinaa.yourdomain.com;

    client_max_body_size 10M;

    # API → Backend
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /auth/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # باقي الطلبات → Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/albinaa /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## إعداد SSL

```bash
# تثبيت Certbot
sudo apt install -y certbot python3-certbot-nginx

# إعداد شهادة SSL
sudo certbot --nginx -d albinaa.yourdomain.com

# تجديد تلقائي
sudo systemctl enable certbot.timer
```

---

## النسخ الاحتياطي التلقائي

### إعداد السكربت

```bash
mkdir -p /opt/albinaa-backups/{db,uploads}
chmod +x /opt/albinaa-platform/scripts/backup.sh

# إضافة إلى crontab
sudo crontab -e
# الصق:
0 2 * * * /opt/albinaa-platform/scripts/backup.sh
```

### عرض النسخ الاحتياطية

```bash
ls -lh /opt/albinaa-backups/db/
ls -lh /opt/albinaa-backups/uploads/
```

---

## الترقية والتحديث

### تحديث الكود

```bash
cd /opt/albinaa-platform
git pull origin main
```

### إعادة البناء

```bash
# بناء الصور الجديدة
docker compose build

# تطبيق التحديثات
docker compose up -d

# تطبيق تحديثات قاعدة البيانات
docker compose exec backend npx prisma migrate deploy

# التحقق
docker compose ps
curl -f http://localhost:3000/health
```

### الترقية بدون توقف

```bash
# للتحديثات غير الحساسة (كود فقط)
docker compose up -d --no-deps backend frontend

# للتحديثات مع تغيير قاعدة البيانات
docker compose up -d --no-deps postgres
docker compose exec backend npx prisma migrate deploy
docker compose up -d --no-deps backend frontend
```

### التراجع عن الترقية

```bash
# استعادة من النسخة الاحتياطية
cd /opt/albinaa-platform
git checkout v0.1.0-alpha  # أو الإصدار السابق

docker compose build
docker compose up -d
docker compose exec backend npx prisma migrate deploy
```

---

## استكشاف الأخطاء وإصلاحها

### Backend لا يعمل

```bash
# عرض السجلات
docker compose logs backend --tail=50

# إعادة التشغيل
docker compose restart backend

# إعادة البناء الكاملة
docker compose down
docker compose build --no-cache backend
docker compose up -d backend
```

### خطأ في قاعدة البيانات

```bash
# التحقق من PostgreSQL
docker compose exec postgres pg_isready -U albinaa

# التحقق من الاتصال
docker compose exec backend npx prisma db push

# إعادة تطبيق المخطط
docker compose exec backend npx prisma migrate deploy
```

### Frontend لا يتصل بالـ Backend

```bash
# التحقق من عمل API proxy
curl -v http://localhost:3001/api/auth/me

# التحقق من عمل Backend مباشرة
curl -v http://localhost:3000/auth/me
```

### خطأ "relation does not exist"

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma generate
```

### Redis / Cache

```bash
# إذا كان هناك مشكلة في الذاكرة المؤقتة
docker compose exec backend npx prisma db push --force-reset
```

---

## ملاحظات أمنية للإنتاج

1. **غيّر جميع كلمات المرور الافتراضية** قبل النشر
2. **استخدم HTTPS** عبر Let's Encrypt
3. **قيّد الوصول** بجدار حماية (UFW):
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
4. **لا تستخدم** `NODE_ENV=development` في الإنتاج
5. **فعّل تسجيل الأخطاء** في PostgreSQL:
   ```bash
   docker compose exec postgres psql -U albinaa -c "ALTER SYSTEM SET log_statement = 'ddl';"
   ```
6. **راقب الموارد**:
   ```bash
   docker stats
   ```
