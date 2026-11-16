/* =========================================================================
   icons.js — inline SVG icon set. No emojis anywhere in the interface.
   ========================================================================= */
(function () {
  "use strict";

  function svg(paths, extra) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + paths + "</svg>";
  }

  var paths = {
    arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowDown: '<path d="M12 5v14"/><path d="m5 12 7 7 7-7"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
    fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7"/><path d="M12 13v4"/>',
    issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.7.3-.9.8-.9 1.5v.4"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    chart: '<path d="M3 20h18"/><path d="m4 15 5-5 4 3 7-8"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
    code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m14 5-4 14"/>',
    sparkles: '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2.5 2.5"/><path d="m15.5 15.5 2.5 2.5"/><path d="m18 6-2.5 2.5"/><path d="m8.5 15.5-2.5 2.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-3.4v-.3a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L5.6 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4v-3.4h.4a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L5.6 7.6 8 5.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3.6h3.4V4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.4V14h-.4a1.7 1.7 0 0 0-1.6 1Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    alert: '<path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    github: '<path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5.4v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 18.9 5a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C5.9 1.1 4.8 1.4 4.8 1.4A4.9 4.9 0 0 0 4.7 5a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/>'
  };

  var icons = {};
  Object.keys(paths).forEach(function (key) { icons[key] = svg(paths[key]); });

  window.DEVTRENDS_ICONS = {
    get: function (name, className) {
      var markup = icons[name] || icons.info;
      if (className) markup = markup.replace('class="icon"', 'class="icon ' + className + '"');
      return markup;
    },
    raw: icons
  };
})();
