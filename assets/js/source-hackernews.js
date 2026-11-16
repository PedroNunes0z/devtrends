/* =========================================================================
   source-hackernews.js — fonte de dados Hacker News por SCRAPING de HTML.

   Nenhuma API é usada. O módulo baixa o HTML de /newest e do arquivo da
   front page (/front?p=1..3) — o HN desativou /search — e faz o parsing no
   navegador com DOMParser: título, pontos, comentários e idade de cada post.

   A via preferencial é a API REST própria (tools/scraper.mjs), que faz esse
   scraping no servidor e devolve JSON. Como o HN não envia CORS, em
   hospedagem puramente estática o HTML passa por proxies públicos definidos
   em config.js. Se todas as vias falharem, a fonte retorna "indisponivel" —
   nenhum número é inventado.

   Contrato de saída (inalterado, usado pelo orquestrador e pelos widgets):
   { source, query, siteUrl, searchUrl, titlesLast7d, titlesPrev7d,
     deltaPct, matchesLast7d, frontPage, recentPosts[], note }
   ========================================================================= */
(function () {
  "use strict";

  var config = window.DEVTRENDS.config;
  var http = window.DEVTRENDS_HTTP;

  var HN_SITE_URL = config.hnSite || "https://news.ycombinator.com";
  var ANALYSIS_WINDOW_DAYS = 7;
  var MAX_SEARCH_PAGES = 3;
  var RECENT_POST_LIMIT = 8;
  var MILLISECONDS_PER_DAY = 86400000;

  /* Termos comuns em inglês inflariam o casamento de título. */
  var COMMON_ENGLISH_WORDS = { "go": true, "r": true, "c": true, "ai": true };

  /**
   * @param {string} text
   * @returns {string} texto pronto para uso dentro de RegExp
   */
  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Termos distintos (nome + aliases) que identificam a tecnologia em títulos.
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {string[]}
   */
  function collectSearchTerms(tech) {
    var seen = {}, terms = [];
    [tech.name].concat(tech.aliases || []).forEach(function (candidate) {
      var term = String(candidate).trim().toLowerCase();
      if (!term || term.length < 2 || COMMON_ENGLISH_WORDS[term] || seen[term]) return;
      seen[term] = true;
      terms.push(term);
    });
    return terms.length ? terms : [tech.name.toLowerCase()];
  }

  /**
   * Predicado de casamento por palavra inteira (case-insensitive).
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {function(title: string): boolean}
   */
  function createTitleMatcher(tech) {
    var pattern = "(^|[^a-z0-9])(" + collectSearchTerms(tech).map(escapeRegExp).join("|") + ")([^a-z0-9]|$)";
    var titleRegex = new RegExp(pattern, "i");
    return function (title) { return titleRegex.test(String(title || "")); };
  }

  /**
   * Percentual de variação semana a semana; sem base anterior → null,
   * primeira aparição → 100.
   */
  function computeWeeklyDeltaPct(currentCount, previousCount) {
    if (previousCount > 0) return Math.round((currentCount - previousCount) / previousCount * 100);
    if (currentCount > 0) return 100;
    return null;
  }

  function absoluteUrl(href, baseUrl) {
    if (!href) return "";
    try { return new URL(href, baseUrl || HN_SITE_URL).toString(); } catch (error) { return href; }
  }

  /**
   * Converte o campo de idade do HN (`title` ISO ou texto "3 hours ago")
   * em timestamp em milissegundos. Retorna null quando não há data legível.
   */
  function parseTimestamp(ageElement) {
    if (!ageElement) return null;

    var iso = ageElement.getAttribute("title");
    if (iso) {
      var fromIso = new Date(iso);
      if (!isNaN(fromIso.getTime())) return fromIso.getTime();
    }

    var text = String(ageElement.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "just now") return Date.now();

    var relative = text.match(/^(\d+)\s+(minute|hour|day|month|year)s?\s+ago/);
    if (relative) {
      var amounts = { minute: 60000, hour: 3600000, day: MILLISECONDS_PER_DAY, month: 30 * MILLISECONDS_PER_DAY, year: 365 * MILLISECONDS_PER_DAY };
      return Date.now() - Number(relative[1]) * amounts[relative[2]];
    }

    var dated = text.match(/^on\s+(.+)$/);
    if (dated) {
      var fromText = new Date(dated[1]);
      if (!isNaN(fromText.getTime())) return fromText.getTime();
    }
    return null;
  }

  /**
   * Faz o scraping de uma página HTML do HN: títulos, pontos, comentários,
   * idade e link da próxima página (quando existir).
   * @param {string} html
   * @param {string} pageUrl
   * @returns {{stories: Object[]}}
   */
  function parseStories(html, pageUrl) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var rows = doc.querySelectorAll("tr.athing");
    var stories = [];

    Array.prototype.forEach.call(rows, function (row) {
      /* HN usa .titleline em páginas novas e .storylink nas mais antigas. */
      var titleLink = row.querySelector("span.titleline > a") ||
        row.querySelector("td.title a.storylink") ||
        row.querySelector("td.title > a");
      if (!titleLink) return;

      var title = String(titleLink.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) return;

      /* A linha de metadados é o <tr> seguinte; em buscas antigas pode ser
         a mesma linha. */
      var sibling = row.nextElementSibling;
      var subtext = (sibling && sibling.querySelector(".subtext")) ? sibling.querySelector(".subtext") : row.querySelector(".subtext");

      var scoreElement = subtext && subtext.querySelector(".score");
      var points = scoreElement ? (parseInt(String(scoreElement.textContent).replace(/[^\d-]/g, ""), 10) || 0) : 0;

      var comments = 0;
      if (subtext) {
        Array.prototype.forEach.call(subtext.querySelectorAll("a"), function (anchor) {
          var label = String(anchor.textContent || "").toLowerCase();
          if (label.indexOf("comment") === -1 && label.indexOf("discuss") === -1) return;
          var count = parseInt(String(anchor.textContent).replace(/[^\d]/g, ""), 10);
          if (!isNaN(count)) comments = count;
        });
      }

      var storyId = row.id || "";
      stories.push({
        id: storyId,
        title: title,
        url: absoluteUrl(titleLink.getAttribute("href"), pageUrl) || (HN_SITE_URL + "/item?id=" + encodeURIComponent(storyId)),
        points: points,
        comments: comments,
        createdAt: parseTimestamp(subtext && subtext.querySelector(".age"))
      });
    });

    return { stories: stories };
  }

  /**
   * Busca o HTML de uma página do HN tentando cada proxy em ordem.
   * @param {string} pageUrl
   * @returns {Promise<string>}
   */
  function scrapeHtml(pageUrl) {
    var proxies = config.hnScrapeProxies && config.hnScrapeProxies.length
      ? config.hnScrapeProxies
      : ["https://api.allorigins.win/raw?url="];
    var failures = [];

    function attempt(index) {
      if (index >= proxies.length) {
        return Promise.reject(new Error("HTML do HN indisponível (" + failures.join(" | ") + ")"));
      }
      var proxy = proxies[index];
      return http.requestText(proxy + encodeURIComponent(pageUrl), { timeoutMs: (config.timeoutMs || 9000) + 2000 })
        .then(function (html) {
          var text = String(html || "");
          var isHnPage = text.indexOf("hnmain") !== -1 || text.indexOf("athing") !== -1 || /no results/i.test(text);
          if (text.length < 200 || text.indexOf("<") === -1 || !isHnPage) {
            throw new Error("resposta não é uma página HTML do Hacker News");
          }
          return text;
        })
        .catch(function (error) {
          failures.push(proxy.replace(/\?.*$/, "?…") + ": " + error.message);
          return attempt(index + 1);
        });
    }

    return attempt(0);
  }

  /**
   * Fallback estático: o HN desativou /search, então raspa /newest e o
   * arquivo da front page (/front?p=1..3), ambos HTML server-rendered.
   * @returns {Promise<Object[]>}
   */
  function fetchSearchStories() {
    var urls = [HN_SITE_URL + "/newest"];
    for (var page = 1; page <= MAX_SEARCH_PAGES; page++) {
      urls.push(HN_SITE_URL + "/front?p=" + page);
    }
    var stories = [], seen = {}, index = 0;

    function loadNext() {
      if (index >= urls.length) return Promise.resolve(stories);
      var currentUrl = urls[index++];
      return scrapeHtml(currentUrl).then(function (html) {
        var parsed = parseStories(html, currentUrl);
        parsed.stories.forEach(function (story) {
          var key = story.id || story.title;
          if (!key || seen[key]) return;
          seen[key] = true;
          stories.push(story);
        });
        return loadNext();
      });
    }

    return loadNext().then(function (result) {
      if (!result.length) throw new Error("HTML do HN sem posts reconhecíveis");
      return result;
    });
  }

  /**
   * Raspa a front page atual para saber se a tecnologia está no ar.
   * É um extra: falha silenciosa → null.
   */
  function fetchFrontPage(tech) {
    var pageUrl = HN_SITE_URL + "/";
    return scrapeHtml(pageUrl).then(function (html) {
      var stories = parseStories(html, pageUrl).stories;
      if (!stories.length) throw new Error("front page do HN sem posts reconhecíveis");
      var titleMatches = createTitleMatcher(tech);
      return {
        posts: stories.length,
        matches: stories.filter(function (story) { return titleMatches(story.title); }).length
      };
    }).catch(function (error) {
      console.warn("[hn-front]", error.message);
      return null;
    });
  }

  /**
   * Fallback para hospedagem puramente estática: raspa o HTML no navegador
   * através dos proxies de CORS. A via preferencial é a API REST própria.
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {Promise<Object>}
   */
  function scrapeHackerNewsInBrowser(tech) {
    var searchUrl = HN_SITE_URL + "/front";
    var base = {
      source: "hn-scrape",
      query: tech.name,
      siteUrl: HN_SITE_URL,
      searchUrl: searchUrl,
      titlesLast7d: 0,
      titlesPrev7d: 0,
      deltaPct: null,
      matchesLast7d: 0,
      frontPage: null,
      recentPosts: []
    };

    var now = Date.now();
    var cutoffLast7 = now - ANALYSIS_WINDOW_DAYS * MILLISECONDS_PER_DAY;
    var cutoffPrev7 = now - 2 * ANALYSIS_WINDOW_DAYS * MILLISECONDS_PER_DAY;

    return Promise.all([
      fetchSearchStories().catch(function (error) {
        console.warn("[hn-search]", error.message);
        return null;
      }),
      fetchFrontPage(tech)
    ]).then(function (results) {
      var stories = results[0];
      var frontPage = results[1];

      if (!stories) {
        return Object.assign({}, base, {
          source: "indisponivel",
          note: "Não foi possível raspar o HTML do Hacker News (API própria e proxies CORS indisponíveis). Veja o arquivo da front page em " + searchUrl + "."
        });
      }

      var titleMatches = createTitleMatcher(tech);
      var matching = stories.filter(function (story) { return titleMatches(story.title); });
      var inLast7 = matching.filter(function (story) { return story.createdAt !== null && story.createdAt >= cutoffLast7; });
      var inPrev7 = matching.filter(function (story) {
        return story.createdAt !== null && story.createdAt >= cutoffPrev7 && story.createdAt < cutoffLast7;
      });
      var term = tech.name.toLowerCase();
      var allLast7 = stories.filter(function (story) {
        return story.createdAt !== null && story.createdAt >= cutoffLast7 &&
          (titleMatches(story.title) || String(story.url).toLowerCase().indexOf(term) !== -1);
      });

      var recentPosts = inLast7.slice().sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }).slice(0, RECENT_POST_LIMIT).map(function (story) {
        return {
          title: story.title,
          url: story.url,
          points: story.points,
          answers: story.comments,
          votes: story.points,
          views: null,
          tags: [],
          askedAt: story.createdAt ? new Date(story.createdAt).toISOString() : null,
          unanswered: story.comments === 0
        };
      });

      return Object.assign({}, base, {
        titlesLast7d: inLast7.length,
        titlesPrev7d: inPrev7.length,
        deltaPct: computeWeeklyDeltaPct(inLast7.length, inPrev7.length),
        matchesLast7d: allLast7.length,
        frontPage: frontPage,
        recentPosts: recentPosts,
        note: "Scraping do HTML do news.ycombinator.com (/newest e /front), sem API. Amostra de " +
          stories.length + " posts; posts sem data legível ficam fora das janelas semanais."
      });
    });
  }

  /**
   * Via preferencial: API REST criada para este projeto. O servidor faz o
   * web scraping do HN e devolve o JSON já estruturado (ver tools/scraper.mjs).
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {Promise<Object>}
   */
  function fetchFromStudentApi(tech) {
    var base = config.hnApiBase || "/api";
    var query = "?tech=" + encodeURIComponent(tech.name);
    if (tech.aliases && tech.aliases.length) {
      query += "&aliases=" + encodeURIComponent(tech.aliases.join(","));
    }
    return http.requestJson(base + "/hackernews" + query, { timeoutMs: (config.timeoutMs || 9000) + 6000 })
      .then(function (data) {
        if (!data || data.source !== "hn-scrape") throw new Error("API própria indisponível");
        return data;
      });
  }

  function fetchHackerNewsData(tech) {
    return fetchFromStudentApi(tech).catch(function (error) {
      console.warn("[hn-api]", error.message);
      return scrapeHackerNewsInBrowser(tech);
    });
  }

  window.DEVTRENDS_HACKERNEWS = { get: fetchHackerNewsData };
})();
