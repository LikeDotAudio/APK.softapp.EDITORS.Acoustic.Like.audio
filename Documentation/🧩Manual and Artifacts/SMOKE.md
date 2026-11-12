# Smoke test — EDITORS.Acoustic.Like.audio

Is `EDITORS.Acoustic.Like.audio` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**❌ FAIL** — 3/4 checks, since 2026-11-12 00:16 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.Acoustic.Like.audio](https://github.com/LikeDotAudio/APK.softapp.EDITORS.Acoustic.Like.audio.git) | ❌ | 1 commit(s) not pushed |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.Acoustic.Like.audio/index.html) | ✅ | HTTP 200 |
| frame | `npm run smoke:frame` [https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.Acoustic.Like.audio/] | ✅ | smoke-frame: ✅ https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.CAD.Like.audio/dist/index.html is there and speaks cad.l |
| app | `OS/Acoustics` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.Acoustic.Like.audio/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.Acoustic.Like.audio`

<!-- smoke:sig a90752186b24 since 2026-11-12 00:16 EST -->
