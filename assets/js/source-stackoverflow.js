/* =========================================================================
   source-stackoverflow.js — fonte de dados Stack Exchange API v2.3.

   Responsabilidade única: obter totais da tag (perguntas / sem resposta) e
   uma amostra das perguntas mais recentes. Quando as APIs públicas não
   respondem, devolve uma amostra de demonstração claramente sinalizada
   (source: "demo") — nenhum dado é inventado sem aviso.

   Contrato de saída:
   { source, tag, tagUrl, totalQuestions, totalUnanswered, unansweredRate,
     sampleSize, sampleUnansweredRate, recentQuestions[], note }
   ========================================================================= */
(function () {
  "use strict";

  var config = window.DEVTRENDS.config;
  var http = window.DEVTRENDS_HTTP;

  /**
   * Monta uma URL da Stack Exchange API para site=stackoverflow,
   * incluindo a chave opcional configurada no painel Config.
   * @param {string} apiPath — ex.: "/questions"
   * @param {Object} [params]
   * @returns {string}
   */
  function stackExchangeUrl(apiPath, params) {
    var query = new URLSearchParams(Object.assign({ site: "stackoverflow" }, params || {}));
    if (config.stackexchangeKey) query.set("key", config.stackexchangeKey);
    return config.stackexchangeApi + apiPath + "?" + query.toString();
  }

  /**
   * Amostra das perguntas mais recentes da tag (ordem de criação).
   * @param {{soTag: string}} tech
   * @returns {Promise<{title, url, answers, votes, views, askedAt, unanswered}[]>}
   */
  function fetchRecentQuestions(tech) {
    return http.cachedJson(stackExchangeUrl("/questions", {
      tagged: tech.soTag, sort: "creation", order: "desc", pagesize: String(config.soSampleSize)
    })).then(function (data) {
      return (data.items || []).map(function (question) {
        return {
          title: question.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"),
          url: question.link, answers: question.answer_count, votes: question.score,
          views: question.view_count || null,
          askedAt: new Date(question.creation_date * 1000).toISOString(),
          unanswered: question.answer_count === 0
        };
      });
    });
  }

  /**
   * Totais de perguntas da tag e de perguntas sem resposta, com endpoint
   * de fallback caso o endpoint primário de "unanswered" falhe.
   * @param {{soTag: string}} tech
   * @returns {Promise<{total: number, unanswered: number}>}
   */
  function fetchTagTotals(tech) {
    return http.cachedJson(stackExchangeUrl("/tags/" + encodeURIComponent(tech.soTag) + "/info", {}))
      .then(function (tagInfo) {
        var total = tagInfo.items && tagInfo.items[0] && tagInfo.items[0].count ? tagInfo.items[0].count : 0;
        return http.cachedJson(stackExchangeUrl("/questions/unanswered", { tagged: tech.soTag, filter: "total" }))
          .catch(function () { return http.cachedJson(stackExchangeUrl("/search/advanced", { tagged: tech.soTag, answers: "0", filter: "total" })); })
          .then(function (unansweredInfo) { return { total: total, unanswered: unansweredInfo.total || 0 }; });
      });
  }

  /**
   * Amostra determinística de demonstração, usada só quando nenhuma API
   * respondeu; sinalizada com source "demo" em todo o relatório.
   * @param {{soTag: string}} tech
   * @returns {Object}
   */
  function buildDemoData(tech) {
    var seed = tech.soTag.split("").reduce(function (accumulator, character) { return accumulator + character.charCodeAt(0); }, 0);
    var total = 12000 + (seed * 7919) % 480000;
    var unanswered = Math.round(total * (0.18 + (seed % 17) / 100));
    return {
      source: "demo", tag: tech.soTag,
      tagUrl: config.stackOverflow + "/questions/tagged/" + encodeURIComponent(tech.soTag),
      totalQuestions: total, totalUnanswered: unanswered,
      unansweredRate: unanswered / total, sampleSize: 0,
      sampleUnansweredRate: 0, recentQuestions: [],
      note: "Dados de demonstração: as APIs públicas não responderam."
    };
  }

  /**
   * Busca totais + amostra do Stack Overflow para a tecnologia.
   * @param {{soTag: string}} tech
   * @returns {Promise<Object>} sempre resolve (com demo data se necessário)
   */
  function fetchStackOverflowData(tech) {
    var base = { tag: tech.soTag, tagUrl: config.stackOverflow + "/questions/tagged/" + encodeURIComponent(tech.soTag) };
    return Promise.all([
      fetchTagTotals(tech).catch(function (error) { console.warn("[se-totals]", error.message); return null; }),
      fetchRecentQuestions(tech).catch(function (error) { console.warn("[se-questions]", error.message); return []; })
    ]).then(function (results) {
      var tagTotals = results[0];
      var recentQuestions = results[1];

      var unansweredInSample = recentQuestions.filter(function (question) { return question.unanswered; }).length;
      var sampleUnansweredRate = recentQuestions.length ? unansweredInSample / recentQuestions.length : 0;

      if (!tagTotals && !recentQuestions.length) return Object.assign(base, buildDemoData(tech));

      var totalQuestions = tagTotals ? tagTotals.total : 0;
      var totalUnanswered = tagTotals ? tagTotals.unanswered : Math.round(totalQuestions * sampleUnansweredRate);

      var notes = [];
      notes.push(recentQuestions.length ? "Amostra de perguntas recentes via Stack Exchange API." : "Amostra de perguntas recentes indisponível.");
      if (!tagTotals) notes.push("Totais estimados a partir da amostra disponível.");

      return Object.assign(base, {
        source: "stackexchange-api",
        totalQuestions: totalQuestions,
        totalUnanswered: Math.min(totalUnanswered, totalQuestions),
        unansweredRate: totalQuestions > 0 ? Math.min(1, totalUnanswered / totalQuestions) : sampleUnansweredRate,
        sampleSize: recentQuestions.length,
        sampleUnansweredRate: sampleUnansweredRate,
        recentQuestions: recentQuestions,
        note: notes.join(" ")
      });
    }).catch(function () { return Object.assign(base, buildDemoData(tech)); });
  }

  window.DEVTRENDS_STACKOVERFLOW = { get: fetchStackOverflowData };
})();
