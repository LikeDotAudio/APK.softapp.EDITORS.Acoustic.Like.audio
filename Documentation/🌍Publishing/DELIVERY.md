# Delivery — EDITORS.Acoustic.Like.audio

← [Wiki home](../README.md)

**No build step.** Plain ES modules, published as they are.

| Where it lands | How |
|---|---|
| **https://likedotaudio.github.io/APK.softapp.EDITORS.Acoustic.Like.audio/** (live, 200 on 2026-10-30) | `.github/workflows/deploy.yml`, on every push to `main`, nightly at 06:17 UTC and on dispatch: runs `npm test` first (a failure stops both deploys), then lays out `_site/` from `index.html`, `css/`, `js/`, `LICENSE` and `Documentation/`, copies the CAD repo's tracked `dist/` in as `cad/`, re-points the iframe there (`sed`, then `grep -q` to prove it), and deploys to GitHub Pages |
| **https://acoustics.like.audio/** (live, 200) | the same workflow's `ftps` job syncs `_site/` to the Varial account (secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`; variable `FTP_SERVER_DIR`) |
| **https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.Acoustic.Like.audio/index.html** (live, 200) | the APK.audio monorepo's FTPS job (`.github/workflows/ci.yml`) uploads the checkout when this submodule's pointer is bumped (`.apk.scripts/deploy_all.py`) |
| the rig, `/APK:Softapps/EDITORS/EDITORS.Acoustic.Like.audio/` | baked into the **WEB.Frontend-Assets** image with the rest of `PODS/POD.THIN/Softapps`; rebuild that stack after an edit |

The nightly run is how a CAD change reaches the github.io and acoustics.like.audio copies: the CAD is pulled fresh each time. The custom domain `acoustics.cad.like.audio` is switched off until its DNS exists (steps in the repo README, *Hosting*). The 1997 Acoustic-X manual (`Documentation/acoustic-x/manual-1997/`) is git-ignored and never published.

**Tested:** `npm test` in the deploy workflow's build job, ahead of both publishes, and by hand (269 passed, 2026-10-30). `.apk.scripts/smoke.py` checks that HEAD is pushed and the apk.audio page answers 200 ([SMOKE](../%F0%9F%A7%A9Manual%20and%20Artifacts/SMOKE.md)).

**Not automated:** the deploy workflow runs no tests — a push that breaks them still publishes; nothing checks the published page in a browser; the WEB.Frontend-Assets rebuild is by hand.
