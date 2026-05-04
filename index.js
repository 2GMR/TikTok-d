const BOT_TOKEN = ‘8771278577:AAEw5h0DHkCR_axGfg1nvcsLAZnfVghU17w’;
const ADMIN_ID = ‘6042456311’;

export default {
async fetch(request, env) {
const url = new URL(request.url);

```
if (url.pathname === '/setup') {
  const webhookUrl = `https://${url.hostname}/endpoint`;
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN || BOT_TOKEN}/setWebhook?url=${webhookUrl}`
  );
  const result = await response.json();
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}

if (url.pathname === '/endpoint' && request.method === 'POST') {
  try {
    const update = await request.json();
    if (update.message) {
      await handleMessage(update.message, env);
    }
  } catch (e) {
    console.error('Error:', e);
  }
  return new Response('OK');
}

return new Response('Bot is running!');
```

},
};

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
async function handleMessage(message, env) {
const chatId = message.chat.id;
const text = message.text || ‘’;
const userId = message.from.id.toString();
const token = env.BOT_TOKEN || BOT_TOKEN;
const adminId = env.ADMIN_ID || ADMIN_ID;

if (env.USERS_KV) {
await updateStats(userId, env.USERS_KV);
}

if (text === ‘/start’) {
return await sendMessage(
chatId, token,
‘أهلاً بك! 👋\nأرسل لي رابط تيك توك وسأرسله لك فوراً بدون علامة مائية.’
);
}

if (text.startsWith(’/admin’) && userId === adminId) {
return await sendAdminPanel(chatId, token, env.USERS_KV);
}

const tiktokRegex = /https?://(www.|v[tm].)?tiktok.com/[@a-zA-Z0-9._-/]+/g;
const match = text.match(tiktokRegex);

if (match) {
const tiktokUrl = match[0];

```
await sendMessage(chatId, token, '⏳ جاري المعالجة...');

// جلب بيانات الفيديو (الرابط المباشر فقط من tikwm)
const data = await fetchVideoData(tiktokUrl);

if (!data) {
  return await sendMessage(chatId, token, '⚠️ فشل استخراج الرابط، تأكد من الرابط وحاول مجدداً.');
}

// ── صور Slideshow ──
if (data.images && data.images.length > 0) {
  await sendAlbum(chatId, token, data.images);
  if (data.music) {
    await sendAudio(chatId, token, data.music, data.musicTitle);
  }
  return;
}

// ── فيديو: تيليجرام يسحب الرابط مباشرة من تيك توك ──
if (data.url) {
  return await sendVideoByUrl(chatId, token, data);
}

return await sendMessage(chatId, token, '⚠️ لم يتم العثور على محتوى.');
```

}
}

// ─────────────────────────────────────────────
// جلب الرابط المباشر من tikwm فقط (بدون تحميل)
// ─────────────────────────────────────────────
async function fetchVideoData(url) {
const apis = [
`https://api.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
];

for (const api of apis) {
try {
const res = await fetch(api, {
headers: {
‘User-Agent’: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36’,
},
});

```
  if (!res.ok) continue;

  const json = await res.json();

  if (json.code !== 0 || !json.data) continue;

  const d = json.data;

  // نفضل hdplay ثم play — نتجنب wmplay (فيه علامة مائية)
  const videoUrl = d.hdplay || d.play || null;

  const images = Array.isArray(d.images) && d.images.length > 0 ? d.images : [];

  if (!videoUrl && images.length === 0) continue;

  return {
    url: videoUrl,
    images,
    music: d.music || null,
    musicTitle: d.music_info?.title || 'TikTok Audio',
    width: d.width || 0,
    height: d.height || 0,
    duration: d.duration || 0,
  };
} catch (e) {
  console.error(`API failed: ${api}`, e.message);
}
```

}

return null;
}

// ─────────────────────────────────────────────
// إرسال الفيديو — تيليجرام يسحب الرابط مباشرة
// ─────────────────────────────────────────────
async function sendVideoByUrl(chatId, token, data) {
/*

- نمرر الرابط المباشر لتيليجرام عبر sendVideo.
- تيليجرام سيتصل بخوادم tikwm مباشرة ويسحب الفيديو بنفسه.
- Cloudflare لا تلمس الفيديو إطلاقاً.
- 
- supports_streaming: true  يضمن تشغيل الفيديو inline بدون تقطيع.
- width / height / duration يساعد تيليجرام على عرض الفيديو بشكل صحيح.
  */
  const body = {
  chat_id: chatId,
  video: data.url,
  supports_streaming: true,
  caption: ‘’,
  };

if (data.width)    body.width    = data.width;
if (data.height)   body.height   = data.height;
if (data.duration) body.duration = data.duration;

const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify(body),
});

const result = await res.json();

// إذا رفض تيليجرام الرابط (مثلاً انتهت صلاحيته)
if (!result.ok) {
console.error(‘sendVideo failed:’, result.description);
return await sendMessage(
chatId, token,
`⚠️ تعذّر إرسال الفيديو.\nالسبب: ${result.description || 'خطأ غير معروف'}`
);
}

return result;
}

// ─────────────────────────────────────────────
// إرسال ألبوم الصور
// ─────────────────────────────────────────────
async function sendAlbum(chatId, token, images) {
const media = images.slice(0, 10).map((img, i) => ({
type: ‘photo’,
media: img,
…(i === 0 ? { caption: ‘’ } : {}),
}));

return fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({ chat_id: chatId, media }),
});
}

// ─────────────────────────────────────────────
// إرسال الصوت
// ─────────────────────────────────────────────
async function sendAudio(chatId, token, audioUrl, title = ‘TikTok Audio’) {
const res = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({
chat_id: chatId,
audio: audioUrl,
title,
caption: ‘’,
}),
});

const result = await res.json();

// fallback إلى voice إذا فشل sendAudio
if (!result.ok) {
return fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({ chat_id: chatId, voice: audioUrl }),
});
}
}

// ─────────────────────────────────────────────
// رسالة نصية
// ─────────────────────────────────────────────
async function sendMessage(chatId, token, text) {
return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({ chat_id: chatId, text }),
});
}

// ─────────────────────────────────────────────
// إحصائيات
// ─────────────────────────────────────────────
async function updateStats(userId, kv) {
try {
const users = JSON.parse((await kv.get(‘all_users’)) || ‘[]’);
if (!users.includes(userId)) {
users.push(userId);
await kv.put(‘all_users’, JSON.stringify(users));
}
} catch (e) {
console.error(‘updateStats error:’, e.message);
}
}

// ─────────────────────────────────────────────
// لوحة المشرف
// ─────────────────────────────────────────────
async function sendAdminPanel(chatId, token, kv) {
if (!kv) return sendMessage(chatId, token, ‘⚠️ قاعدة البيانات غير مرتبطة.’);
const users = JSON.parse((await kv.get(‘all_users’)) || ‘[]’);
return sendMessage(
chatId, token,
`📊 لوحة الإدارة\n━━━━━━━━━━━━━\n👥 إجمالي المستخدمين: ${users.length}`
);
}
