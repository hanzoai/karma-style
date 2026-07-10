# karma-style — the Karma content engine

karma.style storefront + the agentic content pipeline. A self-contained static
SPA (`ghcr.io/hanzoai/spa`, `Dockerfile` = `COPY site /public`) served on the
`karma-style` operator Service CR (universe `infra/k8s/operator/crs/karma-style.yaml`),
IAM-gated (`SPA_PROTECT=iam`, admins `z@karma.style` / `antje@karma.style`).

## The ONE store
Canonical library: **`s3://hanzo-studio/orgs/karma/output/`** (rclone `hz:` remote,
endpoint `s3.hanzo.ai`). The studio pod mirrors **PVC → S3** every 30s
(`rclone copy`, sidecar `mirror-to-s3`) — the **pod PVC is authoritative**; a
direct S3 push is overwritten on the next pass, so writes go to the PVC.
Spark-local mirror: `/home/z/work/hanzo/studio/output/orgs/karma/output/`.

Layout:
- `designs/<slug>/<kind>_<role>.png` — catalog shots (`ecom|product|lifestyle|hover`).
- `marketing/<channel>/<name>.{png,md}` — queue assets (`blog|social|campaign`);
  `.md` = written copy (blog post / campaign brief / social ad), first-class.
- `library.json` — the ONE index. Never a second index.

Tools (scattered by history; all operate on `library.json`):
- `scripts/karma_manifest.py` — regenerates `library.json` from disk,
  **preserving `status`/`caption`/`tags` by path**. Indexes images **and**
  `marketing/**/*.md`. Run after any file add.
- `~/Desktop/Bikinis/scripts/karma-queue.py` — the `draft → approved/queued →
  published` lifecycle (`approve` = catalog→live, `queue` = marketing, `tag` =
  hashtags, `caption`, `publish`).
- `scripts/sync-library.py` — approved catalog → `site/img/<slug>/<role>.webp`.
- `scripts/sync-journal.py` — queued/published `blog`+`campaign` `.md` →
  `site/journal/*.md` + `site/journal.json` (hero mapped to the catalog webp).
- `/journal` page: `site/journal.js` + `app.js` route + nav.

## Env (secrets from KMS/k8s only — never on disk)
```
AK=$(kubectl --context do-sfo3-hanzo-k8s -n hanzo get secret s3-credentials -o jsonpath='{.data.access-key}' | base64 -d)
SK=$(kubectl --context do-sfo3-hanzo-k8s -n hanzo get secret s3-credentials -o jsonpath='{.data.secret-key}' | base64 -d)
export RCLONE_CONFIG_HZ_TYPE=s3 RCLONE_CONFIG_HZ_PROVIDER=Other RCLONE_CONFIG_HZ_ENDPOINT=https://s3.hanzo.ai \
       RCLONE_CONFIG_HZ_FORCE_PATH_STYLE=true RCLONE_CONFIG_HZ_ACCESS_KEY_ID="$AK" RCLONE_CONFIG_HZ_SECRET_ACCESS_KEY="$SK"
export KARMA_LIBRARY_ROOT=/home/z/work/hanzo/studio/output/orgs/karma/output
```

## The repeatable loop (exact commands)

### 1 — RENDER (studio) → `designs/<slug>/`
Render in studio (ComfyUI `127.0.0.1:8188`, the proven single-CAD-ref
Qwen-Image-Edit-2511 recipe) and save winners to
`$KARMA_LIBRARY_ROOT/designs/<slug>/<kind>_<role>.png`.
`~/Desktop/Bikinis/scripts/seed_library.py` bridges delivered picks into that layout.

### 2 — INDEX + APPROVE (catalog)
```
python3 /home/z/work/hanzo/karma-style/scripts/karma_manifest.py --root $KARMA_LIBRARY_ROOT
cd ~/Desktop/Bikinis/scripts
python3 karma-queue.py approve designs/<slug>/ecom_front.png   # per catalog shot
python3 karma-queue.py list --status approved
```

### 3 — GENERATE CONTENT (marketing) → `marketing/{blog,social,campaign}/`
Author on-brand copy (white high-fashion, monochrome, tight editorial — see the
`marketing/blog/*_journal.md`, `marketing/social/*_ig.md`, `marketing/campaign/*_brief.md`
already in the library for voice). Draft via the AI (api.hanzo.ai zen3 or author
directly). Then index + queue:
```
python3 /home/z/work/hanzo/karma-style/scripts/karma_manifest.py --root $KARMA_LIBRARY_ROOT   # picks up new .md as draft
cd ~/Desktop/Bikinis/scripts
python3 karma-queue.py queue marketing/blog/<slug>_journal.md   -m "<teaser>"
python3 karma-queue.py queue marketing/social/<slug>_ig.md      -m "<caption>"
python3 karma-queue.py tag   marketing/social/<slug>_ig.md "#karmabikinis" "#karmastyle" ...
python3 karma-queue.py queue marketing/campaign/<name>_brief.md -m "<line>"
python3 /home/z/work/hanzo/karma-style/scripts/karma_manifest.py --root $KARMA_LIBRARY_ROOT   # recompute _meta.byStatus
```

