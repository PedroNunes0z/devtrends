/* =========================================================================
   widgets.js — renderização do relatório. Todo número exibido passa pelo
   Number Ticker vanilla (efeito de contagem). Ícones em vez de emojis.

   A saída do Gemini nunca é apresentada como texto puro — cada campo
   estruturado vira um widget:
   · Índice de Vitalidade  → gauge animado
   · Tendência             → badge colorida com ícone de seta
   · scoreBreakdown        → gráfico de barras proporcionais
   · Tags de saúde         → pills coloridas por tom
   · comparativo           → tabela em duas colunas (fortes vs atenção)
   · projecao              → indicador de risco/momentum com horizonte
   · confiança             → barra de progresso com porcentagem
   · recomendação          → callout destacado com borda de acento
   ========================================================================= */
(function () {
  "use strict";

  var dataApi = window.DEVTRENDS_DATA;
  var icons = window.DEVTRENDS_ICONS;
  var esc = window.DEVTRENDS_HIGHLIGHT.esc;

  /* ---Paleta e geometria do gauge------------------------------------------ */
  var COLOR_GOOD = "#C3E88D", COLOR_WARNING = "#FFCB6B", COLOR_BAD = "#F07178";
  var COLOR_BLUE = "#82AAFF";
  var GAUGE_GOOD_THRESHOLD = 70, GAUGE_WARNING_THRESHOLD = 40;
  var GAUGE_WIDTH = 240, GAUGE_HEIGHT = 138, GAUGE_CENTER_X = 120, GAUGE_CENTER_Y = 112, GAUGE_RADIUS = 100, GAUGE_TICK_INNER = 86, GAUGE_TICK_OUTER = 92;
  var SCORE_GOOD_THRESHOLD = 70, SCORE_WARNING_THRESHOLD = 40;
  var MAX_RECENT_ITEMS = 8;

  /**
   * Caminho base da página (mantém imagens funcionando dentro e fora do /devtrends).
   * @returns {string}
   */
  function getHome() {
    return document.body.getAttribute("data-home") || ".";
  }

  /**
   * Logotipo do Google Gemini como imagem inline.
   * @param {number} size — largura/altura em px
   * @param {string} [extraStyle] — CSS inline adicional
   * @returns {string}
   */
  function geminiLogo(size, extraStyle) {
    var iconSize = size || 16;
    var style = extraStyle ? ' style="' + extraStyle + '"' : '';
    return '<img class="gemini-icon-img" src="' + getHome() + '/assets/img/Google_Gemini_icon.svg" alt="Google Gemini" width="' + iconSize + '" height="' + iconSize + '"' + style + '>';
  }

  /**
   * Logotipo do Stack Overflow como imagem inline.
   * @param {number} height — altura em px
   * @param {string} [extraStyle] — CSS inline adicional
   * @returns {string}
   */
  function stackOverflowLogo(height, extraStyle) {
    var logoHeight = height || 13;
    var style = extraStyle ? ' style="' + extraStyle + '"' : '';
    return '<img class="so-logo-img" src="' + getHome() + '/assets/img/Stack_Overflow_logo.svg" alt="Stack Overflow" height="' + logoHeight + '"' + style + '>';
  }

  /**
   * Logotipo do Hacker News como SVG inline (quadrado laranja com Y).
   * @param {number} size — largura/altura em px
   * @returns {string}
   */
  function hackerNewsLogo(size) {
    var iconSize = size || 14;
    return '<svg class="hn-logo" width="' + iconSize + '" height="' + iconSize + '" viewBox="0 0 24 24" role="img" aria-label="Hacker News" style="border-radius:3px;flex:none;vertical-align:-2px"><rect width="24" height="24" fill="#FF6600"/><path d="M10.6 13.9 6.4 6.5h2.3l2.6 4.9c.05.1.1.2.15.3h.02c.04-.1.09-.2.14-.3l2.7-4.9H17l-4.3 7.4v4.2h-2.1v-4.2z" fill="#fff"/></svg>';
  }

  /**
   * Número animado pelo Number Ticker (ou travessão se indisponível).
   * @param {number|null} value
   * @param {string} [extraAttributes] — attrs data-* do ticker (decimais, sufixo)
   * @returns {string}
   */
  function ticker(value, extraAttributes) {
    if (value === null || value === undefined || !isFinite(value)) return "&mdash;";
    var attributes = extraAttributes || "";
    return '<span class="mono ticker" data-ticker="' + Number(value) + '" ' + attributes + ">" + dataApi.formatNumber(value) + "</span>";
  }

  /*
   * Chave do relatório (r.sources) → rótulo legível da origem de cada dado.
   */
  var SOURCE_LABELS = {
    "github-api": "GitHub REST API",
    "github-html": "GitHub página pública",
    "stackexchange-api": "Stack Exchange API",
    "hn-scrape": "Hacker News (scraping HTML)",
    demo: "dados de demonstração",
    "heuristica-local": "heurística local",
    gemini: "Gemini",
    indisponivel: "indisponível"
  };

  var TREND_PRESENTATIONS = {
    em_alta: { icon: "arrowUp", cls: "up", label: "Em ascensão" },
    estavel: { icon: "arrowRight", cls: "flat", label: "Estável" },
    em_queda: { icon: "arrowDown", cls: "down", label: "Em retração" }
  };

  var RISK_LEVELS = {
    baixo: { cls: "risk-low", label: "Baixo", color: COLOR_GOOD },
    medio: { cls: "risk-medium", label: "Médio", color: COLOR_WARNING },
    alto: { cls: "risk-high", label: "Alto", color: COLOR_BAD }
  };

  var MOMENTUM_PRESENTATIONS = {
    positivo: { icon: "arrowUp", cls: "mom-pos", label: "Positivo", color: COLOR_GOOD },
    neutro: { icon: "arrowRight", cls: "mom-neu", label: "Neutro", color: COLOR_BLUE },
    negativo: { icon: "arrowDown", cls: "mom-neg", label: "Negativo", color: COLOR_BAD }
  };

  /* ---Gauge do Índice de Vitalidade---------------------------------------- */

  /**
   * Cor de faixa para uma nota 0-100: verde, amarelo ou vermelho.
   * @param {number} score
   * @returns {string} cor hexadecimal
   */
  function scoreColor(score) {
    return score >= SCORE_GOOD_THRESHOLD ? COLOR_GOOD : score >= SCORE_WARNING_THRESHOLD ? COLOR_WARNING : COLOR_BAD;
  }

  /**
   * Marca de graduação (tick) do arco do gauge, em um ângulo da semicircunferência.
   * @param {number} percentage — 0 a 100
   * @returns {string}
   */
  function gaugeTick(percentage) {
    var angle = Math.PI - percentage / 100 * Math.PI;
    return '<line x1="' + (GAUGE_CENTER_X + Math.cos(angle) * GAUGE_TICK_INNER) + '" y1="' + (GAUGE_CENTER_Y - Math.sin(angle) * GAUGE_TICK_INNER) +
      '" x2="' + (GAUGE_CENTER_X + Math.cos(angle) * GAUGE_TICK_OUTER) + '" y2="' + (GAUGE_CENTER_Y - Math.sin(angle) * GAUGE_TICK_OUTER) +
      '" stroke="#454B54" stroke-width="1"/>';
  }

  /**
   * Gauge semicircular animado do Índice de Vitalidade.
   * @param {number} score — 0 a 100
   * @returns {string}
   */
  function gauge(score) {
    var value = Math.max(0, Math.min(100, Math.round(score)));
    var arcLength = Math.PI * GAUGE_RADIUS;
    var ticks = [0, 25, 50, 75, 100].map(gaugeTick).join("");
    return '<div class="gauge-box">' +
      '<div class="gauge-wrap">' +
        '<svg viewBox="0 0 ' + GAUGE_WIDTH + ' ' + GAUGE_HEIGHT + '" role="img" aria-label="Índice de Vitalidade ' + value + ' de 100">' +
          '<path d="M 20 112 A 100 100 0 0 1 220 112" fill="none" stroke="#2A2E37" stroke-width="10" stroke-linecap="round"/>' +
          '<path d="M 20 112 A 100 100 0 0 1 220 112" fill="none" stroke="' + scoreColor(value) + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (value / 100 * arcLength) + ' ' + arcLength + '"/>' +
          ticks +
          '<text x="16" y="134" fill="#7B818B" font-size="11" font-family="monospace">0</text>' +
          '<text x="224" y="134" text-anchor="end" fill="#7B818B" font-size="11" font-family="monospace">100</text>' +
        '</svg>' +
        '<div class="gauge-value">' + ticker(value) + '<span class="gauge-unit">/ 100</span></div>' +
      '</div>' +
      '<p class="gauge-caption">Índice de Vitalidade</p>' +
    '</div>';
  }

  /* ---Cartão de tendência--------------------------------------------------- */

  /**
   * Cabeçalho do relatório: nome, tendência, resumo e três destaques.
   * @param {Object} report
   * @returns {string}
   */
  function trendCard(report) {
    var ai = report.ai;
    var github = report.github;
    var stackOverflow = report.stackoverflow;
    var trend = TREND_PRESENTATIONS[ai.tendencia] || TREND_PRESENTATIONS.estavel;
    var confidencePercent = Math.round(ai.confianca * 100);
    var originBadge = ai.source === "gemini"
      ? geminiLogo(14) + '<span>gemini: ' + esc(ai.model || "") + '</span>'
      : '<span>heurística local</span>';

    return '<div class="frame trend-card">' +
      '<div class="panel trend-inner">' +
        '<div>' +
          '<div class="trend-meta"><span>relatório / ' + esc(report.tech.slug) + '</span><span>·</span><span style="display:inline-flex;align-items:center;gap:6px">' + originBadge + '</span></div>' +
          '<h2 class="trend-name">' + esc(report.tech.name) + '</h2>' +
          '<div style="margin-top:20px">' +
            '<span class="trend-badge ' + trend.cls + '">' + icons.get(trend.icon, "icon-sm") + trend.label + '</span>' +
            '<span class="trend-prediction">' + esc(ai.previsao) + '</span>' +
          '</div>' +
          '<p class="trend-resume">' + esc(ai.resumo) + '</p>' +
          '<dl class="trend-stats">' +
            '<div><dt>GitHub ' + icons.get("star", "icon-sm") + '</dt><dd>' + ticker(github ? github.repo.stars : null) + '</dd></div>' +
            '<div><dt style="display:inline-flex;align-items:center;gap:6px"><span>Perguntas</span> ' + stackOverflowLogo(11) + '</dt><dd>' + ticker(stackOverflow ? stackOverflow.totalQuestions : null) + '</dd></div>' +
            '<div><dt>Sem resposta</dt><dd>' + ticker(stackOverflow ? stackOverflow.unansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"') + '</dd></div>' +
          '</dl>' +
          '<div class="confidence"><span>confiança ' + ticker(confidencePercent, 'data-suffix="%"') + '</span>' +
            '<span class="hairline-bar"><i style="width:' + confidencePercent + '%"></i></span></div>' +
        '</div>' +
        gauge(ai.indiceVitalidade) +
      '</div></div>';
  }

  /* ---Decomposição do índice (barras)--------------------------------------- */

  /**
   * Gráfico de barras com a nota de cada dimensão do índice.
   * @param {Object} report
   * @returns {string}
   */
  function scoreBreakdown(report) {
    var breakdown = report.ai.scoreBreakdown;
    if (!breakdown) return "";
    var dimensions = [
      { key: "popularidade", label: "Popularidade", icon: "star", weight: "25%" },
      { key: "atividade", label: "Atividade", icon: "refresh", weight: "20%" },
      { key: "suporte", label: "Suporte", icon: "question", weight: "20%" },
      { key: "comunidade", label: "Comunidade", icon: "fork", weight: "15%" },
      { key: "adocao", label: "Adoção", icon: "fork", weight: "10%" },
      { key: "manutencao", label: "Manutenção", icon: "issue", weight: "10%" }
    ];
    var barsHtml = dimensions.map(function (dimension) {
      var dimensionScore = breakdown[dimension.key] !== undefined ? breakdown[dimension.key] : 0;
      return '<div class="breakdown-row">' +
        '<div class="breakdown-label"><span class="breakdown-icon">' + icons.get(dimension.icon, "icon-sm") + '</span>' +
          '<span>' + dimension.label + '</span><span class="breakdown-weight">' + dimension.weight + '</span></div>' +
        '<div class="breakdown-bar-wrap">' +
          '<div class="breakdown-bar" style="width:' + dimensionScore + '%;background:' + scoreColor(dimensionScore) + '"></div>' +
        '</div>' +
        '<div class="breakdown-value">' + ticker(dimensionScore) + '<span class="breakdown-unit">/100</span></div>' +
      '</div>';
    }).join("");
    return '<section class="section" aria-labelledby="breakdown-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="breakdown-h">Decomposição do índice. <span>Cada dimensão com peso e cor.</span></h2>' +
      '<div class="detail"><p>O Índice de Vitalidade é uma média ponderada de seis dimensões. As barras mostram a nota de cada uma, com cor indicando faixa: verde (70+), amarelo (40-69), vermelho (<40).</p><p class="index">2.1 Decomposição →</p></div></div>' +
      '<div class="breakdown-chart panel" style="margin-top:28px;padding:24px">' + barsHtml + '</div>' +
    '</section>';
  }

  /* ---Projeção (risco/momentum/horizonte)----------------------------------- */

  /**
   * Indicador direcional: horizonte, risco e momentum, cada um num cartão.
   * @param {Object} report
   * @returns {string}
   */
  function projection(report) {
    var projectionData = report.ai.projecao;
    if (!projectionData) return "";
    var riskLevel = RISK_LEVELS[projectionData.risco] || RISK_LEVELS.medio;
    var momentum = MOMENTUM_PRESENTATIONS[projectionData.momentum] || MOMENTUM_PRESENTATIONS.neutro;
    return '<section class="section" aria-labelledby="proj-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="proj-h">Projeção. <span>Risco, momentum e horizonte.</span></h2>' +
      '<div class="detail"><p>Avaliação direcional baseada nos dados de atividade e crescimento.</p><p class="index">2.2 Projeção →</p></div></div>' +
      '<div class="proj-grid" style="margin-top:28px">' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Horizonte</div>' +
          '<div class="proj-card-value">' + esc(projectionData.horizonte) + '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Risco</div>' +
          '<div class="proj-card-value ' + riskLevel.cls + '">' +
            '<span class="risk-dot" style="background:' + riskLevel.color + '"></span>' + riskLevel.label +
          '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Momentum</div>' +
          '<div class="proj-card-value ' + momentum.cls + '">' +
            icons.get(momentum.icon, "icon-sm") + momentum.label +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---Comparativo (fortes / atenção / alternativas)-------------------------- */

  /**
   * Duas colunas (pontos fortes vs de atenção) e chips de alternativas.
   * @param {Object} report
   * @returns {string}
   */
  function comparativo(report) {
    var comparison = report.ai.comparativo;
    if (!comparison) return "";
    var strengthItems = (comparison.pontosFortes || []).map(function (point) {
      return '<li class="comp-item pos">' + icons.get("arrowUp", "icon-sm") + '<span>' + esc(point) + '</span></li>';
    }).join("");
    var cautionItems = (comparison.pontosAtencao || []).map(function (point) {
      return '<li class="comp-item warn">' + icons.get("arrowDown", "icon-sm") + '<span>' + esc(point) + '</span></li>';
    }).join("");
    var alternativeChips = (comparison.alternativas || []).map(function (alternativeName) {
      var alternativeTech = dataApi.resolveTech(alternativeName);
      if (!alternativeTech || !alternativeTech.slug) return "";
      return '<a class="alt-chip" href="#analise" data-analyze-dispatch="' + esc(alternativeName) + '">' + icons.get("arrowRight", "icon-sm") + esc(alternativeName) + '</a>';
    }).join("");

    return '<section class="section" aria-labelledby="comp-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="comp-h">Comparativo. <span>Pontos fortes, pontos de atenção e alternativas.</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>Análise estruturada gerada pelo</span> ' + geminiLogo(14) + ' <span>Gemini a partir das métricas coletadas.</span></p><p class="index">2.3 Comparativo →</p></div></div>' +
      '<div class="comp-grid" style="margin-top:28px">' +
        '<div class="panel comp-col">' +
          '<h3 class="comp-title pos">' + icons.get("arrowUp", "icon-sm") + ' Pontos fortes</h3>' +
          '<ul class="comp-list">' + (strengthItems || '<li class="comp-item empty">—</li>') + '</ul>' +
        '</div>' +
        '<div class="panel comp-col">' +
          '<h3 class="comp-title warn">' + icons.get("arrowDown", "icon-sm") + ' Pontos de atenção</h3>' +
          '<ul class="comp-list">' + (cautionItems || '<li class="comp-item empty">—</li>') + '</ul>' +
        '</div>' +
      '</div>' +
      (alternativeChips ? '<div class="alt-section" style="margin-top:16px"><span class="mono" style="font-size:12px;color:var(--tertiary)">alternativas sugeridas:</span><div class="alt-chips" style="margin-top:8px">' + alternativeChips + '</div></div>' : '') +
    '</section>';
  }

  /* ---Tags de saúde + leitura dos números----------------------------------- */

  /**
   * Tags de saúde, metadados do modelo e a interpretação completa.
   * @param {Object} report
   * @returns {string}
   */
  function analysis(report) {
    var ai = report.ai;
    var tags = ai.tags.map(function (tag) {
      var tone = tag.tone === "positivo" ? "pos" : tag.tone === "atencao" ? "warn" : "neu";
      var mark = tone === "pos" ? "+" : tone === "warn" ? "!" : "·";
      return '<li class="health-tag ' + tone + '"><span aria-hidden="true">' + mark + '</span><span>#' + esc(tag.label) + '</span><span class="sr-only">(' + esc(tag.tone) + ')</span></li>';
    }).join("");
    return '<section class="split">' +
      '<div class="split-cell">' +
        '<h3 class="split-label">Tags de saúde</h3>' +
        '<ul class="health-tags">' + tags + '</ul>' +
        '<dl class="kv">' +
          '<div class="kv-row"><dt>Modelo</dt><dd style="display:inline-flex;align-items:center;gap:6px">' + (ai.source === "gemini" ? geminiLogo(14) : "") + '<span>' + esc(ai.source === "gemini" ? ai.model : "heurística local") + '</span></dd></div>' +
          '<div class="kv-row"><dt>Tendência</dt><dd>' + esc(ai.tendencia) + '</dd></div>' +
          '<div class="kv-row"><dt>Confiança</dt><dd>' + ticker(Math.round(ai.confianca * 100), 'data-suffix="%"') + '</dd></div>' +
          (ai.keyUsed ? '<div class="kv-row"><dt>Chave Gemini</dt><dd style="display:inline-flex;align-items:center;gap:6px">' + geminiLogo(14) + '<span>' + esc(ai.keyUsed) + '</span></dd></div>' : "") +
        '</dl>' +
      '</div>' +
      '<div class="split-cell">' +
        '<h3 class="split-label">Leitura dos números</h3>' +
        '<div class="analysis"><p>' + esc(ai.justificativa) + '</p>' +
        '<p class="highlight">' + esc(ai.recomendacao) + '</p>' +
        (report.github && report.github.repo.description
          ? '<p class="repo-desc"><span class="mono">' + esc(report.github.repo.fullName) + ':</span> ' + esc(report.github.repo.description) + '</p>'
          : "") +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ---Linha do tempo (SVG de duas escalas)----------------------------------- */

  /* Geometria do gráfico de linha do tempo. */
  var TIMELINE_PLOT_WIDTH = 760, TIMELINE_PLOT_HEIGHT = 260;
  var TIMELINE_MARGIN = { left: 54, right: 58, top: 18, bottom: 38 };
  var TIMELINE_GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1];

  /**
   * Escala de valores para o gráfico: domínio [min,max] com folga de 18%.
   * @param {number[]} values
   * @returns {{min: number, max: number}}
   */
  function buildAxisScale(values) {
    var low = Math.min.apply(null, values);
    var high = Math.max.apply(null, values);
    var span = Math.max(high - low, high * 0.02, 1);
    var padding = span * 0.18;
    return { min: Math.max(0, low - padding), max: high + padding };
  }

  /**
   * Gráfico SVG de 12 meses com estrelas (azul) e perguntas (verde).
   * @param {Object} report
   * @returns {string}
   */
  function timeline(report) {
    var points = report.timeline;
    var lastPoint = points[points.length - 1];
    var hasGithub = Boolean(report.github);
    var plotWidth = TIMELINE_PLOT_WIDTH - TIMELINE_MARGIN.left - TIMELINE_MARGIN.right;
    var plotHeight = TIMELINE_PLOT_HEIGHT - TIMELINE_MARGIN.top - TIMELINE_MARGIN.bottom;

    var xAxis = function (pointIndex) { return TIMELINE_MARGIN.left + pointIndex / Math.max(points.length - 1, 1) * plotWidth; };
    var yAxis = function (value, axisScale) { return TIMELINE_MARGIN.top + (1 - (value - axisScale.min) / (axisScale.max - axisScale.min)) * plotHeight; };

    var starAxis = buildAxisScale(points.map(function (point) { return point.stars; }));
    var questionAxis = buildAxisScale(points.map(function (point) { return point.questions; }));
    var starPoints = points.map(function (point, pointIndex) { return xAxis(pointIndex) + "," + yAxis(point.stars, starAxis); }).join(" ");
    var questionPoints = points.map(function (point, pointIndex) { return xAxis(pointIndex) + "," + yAxis(point.questions, questionAxis); }).join(" ");

    var gridLines = TIMELINE_GRID_RATIOS.map(function (ratio) {
      var gridY = TIMELINE_MARGIN.top + (1 - ratio) * plotHeight;
      return '<line x1="' + TIMELINE_MARGIN.left + '" y1="' + gridY + '" x2="' + (TIMELINE_PLOT_WIDTH - TIMELINE_MARGIN.right) + '" y2="' + gridY + '" stroke="#1E2127" stroke-width="1"/>' +
        '<text x="' + (TIMELINE_MARGIN.left - 8) + '" y="' + (gridY + 4) + '" text-anchor="end" fill="#7B818B" font-size="10" font-family="monospace">' + (hasGithub ? dataApi.formatCompact(starAxis.min + (starAxis.max - starAxis.min) * ratio) : "—") + '</text>' +
        '<text x="' + (TIMELINE_PLOT_WIDTH - TIMELINE_MARGIN.right + 8) + '" y="' + (gridY + 4) + '" fill="#7B818B" font-size="10" font-family="monospace">' + dataApi.formatCompact(questionAxis.min + (questionAxis.max - questionAxis.min) * ratio) + '</text>';
    }).join("");

    var monthLabels = points.map(function (point, pointIndex) {
      return '<text x="' + xAxis(pointIndex) + '" y="' + (TIMELINE_PLOT_HEIGHT - 14) + '" text-anchor="middle" fill="' + (point.estimated ? "#7B818B" : "#E6E8EB") + '" font-size="10" font-family="monospace">' + (point.label || "·") + '</text>';
    }).join("");

    var starSamplingSummary = dataApi.summarizeStars(report.github);
    var samplingNote = !hasGithub
      ? "O GitHub não respondeu: nenhuma série de estrelas foi estimada (não há total real de onde partir)."
      : starSamplingSummary.size > 0
        ? "A inclinação usa " + dataApi.formatNumber(starSamplingSummary.size) + " eventos reais de stargazers em " + starSamplingSummary.days + " dia(s)."
        : "Sem amostragem de stargazers: a inclinação vem da idade do repositório.";

    /* Série de estrelas: traçado estimado (tracejado) + trecho real (sólido). */
    var starSeries = hasGithub
      ? '<polyline points="' + starPoints + '" fill="none" stroke="#82AAFF" stroke-width="2" stroke-dasharray="4 4" stroke-opacity="0.7"/>' +
        '<polyline points="' + [xAxis(points.length - 2) + "," + yAxis(points[points.length - 2].stars, starAxis), xAxis(points.length - 1) + "," + yAxis(lastPoint.stars, starAxis)].join(" ") + '" fill="none" stroke="#82AAFF" stroke-width="2"/>' +
        '<circle cx="' + xAxis(points.length - 1) + '" cy="' + yAxis(lastPoint.stars, starAxis) + '" r="4" fill="#82AAFF"/>'
      : "";

    return '<section class="section" aria-labelledby="timeline-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="timeline-h">Linha do tempo. <span>Onde os números vieram parar.</span></h2>' +
      '<div class="detail"><p>Estrelas do GitHub e perguntas no Stack Overflow em escalas independentes. A curva é calculada, não desenhada.</p><p class="index">4.0 Série histórica →</p></div></div>' +
      '<figure class="code-block timeline-figure" style="margin-top:28px">' +
        '<figcaption class="code-chrome"><span>timeline.js</span>' +
          '<span class="legend">' +
            '<span class="legend-item"><i class="rule" style="background:#82AAFF"></i> GitHub ' + (hasGithub ? ticker(lastPoint.stars) : "indisponível") + '</span>' +
            '<span class="legend-item"><i class="rule" style="background:#C3E88D"></i> ' + stackOverflowLogo(11) + ' ' + ticker(lastPoint.questions) + '</span>' +
          '</span><span class="lang">12 meses · pt-BR</span></figcaption>' +
        '<div class="code-body" style="padding:12px"><svg viewBox="0 0 ' + TIMELINE_PLOT_WIDTH + ' ' + TIMELINE_PLOT_HEIGHT + '" role="img" aria-label="Evolução estimada de estrelas e perguntas em 12 meses">' +
          gridLines +
          starSeries +
          '<polyline points="' + questionPoints + '" fill="none" stroke="#C3E88D" stroke-width="2" stroke-dasharray="4 4" stroke-opacity="0.7"/>' +
          '<polyline points="' + [xAxis(points.length - 2) + "," + yAxis(points[points.length - 2].questions, questionAxis), xAxis(points.length - 1) + "," + yAxis(lastPoint.questions, questionAxis)].join(" ") + '" fill="none" stroke="#C3E88D" stroke-width="2"/>' +
          '<circle cx="' + xAxis(points.length - 1) + '" cy="' + yAxis(lastPoint.questions, questionAxis) + '" r="4" fill="#C3E88D"/>' +
          monthLabels +
          '<text x="' + TIMELINE_MARGIN.left + '" y="' + (TIMELINE_PLOT_HEIGHT - 2) + '" fill="#454B54" font-size="9" font-family="monospace">escala esquerda: estrelas</text>' +
          '<text x="' + (TIMELINE_PLOT_WIDTH - TIMELINE_MARGIN.right) + '" y="' + (TIMELINE_PLOT_HEIGHT - 2) + '" text-anchor="end" fill="#454B54" font-size="9" font-family="monospace">escala direita: perguntas</text>' +
        '</svg></div>' +
        '<div class="timeline-note"><span class="mono">fonte:</span> 11 pontos estimados a partir dos totais reais de hoje; o ponto final é real. ' + esc(samplingNote) + ' Tracejado = estimativa, contínuo = trecho real.</div>' +
        (hasGithub ? "" : '<div class="timeline-note"><span class="mono">aviso:</span> série de estrelas omitida por falta de resposta do GitHub; nenhum valor foi substituído por zero.</div>') +
      '</figure></section>';
  }

  /* ---Tabela de métricas brutos---------------------------------------------- */

  /**
   * Linha da tabela de métricas com valor animado e barra de proporção.
   * @param {string} label
   * @param {number|null} value
   * @param {string} valueAttributes
   * @param {string} origin
   * @param {number|null} barPercent — null significa "n/a"
   * @returns {string}
   */
  function buildMetricRow(label, value, valueAttributes, origin, barPercent) {
    return '<tr><th scope="row">' + label + '</th><td class="num">' + (value === null ? "&mdash;" : ticker(value, valueAttributes)) + '</td>' +
      '<td>' + (barPercent === null
        ? '<span class="mono" style="font-size:12px;color:var(--disabled)">n/a</span>'
        : '<span class="hairline-bar"><i style="width:' + barPercent + '%"></i></span>') + '</td>' +
      '<td class="origin">' + origin + '</td></tr>';
  }

  /**
   * Tabela de métricas com a origem de cada número e barra proporcional.
   * @param {Object} report
   * @returns {string}
   */
  function metrics(report) {
    var githubRepo = report.github && report.github.repo;
    var stackOverflow = report.stackoverflow;
    var metricValues = [
      githubRepo ? githubRepo.stars : 0,
      githubRepo ? githubRepo.forks : 0,
      githubRepo ? githubRepo.openIssues : 0,
      githubRepo ? githubRepo.watchers : 0,
      stackOverflow ? stackOverflow.totalQuestions : 0,
      stackOverflow ? stackOverflow.totalUnanswered : 0,
      report.github ? report.github.sampleSize : 0,
      stackOverflow ? stackOverflow.sampleSize : 0
    ];
    var maxValue = Math.max.apply(null, metricValues.concat([1]));
    var ratio = function (value) { return Math.max(2, Math.round(value / maxValue * 100)); };
    var githubOrigin = "GitHub REST";
    var stackOverflowOrigin = stackOverflow && stackOverflow.source === "demo" ? "demo" : "Stack Exchange";

    var metricRows = [
      buildMetricRow("Estrelas no GitHub", githubRepo ? githubRepo.stars : null, "", githubOrigin, ratio(githubRepo ? githubRepo.stars : 0)),
      buildMetricRow("Forks", githubRepo ? githubRepo.forks : null, "", githubOrigin, ratio(githubRepo ? githubRepo.forks : 0)),
      buildMetricRow("Issues abertas (inclui PRs)", githubRepo ? githubRepo.openIssues : null, "", githubOrigin, ratio(githubRepo ? githubRepo.openIssues : 0)),
      buildMetricRow("Watchers", githubRepo ? githubRepo.watchers : null, "", githubOrigin, ratio(githubRepo ? githubRepo.watchers : 0)),
      buildMetricRow("Dias desde o último push", report.github ? report.github.daysSincePush : null, "", githubOrigin, null),
      buildMetricRow("Amostragem real de stargazers", report.github ? report.github.sampleSize : null, "", githubOrigin, ratio(report.github ? report.github.sampleSize : 0)),
      buildMetricRow("Total de perguntas na tag", stackOverflow ? stackOverflow.totalQuestions : null, "", stackOverflowOrigin, ratio(stackOverflow ? stackOverflow.totalQuestions : 0)),
      buildMetricRow("Perguntas sem resposta", stackOverflow ? stackOverflow.totalUnanswered : null, "", stackOverflowOrigin, ratio(stackOverflow ? stackOverflow.totalUnanswered : 0)),
      buildMetricRow("Taxa geral sem resposta", stackOverflow ? stackOverflow.unansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"', stackOverflowOrigin, stackOverflow ? Math.round(stackOverflow.unansweredRate * 100) : null),
      buildMetricRow("Sem resposta na amostra recente", stackOverflow && stackOverflow.sampleSize ? stackOverflow.sampleUnansweredRate * 100 : null, 'data-decimals="1" data-suffix="%"', "scraping / API", stackOverflow && stackOverflow.sampleSize ? Math.round(stackOverflow.sampleUnansweredRate * 100) : null),
      buildMetricRow("Perguntas recentes analisadas", stackOverflow ? stackOverflow.sampleSize : null, "", "scraping / API", ratio(stackOverflow ? stackOverflow.sampleSize : 0))
    ].join("");

    return '<section class="section" aria-labelledby="metrics-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="metrics-h">Os números, sem interpretação. <span>Cada linha com a sua origem.</span></h2>' +
      '<div class="detail"><p>As barras de 1px são proporcionais ao maior valor do grupo, calculadas no cliente.</p><p class="index">5.0 Métricas →</p></div></div>' +
      '<div class="table-wrap" style="margin-top:28px"><table><thead><tr><th>Métrica</th><th class="num">Valor</th><th>Proporção</th><th>Origem</th></tr></thead><tbody>' + metricRows + '</tbody></table></div>' +
      '</section>';
  }

  /* ---Perguntas recentes------------------------------------------------------ */

  /**
   * Lista das perguntas mais recentes da tag no Stack Overflow.
   * @param {Object} report
   * @returns {string}
   */
  function questions(report) {
    var recentQuestions = report.stackoverflow ? report.stackoverflow.recentQuestions : [];
    if (!recentQuestions.length) return "";
    var questionItems = recentQuestions.slice(0, MAX_RECENT_ITEMS).map(function (question) {
      return '<li class="question-row">' +
        '<span class="state ' + (question.unanswered ? "open" : "answered") + '">' + (question.unanswered ? "sem resposta" : question.answers + " resp.") + '</span>' +
        '<a href="' + esc(question.url) + '" target="_blank" rel="noopener noreferrer">' + esc(question.title) + '</a>' +
        '<span class="votes">' + question.votes + ' votos</span>' +
        (question.askedAt ? '<span class="date">' + new Date(question.askedAt).toLocaleDateString("pt-BR") + '</span>' : "") +
        '</li>';
    }).join("");
    return '<section class="section" aria-labelledby="questions-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="questions-h">Amostra ' + stackOverflowLogo(16) + '. <span>As perguntas mais recentes da tag.</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + recentQuestions.length + ' perguntas coletadas no</span> ' + stackOverflowLogo(12) + ' <span>via Stack Exchange API, para medir a frequência de dúvidas sem resposta.</span></p><p class="index">6.0 Amostra →</p></div></div>' +
      '<ul class="panel questions" style="margin-top:28px">' + questionItems + '</ul></section>';
  }

  /* ---Hacker News (buzz em títulos)------------------------------------------- */

  /**
   * Badge de variação semana a semana do buzz no Hacker News.
   * @param {number|null} changePercent
   * @returns {string}
   */
  function buildBuzzChangeBadge(changePercent) {
    if (changePercent === null) return '<span class="mono" style="font-size:12px;color:var(--disabled)">sem base de comparação</span>';
    if (changePercent > 0) return '<span class="trend-badge up">' + icons.get("arrowUp", "icon-sm") + '+' + changePercent + '% vs. semana anterior</span>';
    if (changePercent < 0) return '<span class="trend-badge down">' + icons.get("arrowDown", "icon-sm") + changePercent + '% vs. semana anterior</span>';
    return '<span class="trend-badge flat">' + icons.get("arrowRight", "icon-sm") + '0% vs. semana anterior</span>';
  }

  /**
   * Seção do Hacker News: cards de menções + posts recentes.
   * @param {Object} report
   * @returns {string}
   */
  function hnSection(report) {
    var hackerNews = report.hn;
    if (!hackerNews) return "";
    var processDescription = 'Processo: <code class="inline-code">' + esc(hackerNews.siteUrl) + '</code> (front page em HTML) · ' +
      '<code class="inline-code">' + esc(hackerNews.siteUrl) + '/newest + /front?p=1..5</code> (arquivo em HTML, menções em títulos) — via <a href="' + esc(hackerNews.searchUrl) + '" target="_blank" rel="noopener noreferrer">arquivo da front page do HN</a>';

    var frontPage = hackerNews.frontPage;
    var frontPageTag = !frontPage || !frontPage.posts
      ? ""
      : frontPage.matches > 0
        ? '<li class="health-tag pos"><span aria-hidden="true">+</span><span>#na front page do HN agora (' + frontPage.matches + ' de ' + frontPage.posts + ' posts)</span></li>'
        : '<li class="health-tag neu"><span aria-hidden="true">·</span><span>#fora da front page do HN agora (' + frontPage.posts + ' posts no ar)</span></li>';

    if (hackerNews.source !== "hn-scrape") {
      return '<section class="section" aria-labelledby="hn-h">' +
        '<div class="section-head"><h2 class="h2 headline two-tone" id="hn-h">HACKER NEWS ' + hackerNewsLogo(16) + '. <span>Buzz da comunidade.</span></h2>' +
        '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + processDescription + '</span></p><p class="index">7.0 HACKER NEWS →</p></div></div>' +
        '<div class="status-line" style="margin-top:28px">' + icons.get("info", "icon-sm") + '<span>' + esc(hackerNews.note || "Dados do Hacker News indisponíveis.") + '</span></div>' +
        '</section>';
    }

    var recentPosts = (hackerNews.recentPosts || []).slice(0, MAX_RECENT_ITEMS);
    var postsHtml = recentPosts.length
      ? '<ul class="panel questions" style="margin-top:28px">' + recentPosts.map(function (post) {
          return '<li class="question-row">' +
            '<span class="state ' + (post.unanswered ? "open" : "answered") + '">' + (post.unanswered ? "sem comentários" : post.answers + " coment.") + '</span>' +
            '<a href="' + esc(post.url) + '" target="_blank" rel="noopener noreferrer">' + esc(post.title) + '</a>' +
            '<span class="votes">' + post.points + ' pontos</span>' +
            (post.askedAt ? '<span class="date">' + new Date(post.askedAt).toLocaleDateString("pt-BR") + '</span>' : "") +
            '</li>';
        }).join("") + '</ul>'
      : '<div class="status-line" style="margin-top:28px">' + icons.get("info", "icon-sm") + '<span>Nenhum título mencionou "' + esc(hackerNews.query) + '" nos últimos 7 dias.</span></div>';

    return '<section class="section" aria-labelledby="hn-h">' +
      '<div class="section-head"><h2 class="h2 headline two-tone" id="hn-h">HACKER NEWS ' + hackerNewsLogo(16) + '. <span>Buzz da comunidade, medido em menções a títulos.</span></h2>' +
      '<div class="detail"><p style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>' + processDescription + '</span></p><p class="index">7.0 HACKER NEWS →</p></div></div>' +
      '<div class="proj-grid" style="margin-top:28px">' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Títulos na última semana ' + hackerNewsLogo(12) + '</div>' +
          '<div class="proj-card-value">' + ticker(hackerNews.titlesLast7d) + '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Semana anterior</div>' +
          '<div class="proj-card-value">' + ticker(hackerNews.titlesPrev7d) + '</div>' +
        '</div>' +
        '<div class="proj-card panel">' +
          '<div class="proj-card-label">Variação (buzz)</div>' +
          '<div class="proj-card-value">' + buildBuzzChangeBadge(hackerNews.deltaPct) + '</div>' +
        '</div>' +
      '</div>' +
      (frontPageTag ? '<ul class="health-tags" style="margin-top:16px">' + frontPageTag + '</ul>' : "") +
      postsHtml +
      '<div class="timeline-note" style="margin-top:12px"><span class="mono">métrica:</span> posts (stories) cujo título menciona "' + esc(hackerNews.query) + '", extraídos do HTML do Hacker News (/newest e /front, sem API); comparação semana a semana indica aceleração do interesse. O arquivo público cobre apenas os últimos dias.</div>' +
      '</section>';
  }

  /* ---Aviso de indisponibilidade do GitHub------------------------------------ */

  /**
   * Cartão de aviso exibido quando a API do GitHub não respondeu.
   * @param {Object} report
   * @returns {string}
   */
  function githubNotice(report) {
    if (report.github) return "";
    var errorMessage = report.githubError;
    var isRateLimit = errorMessage && (errorMessage.indexOf("403") !== -1 || errorMessage.indexOf("rate limit") !== -1 || errorMessage.indexOf("cota") !== -1);
    var noticeTitle = isRateLimit
      ? "Limite de requisições do GitHub atingido (HTTP 403)"
      : "Dados do GitHub indisponíveis";
    var noticeDescription = isRateLimit
      ? "A cota não autenticada da API pública do GitHub (60 req/h por IP) foi esgotada. Para continuar analisando sem restrições (5.000 req/h), adicione um GitHub Token pessoal (gratuito) no painel Config."
      : "A API do GitHub não respondeu no momento. A análise abaixo foi calculada com os dados do Stack Overflow e heurística/Gemini.";

    return '<div class="github-limit-notice panel" style="margin-top:20px;padding:16px 20px;border-left:3px solid var(--const);background:var(--surface)">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
        '<div>' +
          '<div style="font-weight:600;color:var(--const);font-size:13px;display:flex;align-items:center;gap:6px">' +
            icons.get("alert", "icon-sm") + ' <span>' + esc(noticeTitle) + '</span>' +
          '</div>' +
          '<p style="margin-top:6px;font-size:12px;color:var(--secondary);line-height:1.5">' + esc(noticeDescription) + '</p>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary" data-open-config style="height:32px;padding:0 14px;font-size:12px;cursor:pointer">Abrir Config</button>' +
      '</div></div>';
  }

  /* ---Proveniência e avisos---------------------------------------------------- */

  /**
   * Rodapé do relatório: badges de proveniência, avisos e links das fontes.
   * @param {Object} report
   * @returns {string}
   */
  function sources(report) {
    var reportSources = report.sources || {};
    var badges = Object.keys(reportSources).map(function (sourceKey) {
      return '<span class="source-badge">' + esc(sourceKey) + ' → ' + esc(SOURCE_LABELS[reportSources[sourceKey]] || reportSources[sourceKey]) + '</span>';
    }).join("");
    var warningItems = (report.warnings || []).map(function (warningText) {
      return '<li><span class="mark">!</span><span>' + esc(warningText) + '</span></li>';
    }).join("");
    var generatedAt = new Date(report.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    var githubRepoName = report.github && report.github.repo ? report.github.repo.fullName : report.tech.repo;
    var githubApiLink = githubRepoName ? window.DEVTRENDS.config.githubApi + '/repos/' + esc(githubRepoName) : '';
    var githubWebLink = githubRepoName ? 'https://github.com/' + esc(githubRepoName) : '';
    var stackOverflowLink = report.stackoverflow && report.stackoverflow.tagUrl ? esc(report.stackoverflow.tagUrl) : '#';
    var hackerNewsLink = report.hn && report.hn.searchUrl && report.hn.source === "hn-scrape" ? esc(report.hn.searchUrl) : '';

    return '<section class="section"><aside class="nested source-notice" aria-label="Proveniência dos dados">' +
      '<div class="source-badges"><span class="mono" style="font-size:12px;color:var(--tertiary)">proveniência:</span>' + badges +
      '<span class="source-time">gerado ' + esc(generatedAt) + '</span></div>' +
      '<ul class="warnings">' + warningItems + '</ul>' +
      '<div class="source-links">' +
        (githubWebLink ? '<a class="btn-link" href="' + githubWebLink + '" target="_blank" rel="noopener noreferrer">GitHub repo ' + icons.get("arrowUpRight", "icon-sm") + '</a>' : '') +
        (githubApiLink ? '<a class="btn-link" href="' + githubApiLink + '" target="_blank" rel="noopener noreferrer">GitHub REST ' + icons.get("arrowUpRight", "icon-sm") + '</a>' : '') +
        '<a class="btn-link" href="' + stackOverflowLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px">' + stackOverflowLogo(13) + ' ' + icons.get("arrowUpRight", "icon-sm") + '</a>' +
        (hackerNewsLink ? '<a class="btn-link" href="' + hackerNewsLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px">' + hackerNewsLogo(13) + ' ' + icons.get("arrowUpRight", "icon-sm") + '</a>' : '') +
      '</div></aside></section>';
  }

  /* ---Ponto de entrada da renderização------------------------------------------ */

  /**
   * Renderiza o relatório completo no contêiner e monta ticker/highlight.
   * @param {HTMLElement} container — nó que receberá o HTML do relatório
   * @param {Object} report — relatório produzido por DEVTRENDS_DATA.getInsights
   */
  function render(container, report) {
    container.innerHTML =
      githubNotice(report) +
      trendCard(report) +
      scoreBreakdown(report) +
      projection(report) +
      comparativo(report) +
      analysis(report) +
      timeline(report) +
      metrics(report) +
      questions(report) +
      hnSection(report) +
      sources(report);
    window.DEVTRENDS_TICKER.mount(container);
    window.DEVTRENDS_HIGHLIGHT.mount(container);
  }

  window.DEVTRENDS_WIDGETS = { render: render, ticker: ticker, gauge: gauge };
})();
