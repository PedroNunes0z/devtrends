/* =========================================================================
   http.js — cliente HTTP com timeout e cache opcional em localStorage.

   Responsabilidade única: fazer requisições JSON com cancelamento por
   timeout e traduzir respostas de erro HTTP em Error com mensagem útil.
   O cache é opt-in por chamada (cachedJson); o Hacker News, por exemplo,
   usa requestJson direto para garantir dados em tempo real.
   ========================================================================= */
(function () {
  "use strict";

  var config = window.DEVTRENDS.config;

  var CACHE_KEY_PREFIX = "devtrends.cache.";
  var MILLISECONDS_PER_MINUTE = 60000;

  /**
   * Executa uma requisição JSON com AbortController e timeout.
   * Rejeita com Error (com .status) para qualquer resposta não-OK.
   * @param {string} url
   * @param {{method?: string, headers?: Object, body?: string, timeoutMs?: number}} [options]
   * @returns {Promise<Object|Array>}
   */
  function requestJson(url, options) {
    var requestOptions = options || {};
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, requestOptions.timeoutMs || config.timeoutMs);

    return fetch(url, {
      method: requestOptions.method || "GET",
      headers: requestOptions.headers || {},
      body: requestOptions.body || undefined,
      signal: controller.signal,
      mode: "cors",
      credentials: "omit"
    }).then(function (response) {
      clearTimeout(timer);
      if (!response.ok) return rejectWithHttpError(response, url);
      return response.json();
    }).catch(function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  /**
   * Extrai a mensagem do corpo de erro da API (formatos variados) e rejeita.
   * @param {Response} response
   * @param {string} url
   * @returns {Promise<never>}
   */
  function rejectWithHttpError(response, url) {
    return response.json()
      .catch(function () { return null; })
      .then(function (errorBody) {
        var message = (errorBody && errorBody.error && errorBody.error.message) ||
          (errorBody && errorBody.message) ||
          ("HTTP " + response.status + " em " + new URL(url).host);
        var error = new Error(message);
        error.status = response.status;
        throw error;
      });
  }

  function cacheKey(url) {
    return CACHE_KEY_PREFIX + url;
  }

  /**
   * Lê uma entrada válida do cache (expira em cacheTtlMinutes); inválida → null.
   * @param {string} url
   * @returns {Object|Array|null}
   */
  function readFreshCacheEntry(url) {
    try {
      var raw = localStorage.getItem(cacheKey(url));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      var isExpired = Date.now() - entry.t > config.cacheTtlMinutes * MILLISECONDS_PER_MINUTE;
      return isExpired ? null : entry.data;
    } catch (storageError) {
      return null;
    }
  }

  /**
   * Grava no cache; silencioso quando o localStorage está cheio/indisponível.
   * @param {string} url
   * @param {Object|Array} data
   */
  function writeCacheEntry(url, data) {
    try {
      localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), data: data }));
    } catch (storageError) { /* cota do localStorage esgotada */ }
  }

  /**
   * Requisição JSON com cache prévio: devolve o valor em cache quando fresco.
   * @param {string} url
   * @param {Object} [options] — mesmas opções de requestJson
   * @returns {Promise<Object|Array>}
   */
  function cachedJson(url, options) {
    var cachedValue = readFreshCacheEntry(url);
    if (cachedValue) return Promise.resolve(cachedValue);
    return requestJson(url, options).then(function (data) {
      writeCacheEntry(url, data);
      return data;
    });
  }

  window.DEVTRENDS_HTTP = { requestJson: requestJson, cachedJson: cachedJson };
})();
