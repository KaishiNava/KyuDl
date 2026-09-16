import https from "node:https";
import http from "node:http";
import zlib from "node:zlib";

const CONFIG = {
  ENDPOINT: "https://snaptik.fi/api/tiktok",
  TIMEOUT_MS: 30000,
  UA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function request(urlStr, opts = {}) {
  const { method = "GET", headers = {}, body = null, redirects = 5 } = opts;
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === "https:" ? https : http;
    const h = { "User-Agent": CONFIG.UA, "Accept-Language": "en-US,en;q=0.9", ...headers };
    
    const req = lib.request(
      {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: h,
      },
      (res) => {
        if (redirects > 0 && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return request(new URL(res.headers.location, urlStr).toString(), { ...opts, redirects: redirects - 1 }).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let buf = Buffer.concat(chunks);
          const enc = (res.headers["content-encoding"] || "").toLowerCase();
          try {
            if (enc === "gzip") buf = zlib.gunzipSync(buf);
            else if (enc === "deflate") buf = zlib.inflateSync(buf);
            else if (enc === "br") buf = zlib.brotliDecompressSync(buf);
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: buf.toString("utf-8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(CONFIG.TIMEOUT_MS, () => req.destroy(new Error(`Timeout`)));
    if (body) req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  // Buka CORS agar frontend bisa akses API
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL TikTok wajib diisi" });
    }

    const snapRes = await request(CONFIG.ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, */*",
        Origin: "https://snaptik.fi",
        Referer: "https://snaptik.fi/",
      },
      body: JSON.stringify({ url }),
    });

    if (snapRes.status !== 200) {
      return res.status(snapRes.status).json({ error: "Gagal mengambil data dari server asal" });
    }

    const data = JSON.parse(snapRes.body);

    const result = {
      success: !!(data.download_link?.no_watermark || data.download_link?.watermark || data.download_link?.mp3),
      title: data.title || "TikTok Video",
      cover: data.cover || null,
      author: data.author ? { nickname: data.author.nickname, uniqueId: data.author.uniqueId } : null,
      downloads: {
        no_watermark: data.download_link?.no_watermark || null,
        watermark: data.download_link?.watermark || null,
        mp3: data.download_link?.mp3 || null,
      },
    };

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
