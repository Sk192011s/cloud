// Cloudflare Worker Code (Login Proxy)
export default {
  async fetch(req) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight check
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    try {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: cors });
      }

      // Deno ဆီက Data လက်ခံမယ်
      const { targetUrl, cookie, formData: data } = await req.json();

      if (!targetUrl || !cookie) {
        return new Response(JSON.stringify({ error: "Missing params" }), { headers: cors });
      }

      const form = new FormData();
      for (const key in data) {
        form.append(key, data[key]);
      }

      // Qyun ဆီကို Cloudflare IP သုံးပြီး လှမ်းပို့မယ်
      const qyunRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Cookie": cookie,
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
          "Referer": "https://qyun.org/files.html",
          "Origin": "https://qyun.org",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: form
      });

      const text = await qyunRes.text();
      
      // Qyun အဖြေကို Deno ဆီ ပြန်ပို့မယ်
      return new Response(text, {
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: cors });
    }
  }
};
