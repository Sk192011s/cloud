export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CONFIGURATION
    const PARAM_KEY = "download"; 
    const DOWNLOAD_FLAG = "dl"; 
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "Soekyawwin@93";

    // 1. PROXY LOGIC (Stream/Download with Full Range Support)
    const targetUrl = url.searchParams.get(PARAM_KEY);
    const shouldDownload = url.searchParams.get(DOWNLOAD_FLAG) === "true"; 
    
    if (targetUrl) {
      // Prepare Headers to forward to R2
      const newHeaders = new Headers(request.headers);
      
      // Use Android User-Agent (Fix for APKs)
      newHeaders.set("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");

      // CRITICAL: Ensure Range header is passed (Fix for IDM & Players)
      if (request.headers.has("Range")) {
        newHeaders.set("Range", request.headers.get("Range"));
      }

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: newHeaders,
          redirect: "follow"
        });

        // Prepare Response Headers
        const responseHeaders = new Headers(response.headers);
        
        // Essential Headers for Video Players
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Accept-Ranges", "bytes"); // Tells player "Yes, we support seeking"
        
        // Remove existing Content-Disposition to avoid conflicts before setting ours
        responseHeaders.delete("Content-Disposition");

        // Set Content-Disposition based on mode
        if (shouldDownload) {
            const filename = targetUrl.substring(targetUrl.lastIndexOf('/') + 1);
            responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`);
        } else {
            responseHeaders.set("Content-Disposition", "inline");
        }

        // Return the response with the CORRECT status code (200 or 206)
        // This is vital for players to know if they got the full file or a chunk
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
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

    // 3. GENERATOR UI
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Universal Proxy Gen</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
          input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
          button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; font-weight: bold; margin-top: 5px; }
          .copy-btn { background: #28a745; margin-top: 5px; }
          .download-btn { background: #dc3545; }
        </style>
      </head>
      <body>
          <h3>Universal Stream & Download Gen</h3>
          <label>Original URL (R2 Link)</label>
          <input type="url" id="r2" placeholder="https://pub-xxx.r2.dev/video.mp4">
          <button onclick="gen()">Generate Links</button>
          
          <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 10px;">
            <label>1. STREAM LINK (APK / Player Compatible)</label>
            <input type="text" id="streamOut" readonly onclick="this.select()">
            <button class="copy-btn" onclick="copyLink('streamOut')">Copy Stream Link</button>
            
            <label style="margin-top: 15px; display: block;">2. DOWNLOAD LINK</label>
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
            navigator.clipboard.writeText(copyText.value).then(() => alert("Copied!"));
          }
        </script>
      </body>
      </html>`;

    return new Response(html, { headers: { "content-type": "text/html" } });
  }
};
