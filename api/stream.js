import https from "node:https";
import http from "node:http";

export default async function handler(req, res) {
  const mediaUrl = req.query.url;
  const filename = req.query.filename || "tiktok_media.mp4";

  if (!mediaUrl) {
    return res.status(400).send("URL media tidak ditemukan.");
  }

  try {
    const parsed = new URL(mediaUrl);
    const lib = parsed.protocol === "https:" ? https : http;

    lib.get(
      mediaUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://snaptik.fi/",
        },
      },
      (streamRes) => {
        if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
          // Ikuti redirect jika ada
          return handler(
            { query: { url: streamRes.headers.location, filename } },
            res
          );
        }

        // Paksa browser untuk mendownload file langsung
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader(
          "Content-Type",
          streamRes.headers["content-type"] || "application/octet-stream"
        );

        streamRes.pipe(res);
      }
    ).on("error", (err) => {
      res.status(500).send("Gagal mengambil stream file: " + err.message);
    });
  } catch (err) {
    res.status(500).send("URL tidak valid: " + err.message);
  }
}
