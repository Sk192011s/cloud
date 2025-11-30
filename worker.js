// Cloudflare Worker Code (Qyun Login Proxy)
export default {
  async fetch(req) {
    // CORS Headers (Deno က လှမ်းခေါ်ရင် လက်ခံဖို့)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const { targetUrl, cookie, formData: data } = await req.json();

      // Form Data ပြန်ဖွဲ့စည်းမယ်
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
      return new Response(text, {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders });
    }
  }
};
