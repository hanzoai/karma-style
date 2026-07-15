// Karma Bikinis — the Journal. PRIMARY source is the public Hanzo CMS
// (cms.hanzo.ai, karma tenant), reached SAME-ORIGIN via the hanzoai/spa
// PROXY_API mount (/api/* -> in-cluster `cms` Service on the karma-style CR) so
// there is no CORS and reads sit behind the same gate/edge as the site. Each
// published CMS page is a Lexical richText doc; mapCMS() renders it
// (headings / paragraphs / lists / bold / italic / code / links + an upload
// hero) into the SAME post shape the list & detail views already consume.
//
// FAIL-SOFT: if no tenant is configured, or the CMS is unreachable / returns
// nothing, we fall back to the versioned /journal.json that sync-journal.py
// materializes from the approved asset library — the Journal is never empty.
//
// app.js routes /journal and /journal/<slug> into #pageBody and calls
// KARMA_JOURNAL.render(el, slug).
window.KARMA_JOURNAL = (function () {
  var V = (window.KARMA_ASSET_V || "1");
  // Same-origin CMS base: hanzoai/spa reverse-proxies /api/* to the cms Service
  // when PROXY_API is set on the karma-style CR. The tenant comes from the CR
  // too (SPA_CMS_TENANT_ID -> /config.json cmsTenantId, read via KARMA_CONFIG).
  var CMS_BASE = "/api";
  var cache = null;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ---- journal.json fallback: minimal Markdown (headings/bold/italics/links) ----
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  }
  function stripFrontMatter(md) {
    if (md.indexOf("---") === 0) { var i = md.indexOf("---", 3); if (i >= 0) return md.slice(i + 3); }
    return md;
  }
  function md2html(md) {
    var out = [], para = [];
    function flush() { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } }
    stripFrontMatter(md).split("\n").forEach(function (line) {
      var t = line.trim();
      var h = t.match(/^(#{1,3})\s+(.*)$/);
      if (h) { flush(); out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); }
      else if (!t) flush();
      else para.push(t);
    });
    flush();
    return out.join("\n");
  }

  // ---- Lexical (CMS richText) -> HTML ----
  // text.format is a bitmask: 1 bold, 2 italic, 16 code (others ignored, safe).
  function fmt(t, f) {
    if (f & 16) t = "<code>" + t + "</code>";
    if (f & 2) t = "<em>" + t + "</em>";
    if (f & 1) t = "<strong>" + t + "</strong>";
    return t;
  }
  function mediaURL(v) {
    if (!v || typeof v !== "object") return "";
    // value.url is already the same-origin CMS path (/api/media/file/..?prefix=hanzo).
    return v.url || (v.filename ? CMS_BASE + "/media/file/" + encodeURIComponent(v.filename) + "?prefix=hanzo" : "");
  }
  function kids(n) { return (n.children || []).map(lx).join(""); }
  function lx(n) {
    switch (n.type) {
      case "text": return fmt(esc(n.text || ""), n.format || 0);
      case "linebreak": return "<br>";
      case "link": var f = n.fields || {}, nt = f.newTab ? ' target="_blank" rel="noopener"' : ""; return '<a href="' + esc(f.url || "#") + '"' + nt + ">" + kids(n) + "</a>";
      case "heading": var tg = /^h[1-6]$/.test(n.tag || "") ? n.tag : "h3"; return "<" + tg + ">" + kids(n) + "</" + tg + ">";
      case "paragraph": var p = kids(n); return p.trim() ? "<p>" + p + "</p>" : "";
      case "list": var lt = (n.tag === "ol" || n.listType === "number") ? "ol" : "ul"; return "<" + lt + ">" + kids(n) + "</" + lt + ">";
      case "listitem": return "<li>" + kids(n) + "</li>";
      case "quote": return "<blockquote>" + kids(n) + "</blockquote>";
      case "upload": var s = mediaURL(n.value); return s ? '<img src="' + esc(s) + '" alt="' + esc((n.value && n.value.alt) || "") + '" loading="lazy">' : "";
      default: return kids(n);
    }
  }
  function plain(n) { return n.type === "text" ? (n.text || "") : (n.children || []).map(plain).join(""); }
  function teaserOf(children) {
    for (var i = 0; i < children.length; i++) {
      if (children[i].type === "paragraph") {
        var t = plain(children[i]).trim();
        if (t) return t.length > 170 ? t.slice(0, 167).replace(/\s+\S*$/, "") + "…" : t;
      }
    }
    return "";
  }
  function mapCMS(doc) {
    var root = (doc.content && doc.content.root) || { children: [] };
    var children = root.children || [];
    var hero = null, body = [];
    children.forEach(function (c) {
      if (!hero && c.type === "upload") { hero = mediaURL(c.value); return; } // first upload = hero (shown separately)
      body.push(c);
    });
    return { slug: doc.slug, title: doc.title, teaser: teaserOf(children), hero: hero, channel: "journal", html: body.map(lx).join("\n") };
  }

  // ---- load: CMS primary, journal.json fallback ----
  function loadJson(cb) {
    fetch("/journal.json?v=" + V).then(function (r) { return r.ok ? r.json() : { posts: [] }; })
      .catch(function () { return { posts: [] }; })
      .then(function (d) { cache = (d.posts || []); cb(cache); });
  }
  function load(cb) {
    if (cache) return cb(cache);
    var tenant = (window.KARMA_CONFIG || {}).cmsTenantId;
    if (!tenant) return loadJson(cb); // CMS not configured -> approved library
    var url = CMS_BASE + "/pages?where%5B_status%5D%5Bequals%5D=published&where%5Btenant%5D%5Bequals%5D=" +
      encodeURIComponent(tenant) + "&depth=1&limit=50&sort=-createdAt";
    fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var posts = (d.docs || []).map(mapCMS);
        if (!posts.length) return loadJson(cb); // published-but-empty -> fallback
        cache = posts; cb(cache);
      })
      .catch(function () { loadJson(cb); }); // CMS down / blocked -> fallback
  }

  function heroImg(p) {
    if (!p.hero) return "";
    // Local /img assets take the release cache-bust; CMS /api (already carries
    // ?prefix=hanzo) and absolute URLs are used verbatim.
    var src = (/^(https?:)?\/\//.test(p.hero) || p.hero.indexOf("/api/") === 0) ? p.hero : (p.hero + "?v=" + V);
    return '<img src="' + src + '" alt="" loading="lazy">';
  }

  function renderList(el, posts) {
    document.title = "Journal — Karma Bikinis";
    var cards = posts.map(function (p) {
      return '<a class="jcard" href="/journal/' + p.slug + '" data-link>' +
        '<div class="jhero">' + heroImg(p) + "</div>" +
        '<div class="jmeta"><span class="eyebrow">' + (p.channel === "campaign" ? "Campaign" : "Journal") + "</span>" +
        "<h2>" + p.title + "</h2><p>" + (p.teaser || "") + "</p></div></a>";
    }).join("");
    el.innerHTML = '<div class="eyebrow">The House</div><h1>Journal</h1>' +
      '<div class="jgrid">' + (cards || "<p>New writing soon.</p>") + "</div>";
  }

  function renderPost(el, p) {
    document.title = p.title + " — Karma Bikinis";
    // CMS posts carry pre-rendered `html` (Lexical -> HTML); journal.json posts
    // reference a Markdown `file` fetched below.
    el.innerHTML = '<article class="jpost"><a class="jback" href="/journal" data-link>← Journal</a>' +
      (p.hero ? '<div class="jposthero">' + heroImg(p) + "</div>" : "") +
      '<div class="jbody">' + (p.html != null ? p.html : "Loading…") + "</div></article>";
    if (p.html == null && p.file) {
      fetch("/" + p.file + "?v=" + V).then(function (r) { return r.text(); })
        .then(function (md) { el.querySelector(".jbody").innerHTML = md2html(md); })
        .catch(function () { el.querySelector(".jbody").innerHTML = "<p>Post unavailable.</p>"; });
    }
  }

  function render(el, slug) {
    load(function (posts) {
      if (slug) {
        var p = posts.filter(function (x) { return x.slug === slug; })[0];
        if (p) return renderPost(el, p);
      }
      renderList(el, posts);
    });
  }

  return { render: render };
})();
