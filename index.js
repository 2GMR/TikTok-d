const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// --- نظام السحب المستقر (Stable Downloader System) ---

async function getTikTokVideo(tiktokUrl) {
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}&hd=1`, {
      headers: { "User-Agent": BROWSER_UA }
    });
    const d = await res.json();
    if (d.code === 0 && d.data) {
      if (d.data.images && d.data.images.length > 0) return { images: d.data.images };
      const videoUrl = d.data.play || d.data.hdplay || d.data.wmplay;
      if (videoUrl) return { videoUrl };
    }
    
    // محاولة مصدر احتياطي
    const backupRes = await fetch(`https://api.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}&hd=1`);
    const backupData = await backupRes.json();
    if (backupData.code === 0 && backupData.data) {
      if (backupData.data.images) return { images: backupData.data.images };
      return { videoUrl: backupData.data.play || backupData.data.hdplay };
    }
  } catch (e) {}
  throw new Error("عذراً، فشل استخراج الفيديو. يرجى التأكد من الرابط أو المحاولة لاحقاً.");
}

// --- إدارة المستخدمين والإحصائيات (Cloudflare KV) ---

async function trackUser(env, userId) {
  if (!env.USERS_KV) return;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const month = today.substring(0, 7);

  const userKey = `user:${userId}`;
  const userExists = await env.USERS_KV.get(userKey);
  if (!userExists) {
    await env.USERS_KV.put(userKey, JSON.stringify({ joined: today }));
    const total = parseInt(await env.USERS_KV.get("stats:total") || "0");
    await env.USERS_KV.put("stats:total", (total + 1).toString());
  }

  await env.USERS_KV.put(`active:day:${today}:${userId}`, "1", { expirationTtl: 172800 });
  await env.USERS_KV.put(`active:month:${month}:${userId}`, "1", { expirationTtl: 2764800 });
}

async function getStats(env) {
  if (!env.USERS_KV) return "⚠️ قاعدة بيانات KV غير مربوطة.";
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const month = today.substring(0, 7);

  const total = await env.USERS_KV.get("stats:total") || "0";
  const dailyList = await env.USERS_KV.list({ prefix: `active:day:${today}:` });
  const monthlyList = await env.USERS_KV.list({ prefix: `active:month:${month}:` });

  return `📊 إحصائيات البوت:
👥 إجمالي المستخدمين: ${total}
📅 نشط اليوم: ${dailyList.keys.length}
🌙 نشط هذا الشهر: ${monthlyList.keys.length}`;
}

// --- معالجة الطلبات (Webhook) ---

async function handleWebhook(request, env) {
  // التحقق من أن الطلب POST ومن المسار الصحيح
  const url = new URL(request.url);
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("OK"); // تجاهل الطلبات غير الصحيحة
  }
  
  if (body.callback_query) return handleCallback(body.callback_query, env);
  if (!body.message) return new Response("OK");

  const chatId = body.message.chat.id;
  const userId = body.message.from.id;
  const text = body.message.text || "";
  const isAdmin = userId.toString() === env.ADMIN_ID;

  await trackUser(env, userId);

  // أوامر المدير
  if (text.startsWith("/admin") && isAdmin) {
    const stats = await getStats(env);
    await sendMessage(env.BOT_TOKEN, chatId, `${stats}\n\n🛠️ لوحة التحكم:\n/broadcast [الرسالة]\n/send [ID] [الرسالة]`);
    return new Response("OK");
  }

  if (text.startsWith("/broadcast ") && isAdmin) {
    const msg = text.replace("/broadcast ", "");
    await sendConfirm(env, chatId, "broadcast", null, msg);
    return new Response("OK");
  }

  if (text.startsWith("/send ") && isAdmin) {
    const parts = text.split(" ");
    if (parts.length < 3) return new Response("OK");
    const targetId = parts[1];
    const msg = parts.slice(2).join(" ");
    await sendConfirm(env, chatId, "private", targetId, msg);
    return new Response("OK");
  }

  // معالجة روابط تيك توك
  const tiktokRegex = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i;
  const match = text.match(tiktokRegex);

  if (!match) {
    if (text.startsWith("/start")) {
      await sendMessage(env.BOT_TOKEN, chatId, "أهلاً بك! 👋\nأرسل لي رابط فيديو تيك توك وسأرسله لك بجودة عالية وبدون علامة مائية.");
    }
    return new Response("OK");
  }

  const tiktokUrl = match[0];
  const processing = await sendMessage(env.BOT_TOKEN, chatId, "⏳ جارٍ التحميل...");
  const procId = processing?.result?.message_id;

  try {
    const result = await getTikTokVideo(tiktokUrl);
    if (result.images) {
      await sendMediaGroup(env.BOT_TOKEN, chatId, result.images);
    } else if (result.videoUrl) {
      await sendDocument(env.BOT_TOKEN, chatId, result.videoUrl);
    }
    if (procId) await deleteMessage(env.BOT_TOKEN, chatId, procId);
  } catch (err) {
    if (procId) await deleteMessage(env.BOT_TOKEN, chatId, procId);
    await sendMessage(env.BOT_TOKEN, chatId, `⚠️ ${err.message}`);
  }

  return new Response("OK");
}

