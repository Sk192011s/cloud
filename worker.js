export default {
  // Add 'ctx' parameter to the fetch function to access Caching API
  async fetch(request, env, ctx) { 
    const url = new URL(request.url);
    
    // CONFIGURATION
    const PARAM_KEY = "download"; 
    const DOWNLOAD_FLAG = "dl"; 
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "Soekyawwin@93";

    // 1. PROXY LOGIC (Handles Stream OR Download)
    const targetUrl = url.searchParams.get(PARAM_KEY);
    const shouldDownload = url.searchParams.get(DOWNLOAD_FLAG) === "true"; 
    
    if (targetUrl) {
      const cache = caches.default;
      let response = await cache.match(request); // Check if file is already in Cloudflare Cache

      if (!response) {
          // Cache Miss: Must fetch from origin (R2/External Server)
          const newHeaders = new Headers(request.headers);
          newHeaders.set("User-Agent", "CF-Worker-Dual-Proxy");

          try {
            const originResponse = await fetch(targetUrl, {
              method: request.method,
              headers: newHeaders,
              redirect: "follow"
            });
            
            // Clone the response to modify headers and store in cache
            response = originResponse; 

            // Put a copy of the response into the Cloudflare Cache (Async)
            // It will be cached according to Cache-Control header
            ctx.waitUntil(cache.put(request, response.clone())); 

          } catch (err) {
            return new Response("Error fetching content", { status: 500 });
          }
      }
      
      // Override headers regardless of whether it came from cache or origin
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      
      // Ensure the client browser knows it's cachable (4 hours)
      responseHeaders.set("Cache-Control", "public, max-age=14400"); 

      // CRUCIAL STEP: Override Content-Disposition (Stream vs. Download)
      if (shouldDownload) {
          // Force Download
          const filename = targetUrl.substring(targetUrl.lastIndexOf('/') + 1);
          responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`);
      } else {
          // Force Stream/View
          responseHeaders.set("Content-Disposition", "inline");
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    }

    // 2. AUTH CHECK (Remains the same)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + ADMIN_PASSWORD)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' }
      });
    }

    // 3. GENERATOR UI (Remains the same)
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dual Link Generator</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
          input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
          button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; font-weight: bold; margin-top: 5px; }
          .copy-btn { background: #28a745; margin-top: 5px; }
          .download-btn { background: #dc3545; }
        </style>
      </head>
      <body>
          <h3>Stream & Download Link Generator</h3>
          <label>Original URL (R2 or External)</label>
          <input type="url" id="r2" placeholder="https://pub-xxx.r2.dev/video.mp4">
          <button onclick="gen()">Generate Links</button>
          
          <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px;">
            <label>1. STREAM / VIEW LINK (Opens in Browser)</label>
            <input type="text" id="streamOut" readonly onclick="this.select()">
            <button class="copy-btn" onclick="copyLink('streamOut')">Copy Stream Link</button>
            
            <label style="margin-top: 15px; display: block;">2. DOWNLOAD LINK (Forces File Download)</label>
            <input type="text" id="dlOut" readonly onclick="this.select()">
            <button class="copy-btn download-btn" onclick="copyLink('dlOut')">Copy Download Link</button>
          </div>

        <script>
          const paramKey = "${PARAM_KEY}";
          const dlFlag = "${DOWNLOAD_FLAG}";
          
          function gen() {
            const r2 = document.getElementById('r2').value.trim();
            if(!r2) return;
            
            const origin = window.location.origin;
            const streamLink = \`\${origin}/?\${paramKey}=\${r2}\`;
            const dlLink = streamLink + \`&\${dlFlag}=true\`;
            
            document.getElementById('streamOut').value = streamLink;
            document.getElementById('dlOut').value = dlLink;
          }

          function copyLink(id) {
            const copyText = document.getElementById(id);
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
