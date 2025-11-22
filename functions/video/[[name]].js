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
  // 2. INPUT LOGIC
  // ==========================================
  let inputKey = url.searchParams.get("file");
  
  if (!inputKey) {
      const pathParts = url.pathname.split('/').filter(p => p);
      if (pathParts.length > 1) {
          inputKey = decodeURIComponent(pathParts[pathParts.length - 1]);
      }
  }

  // Show Admin Panel if no file specified
  if (!inputKey) return handleAdminPanel(request, ADMIN_PASSWORD);

  // ==========================================
  // 3. PROCESS LOGIC
  // ==========================================
  const signature = url.searchParams.get("sig");
  const expiry = url.searchParams.get("expiry");
  const shouldDownload = url.searchParams.get("dl") === "true";

  // (A) AUTO-SIGNING REDIRECT
  if (!signature) {
      const now = Math.floor(Date.now() / 1000);
      const newExpiry = now + EXPIRY_SECONDS;
      const sig = await generateSignature(inputKey, newExpiry, SECRET_KEY);
      
      url.searchParams.set("expiry", newExpiry);
      url.searchParams.set("sig", sig);
      
      return Response.redirect(url.toString(), 302);
  }

  // (B) STREAMING LOGIC
  if (signature) {
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(expiry) < now) return new Response("Link Expired", { status: 403 });

      const expectedSig = await generateSignature(inputKey, expiry, SECRET_KEY);
      if (signature !== expectedSig) return new Response("Invalid Signature", { status: 403 });

      // Construct R2 URL
      let finalTargetUrl = inputKey;
      if (!finalTargetUrl.startsWith("http")) {
          if (!finalTargetUrl.startsWith("/")) finalTargetUrl = "/" + finalTargetUrl;
          finalTargetUrl = DEFAULT_R2_DOMAIN + finalTargetUrl;
      }

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
        
        // --- APK PLAYBACK FIXES ---
        responseHeaders.delete("Content-Disposition");

        if (shouldDownload) {
            const fname = finalTargetUrl.substring(finalTargetUrl.lastIndexOf('/') + 1);
            responseHeaders.set("Content-Disposition", `attachment; filename="${fname}"`);
        } else {
            // Force inline for players
            responseHeaders.set("Content-Disposition", "inline"); 
        }

        // Fix Content-Type if R2 sends generic stream
        const contentType = responseHeaders.get("Content-Type");
        if (!contentType || contentType === "application/octet-stream") {
            if (finalTargetUrl.endsWith(".mp4")) responseHeaders.set("Content-Type", "video/mp4");
            if (finalTargetUrl.endsWith(".mkv")) responseHeaders.set("Content-Type", "video/x-matroska");
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

// --- ADMIN UI ---
function handleAdminPanel(request, password) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + password)) {
        return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' } });
    }
    return new Response(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{padding:20px;font-family:sans-serif}input{width:100%;padding:10px;margin:10px 0}button{width:100%;padding:10px;background:#007bff;color:white;border:none}</style></head><body><h3>Video Link Gen</h3><input id="r2" placeholder="Filename or Link"><button onclick="g()">Get Link</button><input id="out" readonly onclick="this.select()"><script>function g(){const val=document.getElementById('r2').value.trim();if(!val)return;let path=window.location.pathname;if(path.endsWith('/'))path=path.slice(0,-1);const url=window.location.origin+path+"/"+val;document.getElementById('out').value=url;}</script></body></html>`, { headers: { "content-type": "text/html" } });
}

// --- SIGNATURE HELPER ---
async function generateSignature(key, expiry, secret) {
    key = decodeURIComponent(key);
    const msg = key + expiry + secret;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
