export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Show UI (Frontend)
    if (request.method === "GET") {
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // 2. Handle Upload (Backend)
    if (request.method === "POST" && url.pathname === "/upload") {
      try {
        const { videoUrl, tokenJson } = await request.json();
        
        // Token ကို စစ်ဆေးခြင်း
        let token;
        try { token = JSON.parse(tokenJson); } 
        catch (e) { return Response.json({ error: "JSON Format မှားနေသည်" }); }

        const ossData = token.data || token; // တချို့မှာ data ထဲမှာရှိ၊ တချို့မှာ တန်းရှိ
        if (!ossData.policy || !ossData.signature) {
            return Response.json({ error: "Token တွင် Policy/Signature မပါပါ" });
        }

        // OSS Upload URL (Aliyun)
        const uploadHost = (ossData.hosts && ossData.hosts[0]) || "https://upload.qyun.org";
        
        // Source Video ကို လှမ်းဆွဲခြင်း (Streaming)
        const sourceRes = await fetch(videoUrl);
        if (!sourceRes.ok) return Response.json({ error: "Link မှားနေသည် (Download မရပါ)" });

        const totalSize = sourceRes.headers.get("content-length") || "0";

        // Form Data တည်ဆောက်ခြင်း
        const formData = new FormData();
        formData.append("OSSAccessKeyId", ossData.OSSAccessKeyId);
        formData.append("policy", ossData.policy);
        formData.append("Signature", ossData.signature);
        formData.append("key", ossData.key);
        formData.append("success_action_status", "200");
        
        // Video ဖိုင်ကို Stream အနေနဲ့ ထည့်ခြင်း
        formData.append("file", sourceRes.body, "video.mp4");

        // OSS သို့ တင်ခြင်း
        const uploadRes = await fetch(uploadHost, {
          method: "POST",
          body: formData,
        });

        if (uploadRes.ok) {
          return Response.json({ status: "success", size: totalSize });
        } else {
          const errText = await uploadRes.text();
          return Response.json({ error: "OSS Error: " + errText });
        }

      } catch (e) {
        return Response.json({ error: e.message });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

// Frontend HTML Interface
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CF Worker Uploader</title>
  <style>
    body { background: #111; color: #eee; font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; }
    input, textarea, button { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #444; background: #222; color: white; box-sizing: border-box;}
    button { background: #0070f3; font-weight: bold; cursor: pointer; }
    button:disabled { background: #555; }
    #status { margin-top: 10px; font-size: 14px; white-space: pre-wrap; word-break: break-all;}
    .success { color: #0f0; } .error { color: #f00; }
  </style>
</head>
<body>
  <h2>🚀 Cloudflare Bandwidth Saver</h2>
  
  <label>1. Video URL</label>
  <input type="text" id="url" placeholder="https://example.com/video.mp4">

  <label>2. Paste Token JSON</label>
  <textarea id="token" rows="6" placeholder='Paste code from Console...'></textarea>

  <button onclick="upload()" id="btn">Start Upload</button>
  <div id="status"></div>

  <script>
    async function upload() {
      const url = document.getElementById('url').value;
      const tokenJson = document.getElementById('token').value;
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');

      if (!url || !tokenJson) return alert("အချက်အလက်မစုံပါ");

      btn.disabled = true;
      btn.innerText = "Uploading... (Please Wait)";
      status.innerHTML = "⏳ Worker is proxying file to OSS...<br>ဖိုင်ကြီးရင် 1-2 မိနစ်ကြာနိုင်ပါတယ်...";
      status.className = "";

      try {
        const res = await fetch('/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: url, tokenJson })
        });
        
        const data = await res.json();

        if (data.status === 'success') {
          status.innerHTML = "✅ Upload Successful!<br>Size: " + (data.size/1024/1024).toFixed(2) + " MB";
          status.className = "success";
        } else {
          status.innerHTML = "❌ Error: " + data.error;
          status.className = "error";
        }
      } catch (e) {
        status.innerHTML = "❌ Network Error: " + e.message;
        status.className = "error";
      }
      btn.disabled = false;
      btn.innerText = "Start Upload";
    }
  </script>
</body>
</html>
`;
