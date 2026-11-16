/* =========================================================================
   scraper.mjs — optional dependency-free scraping API.

   Browsers cannot scrape stackoverflow.com (CORS + Cloudflare), so the
   deployed GitHub Pages site uses the Stack Exchange API directly. Run this
   tiny local server when you are developing on localhost and the app will
   prefer real scraped questions automatically.

   Run: node tools/scraper.mjs
   Test: curl "http://127.0.0.1:8787/api/stackoverflow?tag=reactjs"
   ========================================================================= */
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function decode(text) {
  return text
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}
function stripTags(html) { return decode(html.replace(/<[^>]*>/g, "")); }

async function scrape(tag, limit) {
  const url = `https://stackoverflow.com/questions/tagged/${encodeURIComponent(tag)}?tab=newest&pagesize=${limit}&page=1`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`Stack Overflow respondeu HTTP ${response.status}`);
  const html = await response.text();
  if (/Just a moment|challenges\.cloudflare\.com/i.test(html)) {
    throw new Error("Cloudflare bloqueou o scraping; use a Stack Exchange API");
  }

  const chunks = html.split(/class="s-post-summary[\s"]/).slice(1);
  const recentQuestions = [];
  for (const chunk of chunks) {
    if (recentQuestions.length >= limit) break;
    const link = chunk.match(/<a[^>]*class="[^"]*s-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const title = stripTags(link[2]);
    if (!title) continue;
    const answer = chunk.match(/([\d,]+)\s*answers?/i);
    const votes = chunk.match(/(-?[\d,]+)\s*votes?/i);
    const time = chunk.match(/datetime="([^"]+)"/) || chunk.match(/title="([^"]*20\d\d[^"]*)"/);
    const answers = answer ? Number(answer[1].replace(/,/g, "")) : 0;
    recentQuestions.push({
      title: title.slice(0, 180),
      url: link[1].startsWith("http") ? link[1] : "https://stackoverflow.com" + link[1],
      answers,
      votes: votes ? Number(votes[1].replace(/,/g, "")) : 0,
      views: null,
      askedAt: time ? new Date(time[1]).toISOString() : null,
      unanswered: answers === 0
    });
  }

  const totalMatch = html.match(/([\d,.]+)\s*(?:million\s+)?questions?/i);
  const totalQuestions = totalMatch
    ? Math.round(Number(totalMatch[1].replace(/[.,]/g, "")))
    : 0;

  return {
    source: "stackoverflow-scrape",
    tag,
    totalQuestions,
    recentQuestions,
    note: recentQuestions.length
      ? `${recentQuestions.length} perguntas raspadas de stackoverflow.com.`
      : "Markup não reconhecido; execute a Stack Exchange API como fallback."
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/api/health") {
    res.end(JSON.stringify({ ok: true, service: "devtrends-local-scraper" }));
    return;
  }
  if (url.pathname !== "/api/stackoverflow") {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Use /api/stackoverflow?tag=<tag>" }));
    return;
  }
  const tag = (url.searchParams.get("tag") || "").slice(0, 40);
  const limit = Math.min(50, Math.max(10, Number(url.searchParams.get("limit")) || 30));
  if (!/^[\w.+#-]+$/.test(tag)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "tag inválida" }));
    return;
  }
  try {
    res.end(JSON.stringify(await scrape(tag, limit)));
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error.message, recentQuestions: [] }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DevTrends local scraper: http://127.0.0.1:${PORT}/api/stackoverflow?tag=reactjs`);
});
