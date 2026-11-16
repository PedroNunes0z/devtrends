/* =========================================================================
   scraper.mjs — optional dependency-free scraping API (DEV.TO).

   dev.to is server-rendered and has no Cloudflare wall, so a tiny local
   server can scrape it directly. Home (dev.to/), trending (dev.to/trending)
   and the tag search (dev.to/search?q= tag, with the server-rendered
   dev.to/t/<tag> page as fallback) are scraped for real posts.

   Run: node tools/scraper.mjs
   Test: curl "http://127.0.0.1:8787/api/devto?tag=react"
   ========================================================================= */
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DEVTO = "https://dev.to";

/* Stack Overflow tags ("reactjs", "vue.js") map to dev.to tags ("react", "vue"). */
const TAG_ALIASES = {
  "reactjs": "react",
  "vue.js": "vue",
  "angular.js": "angular",
  "node-js": "node",
  "next-js": "nextjs",
  "nest-js": "nestjs",
  "tailwind-css": "tailwindcss",
  "svelte": "svelte",
  "graphql": "graphql",
  "postgres": "postgresql"
};
function toDevtoTag(tag) {
  const t = (tag || "").toLowerCase();
  if (TAG_ALIASES[t]) return TAG_ALIASES[t];
  const looser = t.replace(/\.[jt]sx?$/, "").replace(/-js$/, "js");
  return TAG_ALIASES[looser] || looser;
}

function decode(text) {
  return text
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}
function stripTags(html) { return decode(html.replace(/<[^>]*>/g, "")); }

/* dev.to renders counters as "1.2k", "98", "1,234". */
function parseCount(raw) {
  if (!raw) return 0;
  const m = raw.trim().match(/^([\d.,]+)\s*([kKmM])?/);
  if (!m) return 0;
  let n = Number(m[1].replace(/,/g, ""));
  if (Number.isNaN(n)) return 0;
  if (m[2] === "k" || m[2] === "K") n *= 1000;
  if (m[2] === "m" || m[2] === "M") n *= 1000000;
  return n;
}

async function get(path) {
  const response = await fetch(DEVTO + path, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`dev.to respondeu HTTP ${response.status} em ${path}`);
  return response.text();
}

/* The public feed of dev.to itself (what /search and /t load via JS). */
async function getJson(path) {
  const response = await fetch(DEVTO + path, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`dev.to respondeu HTTP ${response.status} em ${path}`);
  return response.json();
}

