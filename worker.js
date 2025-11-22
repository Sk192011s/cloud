export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CONFIGURATION
    const SECRET_KEY = "change-this-to-your-secure-key"; 
    const EXPIRY_SECONDS = 10800; // 3 Hours
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";
    
    // Your R2 Public Domain
    const DEFAULT_R2_DOMAIN = "https://pub-325f169b91ff4758b1f491b11e74f77b.r2.dev"; 

    // 2. INPUT LOGIC
    const targetFile = url.searchParams.get("file");
    const signature = url.searchParams.get("sig");
    const expiry = url.searchParams.get("expiry");
    const shouldDownload = url.searchParams.get("dl") === "true";

    // If no file param, show Admin Panel
    if (!targetFile) {
        return handleAdminPanel(request, ADMIN_PASSWORD);
    }

    // 3. LOGIC: REDIRECT OR STREAM

    // (A) MASTER LINK HIT -> REDIRECT
    if (!signature) {
        const now = Math.floor(Date.now() / 1000);
        const newExpiry = now + EXPIRY_SECONDS;
        
        const sig = await generateSignature(targetFile, newExpiry, SECRET_KEY);
        
        url.searchParams.set("expiry", newExpiry);
        url.searchParams.set("sig", sig);
        
        return Response.redirect(url.toString(), 302);
    }

    // (B) SIGNED LINK HIT -> STREAM
    if (signature) {
        const now = Math.floor(Date.now() / 1000);
        if (parseInt(expiry) < now) return new Response("Link Expired", { status: 403 });

        const expectedSig = await generateSignature(targetFile, expiry, SECRET_KEY);
        if (signature !== expectedSig) return new Response("Invalid Signature", { status: 403 });

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

            const contentType = responseHeaders.get("Content-Type");
            if (!contentType || contentType === "application/octet-stream") {
                if (r2Url.endsWith(".mp4")) responseHeaders.set("Content-Type", "video/mp4");
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
};

// --- ADMIN UI ---
function handleAdminPanel(request, password) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + password)) {
        return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' } });
    }
    return new Response(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{padding:20px;font-family:sans-serif}input{width:100%;padding:10px;margin:10px 0}button{width:100%;padding:10px;background:#007bff;color:white;border:none}</style></head><body><h3>Worker Redirect Gen</h3><input id="r2" placeholder="Filename (movie.mp4)"><button onclick="g()">Get Link</button><input id="out" readonly onclick="this.select()"><script>function g(){const v=document.getElementById('r2').value.trim();if(!v)return;const u=window.location.origin+"/?file="+encodeURIComponent(v);document.getElementById('out').value=u;}</script></body></html>`, { headers: { "content-type": "text/html" } });
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
