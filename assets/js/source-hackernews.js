/* =========================================================================
   source-hackernews.js — fonte de dados Hacker News (busca oficial Algolia).

   Responsabilidade única: medir o "buzz" de uma tecnologia no HN em tempo
   real — posts (stories) cujo TÍTULO menciona a tecnologia nos últimos 7
   dias vs. os 7 dias anteriores — e verificar presença na front page.

   A API da Algolia (hn.algolia.com/api/v1) é o backend oficial de busca do
   site, libera CORS e é chamada SEM cache: cada análise busca dados frescos.

   Contrato de saída:
   { source, query, siteUrl, searchUrl, titlesLast7d, titlesPrev7d,
     deltaPct, matchesLast7d, frontPage, recentPosts[], note }
   Indisponível → source: "indisponivel" com note explicativa.
   ========================================================================= */
(function () {
  "use strict";

  var config = window.DEVTRENDS.config;
  var http = window.DEVTRENDS_HTTP;

  var SECONDS_PER_DAY = 86400;
  var ANALYSIS_WINDOW_DAYS = 7;
  var MAX_SEARCH_HITS = 1000;
  var FRONT_PAGE_SAMPLE_SIZE = 30;
  var RECENT_POST_LIMIT = 8;
  var SEARCH_TIMEOUT_BOOST_MILLISECONDS = 3000;
  var HN_SITE_URL = "https://news.ycombinator.com";

  /* Termos que são palavras comuns em inglês inflariam o casamento de título. */
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
   * Cria um predicado de casamento por palavra inteira (case-insensitive).
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {function(title: string): boolean}
   */
  function createTitleMatcher(tech) {
    var pattern = "(^|[^a-z0-9])(" + collectSearchTerms(tech).map(escapeRegExp).join("|") + ")([^a-z0-9]|$)";
    var titleRegex = new RegExp(pattern, "i");
    return function (title) { return titleRegex.test(String(title || "")); };
  }

  /**
   * Busca stories por janela de tempo (created_at_i é unix em segundos).
   * @param {{name: string}} tech
   * @param {string} numericFilter — ex.: "created_at_i>1730000000"
   * @returns {Promise<{hits: Object[], nbHits: number}>}
   */
  function searchStoriesForWindow(tech, numericFilter) {
    var url = config.hnAlgolia + "/search_by_date?tags=story&hitsPerPage=" + MAX_SEARCH_HITS + "&query=" +
      encodeURIComponent(tech.name) +
      (numericFilter ? "&numericFilters=" + encodeURIComponent(numericFilter) : "");
    return http.requestJson(url, { timeoutMs: config.timeoutMs + SEARCH_TIMEOUT_BOOST_MILLISECONDS });
  }

  /**
   * Resumo da front page atual do HN e quantos posts a mencionam.
   * Falha silenciosa → null (a front page é um extra, não essencial).
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {Promise<{posts: number, matches: number}|null>}
   */
  function fetchFrontPageSummary(tech) {
    return http.requestJson(config.hnAlgolia + "/search?tags=front_page&hitsPerPage=" + FRONT_PAGE_SAMPLE_SIZE, { timeoutMs: config.timeoutMs })
      .then(function (data) {
        var titleMatches = createTitleMatcher(tech);
        var hits = (data && data.hits) || [];
        return { posts: hits.length, matches: hits.filter(function (hit) { return titleMatches(hit.title); }).length };
      })
      .catch(function (error) {
        console.warn("[hn-front]", error && error.message);
        return null;
      });
  }

  /**
   * Normaliza um hit da API no formato de post usado pelo relatório
   * (compatível com a lista de perguntas do Stack Overflow).
   * @param {Object} hit
   * @returns {Object}
   */
  function toReportPost(hit) {
    return {
      title: hit.title || "",
      url: hit.url || (HN_SITE_URL + "/item?id=" + hit.objectID),
      points: Number(hit.points) || 0,
      answers: Number(hit.num_comments) || 0,
      votes: Number(hit.points) || 0,
      views: null,
      tags: [],
      askedAt: hit.created_at ? new Date(hit.created_at).toISOString() : null,
      unanswered: !(hit.num_comments > 0)
    };
  }

  /**
   * Percentual de variação semana a semana; sem base anterior → null,
   * primeira aparição → 100.
   * @param {number} currentCount
   * @param {number} previousCount
   * @returns {number|null}
   */
  function computeWeeklyDeltaPct(currentCount, previousCount) {
    if (previousCount > 0) return Math.round((currentCount - previousCount) / previousCount * 100);
    if (currentCount > 0) return 100;
    return null;
  }

  /**
   * Busca os dados de buzz no Hacker News para a tecnologia.
   * @param {{name: string, aliases?: string[]}} tech
   * @returns {Promise<Object>}
   */
  function fetchHackerNewsData(tech) {
    var nowUnixSeconds = Math.floor(Date.now() / 1000);
    var oneWeekAgo = nowUnixSeconds - ANALYSIS_WINDOW_DAYS * SECONDS_PER_DAY;
    var twoWeeksAgo = nowUnixSeconds - 2 * ANALYSIS_WINDOW_DAYS * SECONDS_PER_DAY;
    var searchTerm = tech.name;

    var base = {
      source: "hn-algolia",
      query: searchTerm,
      siteUrl: HN_SITE_URL,
      searchUrl: "https://hn.algolia.com/?q=" + encodeURIComponent(searchTerm),
      titlesLast7d: 0, titlesPrev7d: 0, deltaPct: null, matchesLast7d: 0,
      frontPage: null, recentPosts: []
    };

    return Promise.all([
      searchStoriesForWindow(tech, "created_at_i>" + oneWeekAgo).catch(function (error) {
        console.warn("[hn-week]", error.message); return null;
      }),
      searchStoriesForWindow(tech, "created_at_i>" + twoWeeksAgo + ",created_at_i<" + oneWeekAgo).catch(function (error) {
        console.warn("[hn-prev]", error.message); return null;
      }),
      fetchFrontPageSummary(tech)
    ]).then(function (results) {
      var currentWeek = results[0], previousWeek = results[1], frontPage = results[2];

      if (!currentWeek && !previousWeek) {
        return Object.assign({}, base, {
          source: "indisponivel",
          note: "Hacker News indisponível no momento (API Algolia não respondeu)."
        });
      }

      var titleMatches = createTitleMatcher(tech);
      var currentWeekHits = currentWeek && currentWeek.hits ? currentWeek.hits : [];
      var previousWeekHits = previousWeek && previousWeek.hits ? previousWeek.hits : [];
      var titlesLast7d = currentWeekHits.filter(function (hit) { return titleMatches(hit.title); }).length;
      var titlesPrev7d = previousWeekHits.filter(function (hit) { return titleMatches(hit.title); }).length;

      return Object.assign({}, base, {
        titlesLast7d: titlesLast7d,
        titlesPrev7d: titlesPrev7d,
        deltaPct: computeWeeklyDeltaPct(titlesLast7d, titlesPrev7d),
        matchesLast7d: (currentWeek && currentWeek.nbHits) || 0,
        frontPage: frontPage,
        recentPosts: currentWeekHits.filter(function (hit) { return titleMatches(hit.title); }).slice(0, RECENT_POST_LIMIT).map(toReportPost),
        note: "Contagem de menções em TÍTULOS de posts (stories) na API pública de busca do Hacker News (Algolia); compara os últimos 7 dias com os 7 dias anteriores. Menções totais (título + texto + url): " + ((currentWeek && currentWeek.nbHits) || 0) + "."
      });
    });
  }

  window.DEVTRENDS_HACKERNEWS = { get: fetchHackerNewsData };
})();
