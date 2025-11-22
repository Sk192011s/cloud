export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);

    if (!key) {
      return new Response("File name required", { status: 404 });
    }

    const object = await env.MY_BUCKET.get(key);

    if (object === null) {
      return new Response("File Not Found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    return new Response(object.body, {
      headers,
    });
  },
};
