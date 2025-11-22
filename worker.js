export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const PARAM_KEY = "v"; 
    
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";

    // 1. PROXY LOGIC
    const targetUrl = url.searchParams.get(PARAM_KEY);
    if (targetUrl) {
      const newHeaders = new Headers(request.headers);
      newHeaders.set("User-Agent", "CF-Worker-Proxy");

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: newHeaders,
          redirect: "follow"
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Cache-Control", "public, max-age=14400"); 

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      } catch (err) {
        return new Response("Error fetching content", { status: 500 });
      }
    }

    // 2. AUTHENTICATION
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + ADMIN_PASSWORD)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' }
      });
    }

    // 3. ADMIN UI
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Link Generator</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f0f2f5; }
          input, button { width: 100%; padding: 12px; margin-bottom: 10px; box-sizing: border-box; }
          button { background: #007bff; color: white; border: none; border-radius: 5px; }
        </style>
      </head>
      <body>
          <h3>Worker Link Generator</h3>
          <input type="url" id="r2" placeholder="Original R2 Link">
          <button onclick="gen()">Generate Proxy Link</button>
          <input type="text" id="out" readonly onclick="this.select()">
          
        <script>
          function gen() {
            const r2 = document.getElementById('r2').value.trim();
            if(!r2) return;
            const finalUrl = window.location.origin + "/?${PARAM_KEY}=" + r2;
            document.getElementById('out').value = finalUrl;
          }
        </script>
      </body>
      </html>`;

    return new Response(html, { headers: { "content-type": "text/html" } });
  }
};
