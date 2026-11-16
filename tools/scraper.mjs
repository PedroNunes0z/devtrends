/* =========================================================================
   scraper.mjs — API REST própria + servidor da aplicação.

   Node 18+, sem dependências. Substitui um backend externo: serve a página
   estática e expõe uma API REST cuja lógica encapsula web scraping do
   Hacker News (HTML de /search e da front page, parseado no servidor).

   Endpoints:
     GET /api/health
     GET /api/hackernews?tech=react&aliases=reactjs,react.js
   Qualquer outra rota serve um arquivo estático do projeto.

   Uso:
     node tools/scraper.mjs        # abra http://localhost:8787
     PORT=3000 node tools/scraper.mjs
   ========================================================================= */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const HN = "https://news.ycombinator.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DAY_MS = 86400000;
const MAX_FRONT_PAGES = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;
const COMMON_WORDS = new Set(["go", "r", "c", "ai"]);
const CACHE = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

/* ---------------------------------------------------------------- helpers */

function sendJson(response, status, payload, cacheControl) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": cacheControl || "no-store"
  });
  response.end(body);
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, ""));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTerms(tech, aliases) {
  const seen = new Set(), terms = [];
  [tech].concat(aliases || []).forEach((candidate) => {
    const term = String(candidate || "").trim().toLowerCase();
    if (!term || term.length < 2 || COMMON_WORDS.has(term) || seen.has(term)) return;
    seen.add(term);
    terms.push(term);
  });
  return terms.length ? terms : [tech.toLowerCase()];
}

function computeWeeklyDeltaPct(current, previous) {
  if (previous > 0) return Math.round((current - previous) / previous * 100);
  if (current > 0) return 100;
  return null;
}

function parseAge(chunk) {
  const ageMatch = chunk.match(/<span\s+class="age"([^>]*)>([\s\S]*?)<\/span>/i);
  if (!ageMatch) return null;

  const isoMatch = ageMatch[1].match(/title="([^"]+)"/i);
  if (isoMatch) {
    const fromIso = new Date(decodeEntities(isoMatch[1]));
    if (!Number.isNaN(fromIso.getTime())) return fromIso.getTime();
  }

  const text = textOf(ageMatch[2]).toLowerCase();
  if (text === "just now") return Date.now();
  const relative = text.match(/^(\d+)\s+(minute|hour|day|month|year)s?\s+ago/);
  if (relative) {
    const amounts = { minute: 60000, hour: 3600000, day: DAY_MS, month: 30 * DAY_MS, year: 365 * DAY_MS };
    return Date.now() - Number(relative[1]) * amounts[relative[2]];
  }
  const dated = text.match(/^on\s+(.+)$/);
  if (dated) {
    const fromText = new Date(dated[1]);
    if (!Number.isNaN(fromText.getTime())) return fromText.getTime();
  }
  return null;
}

/* ------------------------------------------------------- scraping do HTML */

async function getHtml(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`HN respondeu HTTP ${response.status}`);
  const html = await response.text();
  if (!/hnmain|athing|no results/i.test(html)) throw new Error("resposta não é uma página do Hacker News");
  return html;
}

/** Extrai título, URL, pontos, comentários e idade de cada tr.athing. */
function parseStories(html) {
  const parts = String(html).split(/(<tr[^>]*\bclass="[^"]*\bathing\b[^"]*"[^>]*>)/i);
  const stories = [];

  for (let index = 1; index < parts.length; index += 2) {
    const openTag = parts[index];
    const chunk = parts[index + 1] || "";

    const titleMatch = chunk.match(/<span\s+class="titleline">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
      chunk.match(/<a[^>]*href="([^"]+)"[^>]*class="storylink"[^>]*>([\s\S]*?)<\/a>/i) ||
      chunk.match(/<td\s+class="title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const title = textOf(titleMatch[2]);
    if (!title) continue;

    const scoreMatch = chunk.match(/class="score"[^>]*>\s*([\d,]+)\s*points?/i);
    const points = scoreMatch ? Number(scoreMatch[1].replace(/,/g, "")) || 0 : 0;

    const commentMatch = chunk.match(/<a[^>]*href="item\?id=\d+"[^>]*>\s*([\d,]+)&nbsp;comments?\s*<\/a>/i) ||
      chunk.match(/>\s*([\d,]+)&nbsp;comments?\s*<\/a>/i);
    const comments = commentMatch ? Number(commentMatch[1].replace(/,/g, "")) || 0 : 0;

    const idMatch = openTag.match(/\bid="([^"]+)"/i);
    let href = decodeEntities(titleMatch[1]);
    if (href.startsWith("/")) href = HN + href;

    stories.push({
      title,
      url: href || `${HN}/item?id=${idMatch ? idMatch[1] : ""}`,
      points,
      comments,
      createdAt: parseAge(chunk),
      id: idMatch ? idMatch[1] : ""
    });
  }
  return stories;
}

/* O HN desativou /search: o próprio formulário do site aponta para a Algolia.
   Para scraping puro de HTML, usamos /newest e o arquivo da front page
   (/front?p=1..5), que ainda são server-rendered e cobrem os últimos dias. */
