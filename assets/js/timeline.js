/* =========================================================================
   timeline.js — série histórica de 12 meses (estrelas e perguntas).

   Responsabilidade única: construir a projeção mensal a partir dos totais
   reais de hoje e da velocidade REAL observada na amostra de stargazers.
   Não desenha nada — devolve pontos que o widgets.js renderiza.

   Toda a série é estimada, exceto o último ponto (totais reais de hoje);
   o relatório sinaliza isso explicitamente.
   ========================================================================= */
(function () {
  "use strict";

  var catalog = window.DEVTRENDS_CATALOG;

  var MILLISECONDS_PER_DAY = 86400000;
  var TIMELINE_MONTHS = 12;
  var CURVE_EXPONENT = 1.4;
  var DAYS_PER_MONTH = 30;
  var YEARS_PER_AVERAGE = 365.25;
  var MONTHS_PER_YEAR = 12;

  /* Faixas de crescimento mensal aceitáveis na projeção (fração do total). */ 
  var ANNUAL_GROWTH_FLOOR = 0.08, ANNUAL_GROWTH_EARLY_CEILING = 0.85, ANNUAL_GROWTH_DEFAULT = 0.2;
  var MATURITY_GROWTH_CEILING = 0.7;

  /**
   * Resume a amostragem real de stargazers em métricas de velocidade.
   * @param {Object|null} github — saída de DEVTRENDS_GITHUB.get()
   * @returns {{size: number, days: number, from: string|null, to: string|null,
   *            monthlyVelocity: number|null}}
   */
  function summarizeStars(github) {
    if (!github || !github.sampleSize || !github.starSample.length) {
      return { size: 0, days: 0, from: null, to: null, monthlyVelocity: null };
    }
    var firstSampleDay = github.starSample[0].date;
    var lastSampleDay = github.starSample[github.starSample.length - 1].date;
    var coveredDays = Math.max(1, Math.ceil((new Date(lastSampleDay) - new Date(firstSampleDay)) / MILLISECONDS_PER_DAY) + 1);
    var monthlyVelocity = github.sampleSize / coveredDays * DAYS_PER_MONTH;
    return { size: github.sampleSize, days: coveredDays, from: firstSampleDay, to: lastSampleDay, monthlyVelocity: monthlyVelocity };
  }

  /**
   * Últimos 12 meses como chaves ISO (YYYY-MM) e rótulos curtos pt-BR.
   * @param {Date} now
   * @returns {{key: string, label: string}[]}
   */
  function buildMonthBuckets(now) {
    var out = [], formatter = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
    for (var monthsAgo = TIMELINE_MONTHS - 1; monthsAgo >= 0; monthsAgo--) {
      var monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
      out.push({
        key: monthDate.getUTCFullYear() + "-" + String(monthDate.getUTCMonth() + 1).padStart(2, "0"),
        label: formatter.format(monthDate).replace(".", "")
      });
    }
    return out;
  }

  /**
   * Taxa anual de crescimento inferida da velocidade real (quando existe) ou
   * da idade do repositório (projeto novo cresce rápido; maduro, devagar).
   * @param {number} total
   * @param {number|null} monthlyVelocity
   * @param {number|null} ageYears
   * @returns {number} fração anual (0.08..0.85)
   */
  function estimateAnnualGrowthRate(total, monthlyVelocity, ageYears) {
    if (total <= 0) return ANNUAL_GROWTH_DEFAULT;
    if (monthlyVelocity > 0) return catalog.clamp(monthlyVelocity * MONTHS_PER_YEAR / total, ANNUAL_GROWTH_FLOOR, ANNUAL_GROWTH_EARLY_CEILING);
    if (ageYears > 0) return catalog.clamp(0.9 / (1 + ageYears), ANNUAL_GROWTH_FLOOR, MATURITY_GROWTH_CEILING);
    return ANNUAL_GROWTH_DEFAULT;
  }

  /**
   * Velocidade mensal de perguntas estimada pela amostra recente (30/dia).
   * @param {Object|null} stackOverflow
   * @param {Date} now
   * @returns {number|null}
   */
  function estimateMonthlyQuestionRate(stackOverflow, now) {
    if (!stackOverflow) return null;
    var timestamps = stackOverflow.recentQuestions.map(function (question) {
      return question.askedAt ? new Date(question.askedAt).getTime() : NaN;
    }).filter(function (timestamp) { return isFinite(timestamp); });
    if (timestamps.length < 2) return null;

    var oldestTimestamp = Math.min.apply(null, timestamps);
    var spanDays = Math.max(1, (now.getTime() - oldestTimestamp) / MILLISECONDS_PER_DAY);
    return timestamps.length / spanDays * DAYS_PER_MONTH;
  }

  /**
   * Constrói a série de 12 meses (estrelas e perguntas por mês).
   * @param {Object|null} github
   * @param {Object|null} stackOverflow
   * @returns {{month: string, label: string, stars: number, questions: number,
   *            estimated: boolean}[]}
   */
  function buildTimeline(github, stackOverflow) {
    var now = new Date();
    var monthBuckets = buildMonthBuckets(now);
    var starSampling = summarizeStars(github);

    var repositoryAgeYears = github ? (now - new Date(github.repo.createdAt)) / (YEARS_PER_AVERAGE * MILLISECONDS_PER_DAY) : null;
    var totalStars = github ? github.repo.stars : 0;
    var totalQuestions = stackOverflow ? stackOverflow.totalQuestions : 0;

    var starGrowthRate = estimateAnnualGrowthRate(totalStars, starSampling.monthlyVelocity, repositoryAgeYears);
    var questionGrowthRate = estimateAnnualGrowthRate(totalQuestions, estimateMonthlyQuestionRate(stackOverflow, now), null);

    return monthBuckets.map(function (month, monthIndex) {
      var curvePosition = Math.pow(monthIndex / (TIMELINE_MONTHS - 1), CURVE_EXPONENT);
      return {
        month: month.key,
        label: (monthIndex % 2 === 0 || monthIndex === TIMELINE_MONTHS - 1) ? month.label : "",
        stars: Math.round(totalStars * (1 - starGrowthRate + starGrowthRate * curvePosition)),
        questions: Math.round(totalQuestions * (1 - questionGrowthRate + questionGrowthRate * curvePosition)),
        estimated: monthIndex < TIMELINE_MONTHS - 1
      };
    });
  }

  window.DEVTRENDS_TIMELINE = { summarizeStars: summarizeStars, buildTimeline: buildTimeline };
})();
