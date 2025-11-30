import { AwsClient } from 'https://cdn.jsdelivr.net/npm/aws4fetch@1.0.17/+esm';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sourceUrl = url.searchParams.get("url");
    const filename = url.searchParams.get("name");
    
    // 🔥 Link မှာ ဘယ် Account ကို သုံးမလဲဆိုတာ ခွဲပေးလိုက်မယ်
    // ဥပမာ: ?target=A သို့မဟုတ် ?target=B
    const target = url.searchParams.get("target") || "A";

    if (!sourceUrl || !filename) {
      return new Response("Usage: ?url=...&name=...&target=A", { status: 400 });
    }

    let r2AccessKey, r2SecretKey, r2AccountId, r2BucketName;
    
    // 🔥 Target အလိုက် သုံးမယ့် Account ကို ရွေးမယ်
    if (target.toUpperCase() === "B") {
      r2AccessKey = env.R2_ACCESS_KEY_ID_B;
      r2SecretKey = env.R2_SECRET_ACCESS_KEY_B;
      r2AccountId = env.R2_ACCOUNT_ID_B;
      r2BucketName = env.R2_BUCKET_NAME_B;
    } else {
      // Default က Account A
      r2AccessKey = env.R2_ACCESS_KEY_ID_A;
      r2SecretKey = env.R2_SECRET_ACCESS_KEY_A;
      r2AccountId = env.R2_ACCOUNT_ID_A;
      r2BucketName = env.R2_BUCKET_NAME_A;
    }

    // ၁။ R2 Client တည်ဆောက်
    const r2 = new AwsClient({
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
      service: 's3',
      region: 'auto',
    });

    try {
      // ၂။ Source Video ချိတ်
      const sourceRes = await fetch(sourceUrl);
      if (!sourceRes.ok) throw new Error("Source URL Error");

      // ၃။ Target Account R2 ဆီ S3 Request ပို့
      const r2Url = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${filename}`;

      const upload = await r2.fetch(r2Url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: sourceRes.body
      });
      
      return new Response(upload.ok ? "Success" : await upload.text(), { status: upload.status });
      
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  },
};
