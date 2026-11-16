/* =========================================================================
   source-github.js — fonte de dados GitHub REST API.

   Responsabilidade única: obter o snapshot do repositório canônico de uma
   tecnologia (estrelas, forks, issues, atividade) e amostrar eventos reais
   de stargazers das páginas mais recentes da lista.

   Contrato de saída (usado pelo orquestrador e pelo widgets):
   { source, repo{...}, sampleSize, starSample[], daysSincePush, note }
   Falha → null (o erro fica disponível via lastError()).
   ========================================================================= */
(function () {
  "use strict";

  var config = window.DEVTRENDS.config;
  var http = window.DEVTRENDS_HTTP;
  var catalog = window.DEVTRENDS_CATALOG;

  var GITHUB_API_VERSION = "2022-11-28";
  var MILLISECONDS_PER_DAY = 86400000;
  var STARGAZERS_PER_PAGE = 100;
  var MAX_STAR_PAGE = 400;

  var lastErrorMessage = null;

  /**
   * Cabeçalhos padrão da REST API; injeta o token opcional do painel Config.
   * @param {string} [acceptType]
   * @returns {Object}
   */
  function buildRequestHeaders(acceptType) {
    var headers = { Accept: acceptType || "application/vnd.github+json", "X-GitHub-Api-Version": GITHUB_API_VERSION };
    if (config.githubToken) headers.Authorization = "Bearer " + config.githubToken;
    return headers;
  }

  /**
   * Descobre o repositório mais relevante quando a tecnologia não declara um.
   * @param {{repo: string, name: string}} tech
   * @returns {Promise<string>} full_name ("owner/repo")
   */
  function findRepository(tech) {
    if (tech.repo) return Promise.resolve(tech.repo);

    var searchQuery = encodeURIComponent(tech.name + " in:name");
    return http.cachedJson(config.githubApi + "/search/repositories?q=" + searchQuery + "&sort=stars&order=desc&per_page=5", { headers: buildRequestHeaders() })
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) throw new Error("nenhum repositório encontrado");
        var exactNameMatch = items.filter(function (repository) {
          return catalog.normalizeForComparison(repository.name) === catalog.normalizeForComparison(tech.name);
        })[0];
        return (exactNameMatch || items[0]).full_name;
      });
  }

  /**
   * Amostra stargazers das últimas páginas possíveis (eventos mais recentes),
   * agregando por dia. Erros de página são ignorados (amostra parcial).
   * @param {string} repositoryFullName
   * @param {number} totalStars
   * @returns {Promise<{size: number, sample: {date: string, count: number}[]}>}
   */
  function sampleLatestStargazers(repositoryFullName, totalStars) {
    var lastPage = Math.max(1, Math.min(Math.ceil(totalStars / STARGAZERS_PER_PAGE), MAX_STAR_PAGE));
    var pages = [];
    for (var page = Math.max(1, lastPage - config.stargazerSamplePages + 1); page <= lastPage; page++) pages.push(page);

    return Promise.all(pages.map(function (pageNumber) {
      return http.cachedJson(config.githubApi + "/repos/" + repositoryFullName + "/stargazers?per_page=" + STARGAZERS_PER_PAGE + "&page=" + pageNumber,
        { headers: buildRequestHeaders("application/vnd.github.star+json") }).catch(function () { return []; });
    })).then(function (pageResults) {
      var stargazersByDay = {}, sampledTotal = 0;
      pageResults.forEach(function (pageStargazers) {
        (Array.isArray(pageStargazers) ? pageStargazers : []).forEach(function (stargazer) {
          if (!stargazer.starred_at) return;
          var day = stargazer.starred_at.slice(0, 10);
          stargazersByDay[day] = (stargazersByDay[day] || 0) + 1;
          sampledTotal += 1;
        });
      });
      return {
        size: sampledTotal,
        sample: Object.keys(stargazersByDay).sort().map(function (day) { return { date: day, count: stargazersByDay[day] }; })
      };
    });
  }

  /**
   * Busca o snapshot completo do GitHub para a tecnologia.
   * @param {{repo: string, name: string}} tech
   * @returns {Promise<Object|null>} null quando a API não responde
   */
  function fetchGithubData(tech) {
    lastErrorMessage = null;
    return findRepository(tech).then(function (repositoryFullName) {
      return http.cachedJson(config.githubApi + "/repos/" + repositoryFullName, { headers: buildRequestHeaders() })
        .then(function (repository) {
          return {
            source: "github-api",
            repo: {
              fullName: repository.full_name, url: repository.html_url, description: repository.description,
              language: repository.language, stars: repository.stargazers_count, forks: repository.forks_count,
              openIssues: repository.open_issues_count, watchers: repository.subscribers_count,
              createdAt: repository.created_at, pushedAt: repository.pushed_at,
              license: repository.license && repository.license.spdx_id, topics: repository.topics || [],
              archived: repository.archived, ownerAvatar: repository.owner && repository.owner.avatar_url
            },
            sampleSize: 0, starSample: [],
            daysSincePush: Math.max(0, Math.floor((Date.now() - new Date(repository.pushed_at).getTime()) / MILLISECONDS_PER_DAY)),
            note: ""
          };
        })
        .then(function (githubData) {
          return sampleLatestStargazers(githubData.repo.fullName, githubData.repo.stars).then(function (starSampling) {
            githubData.sampleSize = starSampling.size;
            githubData.starSample = starSampling.sample;
            return githubData;
          });
        });
    }).catch(function (error) {
      lastErrorMessage = error.message;
      console.warn("[github]", error.message);
      return null;
    });
  }

  window.DEVTRENDS_GITHUB = {
    get: fetchGithubData,
    /** Mensagem do último erro de rede (para avisos do relatório). */
    lastError: function () { return lastErrorMessage; }
  };
})();
