// Cloudflare Worker (Auto Login & Policy Fetcher)
export default {
  async fetch(req) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      const { email, password, filename, size } = await req.json();

      // 1. Login to Qyun
      const loginRes = await fetch("https://qyun.org/api/v1/user/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: email, Password: password })
      });

      const loginData = await loginRes.json();
      if (loginData.code !== 0) throw new Error("Login Failed: " + loginData.msg);

      // Get Cookie from Login Response
      let cookie = loginRes.headers.get("set-cookie");
      if (!cookie) throw new Error("No cookie received");

      // 2. Request Upload Policy (Channel 2 = bucketId: 1)
      // We use the 'files.html' endpoint logic to be safe
      const form = new FormData();
      form.append("name", filename);
      form.append("size", size);
      form.append("type", "video/mp4");
      form.append("bucketId", "1"); // Channel 2
      
      const date = new Date().toISOString().slice(0,10).replace(/-/g,'/'); 
      const key = `upload/${date}/${crypto.randomUUID()}_${filename}`;
      form.append("key", key);

      const policyRes = await fetch("https://qyun.org/files.html?folderId=", {
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

      const policyText = await policyRes.text();
      // Return the Policy JSON back to Deno
      return new Response(policyText, { headers: { ...cors, "Content-Type": "application/json" } });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { headers: cors });
    }
  }
};
