/* =========================================================================
   catalog.js — tecnologias conhecidas, opções de análise e helpers puros.

   Responsabilidade única: fornecer o catálogo de technologies e funções de
   normalização/formato reutilizáveis. Nenhuma chamada de rede, nenhum DOM.
   ========================================================================= */
(function () {
  "use strict";

  /* --- Catálogo: slug estável usado em URLs, tag do Stack Overflow e        --- */
  /* --- repositório canônico do GitHub; aliases amplam a busca por texto.    --- */
  var CATALOG = [
    { slug: "react", name: "React", soTag: "reactjs", repo: "facebook/react", aliases: ["reactjs", "react.js"], blurb: "Biblioteca de interfaces declarativas" },
    { slug: "vue-js", name: "Vue.js", soTag: "vue.js", repo: "vuejs/core", aliases: ["vue", "vuejs", "vue 3"], blurb: "Framework progressivo de interfaces" },
    { slug: "next-js", name: "Next.js", soTag: "next.js", repo: "vercel/next.js", aliases: ["next", "nextjs"], blurb: "Framework React com rendering híbrido" },
    { slug: "typescript", name: "TypeScript", soTag: "typescript", repo: "microsoft/TypeScript", aliases: ["ts"], blurb: "Tipagem estática sobre JavaScript" },
    { slug: "python", name: "Python", soTag: "python", repo: "python/cpython", aliases: ["py", "python3"], blurb: "Linguagem de propósito geral" },
    { slug: "rust", name: "Rust", soTag: "rust", repo: "rust-lang/rust", aliases: ["rustlang"], blurb: "Sistemas com segurança de memória" },
    { slug: "go", name: "Go", soTag: "go", repo: "golang/go", aliases: ["golang"], blurb: "Linguagem compilada e concorrente" },
    { slug: "svelte", name: "Svelte", soTag: "svelte", repo: "sveltejs/svelte", aliases: ["sveltekit", "svelte.js"], blurb: "Compilador de interfaces reativas" },
    { slug: "angular", name: "Angular", soTag: "angular", repo: "angular/angular", aliases: ["angularjs"], blurb: "Framework corporativo de aplicações" },
    { slug: "node-js", name: "Node.js", soTag: "node.js", repo: "nodejs/node", aliases: ["node", "nodejs"], blurb: "Runtime JavaScript no servidor" },
    { slug: "tailwind-css", name: "Tailwind CSS", soTag: "tailwind-css", repo: "tailwindlabs/tailwindcss", aliases: ["tailwind", "tailwindcss"], blurb: "Framework CSS utilitário" },
    { slug: "astro", name: "Astro", soTag: "astro", repo: "withastro/astro", aliases: ["astrojs"], blurb: "Gerador de sites orientado a conteúdo" },
    { slug: "bun", name: "Bun", soTag: "bun", repo: "oven-sh/bun", aliases: ["bunjs"], blurb: "Runtime e toolkit JavaScript" },
    { slug: "deno", name: "Deno", soTag: "deno", repo: "denoland/deno", aliases: ["denojs"], blurb: "Runtime TypeScript seguro por padrão" },
    { slug: "nest-js", name: "NestJS", soTag: "nestjs", repo: "nestjs/nest", aliases: ["nest", "nestjs"], blurb: "Framework Node.js opinativo" },
    { slug: "django", name: "Django", soTag: "django", repo: "django/django", aliases: ["django-rest"], blurb: "Framework web Python" },
    { slug: "flutter", name: "Flutter", soTag: "flutter", repo: "flutter/flutter", aliases: ["dart"], blurb: "Toolkit multiplataforma de UI" },
    { slug: "kotlin", name: "Kotlin", soTag: "kotlin", repo: "JetBrains/kotlin", aliases: ["kt"], blurb: "Linguagem JVM e multiplataforma" },
    { slug: "swift", name: "Swift", soTag: "swift", repo: "swiftlang/swift", aliases: ["swiftui"], blurb: "Linguagem do ecossistema Apple" },
    { slug: "spring-boot", name: "Spring Boot", soTag: "spring-boot", repo: "spring-projects/spring-boot", aliases: ["spring", "springboot"], blurb: "Framework Java para serviços" },
    { slug: "laravel", name: "Laravel", soTag: "laravel", repo: "laravel/framework", aliases: ["laravelphp"], blurb: "Framework PHP para aplicações web" },
    { slug: "kubernetes", name: "Kubernetes", soTag: "kubernetes", repo: "kubernetes/kubernetes", aliases: ["k8s"], blurb: "Orquestração de contêineres" },
    { slug: "docker", name: "Docker", soTag: "docker", repo: "docker/cli", aliases: ["containerd"], blurb: "Contêineres e empacotamento" },
    { slug: "postgresql", name: "PostgreSQL", soTag: "postgresql", repo: "postgres/postgres", aliases: ["postgres", "pg"], blurb: "Banco de dados relacional" },
    { slug: "graphql", name: "GraphQL", soTag: "graphql", repo: "graphql/graphql-js", aliases: ["gql"], blurb: "Linguagem de consulta para APIs" },
    { slug: "pytorch", name: "PyTorch", soTag: "pytorch", repo: "pytorch/pytorch", aliases: ["torch"], blurb: "Framework de aprendizado profundo" },
    { slug: "tensorflow", name: "TensorFlow", soTag: "tensorflow", repo: "tensorflow/tensorflow", aliases: ["tf"], blurb: "Plataforma de machine learning" }
  ];

  var POPULAR_TECH_SLUGS = ["react", "vue-js", "next-js", "typescript", "python", "rust", "go", "svelte", "angular", "node-js", "tailwind-css", "astro", "bun", "kubernetes", "pytorch"];

  /* --- Opções de análise selecionadas pelo usuário na interface; o rótulo  --- */
  /* --- entra literalmente no prompt do Gemini.                             --- */
  var FOCUS_AREAS = {
    "geral": "Análise geral (todos os critérios)",
    "carreira": "Foco em carreira: demanda de mercado e empregabilidade",
    "adocao": "Foco em adoção em projetos: estabilidade e ecossistema",
    "aprendizado": "Foco em curva de aprendizado e documentação",
    "manutencao": "Foco em manutenção: atividade, issues e suporte"
  };

  var ANALYSIS_DEPTHS = {
    "rapida": "Análise rápida (resumo e índice)",
    "padrao": "Análise padrão (todos os campos do schema)",
    "profunda": "Análise profunda (justificativa detalhada e recomendação específica)"
  };

  var EXPERIENCE_LEVELS = {
    "iniciante": "Desenvolvedor iniciante",
    "intermediario": "Desenvolvedor intermediário",
    "avancado": "Desenvolvedor avançado / arquiteto"
  };

  var MAX_SLUG_LENGTH = 60;
  var MAX_TECH_NAME_LENGTH = 40;
  var MAX_QUERY_LENGTH = 80;

  /**
   * Converte texto livre em slug de URL (minúsculas, sem acento, hífens).
   * @param {string} rawInput
   * @returns {string}
   */
  function slugify(rawInput) {
    return String(rawInput || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim().replace(/[._]/g, "-").replace(/[^a-z0-9+#-]+/g, "-")
      .replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, MAX_SLUG_LENGTH);
  }

  /**
   * Remove hífens para comparação flexível ("vue-js" === "vuejs").
   * @param {string} input
   * @returns {string}
   */
  function normalizeForComparison(input) {
    return slugify(input).replace(/-/g, "");
  }

  /**
   * Resolve texto digitado pelo usuário em uma tecnologia do catálogo.
   * Aceita slug, nome, alias; fora do catálogo, cria uma tecnologia sob demanda.
   * @param {string} userInput
   * @returns {{slug: string, name: string, soTag: string, repo: string, aliases: string[], blurb: string}}
   */
  function resolveTech(userInput) {
    var query = String(userInput || "").trim().slice(0, MAX_QUERY_LENGTH);
    if (!query) return CATALOG[0];

    var slug = slugify(query);
    var matchBySlug = CATALOG.filter(function (tech) { return tech.slug === slug; })[0];
    if (matchBySlug) return matchBySlug;

    var needle = normalizeForComparison(query);
    var matchByAlias = CATALOG.filter(function (tech) {
      return normalizeForComparison(tech.name) === needle || normalizeForComparison(tech.slug) === needle ||
        tech.aliases.some(function (alias) { return normalizeForComparison(alias) === needle; });
    })[0];
    if (matchByAlias) return matchByAlias;

    return {
      slug: slug, name: query.slice(0, MAX_TECH_NAME_LENGTH),
      soTag: query.toLowerCase().replace(/\s+/g, "-").replace(/[^\w.+#-]/g, "").slice(0, MAX_TECH_NAME_LENGTH) || slug,
      repo: "", aliases: [], blurb: "Tecnologia consultada sob demanda"
    };
  }

  /**
   * Número inteiro formatado no padrão pt-BR (18.442).
   * @param {number} value
   * @param {string} [locale]
   * @returns {string}
   */
  function formatNumber(value, locale) {
    return new Intl.NumberFormat(locale || "pt-BR").format(Math.round(Number(value) || 0));
  }

  /**
   * Número compacto no padrão pt-BR (18,4 mil).
   * @param {number} value
   * @returns {string}
   */
  function formatCompact(value) {
    return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
  }

  /**
   * Restringe um valor numérico a um intervalo (padrão: 0..100).
   * @param {number} value
   * @param {number} [minBound]
   * @param {number} [maxBound]
   * @returns {number}
   */
  function clamp(value, minBound, maxBound) {
    return Math.min(maxBound === undefined ? 100 : maxBound, Math.max(minBound === undefined ? 0 : minBound, value));
  }

  window.DEVTRENDS_CATALOG = {
    list: CATALOG,
    popular: POPULAR_TECH_SLUGS,
    FOCUS_AREAS: FOCUS_AREAS,
    ANALYSIS_DEPTHS: ANALYSIS_DEPTHS,
    DEPTHS: ANALYSIS_DEPTHS,
    EXPERIENCE_LEVELS: EXPERIENCE_LEVELS,
    slugify: slugify,
    normalizeForComparison: normalizeForComparison,
    resolveTech: resolveTech,
    formatNumber: formatNumber,
    formatCompact: formatCompact,
    clamp: clamp
  };
})();
