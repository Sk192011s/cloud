export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // ==========================================
  // CONFIGURATION
  // ==========================================
  // Replace this with your actual R2 Public Domain (No trailing slash)
  const DEFAULT_R2_DOMAIN = "https://pub-325f169b91ff4758b1f491b11e74f77b.r2.dev"; 

  // ==========================================
  // PATH LOGIC
  // ==========================================
  const pathParts = url.pathname.split('/').filter(p => p);
  let fileName = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;
  
  if (fileName) fileName = decodeURIComponent(fileName);

  if (!fileName) return new Response("File not found", { status: 404 });

  // ==========================================
  // DIRECT STREAM LOGIC
  // ==========================================
  const r2Url = `${DEFAULT_R2_DOMAIN}/${fileName}`;
  const shouldDownload = url.searchParams.get("dl") === "true";

  const newHeaders = new Headers(request.headers);
  // Set Android User-Agent to mimic mobile player
  newHeaders.set("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");
  // Disable Gzip compression for raw video stream
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
    
    // Force Inline for streaming, Attachment for download
    responseHeaders.delete("Content-Disposition");
    if (shouldDownload) {
        responseHeaders.set("Content-Disposition", `attachment; filename="${fileName}"`);
    } else {
        responseHeaders.set("Content-Disposition", "inline");
    }

    // Fix Content-Type if R2 returns generic stream
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
