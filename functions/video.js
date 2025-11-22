export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ==========================================
  // 1. SETTINGS (CHANGE THESE!)
  // ==========================================
  const SECRET_KEY = "change-this-to-your-secure-key"; 
  const EXPIRY_SECONDS = 10800; // 3 Hours
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";
  
  // Replace with your R2 Public Domain (No trailing slash)
  const DEFAULT_R2_DOMAIN = "https://pub-xxx.r2.dev"; 

  // ==========================================
  // 2. LOGIC
  // ==========================================
  const targetFile = url.searchParams.get("file");
  const signature = url.searchParams.get("sig");
  const expiry = url.searchParams.get("expiry");
  const shouldDownload = url.searchParams.get("dl") === "true";

  // (A) MASTER LINK HIT -> REDIRECT TO SIGNED URL
  if (targetFile && !signature) {
      const now = Math.floor(Date.now() / 1000);
      const newExpiry = now + EXPIRY_SECONDS;
      
      const sig = await generateSignature(targetFile, newExpiry, SECRET_KEY);
      
      const secureUrl = new URL(request.url);
      secureUrl.searchParams.set("expiry", newExpiry);
      secureUrl.searchParams.set("sig", sig);
      
      return Response.redirect(secureUrl.toString(), 302);
  }

  // (B) SECURE LINK HIT -> VALIDATE & STREAM
  if (targetFile && signature) {
      // 1. Check Expiry
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(expiry) < now) {
        return new Response("Link Expired", { status: 403 });
      }

      // 2. Check Signature
      const expectedSig = await generateSignature(targetFile, expiry, SECRET_KEY);
      if (signature !== expectedSig) {
        return new Response("Invalid Signature", { status: 403 });
      }

      // 3. Fetch from R2
      let r2Url = targetFile;
      if (!r2Url.startsWith("http")) {
          if (!r2Url.startsWith("/")) r2Url = "/" + r2Url;
          r2Url = DEFAULT_R2_DOMAIN + r2Url;
      }

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
            const filename = r2Url.substring(r2Url.lastIndexOf('/') + 1);
            responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`);
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

  // (C) UI GENERATOR (ADMIN ONLY)
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + ADMIN_PASSWORD)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' }
    });
  }

  return new Response(`
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Master Link Gen</title>
    <style>body{padding:20px;font-family:sans-serif;background:#f4f4f9}input{width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:4px;box-sizing:border-box}button{width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer}.copy-btn{background:#28a745}</style>
    </head><body>
    <h3>Master Link Generator</h3>
    <label>File Name (e.g., movie.mp4)</label>
    <input id="r2" placeholder="movie.mp4">
    <button onclick="gen()">Get Master Link</button>
    <input id="out" style="margin-top:20px" readonly onclick="this.select()">
    <button class="copy-btn" style="margin-top:10px" onclick="copy()">Copy Link</button>
    <script>
      function gen() {
        const val = document.getElementById('r2').value.trim();
        if(!val) return;
        const url = window.location.origin + window.location.pathname + "?file=" + encodeURIComponent(val);
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

async function generateSignature(urlParam, expiry, secret) {
    const msg = urlParam + expiry + secret;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
