export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ==========================================
  // CONFIGURATION
  // ==========================================
  const SECRET_KEY = "change-this-to-your-secure-key"; 
  const EXPIRY_SECONDS = 10800; // 3 Hours
  const DEFAULT_R2_DOMAIN = "https://pub-325f169b91ff4758b1f491b11e74f77b.r2.dev"; 

  // ==========================================
  // PATH HANDLING
  // ==========================================
  const pathParts = url.pathname.split('/').filter(p => p);
  let fileName = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;
  if (fileName) fileName = decodeURIComponent(fileName);

  if (!fileName) return new Response("File Not Found", { status: 404 });

  // ==========================================
  // LOGIC
  // ==========================================
  const signature = url.searchParams.get("sig");
  const expiry = url.searchParams.get("expiry");
  const shouldDownload = url.searchParams.get("dl") === "true";

  // -------------------------------------------------------
  // 1. MASTER LINK -> REDIRECT (tktube style)
  // -------------------------------------------------------
  if (!signature) {
      const now = Math.floor(Date.now() / 1000);
      const newExpiry = now + EXPIRY_SECONDS;
      const sig = await generateSignature(fileName, newExpiry, SECRET_KEY);
      
      // Construct the Signed URL
      url.searchParams.set("expiry", newExpiry);
      url.searchParams.set("sig", sig);
      
      // Return standard 302 Redirect
      return Response.redirect(url.toString(), 302);
  }

  // -------------------------------------------------------
  // 2. SIGNED LINK -> STREAM VIDEO
  // -------------------------------------------------------
  if (signature) {
      // Security Checks
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(expiry) < now) return new Response("Link Expired", { status: 403 });
      
      const expectedSig = await generateSignature(fileName, expiry, SECRET_KEY);
      if (signature !== expectedSig) return new Response("Invalid Signature", { status: 403 });

      // Fetch from R2
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
        
        // 🔥 PLAYER FRIENDLY HEADERS 🔥
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        responseHeaders.set("Accept-Ranges", "bytes");
        
        // Force Inline for Player
        responseHeaders.delete("Content-Disposition");
        if (shouldDownload) {
            responseHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
        } else {
            responseHeaders.set("Content-Disposition", "inline");
        }

        // Strict Content-Type for Player Detection
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
        return new Response("Stream Error", { status: 500 });
      }
  }
}

// Helper
async function generateSignature(key, expiry, secret) {
    key = decodeURIComponent(key);
    const msg = key + expiry + secret;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
