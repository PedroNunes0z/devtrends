/* =========================================================================
   number-ticker.js — vanilla port of Magic UI "Number Ticker"
   (npx shadcn@latest add @magicui/number-ticker)

   Official behaviour kept: spring (damping 60 / stiffness 100), starts when
   the element enters the viewport once, optional delay, up/down direction,
   decimalPlaces and Intl.NumberFormat. Dependencies: none.

   Usage: <span data-ticker="55039" data-decimals="0" data-suffix=""></span>
   ========================================================================= */
(function () {
  "use strict";

  var SPRING = { stiffness: 100, damping: 60, mass: 1 };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function format(value, el) {
    var decimals = Number(el.getAttribute("data-decimals") || 0);
    var locale = el.getAttribute("data-locale") || "pt-BR";
    var suffix = el.getAttribute("data-suffix") || "";
    var prefix = el.getAttribute("data-prefix") || "";
    var text = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(Number(value.toFixed(decimals)));
    return prefix + text + suffix;
  }

  function Ticker(el) {
    this.el = el;
    this.target = Number(el.getAttribute("data-ticker")) || 0;
    this.down = el.getAttribute("data-direction") === "down";
    this.start = this.down ? this.target : Number(el.getAttribute("data-start") || 0);
    this.value = this.start;
    this.velocity = 0;
    this.delay = Number(el.getAttribute("data-delay") || 0);
    this.played = false;
    el.classList.add("ticker");
    /* Correct value by default: crawlers, no-JS and a stalled animation all
       see the real number. The spring only replaces it when it actually runs. */
    el.textContent = format(this.target, el);
  }

  Ticker.prototype.play = function () {
    if (this.played) return;
    this.played = true;
    var self = this;
    if (reduced.matches) {
      self.el.textContent = format(self.target, self.el);
      return;
    }
    self.value = self.down ? self.target : this.start;
    self.el.textContent = format(self.value, self.el);
    setTimeout(function () { self.step(); }, self.delay);
  };

  Ticker.prototype.step = function () {
    var self = this;
    var last = performance.now();
    function frame(now) {
      /* Fixed step keeps the spring identical on 60/120/144 Hz displays. */
      var dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      var goal = self.down ? self.start : self.target;
      var force = -SPRING.stiffness * (self.value - goal) - SPRING.damping * self.velocity;
      self.velocity += (force / SPRING.mass) * dt;
      self.value += self.velocity * dt;
      if (Math.abs(self.value - goal) < 0.01 && Math.abs(self.velocity) < 0.01) {
        self.value = goal;
        self.el.textContent = format(self.value, self.el);
        return;
      }
      self.el.textContent = format(self.value, self.el);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  var observer = null;
  function ensureObserver() {
    if (observer || !("IntersectionObserver" in window)) return observer;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var t = entry.target.__ticker;
        if (t) t.play();
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1 });
    return observer;
  }

  function mount(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-ticker]");
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.__ticker) return;
      var ticker = new Ticker(el);
      el.__ticker = ticker;
      var obs = ensureObserver();
      if (obs) obs.observe(el);
      else ticker.play();
    });

    /* Safety net: if the observer never reports, at least animate what is
       already on screen. Offscreen elements keep the exact final value. */
    setTimeout(function () {
      Array.prototype.forEach.call(nodes, function (el) {
        var t = el.__ticker;
        if (!t || t.played) return;
        var box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) t.play();
      });
    }, 600);
  }

  window.DEVTRENDS_TICKER = { mount: mount, Ticker: Ticker, format: format };
})();
