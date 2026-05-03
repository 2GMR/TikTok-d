const API_SERVER = "https://d32ca79a-8423-460b-872a-fac150ad3deb-00-2ty54b8u5mp8w.sisko.replit.dev/api/tiktok";

async function getTikTokVideo(tiktokUrl) {
  const res = await fetch(`${API_SERVER}?url=${encodeURIComponent(tiktokUrl)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return await res.json();
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
        "أهلاً! 👋\nأرسل لي رابط فيديو أو صورة تيك توك وسأرسله لك بجودة أصلية وبدون علامة مائية 🎬🖼️"
      );
    } else {
      await sendMessage(env.BOT_TOKEN, chatId, "❗ يرجى إرسال رابط تيك توك صحيح.");
    }
    return new Response("ok");
  }

  const tiktokUrl = match[0];
  await sendMessage(env.BOT_TOKEN, chatId, "⏳ جارٍ معالجة الرابط...");

  try {
    const result = await getTikTokVideo(tiktokUrl);

    if (result.images && result.images.length > 0) {
      await sendMediaGroup(env.BOT_TOKEN, chatId, result.images);
    } else if (result.videoUrl) {
      await sendVideo(env.BOT_TOKEN, chatId, result.videoUrl);
    } else {
      await sendMessage(env.BOT_TOKEN, chatId, "⚠️ تعذّر استخراج المحتوى.");
    }
  } catch (err) {
    await sendMessage(env.BOT_TOKEN, chatId, `⚠️ ${err.message}`);
  }

  return new Response("ok");
}

async function sendMessage(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function sendVideo(token, chatId, fileUrl) {
  await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, video: fileUrl }),
  });
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

    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }
    if (url.pathname === "/setup" && request.method === "GET") {
      return setWebhook(request, env);
    }

    return new Response("🤖 بوت تيك توك يعمل بنجاح!", { status: 200 });
  },
};