async function fetchFrontArchiveStories() {
  const urls = [`${HN}/newest`];
  for (let page = 1; page <= MAX_FRONT_PAGES; page++) urls.push(`${HN}/front?p=${page}`);

  const stories = [], seen = new Set();
  for (const url of urls) {
    const html = await getHtml(url);
    const parsed = parseStories(html);
    parsed.forEach((story) => {
      if (!story.id || seen.has(story.id)) return;
      seen.add(story.id);
      stories.push(story);
    });
  }
  if (!stories.length) throw new Error("nenhum post encontrado no HTML do Hacker News");
  return stories;
}

/** Monta o JSON do serviço: buzz 7d vs. 7d anteriores + front page. */
async function buildBuzz(tech, aliases) {
  const terms = collectTerms(tech, aliases);
  const pattern = new RegExp("(^|[^a-z0-9])(" + terms.map(escapeRegExp).join("|") + ")([^a-z0-9]|$)", "i");
  const matchesTitle = (title) => pattern.test(String(title || ""));

  const [stories, frontPageResult] = await Promise.all([
    fetchFrontArchiveStories(),
    getHtml(`${HN}/`).then((html) => parseStories(html)).catch(() => null)
  ]);

  const now = Date.now();
  const cutoffLast7 = now - 7 * DAY_MS;
  const cutoffPrev7 = now - 14 * DAY_MS;

  const matching = stories.filter((story) => matchesTitle(story.title));
  const inLast7 = matching.filter((story) => story.createdAt !== null && story.createdAt >= cutoffLast7);
  const inPrev7 = matching.filter((story) => story.createdAt !== null && story.createdAt >= cutoffPrev7 && story.createdAt < cutoffLast7);
  const term = tech.toLowerCase();
  const allLast7 = stories.filter((story) =>
    story.createdAt !== null && story.createdAt >= cutoffLast7 &&
    (matchesTitle(story.title) || String(story.url).toLowerCase().includes(term))
  );

  let frontPage = null;
  if (frontPageResult && frontPageResult.length) {
    frontPage = {
      posts: frontPageResult.length,
      matches: frontPageResult.filter((story) => matchesTitle(story.title)).length
    };
  }

  const recentPosts = inLast7.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8).map((story) => ({
    title: story.title,
    url: story.url,
    points: story.points,
    answers: story.comments,
    votes: story.points,
    views: null,
    tags: [],
    askedAt: story.createdAt ? new Date(story.createdAt).toISOString() : null,
    unanswered: story.comments === 0
  }));

  return {
    source: "hn-scrape",
    query: tech,
    siteUrl: HN,
    searchUrl: `${HN}/front`,
    titlesLast7d: inLast7.length,
    titlesPrev7d: inPrev7.length,
    deltaPct: computeWeeklyDeltaPct(inLast7.length, inPrev7.length),
    matchesLast7d: allLast7.length,
    frontPage,
    recentPosts,
    note: "API REST própria: scraping do HTML do news.ycombinator.com (/newest e /front?p=1.." + MAX_FRONT_PAGES + "), sem API. " +
      `Amostra de ${stories.length} posts; menções contam o termo no título ou na URL. O arquivo público cobre apenas os últimos dias, então a semana anterior pode ficar sem base de comparação.`
  };
}

async function getBuzz(tech, aliases) {
  const key = `${tech.toLowerCase()}|${aliases.join(",").toLowerCase()}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.t < CACHE_TTL_MS) return cached.data;
  const data = await buildBuzz(tech, aliases);
  CACHE.set(key, { t: Date.now(), data });
  return data;
}

/* ----------------------------------------------------------- arquivos estáticos */

async function serveStatic(response, pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative === "/") relative = "/index.html";

  const segments = relative.split("/").filter(Boolean);
  if (!segments.length || segments.some((part) => part.startsWith(".") || part === "config.local.js")) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const extension = path.extname(relative).toLowerCase();
  if (!MIME[extension]) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(ROOT, ...segments);
  if (!filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME[extension],
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

/* ------------------------------------------------------------------ servidor */

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  const pathname = url.pathname;
  response.setHeader("Access-Control-Allow-Origin", "*");

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "devtrends-hn-scraper-api", endpoints: ["/api/hackernews"] });
    return;
  }

  if (pathname === "/api/hackernews") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Use GET /api/hackernews?tech=<tecnologia>" });
      return;
    }
    const tech = (url.searchParams.get("tech") || "").trim();
    const aliases = (url.searchParams.get("aliases") || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8);
    if (!/^[A-Za-z0-9 .+#_-]{1,60}$/.test(tech)) {
      sendJson(response, 400, { error: "Parâmetro tech inválido (use letras, números, espaços, . + # - _, até 60 caracteres)." });
      return;
    }
    try {
      sendJson(response, 200, await getBuzz(tech, aliases), "public, max-age=300");
    } catch (error) {
      sendJson(response, 502, {
        source: "indisponivel",
        query: tech,
        searchUrl: `${HN}/front`,
        note: `Scraping do Hacker News indisponível: ${error.message}`,
        error: error.message
      });
    }
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }
  await serveStatic(response, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`DevTrends: site + API REST própria em http://localhost:${PORT}`);
  console.log(` scraping do Hacker News em GET /api/hackernews?tech=react`);
});