// --- نظام التأكيد والإرسال ---

async function sendConfirm(env, chatId, type, targetId, msg) {
  if (env.USERS_KV) await env.USERS_KV.put(`temp_msg:${chatId}`, msg, { expirationTtl: 600 });
  await sendMessage(env.BOT_TOKEN, chatId, `❓ هل أنت متأكد من إرسال الرسالة التالية؟\n\n"${msg}"`, {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ تأكيد", callback_data: `conf:yes:${type}:${targetId || '0'}` },
        { text: "❌ إلغاء", callback_data: `conf:no` }
      ]]
    }
  });
}

async function handleCallback(query, env) {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "conf:no") {
    await editMessage(env.BOT_TOKEN, chatId, query.message.message_id, "❌ تم إلغاء الإرسال.");
    return new Response("OK");
  }

  if (data.startsWith("conf:yes:")) {
    const parts = data.split(":");
    const type = parts[2];
    const targetId = parts[3];
    const msg = await env.USERS_KV.get(`temp_msg:${chatId}`);

    if (!msg) {
      await editMessage(env.BOT_TOKEN, chatId, query.message.message_id, "⚠️ انتهت صلاحية الجلسة.");
      return new Response("OK");
    }

    await editMessage(env.BOT_TOKEN, chatId, query.message.message_id, "🚀 جارٍ الإرسال...");

    if (type === "private") {
      const res = await sendMessage(env.BOT_TOKEN, targetId, msg);
      await sendMessage(env.BOT_TOKEN, chatId, res.ok ? "✅ تم الإرسال بنجاح." : `❌ فشل الإرسال: ${res.description}`);
    } else if (type === "broadcast") {
      const users = await env.USERS_KV.list({ prefix: "user:" });
      let count = 0;
      for (const key of users.keys) {
        const uid = key.name.split(":")[1];
        await sendMessage(env.BOT_TOKEN, uid, msg);
        count++;
        if (count % 25 === 0) await new Promise(r => setTimeout(r, 1000));
      }
      await sendMessage(env.BOT_TOKEN, chatId, `✅ تم إرسال الإذاعة لـ ${count} مستخدم.`);
    }
  }
  return new Response("OK");
}

// --- دوال Telegram API ---

async function sendMessage(token, chatId, text, extra = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  return await res.json();
}

async function editMessage(token, chatId, messageId, text) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
}

async function deleteMessage(token, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

async function sendDocument(token, chatId, fileUrl) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, document: fileUrl }),
  });
  const data = await res.json();
  if (!data.ok) {
    await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, video: fileUrl }),
    });
  }
}

async function sendMediaGroup(token, chatId, images) {
  const media = images.map((url) => ({ type: "photo", media: url }));
  await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, media }),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // مسار الـ Webhook يجب أن يكون /webhook
    if (url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }
    // مسار الإعداد
    if (url.pathname === "/setup") {
      const workerUrl = `${url.origin}/webhook`;
      const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${workerUrl}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("Bot is running!");
  },
};