/* Home (https://dev.to/) and tag pages use the same crayons-story cards. */
function parseStories(html, limit) {
  const chunks = html.split(/class="crayons-story[ "]/).slice(1);
  const posts = [];
  for (const chunk of chunks) {
    if (posts.length >= limit) break;
    const link = chunk.match(/crayons-story__title[\s\S]{0,600}?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = stripTags(link[2]);
    if (!title) continue;
    const href = link[1].split("?")[0];
    const url = href.startsWith("http") ? href : DEVTO + href;
    const reactions = chunk.match(/aggregate_reactions_counter[^>]*>\s*([\d.,]+\s*[kKmM]?)/);
    /* dev.to renders "N comments" only when N > 0; otherwise "Add Comment". */
    const comments = chunk.match(/>\s*([\d.,]+\s*[kKmM]?)\s*(?:<span[^>]*>\s*)?comments/i);
    const time = chunk.match(/datetime="([^"]+)"/);
    const tags = [...chunk.matchAll(/href="\/t\/([\w-]+)/g)].map((m) => m[1].toLowerCase());
    posts.push({
      title: title.slice(0, 180),
      url,
      answers: parseCount(comments && comments[1]),
      votes: parseCount(reactions && reactions[1]),
      views: null,
      tags,
      askedAt: time ? new Date(time[1]).toISOString() : null,
      unanswered: !comments || parseCount(comments[1]) === 0
    });
  }
  return posts;
}

/* Trending (https://dev.to/trending/) uses trend-cards: a topic tag and
   "N posts in the last 7 days". Used as a signal, not as sample data. */
function parseTrending(html) {
  const cards = html.split(/class="crayons-card trend-card/).slice(1);
  return cards.slice(0, 20).map((chunk) => {
    const tag = chunk.match(/href="\/t\/([\w-]+)"/);
    const posts = chunk.match(/([\d.,]+)\s*posts?\s*in\s*the\s*last\s*7\s*days/i);
    return {
      tag: tag ? tag[1].toLowerCase() : null,
      postsLast7Days: posts ? parseCount(posts[1]) : null
    };
  }).filter((t) => t.tag);
}

/* Search (https://dev.to/search?q=tag) is rendered client-side ("Loading
   posts..."), so the same query is also served from the server-rendered
   tag page https://dev.to/t/<tag>. */
async function scrapeTagPosts(tag, limit) {
  const searchHtml = await get(`/search?utf8=%E2%9C%93&q=${encodeURIComponent(tag)}`);
  let posts = parseStories(searchHtml, limit);
  if (posts.length) return { posts, via: "search-page" };
  const tagHtml = await get(`/t/${encodeURIComponent(tag)}`);
  posts = parseStories(tagHtml, limit);
  return { posts, via: "tag-page" };
}

async function scrape(tag, limit) {
  const devtoTag = toDevtoTag(tag);
  const [homeHtml, trendingHtml, tagResult] = await Promise.all([
    get("/").catch(() => null),
    get("/trending").catch(() => null),
    scrapeTagPosts(devtoTag, limit)
  ]);

  const homePosts = homeHtml ? parseStories(homeHtml, 50) : [];
  const trending = trendingHtml ? parseTrending(trendingHtml) : [];
  const trendingMatch = trending.find((t) => t.tag === devtoTag) || null;
  const homeMatchesTag = homePosts.some((p) => p.tags.includes(devtoTag));

  const seen = new Set();
  const recentPosts = tagResult.posts.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });

  /* The tag page renders no comment counters, so exact counts come from the
     dev.to feed that the same pages load via JavaScript. */
  let enriched = false;
  try {
    const feed = await getJson(`/api/articles?tag=${encodeURIComponent(devtoTag)}&per_page=${limit}`);
    const byUrl = new Map((feed || []).map((a) => [a.url, a]));
    for (const post of recentPosts) {
      const article = byUrl.get(post.url);
      if (!article) continue;
      post.answers = Number(article.comments_count) || 0;
      post.votes = Number(article.public_reactions_count) || 0;
      if (article.published_at) post.askedAt = new Date(article.published_at).toISOString();
      post.unanswered = post.answers === 0;
      enriched = true;
    }
  } catch (_) { /* keep the scraped values */ }

  const notes = recentPosts.length
    ? `${recentPosts.length} publicações raspadas de dev.to (via ${tagResult.via}${enriched ? ", contadores do feed dev.to" : ""}).`
    : "Nenhuma publicação reconhecida no markup do dev.to.";
  if (trendingMatch) notes.push(` Tag #${devtoTag} em dev.to/trending: ${trendingMatch.postsLast7Days ?? "?"} posts nos últimos 7 dias.`);

  return {
    source: "devto-scrape",
    tag: devtoTag,
    requestedTag: tag,
    totalQuestions: recentPosts.length,
    recentQuestions: recentPosts,
    trending: {
      scraped: Boolean(trendingHtml),
      tagInTrending: Boolean(trendingMatch),
      postsLast7Days: trendingMatch ? trendingMatch.postsLast7Days : null,
      trendingTags: trending.length,
      homePostsScraped: homePosts.length,
      tagOnHome: homeMatchesTag
    },
    note: notes
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  if (url.pathname === "/api/health") {
    res.end(JSON.stringify({ ok: true, service: "devtrends-local-scraper-devto" }));
    return;
  }
  if (url.pathname !== "/api/devto") {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Use /api/devto?tag=<tag>" }));
    return;
  }
  const tag = (url.searchParams.get("tag") || "").slice(0, 40);
  const limit = Math.min(50, Math.max(10, Number(url.searchParams.get("limit")) || 30));
  if (!/^[a-z0-9.+#-]+$/i.test(tag)) {
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
  console.log(`DevTrends local scraper (DEV.TO): http://127.0.0.1:${PORT}/api/devto?tag=react`);
});
