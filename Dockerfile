# karma.style — the Karma Bikinis storefront. A self-contained static SPA
# (no build step, no CDNs) served by the canonical Hanzo SPA server,
# ghcr.io/hanzoai/spa — SPA-mode always on (index.html for every client route,
# NO /index.html redirect: karma.style renders clean at the root), hashed-asset
# immutable caching, pre-compressed .br/.gz, security headers, GET /health, and
# a runtime /config.json templated from SPA_* env (iamHost/apiHost/…) so the one
# bundle takes its IAM login + API hosts from the operator Service CR. Listens
# on :3000; the karma-style Service maps servicePort 80 -> 3000.
#
# Built on Hanzo's own hardware (in-cluster BuildKit), never on GitHub builders:
#   buildctl build --frontend=dockerfile.v0 \
#     --opt=context=https://github.com/hanzoai/karma-style.git#<sha> \
#     --opt=filename=Dockerfile --opt=platform=linux/amd64 \
#     --output=type=image,name=ghcr.io/hanzoai/karma-style:<tag>,push=true
FROM ghcr.io/hanzoai/spa:1.4.8
COPY site /public
