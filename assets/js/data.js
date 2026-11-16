/* =========================================================================
   data.js — orquestrador das fontes e da análise.

   Responsabilidade única: coordenar o pipeline de um relatório e nada mais.

     1. resolveTech()          → qual tecnologia o usuário pediu
     2. GITHUB.get()           → repositório, estrelas, atividade
     3. STACKOVERFLOW.get()    → volume e saúde das perguntas
     4. HACKERNEWS.get()       → buzz em títulos de posts (tempo real)
     5. TIMELINE.buildTimeline() → série histórica derivada dos totais
     6. AI.analyze()           → Gemini (com rodízio de chaves) ou heurística
     7. coletarAvisos()        → avisos explícitos de degradação de dados

   O relatório final mostra de onde veio cada número; nada é inventado em
   silêncio. OAuth/cotas/rede falham? O relatório segue, com aviso.
   ========================================================================= */
(function () {
  "use strict";

  var catalog = window.DEVTRENDS_CATALOG;
  var keyRotation = window.DEVTRENDS.keys;
  var githubSource = window.DEVTRENDS_GITHUB;
  var stackOverflowSource = window.DEVTRENDS_STACKOVERFLOW;
  var hackerNewsSource = window.DEVTRENDS_HACKERNEWS;
  var timelineModule = window.DEVTRENDS_TIMELINE;
  var ai = window.DEVTRENDS_AI;

  /* Textos fixos de aviso (degradação conhecida e esperada). */
  var TIMELINE_ESTIMATE_WARNING =
    "A série histórica é estimada; apenas o ponto atual e a amostragem de stargazers são reais.";

  var GITHUB_RATE_LIMIT_WARNING =
    "Limite de taxa da API do GitHub atingido (cota de 60 req/h excedida). " +
    "Configure um GitHub Token no painel Config para ter 5.000 req/h.";

  /**
   * Detecta se o erro do GitHub foi cota/rate-limit (para escolher o aviso).
   * @param {string|null} errorMessage
   * @returns {boolean}
   */
  function isRateLimitError(errorMessage) {
    if (!errorMessage) return false;
    return errorMessage.indexOf("403") !== -1 ||
      errorMessage.indexOf("rate limit") !== -1 ||
      errorMessage.indexOf("cota") !== -1;
  }

  /**
   * Monta os avisos do relatório: a fonte explicita cada dado ausente,
   * estimado ou degradado.
   * @param {Object|null} github
   * @param {Object|null} stackOverflow
   * @param {Object|null} hackerNews
   * @param {Object} aiAnalysis — Gemini ou heurística local
   * @param {string|null} githubErrorMessage — último erro da fonte GitHub
   * @returns {string[]}
   */
  function collectWarnings(github, stackOverflow, hackerNews, aiAnalysis, githubErrorMessage) {
    var warnings = [];

    if (!github) {
      if (isRateLimitError(githubErrorMessage)) {
        warnings.push(GITHUB_RATE_LIMIT_WARNING);
      } else {
        warnings.push("GitHub REST API não respondeu" +
          (githubErrorMessage ? " (" + githubErrorMessage + ")" : "") +
          ". Configure um token no painel Config.");
      }
    }
    if (github && github.note) warnings.push(github.note);
    if (stackOverflow && stackOverflow.note) warnings.push(stackOverflow.note);
    if (hackerNews && hackerNews.note && hackerNews.source === "indisponivel") {
      warnings.push(hackerNews.note);
    }
    if (stackOverflow && stackOverflow.source === "demo") {
      warnings.push("Exibindo dados de demonstração para o Stack Overflow.");
    }
    if (aiAnalysis.source === "heuristica-local") {
      if (keyRotation.count() > 0) {
        warnings.push("Gemini indisponível (" + (aiAnalysis.geminiError || "erro na chamada") + "): análise gerada pela heurística local.");
      } else {
        warnings.push("Sem chave Gemini configurada: análise gerada pela heurística local.");
      }
    }
    warnings.push(TIMELINE_ESTIMATE_WARNING);
    if (keyRotation.count() > 1) {
      warnings.push("Rodízio de chaves Gemini ativo: " + keyRotation.count() + " chaves configuradas.");
    }

    return warnings;
  }

  /**
   * Gera o relatório completo da tecnologia com base nas opções da UI.
   * Todas as fontes são consultadas em paralelo; cada uma degrada de forma
   * independente (retornando null) sem interromper as outras.
   * @param {string} inputName — nome/alias/slug digitado pelo usuário
   * @param {Object} uiOptions — opções selecionadas na interface
   * @returns {Promise<Object>} relatório completo
   */
  function getInsights(inputName, uiOptions) {
    var selectedOptions = uiOptions || {};
    var tech = catalog.resolveTech(inputName);

    return Promise.all([
      githubSource.get(tech),
      stackOverflowSource.get(tech),
      hackerNewsSource.get(tech)
    ]).then(function (sourceResults) {
      var github = sourceResults[0];
      var stackOverflow = sourceResults[1];
      var hackerNews = sourceResults[2];
      var monthlyTimeline = timelineModule.buildTimeline(github, stackOverflow);

      return ai.analyze(tech, github, stackOverflow, hackerNews, monthlyTimeline, selectedOptions)
        .then(function (aiAnalysis) {
          var githubErrorMessage = githubSource.lastError();

          return {
            tech: tech,
            github: github,
            stackoverflow: stackOverflow,
            hn: hackerNews,
            ai: aiAnalysis,
            timeline: monthlyTimeline,
            generatedAt: new Date().toISOString(),
            warnings: collectWarnings(github, stackOverflow, hackerNews, aiAnalysis, githubErrorMessage),
            githubError: githubErrorMessage,
            userOptions: selectedOptions,
            sources: {
              github: github ? github.source : "indisponivel",
              stackoverflow: stackOverflow ? stackOverflow.source : "indisponivel",
              hn: hackerNews ? hackerNews.source : "indisponivel",
              ai: aiAnalysis.source
            }
          };
        });
    });
  }

  /**
   * API pública de dados. Mantém as chaves originais porque app.js e
   * widgets.js consomem este objeto diretamente.
   */
  window.DEVTRENDS_DATA = {
    catalog: catalog.list,
    popular: catalog.popular,
    slugify: catalog.slugify,
    resolveTech: catalog.resolveTech,
    formatNumber: catalog.formatNumber,
    formatCompact: catalog.formatCompact,
    summarizeStars: timelineModule.summarizeStars,
    getInsights: getInsights,
    heuristic: ai.heuristic,
    FOCUS_AREAS: catalog.FOCUS_AREAS,
    DEPTHS: catalog.DEPTHS,
    EXPERIENCE_LEVELS: catalog.EXPERIENCE_LEVELS
  };
})();
