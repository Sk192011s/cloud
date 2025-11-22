export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CONFIGURATION
    const PARAM_KEY = "download"; 
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";

    // 1. PROXY LOGIC (Flexible: handles any URL in ?v=)
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
        responseHeaders.set("Cache-Control", "public, max-age=14400"); // 4 hours cache

        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders
        });
      } catch (err) {
        return new Response("Error fetching content", { status: 500 });
      }
    }

    // 2. AUTH CHECK
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + ADMIN_PASSWORD)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' }
      });
    }

    // 3. GENERATOR UI (With Copy Button)
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Flexible Generator</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
          input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
          button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; font-weight: bold; margin-top: 5px; }
          .copy-btn { background: #28a745; margin-top: 5px; }
        </style>
      </head>
      <body>
          <h3>Flexible Proxy Link Generator</h3>
          <label>Original URL (R2 or External)</label>
          <input type="url" id="r2" placeholder="https://pub-xxx.r2.dev/video.mp4">
          <button onclick="gen()">Generate Link</button>
          
          <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px;">
            <label>Proxy Result:</label>
            <input type="text" id="out" readonly onclick="this.select()">
            <button class="copy-btn" onclick="copyLink()">Copy Link</button>
          </div>

        <script>
          function gen() {
            const r2 = document.getElementById('r2').value.trim();
            if(!r2) return;
            
            const origin = window.location.origin;
            const param = "${PARAM_KEY}";
            const finalUrl = \`\${origin}/?\${param}=\${r2}\`;
            
            document.getElementById('out').value = finalUrl;
          }

          function copyLink() {
            const copyText = document.getElementById("out");
            if (!copyText.value) return;
            copyText.select();
            copyText.setSelectionRange(0, 99999);
            navigator.clipboard.writeText(copyText.value).then(() => alert("Copied to clipboard!"));
          }
        </script>
      </body>
      </html>`;

    return new Response(html, { headers: { "content-type": "text/html" } });
  }
};
