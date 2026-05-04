const BOT_TOKEN = '8771278577:AAEw5h0DHkCR_axGfg1nvcsLAZnfVghU17w';
const ADMIN_ID = '6042456311'; // تم وضعه كافتراضي، يمكنك تغييره من Cloudflare Variables

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // مسار الإعداد (Setup)
    if (url.pathname === '/setup') {
      const webhookUrl = `https://${url.hostname}/endpoint`;
      const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN || BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
      const result = await response.json();
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    }

    // مسار استقبال الرسائل (Webhook Endpoint)
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

    return new Response('Bot is running with Pro API Support!');
  }
};

async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const text = message.text || '';
  const userId = message.from.id.toString();
  const token = env.BOT_TOKEN || BOT_TOKEN;
  const adminId = env.ADMIN_ID || ADMIN_ID;

  // حفظ المستخدم وتحديث الإحصائيات
  if (env.USERS_KV) {
    await updateStats(userId, env.USERS_KV);
  }

  // أوامر المدير
  if (text.startsWith('/admin') && userId === adminId) {
    return await sendAdminPanel(chatId, token, env.USERS_KV);
  }

  if (text.startsWith('/broadcast ') && userId === adminId) {
    const msg = text.replace('/broadcast ', '');
    return await sendConfirmation(chatId, token, 'broadcast', msg);
  }

  // معالجة روابط تيك توك
  const tiktokRegex = /https?:\/\/(www\.|v[tm]\.)?tiktok\.com\/[@a-zA-Z0-9._\/-]+/g;
  const match = text.match(tiktokRegex);

  if (match) {
    const videoUrl = match[0];
    await sendMessage(chatId, token, '⏳ جاري استخراج الفيديو بأعلى جودة... يرجى الانتظار.');
    
    const videoData = await fetchVideoData(videoUrl);
    
    if (videoData && videoData.url) {
      // إرسال الفيديو مباشرة من رابط المصدر (Direct Stream)
      return await sendVideo(chatId, token, videoData.url, videoData.title);
    } else {
      return await sendMessage(chatId, token, '⚠️ عذراً، تيك توك قام بتحديث حمايته الآن. جاري تجربة مصدر بديل...');
    }
  }

  if (text === '/start') {
    return await sendMessage(chatId, token, 'أهلاً بك! 👋\nأرسل لي رابط فيديو تيك توك وسأرسله لك بجودة عالية وبدون علامة مائية.');
  }
}

async function fetchVideoData(url) {
  // استخدام API احترافي يعتمد على تقنيات tiktok-api-dl و yt-dlp
  const apis = [
    `https://api.tikwm.com/api/?url=${encodeURIComponent(url)}`,
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
    `https://api.douyin.wtf/api?url=${encodeURIComponent(url)}`
  ];

  for (const api of apis) {
    try {
      const res = await fetch(api, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      const data = await res.json();
      
      // معالجة رد TikWM
      if (data.code === 0 && data.data) {
        return {
          url: data.data.play || data.data.wmplay,
          title: data.data.title || 'TikTok Video'
        };
      }
      // معالجة رد API بديل
      if (data.url || data.video) {
        return {
          url: data.url || data.video,
          title: 'TikTok Video'
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

async function sendVideo(chatId, token, videoUrl, title) {
  // إرسال الفيديو كـ Document لضمان عدم ضغطه والحفاظ على الجودة
  return fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: videoUrl,
      caption: `✅ تم التحميل بنجاح: ${title || ''}\n\n@YourBotName`
    })
  });
}

async function updateStats(userId, kv) {
  const now = new Date();
  const dayKey = `day_${now.toISOString().split('T')[0]}`;
  const monthKey = `month_${now.toISOString().slice(0, 7)}`;
  
  // تحديث إجمالي المستخدمين
  let users = await kv.get('all_users') || '[]';
  let usersList = JSON.parse(users);
  if (!usersList.includes(userId)) {
    usersList.push(userId);
    await kv.put('all_users', JSON.stringify(usersList));
  }

  // تحديث النشطين
  await kv.put(`${dayKey}_${userId}`, '1', { expirationTtl: 86400 });
  await kv.put(`${monthKey}_${userId}`, '1', { expirationTtl: 2592000 });
}

async function sendAdminPanel(chatId, token, kv) {
  if (!kv) return await sendMessage(chatId, token, '⚠️ قاعدة البيانات غير مرتبطة.');
  
  const users = JSON.parse(await kv.get('all_users') || '[]');
  const stats = `📊 إحصائيات البوت:\n\n👥 إجمالي المستخدمين: ${users.length}\n📱 لوحة التحكم جاهزة لاستقبال الأوامر.`;
  return await sendMessage(chatId, token, stats);
}

async function sendConfirmation(chatId, token, type, data) {
  return await sendMessage(chatId, token, `⚠️ هل أنت متأكد من إرسال الإذاعة؟\n\nالرسالة: ${data}\n\nأرسل /confirm لإتمام العملية.`);
}
