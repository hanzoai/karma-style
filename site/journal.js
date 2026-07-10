// Karma Bikinis — the Journal. Renders the queued editorial (blog + campaign)
// from /journal.json, which sync-journal.py materializes from the ONE canonical
// asset library (s3://hanzo-studio/orgs/karma/output/library.json). No second
// source of copy: approve/queue a post with karma-queue.py, run sync-journal.py,
// and it appears here. app.js routes /journal and /journal/<slug> into #pageBody
// and calls KARMA_JOURNAL.render(el, slug).
window.KARMA_JOURNAL = (function () {
  var V = (window.KARMA_ASSET_V || "1");
  var cache = null;

  // Minimal, safe-enough Markdown: headings, bold, italics, links, paragraphs.
  // Input is our own trusted library copy (not user content).
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
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

  function load(cb) {
    if (cache) return cb(cache);
    // Versioned so a release busts Cloudflare's edge cache (an un-versioned
    // /journal.json can pin a stale 404 from before the journal shipped).
    fetch("/journal.json?v=" + V).then(function (r) { return r.ok ? r.json() : { posts: [] }; })
      .catch(function () { return { posts: [] }; })
      .then(function (d) { cache = (d.posts || []); cb(cache); });
  }

  function heroImg(p) { return p.hero ? '<img src="' + p.hero + "?v=" + V + '" alt="" loading="lazy">' : ""; }

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
    el.innerHTML = '<article class="jpost"><a class="jback" href="/journal" data-link>← Journal</a>' +
      (p.hero ? '<div class="jposthero">' + heroImg(p) + "</div>" : "") +
      '<div class="jbody">Loading…</div></article>';
    fetch("/" + p.file + "?v=" + V).then(function (r) { return r.text(); })
      .then(function (md) { el.querySelector(".jbody").innerHTML = md2html(md); })
      .catch(function () { el.querySelector(".jbody").innerHTML = "<p>Post unavailable.</p>"; });
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
