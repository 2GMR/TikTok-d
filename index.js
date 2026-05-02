const TIKWM_API = "https://www.tikwm.com/api/";

async function handleWebhook(request, env) {
  const body = await request.json();

  if (!body.message) return new Response("ok");

  const chatId = body.message.chat.id;
  const text = body.message.text || "";

  const tiktokRegex =
    /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/i;
  const match = text.match(tiktokRegex);

  if (!match) {
    if (text.startsWith("/start")) {
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        "أهلاً! 👋\nأرسل لي رابط فيديو تيك توك وسأرسله لك بجودة أصلية وبدون علامة مائية 🎬"
      );
    } else {
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        "❗ يرجى إرسال رابط فيديو تيك توك صحيح."
      );
    }
    return new Response("ok");
  }

  const tiktokUrl = match[0];

  await sendMessage(env.BOT_TOKEN, chatId, "⏳ جارٍ معالجة الرابط...");

  try {
    const apiRes = await fetch(
      `${TIKWM_API}?url=${encodeURIComponent(tiktokUrl)}&hd=1`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          "Accept": "application/json",
          "Referer": "https://www.tikwm.com/",
        },
      }
    );

    const apiData = await apiRes.json();

    if (!apiData || apiData.code !== 0 || !apiData.data) {
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        `⚠️ فشل استخراج الفيديو.\nالكود: ${apiData?.code}\nالرسالة: ${apiData?.msg}`
      );
      return new Response("ok");
    }

    const video = apiData.data;
    const videoUrl = video.hdplay || video.play;
    const caption =
      (video.title ? `📝 ${video.title}\n` : "") +
      `👤 ${video.author?.nickname || ""}`;

    await sendDocument(env.BOT_TOKEN, chatId, videoUrl, caption);
  } catch (err) {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `❌ خطأ: ${err.message}`
    );
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

async function sendDocument(token, chatId, fileUrl, caption) {
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      caption,
    }),
  });
}

async function setWebhook(request, env) {
  const url = new URL(request.url);
  const workerUrl = `${url.origin}/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: workerUrl }),
    }
  );
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
