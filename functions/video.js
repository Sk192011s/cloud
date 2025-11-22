export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ==========================================
  // 1. CONFIGURATION
  // ==========================================
  const SECRET_KEY = "change-this-to-your-secure-key"; 
  const EXPIRY_SECONDS = 10800; // 3 Hours
  const DEFAULT_R2_DOMAIN = "https://pub-xxx.r2.dev"; // Your R2 Domain (No trailing slash)
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";

  // ==========================================
  // 2. PATH LOGIC
  // ==========================================
  // Extract filename from URL path (e.g., /video/movie.mp4 -> movie.mp4)
  const pathParts = url.pathname.split('/').filter(p => p);
  const fileName = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

  // If no filename provided, show Admin Panel
  if (!fileName) {
      return handleAdminPanel(request, ADMIN_PASSWORD);
  }

  // ==========================================
  // 3. REDIRECT & STREAM LOGIC
  // ==========================================
  const signature = url.searchParams.get("sig");
  const expiry = url.searchParams.get("expiry");
  const shouldDownload = url.searchParams.get("dl") === "true";

  // (A) NO SIGNATURE -> GENERATE & REDIRECT
  if (!signature) {
      const now = Math.floor(Date.now() / 1000);
      const newExpiry = now + EXPIRY_SECONDS;
      
      const sig = await generateSignature(fileName, newExpiry, SECRET_KEY);
      
      url.searchParams.set("expiry", newExpiry);
      url.searchParams.set("sig", sig);
      
      // 302 Redirect to signed URL
      return Response.redirect(url.toString(), 302);
  }

  // (B) HAS SIGNATURE -> VALIDATE & STREAM
  if (signature) {
      // 1. Check Expiry
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(expiry) < now) {
        return new Response("Link Expired", { status: 403 });
      }

      // 2. Check Signature
      const expectedSig = await generateSignature(fileName, expiry, SECRET_KEY);
      if (signature !== expectedSig) {
        return new Response("Invalid Signature", { status: 403 });
      }

      // 3. Fetch from R2
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
        responseHeaders.delete("Content-Disposition");

        if (shouldDownload) {
            responseHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
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

// --- HELPER: ADMIN PANEL ---
function handleAdminPanel(request, password) {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + password)) {
        return new Response("Unauthorized", {
            status: 401,
            headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' }
        });
    }

    return new Response(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Link Gen</title>
      <style>body{padding:20px;font-family:sans-serif;background:#f4f4f9}input{width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:4px;box-sizing:border-box}button{width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer}.copy-btn{background:#28a745}</style>
      </head><body>
      <h3>Direct Link Generator</h3>
      <label>File Name (e.g. movie.mp4)</label>
      <input id="r2" placeholder="movie.mp4">
      <button onclick="gen()">Get Master Link</button>
      <input id="out" style="margin-top:20px" readonly onclick="this.select()">
      <button class="copy-btn" style="margin-top:10px" onclick="copy()">Copy Link</button>
      <script>
        function gen() {
          const val = document.getElementById('r2').value.trim();
          if(!val) return;
          let baseUrl = window.location.href.replace(/\\/+$/, "").split('?')[0];
          const url = baseUrl + "/" + val;
          document.getElementById('out').value = url;
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

// --- HELPER: SIGNATURE GENERATOR ---
async function generateSignature(fileName, expiry, secret) {
    const msg = fileName + expiry + secret;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
