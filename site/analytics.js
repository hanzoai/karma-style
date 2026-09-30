// Karma analytics — the standard-ecommerce-events layer.
//
// Loads Hanzo's hosted tag (https://api.hanzo.ai/v1/event/tag.js), so every event
// lands at the one ingest, https://api.hanzo.ai/v1/event, and runs `Annotate` so the
// schema.org microdata on the storefront auto-emits content signals. On top it
// exposes `window.karmaEcom` — GA4-standard ecommerce emitters whose event names
// and params map 1:1 to the GA4 recommended-events schema (and, via the top-level
// content_ids/content_type + value/currency, to Meta CAPI). The server-side WS-A
// adapters fan these out to GA4 / Meta and the rest.
//
// Nothing here throws: analytics must never break the store. Secrets are never
// hardcoded — the write token arrives at runtime from /config.json (SPA_ANALYTICS_TOKEN
// on the karma-style CR) and is a Published, org-scoped (karma) WRITE-ONLY key.
(function () {
  "use strict";
  var CURRENCY = "USD";
  var BRAND = "Karma Bikinis";
  var analytics = null;      // { track } over the hosted tag (once initialized)
  var pending = [];          // events emitted before the tag has loaded
  var annotated = false;     // Annotate() is idempotent — run its global hooks once
  var LOG = [];              // last-50 emitted events (verify page + E2E read this)

  function pushLog(name, params) {
    LOG.push({ t: Date.now(), event: name, params: params });
    if (LOG.length > 50) LOG.shift();
    try { window.dispatchEvent(new CustomEvent("karma:ecom", { detail: { event: name, params: params } })); } catch (e) {}
  }

  // One line item in GA4 shape. price is in major units (dollars) — GA4 uses major.
  function itemOf(p, opts) {
    opts = opts || {};
    var it = {
      item_id: p.slug,
      item_name: p.name,
      item_brand: BRAND,
      item_category: p.collection || p.tag || "Swim",
      price: Number(p.price) || 0,
      quantity: opts.qty || 1
    };
    if (opts.size) it.item_variant = opts.size;
    return it;
  }

  function valueOf(items) {
    return items.reduce(function (s, i) { return s + (Number(i.price) || 0) * (i.quantity || 1); }, 0);
  }

  // Build the GA4 recommended-event payload. `content_ids`/`content_type` are the
  // Meta CAPI bridge; `value`/`currency` are shared by GA4 and Meta.
  function ecomParams(items, extra) {
    var p = {
      currency: CURRENCY,
      value: Math.round(valueOf(items) * 100) / 100,
      items: items,
      content_type: "product",
      content_ids: items.map(function (i) { return i.item_id; })
    };
    if (extra) for (var k in extra) if (extra[k] !== undefined) p[k] = extra[k];
    return p;
  }

  // slot: make the shadcn-style data-slot annotation load-bearing in the payload.
  function withSlot(params, opts) {
    var slot = opts && (opts.slot || (opts.el && opts.el.getAttribute && opts.el.getAttribute("data-slot")));
    if (slot) params.slot = slot;
    return params;
  }

  // Emit one standard event to the one ingest, through the hosted tag. Events
  // emitted before the tag has loaded wait for it.
  function emit(name, params) {
    pushLog(name, params);
    try { if (analytics) analytics.track(name, params); } catch (e) {}
  }

  var karmaEcom = {
    // GA4 `view_item` — one product viewed (product page).
    viewItem: function (product, opts) {
      if (!product) return;
      var items = [itemOf(product, opts)];
      emit("view_item", withSlot(ecomParams(items), opts));
    },
    // GA4 `add_to_cart` — product added to bag.
    addToCart: function (product, opts) {
      if (!product) return;
      var items = [itemOf(product, opts)];
      emit("add_to_cart", withSlot(ecomParams(items), opts));
    },
    // GA4 `begin_checkout` — checkout started from the bag.
    beginCheckout: function (cartItems, opts) {
      var items = (cartItems || []).map(function (c) {
        return { item_id: c.slug, item_name: c.name, item_brand: BRAND,
                 item_category: c.collection || "Swim", item_variant: c.size,
                 price: Number(c.price) || 0, quantity: c.qty || 1 };
      });
      emit("begin_checkout", withSlot(ecomParams(items), opts));
    },
    // GA4 `purchase` — order confirmed. `order` = { items:[GA4 items], value, transaction_id }.
    purchase: function (order) {
      if (!order || !order.items || !order.items.length) return;
      var extra = { transaction_id: order.transaction_id || ("karma_" + Date.now()) };
      if (order.tax != null) extra.tax = order.tax;
      if (order.shipping != null) extra.shipping = order.shipping;
      var params = ecomParams(order.items, extra);
      if (order.value != null) params.value = order.value; // trust the checkout total
      emit("purchase", params);
    },
    // Generic passthrough for non-ecommerce events (keeps one emit path).
    track: function (name, params) { emit(name, params || {}); },
    log: function () { return LOG.slice(); },
    get analytics() { return analytics; }
  };
  window.karmaEcom = karmaEcom;

  var KARMA_ANALYTICS = {
    // Called by app.js boot() with the runtime /config.json (single config source).
    init: function (cfg) {
      cfg = cfg || {};
      try {
        var token = cfg.analyticsToken;
        if (token && !analytics) {
          // The hosted tag sends the page view, SPA navigations and errors, loads the
          // site's pixels only when the visitor's choice or region allows, and answers
          // window.hanzo.track. `analytics` hands Annotate and the emitters the same call.
          var host = (cfg.analyticsHost || "https://api.hanzo.ai").replace(/\/$/, "");
          analytics = { track: function (n, p) {
            if (window.hanzo && window.hanzo.track) window.hanzo.track(n, p);
            else pending.push([n, p]);
          } };
          var s = document.createElement("script");
          s.defer = true;
          s.src = host + "/v1/event/tag.js";
          s.setAttribute("data-key", token);
          s.setAttribute("data-product", cfg.analyticsProduct || "karma");
          s.onload = function () {
            while (pending.length) { var e = pending.shift(); try { window.hanzo.track(e[0], e[1]); } catch (x) {} }
          };
          document.head.appendChild(s);
        }
      } catch (e) { analytics = null; }
      return this;
    },
    // Idempotent: run the published Annotate() once so its global click/schema
    // hooks + IntersectionObserver attach against the rendered [itemscope] cards.
    // Safe to call after the grid renders; the global click listener is delegated
    // so it also covers cards/products rendered later.
    annotate: function (root) {
      if (annotated || !analytics || !window.HanzoTrack || !window.HanzoTrack.Annotate) return;
      try { window.HanzoTrack.Annotate(analytics, root ? { root: root } : {}); annotated = true; } catch (e) {}
    },
    ready: function () { return !!analytics; }
  };
  window.KARMA_ANALYTICS = KARMA_ANALYTICS;
})();
