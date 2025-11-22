export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ==========================================
  // 1. CONFIGURATION
  // ==========================================
  const SECRET_KEY = "my-secure-secret-key"; // Change this!
  const EXPIRY_SECONDS = 10800; // 3 Hours
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";
  
  // Your R2 Domain (No trailing slash)
  const DEFAULT_R2_DOMAIN = "https://pub-325f169b91ff4758b1f491b11e74f77b.r2.dev"; 

  // ==========================================
  // 2. PATH LOGIC
  // ==========================================
  const pathParts = url.pathname.split('/').filter(p => p);
  let fileName = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;
  
  if (fileName) fileName = decodeURIComponent(fileName);

  // If no filename, show Admin Panel
  if (!fileName) return handleAdminPanel(request, ADMIN_PASSWORD);

  // ==========================================
  // 3. REDIRECT & STREAM LOGIC
  // ==========================================
  const signature = url.searchParams.get("sig");
  const expiry = url.searchParams.get("expiry");
  const shouldDownload = url.searchParams.get("dl") === "true";

  // (A) NO SIGNATURE -> GENERATE & REDIRECT (The "tktube" style)
  if (!signature) {
      const now = Math.floor(Date.now() / 1000);
      const newExpiry = now + EXPIRY_SECONDS;
      
      const sig = await generateSignature(fileName, newExpiry, SECRET_KEY);
      
      // Append params to current URL
      url.searchParams.set("expiry", newExpiry);
      url.searchParams.set("sig", sig);
      
      // 302 Redirect to the signed URL
      return Response.redirect(url.toString(), 302);
  }

  // (B) HAS SIGNATURE -> VALIDATE & STREAM
  if (signature) {
      // 1. Check Expiry
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(expiry) < now) return new Response("Link Expired", { status: 403 });

      // 2. Check Signature
      const expectedSig = await generateSignature(fileName, expiry, SECRET_KEY);
      if (signature !== expectedSig) return new Response("Invalid Signature", { status: 403 });

      // 3. Stream from R2
      const r2Url = `${DEFAULT_R2_DOMAIN}/${fileName}`;

      const newHeaders = new Headers(request.headers);
      newHeaders.set("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
      newHeaders.delete("Accept-Encoding"); 

      if (request.headers.has("Range")) {
        newHeaders.set("Range", request.headers.get("Range"));
      }

      try {
        const response = await fetch(r2Url, {
          method: request.method,
          headers: newHeaders,
          redirect: "follow"
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Accept-Ranges", "bytes");
        
        // APK FIX: Force Inline
        responseHeaders.delete("Content-Disposition");
        if (shouldDownload) {
            responseHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
        } else {
            responseHeaders.set("Content-Disposition", "inline");
        }

        // Fix Content-Type
        const contentType = responseHeaders.get("Content-Type");
        if (!contentType || contentType === "application/octet-stream") {
            if (fileName.endsWith(".mp4")) responseHeaders.set("Content-Type", "video/mp4");
            if (fileName.endsWith(".mkv")) responseHeaders.set("Content-Type", "video/x-matroska");
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
    return new Response(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Auto-Link Gen</title><style>body{padding:20px;font-family:sans-serif}input{width:100%;padding:10px;margin:10px 0}button{width:100%;padding:10px;background:#007bff;color:white;border:none}</style></head><body><h3>Auto-Redirect Link Gen</h3><input id="r2" placeholder="Filename (e.g. movie.mp4)"><button onclick="g()">Get Master Link</button><input id="out" readonly onclick="this.select()"><script>function g(){const v=document.getElementById('r2').value.trim();if(!v)return;let p=window.location.pathname;if(p.endsWith('/'))p=p.slice(0,-1);document.getElementById('out').value=window.location.origin+p+"/"+v;}</script></body></html>`, { headers: { "content-type": "text/html" } });
}

// --- HELPER ---
async function generateSignature(key, expiry, secret) {
    key = decodeURIComponent(key);
    const msg = key + expiry + secret;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
