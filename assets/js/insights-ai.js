/* =========================================================================
   insights-ai.js — camada de interpretação das métricas.

   Responsabilidades:
     1. buildPrompt(): montar o prompt OBRIGATÓRIO com dados do GitHub,
        do Stack Overflow, do Hacker News E das opções selecionadas pelo
        usuário na interface.
     2. analyze(): chamar o Gemini com structured output (JSON schema) e
        rodízio automático de chaves; sem chave (ou com todas falhando),
        degrada para a heurística local determinística.
     3. buildLocalHeuristic(): fallback sem rede que reproduz o formato do
        schema e é sempre sinalizado como "heurística local".

   A saída — do Gemini ou da heurística — tem o MESMO formato, então o
   widgets.js a renderiza como widgets sem saber quem produziu.
   ========================================================================= */
(function () {
  "use strict";

  var config = window.DEVTRENDS.config;
  var keyRotation = window.DEVTRENDS.keys;
  var http = window.DEVTRENDS_HTTP;
  var catalog = window.DEVTRENDS_CATALOG;
  var timelineModule = window.DEVTRENDS_TIMELINE;

  /* ---Limites da chamada Gemini----------------------------------------- */
  var GEMINI_TIMEOUT_MILLISECONDS = 20000;
  var GENERATION_TEMPERATURE = 0.35;
  var MAX_OUTPUT_TOKENS = 2000;

  /* ---Limites de normalização da resposta--------------------------------- */
  var SCORE_MIN = 0, SCORE_MAX = 100;
  var TAG_LIMIT = 6, TAG_LABEL_MAX = 40;
  var PREVISAO_MAX = 90, RESUMO_MAX = 600, JUSTIFICATIVA_MAX = 700, RECOMENDACAO_MAX = 400;
  var PONTO_MAX = 120, PONTO_LIMIT = 3, ALTERNATIVA_MAX = 60, ALTERNATIVA_LIMIT = 2;
  var HORIZONTE_MAX = 30;

  /**
   * JSON Schema do structured output do Gemini. Todo campo é renderizado
   * como widget (nunca como texto puro).
   * @type {Object}
   */
  var RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
      indiceVitalidade: { type: "INTEGER" },
      tendencia: { type: "STRING", enum: ["em_alta", "estavel", "em_queda"] },
      previsao: { type: "STRING" },
      resumo: { type: "STRING" },
      justificativa: { type: "STRING" },
      recomendacao: { type: "STRING" },
      confianca: { type: "NUMBER" },
      tags: { type: "ARRAY", items: { type: "OBJECT", properties: { label: { type: "STRING" }, tone: { type: "STRING", enum: ["positivo", "atencao", "neutro"] } }, required: ["label", "tone"] } },
      scoreBreakdown: {
        type: "OBJECT",
        properties: {
          popularidade: { type: "INTEGER" },
          atividade: { type: "INTEGER" },
          manutencao: { type: "INTEGER" },
          comunidade: { type: "INTEGER" },
          suporte: { type: "INTEGER" },
          adocao: { type: "INTEGER" }
        }
      },
      comparativo: {
        type: "OBJECT",
        properties: {
          pontosFortes: { type: "ARRAY", items: { type: "STRING" } },
          pontosAtencao: { type: "ARRAY", items: { type: "STRING" } },
          alternativas: { type: "ARRAY", items: { type: "STRING" } }
        }
      },
      projecao: {
        type: "OBJECT",
        properties: {
          horizonte: { type: "STRING" },
          risco: { type: "STRING", enum: ["baixo", "medio", "alto"] },
          momentum: { type: "STRING", enum: ["positivo", "neutro", "negativo"] }
        }
      }
    },
    required: ["indiceVitalidade", "tendencia", "previsao", "resumo", "justificativa", "recomendacao", "confianca", "tags", "scoreBreakdown", "comparativo", "projecao"]
  };

  var SYSTEM_INSTRUCTION = "Você é um analista de engenharia de software. Recebe métricas REAIS do GitHub e do Stack Overflow, além de opções selecionadas pelo usuário na interface, e produz um Índice de Vitalidade (0-100) para ajudar a decidir o que estudar ou qual stack adotar. Regras: escreva em português do Brasil, tom técnico e direto, sem marketing; baseie cada afirmação nos números; se um dado faltar, reduza a confiança e diga isso; não invente números ou datas; popularidade não é saúde (atividade, volume de dúvidas e taxa de resolução pesam mais); use escala logarítmica; 'previsao' deve ser um rótulo curto; 'tags' de 4 a 6 itens curtos, sem espaços, misturando pontos fortes e de atenção. Em 'scoreBreakdown', dê notas de 0 a 100 para cada dimensão. Em 'comparativo', liste 2-3 pontos fortes, 2-3 pontos de atenção e 1-2 tecnologias alternativas. Em 'projecao', indique horizonte (ex: '6 meses'), risco e momentum. Responda SOMENTE com o JSON do schema.";

  /* ---Heurística local: pesos, saturação log e limiares------------------ */
  var HEURISTIC_WEIGHTS = { popularidade: 0.25, adocao: 0.1, atividade: 0.2, manutencao: 0.1, comunidade: 0.15, suporte: 0.2 };

  /* Teto de saturação da escala logarítmica por métrica. */
  var SATURATION_CEILING = { stars: 250000, forks: 60000, questions: 2000000 };

  var STARS_ECOSYSTEM_THRESHOLD = 40000;      /* ecossistema maduro */
  var QUESTIONS_COMMUNITY_THRESHOLD = 100000; /* comunidade grande */
  var RECENT_PUSH_DAYS = 30;                  /* push considerado recente */
  var STALE_PUSH_DAYS = 180;                  /* push considerado irregular */
  var ACTIVITY_WINDOW_DAYS = 180;             /* janela de decaimento da atividade */
  var GROWING_PUSH_DAYS = 60;                 /* push necessário p/ "em alta" */
  var GROWING_MIN_MONTHLY_STARS = 30;         /* piso de velocidade p/ "em alta" */
  var GROWING_RELATIVE_VELOCITY = 0.004;      /* 0.4% das estrelas/mês */
  var GOOD_UNANSWERED_RATE = 0.3, HIGH_UNANSWERED_RATE = 0.38;
  var ISSUE_BACKLOG_STAR_RATIO = 0.05;
  var DEAD_PROJECT_DAYS = 365;                /* sem push há 1 ano */
  var HEALTHY_SCORE = 70;                     /* nota que sugere adoção */
  var CONFIDENCE_BASE = 0.15, CONFIDENCE_GITHUB = 0.4, CONFIDENCE_STACKOVERFLOW = 0.35, CONFIDENCE_BOTH_BONUS = 0.1;
  var CONFIDENCE_FLOOR = 0.15, CONFIDENCE_CEILING = 0.9;

  /**
   * Nota 0-100 em escala logarítmica: 1 unidade vale o mesmo em 100 → 200
   * quanto em 100k → 200k (popularidade não é linear).
   * @param {number} value
   * @param {number} saturationCeiling — valor que mapeia para 100
   * @returns {number}
   */
  function logarithmicScore(value, saturationCeiling) {
    return catalog.clamp(Math.log10(Math.max(value, 1)) / Math.log10(saturationCeiling) * 100, SCORE_MIN, SCORE_MAX);
  }

  /**
   * Fallback determinístico quando o Gemini não está disponível.
   * Reproduz o schema do Gemini para que os widgets funcionem igual.
   * @param {{name: string, slug: string}} tech
   * @param {Object|null} github
   * @param {Object|null} stackOverflow
   * @param {Object} options — opções selecionadas pelo usuário na UI
   * @returns {Object} análise no formato do schema
   */
  function buildLocalHeuristic(tech, github, stackOverflow, options) {
    var stars = github ? github.repo.stars : 0;
    var forks = github ? github.repo.forks : 0;
    var issues = github ? github.repo.openIssues : 0;
    var daysSincePush = github ? github.daysSincePush : null;
    var totalQuestions = stackOverflow ? stackOverflow.totalQuestions : 0;
    var unansweredRate = stackOverflow ? stackOverflow.unansweredRate : 0.5;
    var starSampling = timelineModule.summarizeStars(github);

    var breakdown = {
      popularidade: Math.round(logarithmicScore(stars, SATURATION_CEILING.stars)),
      adocao: Math.round(logarithmicScore(forks, SATURATION_CEILING.forks)),
      atividade: github ? Math.round(catalog.clamp(100 - daysSincePush / ACTIVITY_WINDOW_DAYS * 100, 0, 100)) : 0,
      manutencao: github ? Math.round(catalog.clamp(100 - issues / Math.max(stars, 1) * 600, 0, 100)) : 0,
      comunidade: Math.round(logarithmicScore(totalQuestions, SATURATION_CEILING.questions)),
      suporte: Math.round(catalog.clamp(100 - unansweredRate * 180, 0, 100))
    };

    var weightedParts = {
      popularidade: breakdown.popularidade * HEURISTIC_WEIGHTS.popularidade,
      adocao: breakdown.adocao * HEURISTIC_WEIGHTS.adocao,
      atividade: breakdown.atividade * HEURISTIC_WEIGHTS.atividade,
      manutencao: breakdown.manutencao * HEURISTIC_WEIGHTS.manutencao,
      comunidade: breakdown.comunidade * HEURISTIC_WEIGHTS.comunidade,
      suporte: breakdown.suporte * HEURISTIC_WEIGHTS.suporte
    };
    var score = Math.round(catalog.clamp(Object.keys(weightedParts).reduce(function (sum, key) { return sum + weightedParts[key]; }, 0), SCORE_MIN, SCORE_MAX));

    var monthlyStarVelocity = starSampling.monthlyVelocity || 0;
    var isGrowing = Boolean(github) && monthlyStarVelocity > Math.max(GROWING_MIN_MONTHLY_STARS, stars * GROWING_RELATIVE_VELOCITY) && daysSincePush < GROWING_PUSH_DAYS;
    var isDeclining = Boolean(github) && (daysSincePush > DEAD_PROJECT_DAYS || github.repo.archived);
    var trend = isDeclining ? "em_queda" : isGrowing ? "em_alta" : "estavel";
    var prediction = isDeclining ? "Em retração: manutenção irregular"
      : isGrowing ? "Tecnologia em ascensão"
        : score > HEALTHY_SCORE ? "Madura e estável" : "Adoção moderada";

    var strengths = [];
    var cautions = [];
    if (stackOverflow && totalQuestions > QUESTIONS_COMMUNITY_THRESHOLD) strengths.push("Comunidade ativa com grande volume de perguntas");
    if (github && stars > STARS_ECOSYSTEM_THRESHOLD) strengths.push("Ecossistema maduro e amplamente adotado");
    if (github && daysSincePush < RECENT_PUSH_DAYS) strengths.push("Manutenção recente e contínua");
    if (stackOverflow && unansweredRate < GOOD_UNANSWERED_RATE) strengths.push("Boa taxa de resolução de dúvidas");
    if (stackOverflow && unansweredRate > HIGH_UNANSWERED_RATE) cautions.push("Taxa elevada de perguntas sem resposta");
    if (github && daysSincePush > STALE_PUSH_DAYS) cautions.push("Atividade de manutenção irregular");
    if (github && issues > stars * ISSUE_BACKLOG_STAR_RATIO) cautions.push("Backlog de issues proporcionalmente alto");
    if (!github) cautions.push("Dados do GitHub indisponíveis para análise");
    if (!stackOverflow) cautions.push("Dados do Stack Overflow indisponíveis para análise");
    if (!strengths.length) strengths.push("Dados insuficientes para avaliar pontos fortes");

    var alternatives = catalog.list.filter(function (candidate) { return candidate.slug !== tech.slug; })
      .slice(0, 2).map(function (candidate) { return candidate.name; });

    var healthTags = [];
    if (stackOverflow && totalQuestions > QUESTIONS_COMMUNITY_THRESHOLD) healthTags.push({ label: "ComunidadeAtiva", tone: "positivo" });
    if (github && stars > STARS_ECOSYSTEM_THRESHOLD) healthTags.push({ label: "EcossistemaMaduro", tone: "positivo" });
    if (github && daysSincePush < RECENT_PUSH_DAYS) healthTags.push({ label: "ManutencaoRecente", tone: "positivo" });
    if (stackOverflow && unansweredRate < GOOD_UNANSWERED_RATE) healthTags.push({ label: "BoaResolucaoDeDuvidas", tone: "positivo" });
    if (stackOverflow && unansweredRate > HIGH_UNANSWERED_RATE) healthTags.push({ label: "CurvaDeAprendizadoAlta", tone: "atencao" });
    if (github && daysSincePush > STALE_PUSH_DAYS) healthTags.push({ label: "AtividadeIrregular", tone: "atencao" });
    if (github && issues > stars * ISSUE_BACKLOG_STAR_RATIO) healthTags.push({ label: "BacklogDeIssues", tone: "atencao" });
    if (!github) healthTags.push({ label: "DadosDoGitHubAusentes", tone: "atencao" });
    if (!stackOverflow) healthTags.push({ label: "DadosDoStackOverflowAusentes", tone: "atencao" });
    if (!healthTags.length) healthTags.push({ label: "DadosParciais", tone: "neutro" });

    var facts = [];
    if (stackOverflow) facts.push(catalog.formatNumber(totalQuestions) + " perguntas no Stack Overflow, " + Math.round(unansweredRate * 100) + "% sem resposta");
    if (github) facts.push(catalog.formatNumber(stars) + " estrelas no GitHub e último push há " + daysSincePush + " dia(s)");
    var summary = tech.name + ": " + (facts.length ? facts.join("; ") + "." : "nenhuma fonte respondeu.")
      + (github ? "" : " Os dados do GitHub não foram obtidos (cota ou rede); estrelas, forks e atividade ficaram de fora desta leitura.")
      + (stackOverflow ? "" : " O volume de perguntas do Stack Overflow não foi obtido.");

    var userOptionSummary = describeUserOptions(options);

    return {
      source: "heuristica-local", model: null,
      indiceVitalidade: score, tendencia: trend, previsao: prediction,
      resumo: summary,
      justificativa: "Nota heurística: popularidade " + weightedParts.popularidade.toFixed(0) + "/25, adoção " + weightedParts.adocao.toFixed(0) + "/10, atividade " + weightedParts.atividade.toFixed(0) + "/20, manutenção " + weightedParts.manutencao.toFixed(0) + "/10, comunidade " + weightedParts.comunidade.toFixed(0) + "/15 e suporte " + weightedParts.suporte.toFixed(0) + "/20."
        + (github ? "" : " Sem resposta do GitHub, quatro dimensões não puderam ser medidas: o índice reflete apenas comunidade e suporte.")
        + " Opções do usuário: " + userOptionSummary + ".",
      recomendacao: score >= HEALTHY_SCORE ? "Boa aposta para estudar ou adotar, desde que o ecossistema resolva o seu caso de uso." : "Compare com alternativas do catálogo antes de decidir; os dados sugerem adoção mais cautelosa.",
      confianca: catalog.clamp(CONFIDENCE_BASE + (github ? CONFIDENCE_GITHUB : 0) + (stackOverflow && stackOverflow.source !== "demo" ? CONFIDENCE_STACKOVERFLOW : 0) + (github && stackOverflow && stackOverflow.source !== "demo" ? CONFIDENCE_BOTH_BONUS : 0), CONFIDENCE_FLOOR, CONFIDENCE_CEILING),
      tags: healthTags.slice(0, TAG_LIMIT),
      scoreBreakdown: breakdown,
      comparativo: {
        pontosFortes: strengths.slice(0, PONTO_LIMIT),
        pontosAtencao: cautions.slice(0, PONTO_LIMIT),
        alternativas: alternatives
      },
      projecao: {
        horizonte: "6 meses",
        risco: isDeclining ? "alto" : isGrowing ? "baixo" : "medio",
        momentum: isGrowing ? "positivo" : isDeclining ? "negativo" : "neutro"
      },
      userOptions: normalizeUserOptions(options)
    };
  }

  /* ---Blocos do prompt----------------------------------------------------- */

  /**
   * Descreve as opções do usuário com rótulos legíveis.
   * @param {Object} options
   * @returns {string} "foco, profundidade, perfil"
   */
  function describeUserOptions(options) {
    var focusLabel = options && catalog.FOCUS_AREAS[options.focus] ? catalog.FOCUS_AREAS[options.focus] : catalog.FOCUS_AREAS.geral;
    var depthLabel = options && catalog.DEPTHS[options.depth] ? catalog.DEPTHS[options.depth] : catalog.DEPTHS.padrao;
    var experienceLabel = options && catalog.EXPERIENCE_LEVELS[options.experience]
      ? catalog.EXPERIENCE_LEVELS[options.experience] : catalog.EXPERIENCE_LEVELS.intermediario;
    return focusLabel + ", " + depthLabel + ", " + experienceLabel;
  }

  /**
   * Normaliza as opções da UI para o formato registrado no relatório.
   * @param {Object} options
   * @returns {{focus: string, depth: string, experience: string}}
   */
  function normalizeUserOptions(options) {
    return {
      focus: options && options.focus || "geral",
      depth: options && options.depth || "padrao",
      experience: options && options.experience || "intermediario"
    };
  }

  /**
   * Bloco de dados do GitHub reais para o prompt.
   * @param {Object|null} github
   * @returns {string}
   */
  function buildGithubBlock(github) {
    if (!github) return "Dados do GitHub INDISPONÍVEIS (cota excedida ou rede).";
    var starSampling = timelineModule.summarizeStars(github);
    return [
      "Repositório: " + github.repo.fullName,
      "Estrelas: " + github.repo.stars,
      "Forks: " + github.repo.forks,
      "Issues abertas (inclui PRs): " + github.repo.openIssues,
      "Watchers: " + github.repo.watchers,
      "Linguagem: " + (github.repo.language || "n/a"),
      "Licença: " + (github.repo.license || "n/a"),
      "Tópicos: " + (github.repo.topics.length ? github.repo.topics.join(", ") : "n/a"),
      "Último push: " + github.repo.pushedAt.slice(0, 10) + " (há " + github.daysSincePush + " dias)",
      "Criado em: " + github.repo.createdAt.slice(0, 10),
      "Arquivado: " + (github.repo.archived ? "sim" : "não"),
      "Amostragem real de stargazers: " + starSampling.size + " estrelas em " + starSampling.days + " dia(s)",
      starSampling.size > 0 ? "Velocidade mensal estimada: " + Math.round(starSampling.monthlyVelocity) + " estrelas/mês" : ""
    ].filter(Boolean).join("\n");
  }

  /**
   * Bloco de dados do Stack Overflow reais para o prompt.
   * @param {Object|null} stackOverflow
   * @returns {string}
   */
  function buildStackOverflowBlock(stackOverflow) {
    if (!stackOverflow) return "Dados do Stack Overflow INDISPONÍVEIS.";
    return [
      "Tag analisada: " + stackOverflow.tag,
      "Origem dos dados: " + stackOverflow.source,
      "Total de perguntas na tag: " + stackOverflow.totalQuestions,
      "Total sem resposta: " + stackOverflow.totalUnanswered,
      "Taxa geral sem resposta: " + (stackOverflow.unansweredRate * 100).toFixed(1) + "%",
      "Amostra recente: " + stackOverflow.sampleSize + " perguntas",
      "Taxa sem resposta na amostra: " + (stackOverflow.sampleUnansweredRate * 100).toFixed(1) + "%",
      stackOverflow.recentQuestions && stackOverflow.recentQuestions.length > 0
        ? "Títulos recentes: " + stackOverflow.recentQuestions.slice(0, 5).map(function (question) { return "\"" + question.title.slice(0, 80) + "\""; }).join("; ")
        : "",
      "Avisos de coleta: " + (stackOverflow.note || "nenhum")
    ].filter(Boolean).join("\n");
  }

  /**
   * Bloco de buzz do Hacker News (menções em títulos) para o prompt.
   * @param {Object|null} hackerNews
   * @returns {string} vazio quando não há nada a reportar
   */
  function buildHackerNewsBlock(hackerNews) {
    if (hackerNews && hackerNews.source === "hn-algolia") {
      return [
        "== HACKER NEWS (API pública de busca, Algolia) ==",
        "Termo buscado: \"" + hackerNews.query + "\" em TÍTULOS de posts (stories)",
        "Posts com a tecnologia no título, últimos 7 dias: " + hackerNews.titlesLast7d,
        "Posts com a tecnologia no título, 7 dias anteriores: " + hackerNews.titlesPrev7d,
        hackerNews.deltaPct !== null ? "Variação semana a semana: " + (hackerNews.deltaPct > 0 ? "+" : "") + hackerNews.deltaPct + "%" : "",
        "Menções totais (título + texto + url) na última semana: " + hackerNews.matchesLast7d,
        hackerNews.frontPage && hackerNews.frontPage.posts > 0
          ? "Front page do news.ycombinator.com agora: " + hackerNews.frontPage.posts + " posts no ar, " + hackerNews.frontPage.matches + " mencionando a tecnologia."
          : "",
        hackerNews.recentPosts && hackerNews.recentPosts.length > 0
          ? "Posts recentes no HN: " + hackerNews.recentPosts.slice(0, 5).map(function (post) { return "\"" + post.title.slice(0, 70) + "\" (" + post.points + " pontos, " + post.answers + " comentários)"; }).join("; ")
          : ""
      ].filter(Boolean).join("\n");
    }
    if (hackerNews) {
      return "== HACKER NEWS ==\nDados do Hacker News INDISPONÍVEIS (" + (hackerNews.note || "API não respondeu") + ").";
    }
    return "";
  }

  /**
   * Bloco com as opções selecionadas pelo usuário na interface.
   * @param {Object} options
   * @returns {string}
   */
  function buildUserOptionsBlock(options) {
    var selectedOptions = options || {};
    var compareTech = selectedOptions.compareWith ? catalog.resolveTech(selectedOptions.compareWith) : null;
    return [
      "== OPÇÕES SELECIONADAS PELO USUÁRIO NA INTERFACE ==",
      "Foco da análise: " + (catalog.FOCUS_AREAS[selectedOptions.focus] || catalog.FOCUS_AREAS.geral),
      "Profundidade: " + (catalog.DEPTHS[selectedOptions.depth] || catalog.DEPTHS.padrao),
      "Perfil do usuário: " + (catalog.EXPERIENCE_LEVELS[selectedOptions.experience] || catalog.EXPERIENCE_LEVELS.intermediario),
      compareTech ? "Tecnologia para comparação: " + compareTech.name + (compareTech.repo ? " (" + compareTech.repo + ")" : "") : "Sem tecnologia de comparação solicitada",
      selectedOptions.considerCareer ? "Considerar perspectiva de carreira/empregabilidade: sim" : "",
      selectedOptions.timeHorizon ? "Horizonte temporal de interesse: " + selectedOptions.timeHorizon : ""
    ].filter(Boolean).join("\n");
  }

  /**
   * Bloco com pontos de referência da série histórica (a cada 3 meses).
   * @param {{month: string, stars: number, questions: number, estimated: boolean}[]} monthlyTimeline
   * @returns {string}
   */
  function buildTimelineBlock(monthlyTimeline) {
    return monthlyTimeline.filter(function (_, pointIndex) { return pointIndex % 3 === 0 || pointIndex === 11; })
      .map(function (point) {
        return point.month + ": " + point.stars + " estrelas / " + point.questions + " perguntas" + (point.estimated ? " (estimado)" : " (real)");
      }).join("\n");
  }

  /**
   * Monta o prompt completo do Gemini: opções do usuário + GitHub +
   * Stack Overflow + Hacker News + série histórica + comparação.
   * @param {{name: string}} tech
   * @param {Object|null} github
   * @param {Object|null} stackOverflow
   * @param {Object|null} hackerNews
   * @param {Object[]} monthlyTimeline
   * @param {Object} options
   * @returns {string}
   */
  function buildPrompt(tech, github, stackOverflow, hackerNews, monthlyTimeline, options) {
    var selectedOptions = options || {};
    var compareTech = selectedOptions.compareWith ? catalog.resolveTech(selectedOptions.compareWith) : null;
    var comparisonBlock = compareTech
      ? "\n\n== TECNOLOGIA DE COMPARAÇÃO SOLICITADA ==\n" + compareTech.name + " (tag: " + compareTech.soTag + ", repo: " + (compareTech.repo || "n/a") + ")\nConsidere esta tecnologia como referência para a recomendação."
      : "";

    return "Analise a tecnologia \"" + tech.name + "\".\n\n"
      + buildUserOptionsBlock(selectedOptions)
      + "\n\n== GITHUB (API pública) ==\n" + buildGithubBlock(github)
      + "\n\n== STACK OVERFLOW (API pública) ==\n" + buildStackOverflowBlock(stackOverflow)
      + (buildHackerNewsBlock(hackerNews) ? "\n\n" + buildHackerNewsBlock(hackerNews) : "")
      + "\n\n== SÉRIE HISTÓRICA (último ponto real) ==\n" + buildTimelineBlock(monthlyTimeline)
      + comparisonBlock
      + "\n\nProduza o JSON completo do schema: indiceVitalidade, tendencia, previsao, resumo, justificativa numérica baseada nos dados, recomendação alinhada ao foco e perfil do usuário, confiança, tags, scoreBreakdown (notas por dimensão), comparativo (pontos fortes, pontos de atenção, alternativas) e projecao (horizonte, risco, momentum).";
  }

  /* ---Normalização da resposta do Gemini---------------------------------- */

  /**
   * Remove cercas de código e faz o parse do JSON devolvido pelo modelo.
   * @param {string} rawText
   * @returns {Object}
   */
  function parseGeminiJson(rawText) {
    return JSON.parse(rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  }

  /**
   * Extrai o texto concatenado da primeira resposta candidata.
   * @param {Object} payload
   * @returns {string}
   */
  function extractResponseText(payload) {
    var candidate = (payload.candidates || [])[0] || {};
    var content = candidate.content;
    return content && content.parts ? content.parts.map(function (part) { return part.text || ""; }).join("") : "";
  }

  /**
   * Mascara a chave para exibição segura no relatório.
   * @param {string} apiKey
   * @returns {string}
   */
  function maskApiKey(apiKey) {
    return apiKey.length > 14 ? apiKey.slice(0, 8) + "..." + apiKey.slice(-4) : apiKey;
  }

  /**
   * Converte a resposta bruta (JSON do modelo) no formato do relatório,
   * com validação e limites de tamanho campo a campo.
   * @param {Object} parsed
   * @param {string} apiKey — apenas para o campo keyUsed (mascarada)
   * @returns {Object}
   */
  function normalizeGeminiAnalysis(parsed, apiKey) {
    var breakdown = parsed.scoreBreakdown || {};
    var comparativo = parsed.comparativo || {};
    var projecao = parsed.projecao || {};

    return {
      source: "gemini", model: config.geminiModel,
      indiceVitalidade: Math.round(catalog.clamp(Number(parsed.indiceVitalidade) || 0, SCORE_MIN, SCORE_MAX)),
      tendencia: parsed.tendencia === "em_alta" || parsed.tendencia === "em_queda" ? parsed.tendencia : "estavel",
      previsao: String(parsed.previsao || "Tendência indefinida").slice(0, PREVISAO_MAX),
      resumo: String(parsed.resumo || "").slice(0, RESUMO_MAX),
      justificativa: String(parsed.justificativa || "").slice(0, JUSTIFICATIVA_MAX),
      recomendacao: String(parsed.recomendacao || "").slice(0, RECOMENDACAO_MAX),
      confianca: catalog.clamp(Number(parsed.confianca) || 0.5, 0, 1),
      tags: (parsed.tags || []).map(function (tag) {
        return { label: String(tag.label || "").replace(/^#/, "").slice(0, TAG_LABEL_MAX), tone: tag.tone === "positivo" || tag.tone === "atencao" ? tag.tone : "neutro" };
      }).filter(function (tag) { return tag.label; }).slice(0, TAG_LIMIT),
      scoreBreakdown: {
        popularidade: Math.round(catalog.clamp(Number(breakdown.popularidade) || 0, SCORE_MIN, SCORE_MAX)),
        adocao: Math.round(catalog.clamp(Number(breakdown.adocao) || 0, SCORE_MIN, SCORE_MAX)),
        atividade: Math.round(catalog.clamp(Number(breakdown.atividade) || 0, SCORE_MIN, SCORE_MAX)),
        manutencao: Math.round(catalog.clamp(Number(breakdown.manutencao) || 0, SCORE_MIN, SCORE_MAX)),
        comunidade: Math.round(catalog.clamp(Number(breakdown.comunidade) || 0, SCORE_MIN, SCORE_MAX)),
        suporte: Math.round(catalog.clamp(Number(breakdown.suporte) || 0, SCORE_MIN, SCORE_MAX))
      },
      comparativo: {
        pontosFortes: (comparativo.pontosFortes || []).map(function (point) { return String(point).slice(0, PONTO_MAX); }).slice(0, PONTO_LIMIT),
        pontosAtencao: (comparativo.pontosAtencao || []).map(function (point) { return String(point).slice(0, PONTO_MAX); }).slice(0, PONTO_LIMIT),
        alternativas: (comparativo.alternativas || []).map(function (alternative) { return String(alternative).slice(0, ALTERNATIVA_MAX); }).slice(0, ALTERNATIVA_LIMIT)
      },
      projecao: {
        horizonte: String(projecao.horizonte || "6 meses").slice(0, HORIZONTE_MAX),
        risco: projecao.risco === "baixo" || projecao.risco === "alto" ? projecao.risco : "medio",
        momentum: projecao.momentum === "positivo" || projecao.momentum === "negativo" ? projecao.momentum : "neutro"
      },
      userOptions: { focus: "", depth: "", experience: "" },
      keyUsed: maskApiKey(apiKey)
    };
  }

  /**
   * Envelope final da análise (heurística ou Gemini) com as opções do usuário.
   * @param {Object} analysis — análise normalizada
   * @param {Object} options — opções da UI
   * @returns {Object}
   */
  function attachUserOptions(analysis, options) {
    analysis.userOptions = normalizeUserOptions(options);
    return analysis;
  }

  /**
   * Chamada HTTP ao Gemini com structured output (resposta obrigatoriamente
   * aderente a RESPONSE_SCHEMA).
   * @param {string} apiKey
   * @param {Object} ModelState —tech/github/stackOverflow/hackerNews/timeline/options
   * @returns {Promise<Object>}
   */
  function requestGeminiGeneration(apiKey, ModelState) {
    var url = config.geminiApi + "/models/" + encodeURIComponent(config.geminiModel) + ":generateContent?key=" + encodeURIComponent(apiKey);
    return http.requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: GEMINI_TIMEOUT_MILLISECONDS,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(ModelState.tech, ModelState.github, ModelState.stackOverflow, ModelState.hackerNews, ModelState.monthlyTimeline, ModelState.options) }] }],
        generationConfig: { temperature: GENERATION_TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA }
      })
    });
  }

  /**
   * Heurística com aviso de indisponibilidade do Gemini.
   * @param {Object} ModelState
   * @param {string} [errorMessage]
   * @returns {Object}
   */
  function heuristicFallback(ModelState, errorMessage) {
    var fallback = buildLocalHeuristic(ModelState.tech, ModelState.github, ModelState.stackOverflow, ModelState.options);
    fallback.previsao += " (Gemini indisponível)";
    if (errorMessage) fallback.geminiError = errorMessage;
    return fallback;
  }

  /**
   * Chama o Gemini tentando uma chave por vez (rodízio em falha de cota,
   * rate-limit ou rede). Esgotadas as chaves, degrada para a heurística.
   * @param {Object} ModelState — {tech, github, stackOverflow, hackerNews, monthlyTimeline, options}
   * @param {number} attemptIndex
   * @returns {Promise<Object>}
   */
  function callGeminiWithKeyRotation(ModelState, attemptIndex) {
    var totalKeys = keyRotation.count();
    if (attemptIndex >= totalKeys) return Promise.resolve(heuristicFallback(ModelState));

    var apiKey = keyRotation.active();
    if (!apiKey) return Promise.resolve(heuristicFallback(ModelState));

    return requestGeminiGeneration(apiKey, ModelState).then(function (payload) {
      if (payload.error && payload.error.message) throw new Error(payload.error.message);

      var responseText = extractResponseText(payload);
      if (!responseText) throw new Error("resposta vazia");
      var parsedResponse = parseGeminiJson(responseText);

      keyRotation.recordCall(apiKey, true);
      return attachUserOptions(normalizeGeminiAnalysis(parsedResponse, apiKey), ModelState.options);
    }).catch(function (error) {
      console.warn("[gemini] key " + (attemptIndex + 1) + "/" + totalKeys + " failed:", error.message);
      keyRotation.recordCall(apiKey, false, error.message);

      if (attemptIndex + 1 < totalKeys) {
        keyRotation.next();
        return callGeminiWithKeyRotation(ModelState, attemptIndex + 1);
      }
      return heuristicFallback(ModelState, error.message);
    });
  }

  /**
   * Ponto de entrada da interpretação: Gemini com rodízio ou heurística local.
   * @param {{name: string}} tech
   * @param {Object|null} github
   * @param {Object|null} stackOverflow
   * @param {Object|null} hackerNews
   * @param {Object[]} monthlyTimeline
   * @param {Object} options — opções selecionadas pelo usuário na UI
   * @returns {Promise<Object>}
   */
  function analyze(tech, github, stackOverflow, hackerNews, monthlyTimeline, options) {
    var ModelState = { tech: tech, github: github, stackOverflow: stackOverflow, hackerNews: hackerNews, monthlyTimeline: monthlyTimeline, options: options };
    if (!keyRotation.count()) {
      return Promise.resolve(buildLocalHeuristic(tech, github, stackOverflow, options));
    }
    return callGeminiWithKeyRotation(ModelState, 0);
  }

  window.DEVTRENDS_AI = {
    analyze: analyze,
    /* A heurística é pública para o painel Config explicar o fallback. */
    heuristic: buildLocalHeuristic,
    buildPrompt: buildPrompt
  };
})();
