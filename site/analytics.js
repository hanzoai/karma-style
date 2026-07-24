// Karma analytics — the standard-ecommerce-events layer.
//
// Wires the published `track.js` (Hanzo Analytics) native integration so every
// event lands at https://api.hanzo.ai/v1/analytics, and runs `Annotate` so the
// schema.org microdata on the storefront auto-emits content signals. On top it
// exposes `window.karmaEcom` — GA4-standard ecommerce emitters whose event names
// and params map 1:1 to the GA4 recommended-events schema (and, via the top-level
// content_ids/content_type + value/currency, to Meta CAPI). The server-side WS-A
// adapters fan these out to Umami / PostHog / GA4 / Meta.
//
// Nothing here throws: analytics must never break the store. Secrets are never
// hardcoded — the write token arrives at runtime from /config.json (SPA_ANALYTICS_TOKEN
// on the karma-style CR) and is a Published, org-scoped (karma) WRITE-ONLY key.
(function () {
  "use strict";
  var CURRENCY = "USD";
  var BRAND = "Karma Bikinis";
  var analytics = null;      // the track.js Analytics instance (once initialized)
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

  // Emit one standard event: to /v1/analytics (native) AND mirror a flat summary
  // to Umami (analytics.hanzo.ai) so the existing page-analytics keeps working.
  function emit(name, params) {
    pushLog(name, params);
    try { if (analytics) analytics.track(name, params); } catch (e) {}
    try {
      if (window.umami && window.umami.track) {
        window.umami.track(name, {
          value: params.value, currency: params.currency,
          items: (params.content_ids || []).join(","),
          count: (params.items || []).reduce(function (s, i) { return s + (i.quantity || 1); }, 0),
          slot: params.slot
        });
      }
    } catch (e) {}
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
        if (window.HanzoTrack && token) {
          var a = new window.HanzoTrack.Analytics();
          a.initialize({ integrations: [{
            type: "native",
            token: token,
            host: cfg.analyticsHost || "https://api.hanzo.ai",
            product: cfg.analyticsProduct || "karma"
          }] });
          analytics = a;
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
