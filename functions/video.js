export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ==========================================
  // 1. SETTINGS
  // ==========================================
  const SECRET_KEY = "change-this-to-your-secure-key"; 
  const EXPIRY_SECONDS = 10800; // 3 Hours
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";
  
  // Main R2 Domain (No trailing slash)
  const DEFAULT_R2_DOMAIN = "https://pub-325f169b91ff4758b1f491b11e74f77b.r2.dev"; 

  // ==========================================
  // 2. INPUT DETECTION (PATH vs QUERY)
  // ==========================================
  // Check Query Param first (?file=...) -> Used for External Links
  let inputKey = url.searchParams.get("file");
  
  // If no query, check Path (/video/filename.mp4) -> Used for Default Link
  if (!inputKey) {
      const pathParts = url.pathname.split('/').filter(p => p);
      // Assuming path is /video/filename.mp4
      if (pathParts.length > 1) {
          inputKey = decodeURIComponent(pathParts[pathParts.length - 1]);
      }
  }

  // If still no input, show Admin Panel
  if (!inputKey) {
      return handleAdminPanel(request, ADMIN_PASSWORD);
  }

  // ==========================================
  // 3. PROCESS LOGIC
  // ==========================================
  const signature = url.searchParams.get("sig");
  const expiry = url.searchParams.get("expiry");
  const shouldDownload = url.searchParams.get("dl") === "true";

  // (A) NO SIGNATURE -> GENERATE & REDIRECT
  if (!signature) {
      const now = Math.floor(Date.now() / 1000);
      const newExpiry = now + EXPIRY_SECONDS;
      
      // Sign the input key (either filename or full URL)
      const sig = await generateSignature(inputKey, newExpiry, SECRET_KEY);
      
      // Add params to current URL structure
      url.searchParams.set("expiry", newExpiry);
      url.searchParams.set("sig", sig);
      
      return Response.redirect(url.toString(), 302);
  }

  // (B) HAS SIGNATURE -> VALIDATE & STREAM
  if (signature) {
      // 1. Validate
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(expiry) < now) return new Response("Link Expired", { status: 403 });

      const expectedSig = await generateSignature(inputKey, expiry, SECRET_KEY);
      if (signature !== expectedSig) return new Response("Invalid Signature", { status: 403 });

      // 2. Resolve Real URL
      let finalTargetUrl = inputKey;
      // If input is NOT a full URL, append Default Domain
      if (!finalTargetUrl.startsWith("http")) {
          if (!finalTargetUrl.startsWith("/")) finalTargetUrl = "/" + finalTargetUrl;
          finalTargetUrl = DEFAULT_R2_DOMAIN + finalTargetUrl;
      }

      // 3. Stream
      const newHeaders = new Headers(request.headers);
      newHeaders.set("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
      newHeaders.delete("Accept-Encoding"); 

      if (request.headers.has("Range")) {
        newHeaders.set("Range", request.headers.get("Range"));
      }

      try {
        const response = await fetch(finalTargetUrl, {
          method: request.method,
          headers: newHeaders,
          redirect: "follow"
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.delete("Content-Disposition");

        if (shouldDownload) {
            const fname = finalTargetUrl.substring(finalTargetUrl.lastIndexOf('/') + 1);
            responseHeaders.set("Content-Disposition", `attachment; filename="${fname}"`);
        } else {
            responseHeaders.set("Content-Disposition", "inline");
        }

        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders
        });
      } catch (err) {
        return new Response("Proxy Error", { status: 500 });
      }
  }
}

// --- SMART GENERATOR UI ---
function handleAdminPanel(request, password) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + password)) {
        return new Response("Unauthorized", {
            status: 401, headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' }
        });
    }

    return new Response(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Universal Link Gen</title>
      <style>body{padding:20px;font-family:sans-serif;background:#f4f4f9}input{width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:4px}button{width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:4px;font-weight:bold}.copy-btn{background:#28a745;margin-top:10px}</style>
      </head><body>
      <h3>Universal Link Generator</h3>
      <label>Filename (Default) OR Full Link (External)</label>
      <input id="r2" placeholder="e.g. movie.mp4 OR https://other.r2.dev/file.mp4">
      <button onclick="gen()">Get Master Link</button>
      <input id="out" style="margin-top:20px" readonly onclick="this.select()">
      <button class="copy-btn" onclick="copy()">Copy Link</button>
      <script>
        function gen() {
          const val = document.getElementById('r2').value.trim();
          if(!val) return;
          
          const origin = window.location.origin;
          const basePath = window.location.pathname.replace(/\\/+$/, ""); 
          
          let finalLink = "";
          
          // SMART LOGIC:
          if (val.includes("://")) {
             // Case 1: Full URL (External) -> Use Query Param
             finalLink = origin + basePath + "?file=" + encodeURIComponent(val);
          } else {
             // Case 2: Filename (Default) -> Use Path
             // Remove leading slash if user typed it
             let cleanVal = val.startsWith("/") ? val.substring(1) : val;
             finalLink = origin + basePath + "/" + cleanVal;
          }
          
          document.getElementById('out').value = finalLink;
        }
        function copy() {
          const el = document.getElementById('out');
          if(!el.value) return;
          el.select();
          navigator.clipboard.writeText(el.value).then(()=>alert("Copied!"));
        }
      </script></body></html>
    `, { headers: { "content-type": "text/html" } });
}

async function generateSignature(key, expiry, secret) {
    const msg = key + expiry + secret;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
