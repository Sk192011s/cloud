export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ==========================================
  // 1. CONFIGURATION
  // ==========================================
  // Replace this with your actual R2 Public Domain (No trailing slash)
  const DEFAULT_R2_DOMAIN = "https://pub-325f169b91ff4758b1f491b11e74f77b.r2.dev"; 
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "mysecretpassword123";

  // ==========================================
  // 2. PATH LOGIC
  // ==========================================
  // Extract filename from URL path
  const pathParts = url.pathname.split('/').filter(p => p);
  // If path is /video/movie.mp4 -> filename is movie.mp4
  let fileName = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;
  
  if (fileName) fileName = decodeURIComponent(fileName);

  // ==========================================
  // 🔥 FIX: SHOW ADMIN PANEL IF NO FILENAME 🔥
  // ==========================================
  if (!fileName) {
      return handleAdminPanel(request, ADMIN_PASSWORD);
  }

  // ==========================================
  // 3. DIRECT STREAM LOGIC
  // ==========================================
  const r2Url = `${DEFAULT_R2_DOMAIN}/${fileName}`;
  const shouldDownload = url.searchParams.get("dl") === "true";

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

    if (response.status === 404) {
        return new Response("Video not found in R2 Bucket", { status: 404 });
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Accept-Ranges", "bytes");
    
    responseHeaders.delete("Content-Disposition");
    if (shouldDownload) {
        responseHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
    } else {
        responseHeaders.set("Content-Disposition", "inline");
    }

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

// --- ADMIN PANEL UI ---
function handleAdminPanel(request, password) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.split(" ")[1] !== btoa("admin:" + password)) {
        return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Admin Access"' } });
    }
    return new Response(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Direct Link Gen</title><style>body{padding:20px;font-family:sans-serif;background:#f4f4f9}input{width:100%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:4px;box-sizing:border-box}button{width:100%;padding:12px;background:#007bff;color:white;border:none;border-radius:4px;font-weight:bold;cursor:pointer}.copy-btn{background:#28a745;margin-top:10px}</style></head><body><h3>Direct Video Link</h3><label>Filename (e.g. movie.mp4)</label><input id="r2" placeholder="movie.mp4"><button onclick="g()">Get Link</button><input id="out" style="margin-top:20px" readonly onclick="this.select()"><button class="copy-btn" onclick="c()">Copy</button><script>function g(){const v=document.getElementById('r2').value.trim();if(!v)return;let p=window.location.pathname;if(p.endsWith('/'))p=p.slice(0,-1);document.getElementById('out').value=window.location.origin+p+"/"+v;}function c(){const e=document.getElementById('out');e.select();navigator.clipboard.writeText(e.value).then(()=>alert("Copied!"));}</script></body></html>`, { headers: { "content-type": "text/html" } });
}
