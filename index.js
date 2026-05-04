‏const BOT_TOKEN = “8771278577:AAEw5h0DHkCR_axGfg1nvcsLAZnfVghU17w”;
‏const ADMIN_ID = “6042456311”;

‏export default {
‏async fetch(request, env) {
‏const url = new URL(request.url);

```
‏if (url.pathname === "/setup") {
‏  const webhookUrl = `https://${url.hostname}/endpoint`;
‏  const response = await fetch(
‏    `https://api.telegram.org/bot${env.BOT_TOKEN || BOT_TOKEN}/setWebhook?url=${webhookUrl}`
  );
‏  const result = await response.json();
‏  return new Response(JSON.stringify(result), {
‏    headers: { "Content-Type": "application/json" },
  });
}

‏if (url.pathname === "/endpoint" && request.method === "POST") {
‏  try {
‏    const update = await request.json();
‏    if (update.message) {
‏      await handleMessage(update.message, env);
    }
‏  } catch (e) {
‏    console.error("Error:", e);
  }
‏  return new Response("OK");
}

‏return new Response("Bot is running!");
```

},
};

‏async function handleMessage(message, env) {
‏const chatId = message.chat.id;
‏const text = message.text || “”;
‏const userId = message.from.id.toString();
‏const token = env.BOT_TOKEN || BOT_TOKEN;
‏const adminId = env.ADMIN_ID || ADMIN_ID;

‏if (env.USERS_KV) {
‏await updateStats(userId, env.USERS_KV);
}

‏if (text === “/start”) {
‏return await sendMessage(chatId, token, “welcome! send me a tiktok link.”);
}

‏if (text.startsWith(”/admin”) && userId === adminId) {
‏return await sendAdminPanel(chatId, token, env.USERS_KV);
}

‏const tiktokRegex = /https?://(www.|v[tm].)?tiktok.com/[@a-zA-Z0-9._-/]+/g;
‏const match = text.match(tiktokRegex);

‏if (match) {
‏const tiktokUrl = match[0];
‏await sendMessage(chatId, token, “processing…”);

```
‏const data = await fetchVideoData(tiktokUrl);

‏if (!data) {
‏  return await sendMessage(chatId, token, "failed to extract link.");
}

‏if (data.images && data.images.length > 0) {
‏  await sendAlbum(chatId, token, data.images);
‏  if (data.music) {
‏    await sendAudio(chatId, token, data.music, data.musicTitle);
  }
‏  return;
}

‏if (data.urls && data.urls.length > 0) {
‏  if (data.duration > 240) {
‏    const mins = Math.floor(data.duration / 60);
‏    return await sendMessage(chatId, token, "sorry, video is too long (" + mins + " min). Max 4 minutes.");
  }
‏  return await sendVideoWithFallback(chatId, token, data);
}

‏return await sendMessage(chatId, token, "no content found.");
```

}
}

‏async function fetchVideoData(url) {
‏const apis = [
‏“https://api.tikwm.com/api/?url=” + encodeURIComponent(url) + “&hd=1”,
‏“https://www.tikwm.com/api/?url=” + encodeURIComponent(url) + “&hd=1”,
];

‏for (const api of apis) {
‏try {
‏const res = await fetch(api, {
‏headers: {
‏“User-Agent”: “Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36”,
},
});

```
‏  if (!res.ok) continue;

‏  const json = await res.json();
‏  if (json.code !== 0 || !json.data) continue;

‏  const d = json.data;
‏  const images = Array.isArray(d.images) && d.images.length > 0 ? d.images : [];

‏  const urls = [];
‏  if (d.play) urls.push(d.play);
‏  if (d.hdplay) urls.push(d.hdplay);
‏  if (d.wmplay) urls.push(d.wmplay);

‏  if (urls.length === 0 && images.length === 0) continue;

‏  return {
‏    urls: urls,
‏    images: images,
‏    music: d.music || null,
‏    musicTitle: d.music_info && d.music_info.title ? d.music_info.title : "TikTok Audio",
‏    width: d.width || 0,
‏    height: d.height || 0,
‏    duration: d.duration || 0,
  };
‏} catch (e) {
‏  console.error("API failed:", e.message);
}
```

}

‏return null;
}

‏async function sendVideoWithFallback(chatId, token, data) {
‏for (const videoUrl of data.urls) {
‏try {
‏const res = await fetch(“https://api.telegram.org/bot” + token + “/sendDocument”, {
‏method: “POST”,
‏headers: { “Content-Type”: “application/json” },
‏body: JSON.stringify({
‏chat_id: chatId,
‏document: videoUrl,
‏caption: “”,
}),
});

```
‏  const result = await res.json();

‏  if (result.ok) {
‏    return result;
  }

‏  if (result.description && result.description.includes("too large")) {
‏    return await sendMessage(chatId, token, "sorry, video is too large (max 50MB).");
  }

‏  console.error("sendDocument failed:", result.description);
‏} catch (e) {
‏  console.error("sendDocument exception:", e.message);
}
```

}

‏return await sendMessage(chatId, token, “failed to send video.”);
}

‏async function sendAlbum(chatId, token, images) {
‏const media = images.slice(0, 10).map(function(img, i) {
‏const item = { type: “photo”, media: img };
‏if (i === 0) item.caption = “”;
‏return item;
});

‏return fetch(“https://api.telegram.org/bot” + token + “/sendMediaGroup”, {
‏method: “POST”,
‏headers: { “Content-Type”: “application/json” },
‏body: JSON.stringify({ chat_id: chatId, media: media }),
});
}

‏async function sendAudio(chatId, token, audioUrl, title) {
‏const res = await fetch(“https://api.telegram.org/bot” + token + “/sendAudio”, {
‏method: “POST”,
‏headers: { “Content-Type”: “application/json” },
‏body: JSON.stringify({
‏chat_id: chatId,
‏audio: audioUrl,
‏title: title || “TikTok Audio”,
‏caption: “”,
}),
});

‏const result = await res.json();

‏if (!result.ok) {
‏return fetch(“https://api.telegram.org/bot” + token + “/sendVoice”, {
‏method: “POST”,
‏headers: { “Content-Type”: “application/json” },
‏body: JSON.stringify({ chat_id: chatId, voice: audioUrl }),
});
}
}

‏async function sendMessage(chatId, token, text) {
‏return fetch(“https://api.telegram.org/bot” + token + “/sendMessage”, {
‏method: “POST”,
‏headers: { “Content-Type”: “application/json” },
‏body: JSON.stringify({ chat_id: chatId, text: text }),
});
}

‏async function updateStats(userId, kv) {
‏try {
‏const users = JSON.parse((await kv.get(“all_users”)) || “[]”);
‏if (!users.includes(userId)) {
‏users.push(userId);
‏await kv.put(“all_users”, JSON.stringify(users));
}
‏} catch (e) {
‏console.error(“updateStats error:”, e.message);
}
}

‏async function sendAdminPanel(chatId, token, kv) {
‏if (!kv) return sendMessage(chatId, token, “KV not connected.”);
‏const users = JSON.parse((await kv.get(“all_users”)) || “[]”);
‏return sendMessage(chatId, token, “Total users: “ + users.length);
}
