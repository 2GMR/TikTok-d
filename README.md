# بوت تيليجرام لتحميل فيديوهات تيك توك 🎬

بوت مجاني بالكامل يعمل على Cloudflare Workers ويتحدث تلقائياً من GitHub.

---

## 📁 هيكل الملفات

```
├── index.js                         ← كود البوت
├── wrangler.toml                    ← إعدادات Cloudflare
└── .github/
    └── workflows/
        └── deploy.yml               ← النشر التلقائي من GitHub
```

---

## 🚀 خطوات الإعداد

### 1. رفع الكود على GitHub
- أنشئ مستودعاً (Repository) جديداً على GitHub
- ارفع جميع الملفات إليه

### 2. ربط GitHub بـ Cloudflare
- ادخل إلى [dash.cloudflare.com](https://dash.cloudflare.com)
- اختر **Workers & Pages** ← **Create**
- اختر **Connect to Git** واختر مستودعك من GitHub

### 3. إضافة الأسرار (Secrets) في GitHub
اذهب إلى مستودعك على GitHub ← **Settings** ← **Secrets and variables** ← **Actions** وأضف:

| الاسم | القيمة |
|-------|--------|
| `CF_API_TOKEN` | توكن Cloudflare API (من [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)) |
| `BOT_TOKEN` | توكن البوت من @BotFather |

> لإنشاء `CF_API_TOKEN`: اذهب إلى Cloudflare ← **My Profile** ← **API Tokens** ← **Create Token** ← اختر **Edit Cloudflare Workers**

### 4. تفعيل الـ Webhook
بعد أول نشر ناجح، افتح المتصفح وادخل على:
```
https://اسم-الـ-worker.اسم-المستخدم.workers.dev/setup
```
سيربط هذا البوت بتيليجرام تلقائياً.

---

## ⚙️ كيف يعمل البوت؟

1. المستخدم يرسل رابط تيك توك
2. البوت يستخرج الفيديو عبر [tikwm.com](https://tikwm.com)
3. يرسله كـ Document بجودة أصلية 100% وبدون علامة مائية

---

## 🔄 التحديث التلقائي

أي تعديل ترفعه على GitHub ← سيتحدث البوت تلقائياً في ثوانٍ.
