/* =========================================================================
   dither-field.js — vanilla port of Magic UI "Dither Field"
   (https://magicui.design/docs/components/dither-field)

   Same WebGL2 two-pass renderer and GLSL (Bayer 8x8 ordered dither) as the
   official React component, without React or any dependency. It renders a
   FIXED FULL-PAGE background, never inside a code container.

   Terminal Dark constraints: single syntax-palette colour (#82AAFF), low
   intensity, still frame (speed 0). The only motion is the pointer glow,
   which runs on demand and stops when idle. prefers-reduced-motion disables
   it entirely.
   ========================================================================= */
(function () {
  "use strict";

  var VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(corner, 0.0, 1.0);
}`;

  var FIELD_HEADER = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec2 uView;
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = turn * p * 2.0 + 11.7;
    amp *= 0.5;
  }
  return sum;
}`;

  var FIELD_MAIN = `
void main() {
  vec2 p = gl_FragCoord.xy / uView * uSize;
  float v = pattern(p, uSize, uTime);
  outColor = vec4(clamp(v, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

  /* GLSL bodies from the official component. Only "waves" is used here. */
  var PATTERNS = {
    waves: `
    vec2 q = p / 32.0;
    float warp = fbm(q * 0.09 + vec2(t * 0.035, t * 0.02));
    float s = 0.5 + 0.5 * sin(q.x * 0.9 + q.y * 0.6 + warp * 5.0 - t * 0.4);
    float crest = s * s * s * s;
    return crest * (0.5 + 0.5 * p.y / size.y) + 0.12 * warp;
  `,
    horizon: `
    float r = max(min(size.x * 0.42, size.y * 0.8), 90.0);
    vec2 d = (p - vec2(0.5 * size.x, -0.15 * r)) / vec2(1.25 * r, r);
    float wobble = fbm(vec2(atan(d.y, d.x) * 1.8, t * 0.04)) - 0.5;
    float rim = length(d) * (1.0 + 0.14 * wobble);
    float sun = exp(-3.4 * max(rim - 0.42, 0.0)) * 0.78;
    float h = p.y / r;
    float drift = (fbm(vec2(p.x / 320.0, t * 0.03)) - 0.5) * 2.4;
    float band = 0.5 + 0.5 * sin(log(1.0 + 7.0 * h) * 8.0 - t * 0.45 + drift);
    float haze = smoothstep(0.25, 0.95, band) * exp(-1.9 * h) * 0.5;
    float ground = exp(-p.y / 22.0) * 0.32;
    float sides = smoothstep(0.0, 0.2, p.x / size.x) * smoothstep(1.0, 0.8, p.x / size.x);
    return (sun * (1.0 + haze) + haze * 0.35 + ground) * sides * (1.0 + 0.04 * sin(t * 0.4));
  `
  };

  var DITHER = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uView;
uniform vec4 uLow;
uniform vec4 uMid;
uniform vec4 uHigh;
uniform float uIntensity;
uniform vec3 uPointer;
uniform float uDot;
out vec4 outColor;

float threshold(vec2 cell) {
  vec2 c = floor(cell);
  float sum = 0.0;
  float weight = 16.0;
  for (int i = 0; i < 3; i++) {
    vec2 b = mod(c, 2.0);
    sum += weight * mod(2.0 * b.x + 3.0 * b.y, 4.0);
    c = floor(c * 0.5);
    weight *= 0.25;
  }
  return (sum + 0.5) / 64.0;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uView;
  float base = texture(uField, uv).r;
  float halo = textureLod(uField, uv, 1.0).r * 0.45
    + textureLod(uField, uv, 2.2).r * 0.35
    + textureLod(uField, uv, 3.4).r * 0.2;
  float v = base + 0.55 * halo;
  float over = max(v - 0.85, 0.0);
  v = min(v, 0.85) + over / (1.0 + 4.0 * over);
  v = clamp(v * uIntensity, 0.0, 1.0);
  vec2 away = gl_FragCoord.xy * uDot - uPointer.xy;
  v = min(v + uPointer.z * exp(-dot(away, away) / 28000.0) * (0.35 + 0.5 * v), 1.0);
  v = max(v - 0.02, 0.0) / 0.98;
  float on = step(threshold(gl_FragCoord.xy), v);
  vec4 c = v < 0.5 ? mix(uLow, uMid, v * 2.0) : mix(uMid, uHigh, v * 2.0 - 1.0);
  outColor = vec4(c.rgb * c.a, c.a) * on;
}`;

  var FIELD_SCALE = 0.6;
  var DOT_SIZE = 2;
  var INTENSITY = 0.34;
  var COLOR = [130 / 255, 170 / 255, 255 / 255]; /* --fn #82AAFF */

  function compile(gl, fragment) {
    var program = gl.createProgram();
    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTEX);
    gl.compileShader(vs);
    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragment);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.warn("DitherField vertex shader:", gl.getShaderInfoLog(vs));
      return null;
    }
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.warn("DitherField fragment shader:", gl.getShaderInfoLog(fs));
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("DitherField link:", gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  function createTexture(gl, mipmaps) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function createRenderer(gl, patternBody) {
    var field = compile(gl, FIELD_HEADER + "float pattern(vec2 p, vec2 size, float t) {" + patternBody + "}" + FIELD_MAIN);
    var dither = compile(gl, DITHER);
    if (!field || !dither) return null;

    var at = function (p, n) { return gl.getUniformLocation(p, n); };
    var fieldTexture = createTexture(gl, true);
    var framebuffer = gl.createFramebuffer();
    var view = [1, 1], fieldView = [1, 1], css = [1, 1];
    var fades = [0.35, 0.75, 1];

    gl.useProgram(dither);
    gl.uniform1i(at(dither, "uField"), 0);
    ["uLow", "uMid", "uHigh"].forEach(function (name, i) {
      gl.uniform4f(at(dither, name), COLOR[0], COLOR[1], COLOR[2], fades[i]);
    });
    gl.uniform1f(at(dither, "uIntensity"), INTENSITY);

    return {
      resize: function (dotsX, dotsY, cssX, cssY) {
        view = [dotsX, dotsY];
        css = [cssX, cssY];
        fieldView = [Math.max(1, Math.round(cssX * FIELD_SCALE)), Math.max(1, Math.round(cssY * FIELD_SCALE))];
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldView[0], fieldView[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      draw: function (time, pointer) {
        gl.useProgram(field);
        gl.uniform2f(at(field, "uSize"), css[0], css[1]);
        gl.uniform2f(at(field, "uView"), fieldView[0], fieldView[1]);
        gl.uniform1f(at(field, "uTime"), time);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, fieldView[0], fieldView[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
        gl.generateMipmap(gl.TEXTURE_2D);

        gl.useProgram(dither);
        gl.uniform2f(at(dither, "uView"), view[0], view[1]);
        gl.uniform1f(at(dither, "uDot"), css[0] / view[0]);
        gl.uniform3f(at(dither, "uPointer"), pointer[0], pointer[1], pointer[2]);
        gl.viewport(0, 0, view[0], view[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };
  }

  function fallback() {
    var el = document.getElementById("dither-fallback");
    if (el) el.style.display = "block";
    var canvas = document.getElementById("dither-bg");
    if (canvas) canvas.style.display = "none";
  }

  function init() {
    var canvas = document.getElementById("dither-bg");
    if (!canvas) return;
    var gl = canvas.getContext("webgl2", {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, powerPreference: "low-power"
    });
    if (!gl) { fallback(); return; }

    var renderer = createRenderer(gl, PATTERNS.waves);
    if (!renderer) { fallback(); return; }

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var pointer = { x: 0, y: 0, targetX: 0, targetY: 0, hover: 0, targetHover: 0 };
    var cssHeight = 0, raf = 0, ready = false;
    var time = 10; /* still frame */

    function resize() {
      var width = window.innerWidth, height = window.innerHeight;
      if (!width || !height) return;
      var dpr = window.devicePixelRatio || 1;
      var devicePerDot = Math.max(1, Math.round(DOT_SIZE * dpr));
      var cssPerDot = devicePerDot / dpr;
      var dotsX = Math.ceil((width * dpr) / devicePerDot);
      var dotsY = Math.ceil((height * dpr) / devicePerDot);
      cssHeight = dotsY * cssPerDot;
      canvas.width = dotsX;
      canvas.height = dotsY;
      canvas.style.width = dotsX * cssPerDot + "px";
      canvas.style.height = cssHeight + "px";
      renderer.resize(dotsX, dotsY, dotsX * cssPerDot, cssHeight);
      ready = true;
      renderer.draw(time, [pointer.x, pointer.y, pointer.hover]);
      /* Opacity and the centre-clearing mask stay in CSS: the canvas must
         never override them inline, or the field competes with the text. */
    }

    function tick() {
      raf = 0;
      if (!ready) return;
      var easing = function (from, to) { return from + (to - from) * 0.18; };
      pointer.x = easing(pointer.x, pointer.targetX);
      pointer.y = easing(pointer.y, pointer.targetY);
      pointer.hover = easing(pointer.hover, pointer.targetHover);
      renderer.draw(time, [pointer.x, pointer.y, pointer.hover]);
      var moving = Math.abs(pointer.hover - pointer.targetHover) > 0.01 ||
        Math.abs(pointer.x - pointer.targetX) > 1 || Math.abs(pointer.y - pointer.targetY) > 1;
      if (moving && !reduced.matches) raf = requestAnimationFrame(tick);
    }
    function schedule() { if (!raf && !reduced.matches) raf = requestAnimationFrame(tick); }

    if (!reduced.matches) {
      window.addEventListener("pointermove", function (event) {
        var dpr = window.devicePixelRatio || 1;
        var devicePerDot = Math.max(1, Math.round(DOT_SIZE * dpr));
        pointer.targetX = (event.clientX * dpr) / devicePerDot;
        pointer.targetY = (window.innerHeight - event.clientY) * dpr / devicePerDot;
        pointer.targetHover = 1;
        schedule();
      }, { passive: true });
      document.documentElement.addEventListener("pointerleave", function () {
        pointer.targetHover = 0;
        schedule();
      });
    }
    window.addEventListener("resize", function () { resize(); }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) renderer.draw(time, [pointer.x, pointer.y, pointer.hover]);
    });
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); fallback(); });

    resize();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