### 4 — MIRROR to S3 (via the pod PVC — authoritative)
```
POD=$(kubectl --context do-sfo3-hanzo-k8s -n hanzo get pods -l app.kubernetes.io/name=studio -o jsonpath='{.items[0].metadata.name}')
for f in library.json marketing/blog/*.md marketing/social/*.md marketing/campaign/*.md ; do
  kubectl --context do-sfo3-hanzo-k8s -n hanzo cp "$KARMA_LIBRARY_ROOT/$f" "$POD:/app/orgs/karma/output/$f" -c studio ; done
# mirror-to-s3 sidecar carries PVC → S3 within ~30s. Verify:
rclone cat hz:hanzo-studio/orgs/karma/output/library.json | python3 -c "import json,sys;print(json.load(sys.stdin)['_meta']['byStatus'])"
```

### 5 — SYNC to the site (reads S3)
```
python3 /home/z/work/hanzo/karma-style/scripts/sync-library.py    # approved catalog → site/img/*.webp
python3 /home/z/work/hanzo/karma-style/scripts/sync-journal.py    # queued blog/campaign → site/journal/ + journal.json
```

### 6 — PUBLISH (deploy — the canonical hanzoai/ci path)
```
cd /home/z/work/hanzo/karma-style
# bump the release token so edge caches bust (site/app.js var V + index.html ?v= + KARMA_ASSET_V)
git add -A && git commit -m "content: <what changed>" && git push origin main
gh workflow run cicd.yml --repo hanzoai/karma-style --ref main    # arc build → ghcr.io/hanzoai/karma-style:sha-<sha>-amd64
# CI deploy step skips on workflow_dispatch + the KMS deploy-cred path; bump the CR yourself:
#   universe infra/k8s/operator/crs/karma-style.yaml  tag: "sha-<sha>-amd64"
kubectl --context do-sfo3-hanzo-k8s apply -f /home/z/work/hanzo/universe/infra/k8s/operator/crs/karma-style.yaml
kubectl --context do-sfo3-hanzo-k8s -n hanzo rollout status deploy/karma-style
# commit the CR bump to universe origin/main (else a clean apply reverts it).
```

## Gotchas (learned the hard way)
- **PVC is truth, not S3.** The mirror is `rclone copy PVC→S3`; a direct S3 write
  is reverted in 30s. Edit the library on the pod PVC (or spark-local → `kubectl cp`).
- **Version every fetched asset** (`?v=<V>`). An un-versioned URL (e.g. a bare
  `/journal.json`) can pin a stale Cloudflare 404/gate from before it shipped.
- **operator dup-port bug**: a CR with `servicePort` ≠ `containerPort` renders two
  ports both named `http` → 422 Duplicate → no Service/endpoints. Keep them equal.
- **GHCR push**: a package created outside the repo's Actions is unlinked → the
  workflow `GITHUB_TOKEN` 403s. Delete the package once so the next push recreates
  it repo-linked (safe: pods are `IfNotPresent` + node-cached). karma-style is now
  linked; this is one-time.
- **GB10 studio**: kill leaked `hanzo serve` gguf instances that OOM renders;
  studio `oom_score_adj -700`.

## Live proof (this relaunch)
`library.json`: 10 approved (valentina 8 + redonepiece 2), 8 queued (3 image crops
+ 5 authored `.md`). `/journal` live on karma.style (list + posts render); refreshed
redonepiece catalog webp live. commerce.hanzo.ai 200; karma sandbox checkout →
live Square sandbox link via `POST /v1/checkout/sessions`.

## Still blocked (external)
- **Live Square** (real charges): karma points at the sandbox
  (`commerce-api.testnet.hanzo.ai`, `SQUARE_ENVIRONMENT=sandbox`). Go-live needs
  Karma's LIVE Square credentials (from Antje) in KMS, then flip the karma-style CR
  `SPA_COMMERCE_HOST`/`STORE`/`TOKEN` to the prod commerce (`commerce.hanzo.ai`).
- **Social posting**: content is queued + publish-ready in the library, but there
  is no IG/TikTok publish integration — needs Graph API / TikTok Content Posting
  API tokens to auto-post (today the queue is the hand-off to a human poster).
- **Hosted checkout SPA** (`pay.hanzo.ai/`): the commerce image's pay-build stage
  ships `checkout/ui/dist` empty across all v1.46.3x releases → `/` 503. karma does
  not use it (it redirects to the Square link), but it needs a commerce image
  rebuild with the Pay SPA embedded. Prod commerce is pinned to the money-safe
  `sha-4b17ec0` hotfix until that release exists.
