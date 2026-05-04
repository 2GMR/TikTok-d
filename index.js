const BOT_TOKEN = '8771278577:AAEw5h0DHkCR_axGfg1nvcsLAZnfVghU17w';
const ADMIN_ID = '6042456311';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/setup') {
      const webhookUrl = `https://${url.hostname}/endpoint`;
      const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN || BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
      const result = await response.json();
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/endpoint' && request.method === 'POST') {
      try {
        const update = await request.json();
        if (update.message) {
          await handleMessage(update.message, env);
        }
      } catch (e) {
        console.error('Error handling update:', e);
      }
      return new Response('OK');
    }

    return new Response('Bot is running with Enhanced Video & Audio Support!');
  }
};

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const userId = message.from.id.toString();
  const token = env.BOT_TOKEN || BOT_TOKEN;
  const adminId = env.ADMIN_ID || ADMIN_ID;

  if (env.USERS_KV) {
    await updateStats(userId, env.USERS_KV);
  }

  if (text.startsWith('/admin') && userId === adminId) {
    return await sendAdminPanel(chatId, token, env.USERS_KV);
  }

  const tiktokRegex = /https?:\/\/(www\.|v[tm]\.)?tiktok\.com\/[@a-zA-Z0-9._\/-]+/g;
  const match = text.match(tiktokRegex);

  if (match) {
    const videoUrl = match[0];
    const videoData = await fetchVideoData(videoUrl);
    
    if (videoData) {
      // إذا كان المنشور عبارة عن صور (Slideshow)
      if (videoData.images && videoData.images.length > 0) {
        await sendAlbum(chatId, token, videoData.images);
        if (videoData.music) {
          // إرسال الصوت بشكل "Voice Note" ليكون شكله مختلفاً وأكثر سلاسة
          await sendVoice(chatId, token, videoData.music);
        }
        return;
      } 
      
      // إذا كان فيديو عادي
      if (videoData.url) {
        // استخدام sendDocument بدلاً من sendVideo لحل مشكلة الشاشة السوداء والتقطيع في بعض الأجهزة
        // ولضمان وصول الملف الخام بأعلى جودة دون معالجة من تيليجرام
        return await sendVideoFile(chatId, token, videoData.url);
      }
    }
    
    return await sendMessage(chatId, token, '⚠️ عذراً، فشل استخراج المحتوى.');
  }

  if (text === '/start') {
    return await sendMessage(chatId, token, 'أهلاً بك! 👋\nأرسل لي رابط تيك توك وسأرسله لك بأعلى جودة وبدون تقطيع.');
  }
}

async function fetchVideoData(url) {
  // استخدام عدة مصادر لضمان جلب أفضل نسخة
  const apis = [
    `https://api.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`
  ];

  for (const api of apis) {
    try {
      const res = await fetch(api, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      const data = await res.json();
      
      if (data.code === 0 && data.data) {
        return {
          // نفضل دائماً نسخة الـ HD لحل مشاكل الجودة
          url: data.data.hdplay || data.data.play || data.data.wmplay,
          images: data.data.images || [],
          music: data.data.music
        };
      }
    } catch (e) {
      console.error(`API ${api} failed:`, e);
    }
  }
  return null;
}

async function sendMessage(chatId, token, text) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

async function sendVideoFile(chatId, token, videoUrl) {
  // إرسال الفيديو كـ Document هو الحل الجذري لمشكلة الشاشة السوداء والتقطيع
  // لأنه يجبر تيليجرام على تحميل الملف كما هو دون محاولة "ترميزه" مجدداً
  return fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: videoUrl,
      caption: ''
    })
  });
}

async function sendAlbum(chatId, token, images) {
  const media = images.slice(0, 10).map(img => ({
    type: 'photo',
    media: img,
    caption: ''
  }));

  return fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      media: media
    })
  });
}

async function sendVoice(chatId, token, audioUrl) {
  // إرسال الصوت كـ Voice Note يعطي شكلاً مختلفاً ومميزاً (الرسالة الصوتية)
  return fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      voice: audioUrl,
      caption: ''
    })
  });
}

async function updateStats(userId, kv) {
  let users = await kv.get('all_users') || '[]';
  let usersList = JSON.parse(users);
  if (!usersList.includes(userId)) {
    usersList.push(userId);
    await kv.put('all_users', JSON.stringify(usersList));
  }
}

async function sendAdminPanel(chatId, token, kv) {
  if (!kv) return await sendMessage(chatId, token, '⚠️ قاعدة البيانات غير مرتبطة.');
  const users = JSON.parse(await kv.get('all_users') || '[]');
  return await sendMessage(chatId, token, `📊 إجمالي المستخدمين: ${users.length}`);
}
