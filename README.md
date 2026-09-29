# QR Studio

Free QR code tools that run in the browser: nothing is uploaded. Static site, no backend.

## Edit, build, deploy

- App code: `assets/` (app.js, parse.js, insights.js, labeler.js, style.css). Page shells: `src/`.
- Tool pages, their copy and FAQs: `TOOLS` in `build.py`. Per-tool app behaviour: `TOOLS` in `assets/app.js`.
- After changing `src/` or `build.py`, regenerate the HTML (commit the output):

      python3 build.py --site https://your-domain.com

  `--site` adds canonical links, `sitemap.xml` and `robots.txt`; leave it out for local work.
- Run locally: `python3 -m http.server 8791`, then open http://localhost:8791
- Deploy: push the folder to GitHub and enable Pages (or Cloudflare Pages). Largest file is 21.6 MB (under Cloudflare's 25 MB limit).

## Checks

- `node test_parse.js`: parser round-trips and safety-check cases.
- `/eval.html`: AI field-naming accuracy (tuning set A, held-out set B).
