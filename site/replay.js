// Karma session replay — the recorder mount point.
//
// STATUS: the Hanzo session-replay recorder is being built in parallel on
// hanzoai/rrweb (branch `blue/session-replay` -> insights.hanzo.ai). It is not
// published yet, so this ships as a fully-wired, opt-in mount point that stays
// idle until a recorder URL is configured. The moment the CTO sets
// SPA_REPLAY_SRC on the karma-style CR (the recorder script URL, which exposes
// the rrweb `record` contract as `window.rrweb` or `window.hanzoReplay`), replay
// lights up for the whole flow with ZERO code change here.
//
// Privacy (defense in depth):
//   - Opt-in only: records nothing until consent is granted.
//   - maskAllInputs — every input value is masked in the recording.
//   - Payment data is UNREACHABLE by construction: checkout.js redirects to the
//     cross-origin hosted checkout, so card fields never enter this DOM. Any
//     in-DOM sensitive region can still be hard-blocked via [data-slot="payment"],
//     [data-private], .rr-block; text masked via .rr-mask; nodes ignored via .rr-ignore.
//
// Never throws — replay must never break the store.
(function () {
  "use strict";
  var cfg = {};
  var recorder = null;      // the recorder module (rrweb-compatible: has .record)
  var stopFn = null;        // teardown returned by record()
  var buffer = [];
  var flushTimer = null;
  var CONSENT_KEY = "karma_replay_consent";
  var state = "pending";    // pending | consent-required | recording | unsupported | error

  function log(msg) { try { console.info("[karma.replay] " + msg); } catch (e) {} }

  function hasConsent() {
    if (cfg.replayConsent === "auto") return true;               // demo/opt-in-by-config
    try { return localStorage.getItem(CONSENT_KEY) === "granted"; } catch (e) { return false; }
  }

  function sink() { return cfg.replaySink || "https://insights.hanzo.ai/v1/replay"; }

  function flush() {
    if (!buffer.length) return;
    var batch = buffer.splice(0, buffer.length);
    try {
      fetch(sink(), {
        method: "POST",
        headers: (function () {
          var h = { "Content-Type": "application/json" };
          if (cfg.replayToken || cfg.analyticsToken) h.Authorization = "Bearer " + (cfg.replayToken || cfg.analyticsToken);
          return h;
        })(),
        body: JSON.stringify({ session: KARMA_REPLAY.sessionId, events: batch }),
        keepalive: true,
        credentials: "include"
      })["catch"](function () {});
    } catch (e) {}
  }

  function loadRecorder(src) {
    return new Promise(function (resolve, reject) {
      // Already present (bundled or a prior load)?
      if (window.rrweb && window.rrweb.record) return resolve(window.rrweb);
      if (window.hanzoReplay && window.hanzoReplay.record) return resolve(window.hanzoReplay);
      if (!src) return reject(new Error("no_recorder_src"));
      var s = document.createElement("script");
      s.src = src; s.async = true; s.crossOrigin = "anonymous";
      s.onload = function () { resolve(window.rrweb || window.hanzoReplay); };
      s.onerror = function () { reject(new Error("recorder_load_failed")); };
      document.head.appendChild(s);
    });
  }

  var KARMA_REPLAY = {
    sessionId: null,

    init: function (config) {
      cfg = config || {};
      try { this.sessionId = "karma_" + Math.random().toString(36).slice(2) + Date.now().toString(36); } catch (e) {}
      if (!cfg.replaySrc && !(window.rrweb && window.rrweb.record)) {
        state = "pending";
        log("mount point idle — set SPA_REPLAY_SRC to the recorder URL to enable replay.");
        return this;
      }
      if (!hasConsent()) { state = "consent-required"; log("recorder available; awaiting opt-in consent."); return this; }
      this.start();
      return this;
    },

    grantConsent: function () {
      try { localStorage.setItem(CONSENT_KEY, "granted"); } catch (e) {}
      if (state === "consent-required") this.start();
    },
    revokeConsent: function () {
      try { localStorage.setItem(CONSENT_KEY, "revoked"); } catch (e) {}
      this.stop();
    },

    start: function () {
      if (stopFn) return;                     // already recording
      if (!hasConsent()) { state = "consent-required"; return; }
      var self = this;
      loadRecorder(cfg.replaySrc).then(function (rec) {
        if (!rec || !rec.record) { state = "unsupported"; log("recorder has no rrweb record() contract."); return; }
        recorder = rec;
        stopFn = rec.record({
          emit: function (event) {
            buffer.push(event);
            if (buffer.length >= 50) flush();
          },
          // ---- privacy config ----
          maskAllInputs: true,
          maskInputOptions: { password: true, email: true, tel: true, text: false },
          maskTextClass: "rr-mask",
          blockClass: "rr-block",
          ignoreClass: "rr-ignore",
          blockSelector: '[data-slot="payment"],[data-private],.karma-pay',
          recordCanvas: false,
          collectFonts: false,
          sampling: cfg.replaySampling || undefined
        });
        state = "recording";
        flushTimer = setInterval(flush, 5000);
        try { window.addEventListener("pagehide", flush); window.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); }); } catch (e) {}
        log("recording (masked) -> " + sink());
      })["catch"](function (e) { state = "error"; log("recorder load failed: " + (e && e.message)); });
    },

    stop: function () {
      try { if (stopFn) stopFn(); } catch (e) {}
      stopFn = null;
      if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
      flush();
      state = "consent-required";
    },

    status: function () { return state; }
  };
  window.KARMA_REPLAY = KARMA_REPLAY;
})();
