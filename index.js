const REPLIT_API = "https://d32ca79a-8423-460b-872a-fac150ad3deb-00-2ty54b8u5mp8w.sisko.replit.dev/api/tiktok";
const TIKWM_API = "https://www.tikwm.com/api/";

const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function tryTikwm(tiktokUrl) {
  const r = await fetch(
    `${TIKWM_API}?url=${encodeURIComponent(tiktokUrl)}&hd=1`,
    { headers: { "User-Agent": BROWSER_UA, Referer: "https://www.tikwm.com/" } }
  );
  const d = await r.json();
  if (d.code === 0 && d.data) {
    const images = d.data.images;
    if (images && images.length > 0) return { images };
    return { videoUrl: d.data.play || d.data.hdplay };
  }
  return null;
}

async function getTikTokVideo(tiktokUrl) {
  // محاولة 1: tikwm مباشرة
  try {
    const res = await tryTikwm(tiktokUrl);
    if (res) return res;
  } catch (_) {}

  // محاولة 2: tikwm مرة ثانية (IP مختلف أحياناً)
  await new Promise((r) => setTimeout(r, 800));
  try {
    const res = await tryTikwm(tiktokUrl);
    if (res) return res;
  } catch (_) {}

  // محاولة 3: عبر API server الخاص
  const r3 = await fetch(`${REPLIT_API}?url=${encodeURIComponent(tiktokUrl)}`, {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
  });
  if (!r3.ok) {
    const err = await r3.json().catch(() => ({}));
    throw new Error(err.error || `فشل الاتصال بالسيرفر (${r3.status})`);
  }
  return await r3.json();
}

async function handleWebhook(request, env) {
  const body = await request.json();
  if (!body.message) return new Response("ok");

  const chatId = body.message.chat.id;
  const text = body.message.text || "";

  const tiktokRegex = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i;
  const match = text.match(tiktokRegex);

  if (!match) {
    if (text.startsWith("/start")) {
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        "أهلاً! 👋\nأرسل لي رابط فيديو أو صور من تيك توك وسأرسله لك بجودة عالية وبدون علامة مائية 🎬🖼️"
      );
    } else {
      await sendMessage(env.BOT_TOKEN, chatId, "❗ أرسل رابط تيك توك صحيح.");
    }
    return new Response("ok");
  }

  const tiktokUrl = match[0];
  const processingMsg = await sendMessage(env.BOT_TOKEN, chatId, "⏳ جارٍ معالجة الرابط...");
  const processingMsgId = processingMsg?.result?.message_id;

  try {
    const result = await getTikTokVideo(tiktokUrl);

    if (result.images && result.images.length > 0) {
      await sendMediaGroup(env.BOT_TOKEN, chatId, result.images);
    } else if (result.videoUrl) {
      await sendVideo(env.BOT_TOKEN, chatId, result.videoUrl);
    } else {
      await sendMessage(env.BOT_TOKEN, chatId, "⚠️ تعذّر استخراج المحتوى.");
    }

    if (processingMsgId) await deleteMessage(env.BOT_TOKEN, chatId, processingMsgId);
  } catch (err) {
    if (processingMsgId) await deleteMessage(env.BOT_TOKEN, chatId, processingMsgId);
    await sendMessage(env.BOT_TOKEN, chatId, `⚠️ ${err.message}`);
  }

  return new Response("ok");
}

async function sendMessage(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return await res.json();
}

async function deleteMessage(token, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

async function sendVideo(token, chatId, fileUrl) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video: fileUrl, supports_streaming: true }),
  });
  const data = await res.json();
  if (!data.ok) {
    await sendMessage(token, chatId, `⚠️ فشل إرسال الفيديو: ${data.description}`);
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

async function setWebhook(request, env) {
  const url = new URL(request.url);
  const workerUrl = `${url.origin}/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: workerUrl }),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/webhook" && request.method === "POST") return handleWebhook(request, env);
    if (url.pathname === "/setup" && request.method === "GET") return setWebhook(request, env);
    return new Response("🤖 بوت تيك توك يعمل بنجاح!", { status: 200 });
  },
};
