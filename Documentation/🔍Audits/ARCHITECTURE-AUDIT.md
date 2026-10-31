# 🔍 Architecture audit — EDITORS.Acoustic.Like.audio (2026-10-30)

Audited against the APK.audio multi-repo architecture standard: coupling, boundaries, duplication, contracts.
← [Audits](INDEX.md) · Improvements: [🛣Roadmap/IMPROVEMENTS.md](../%F0%9F%9B%A3Roadmap/IMPROVEMENTS.md)

## Bounded context
Room-acoustics modelling (modes, image sources, RT, ISO 3382, advisor, racks, wall builds) drawn as an overlay on the CAD. Plain ES-module browser softapp, no build step; ~29.6 k lines of JS in `js/`, 50 `node:test` files (275 tests, all passing on 2026-10-30). Sampled: `index.html`, `js/main.js`, `js/cad/cadLink.js`, `js/model/session.js`, `js/ui/rackPanel.js`, `js/acoustx/markdown.js`, `package.json`, the deploy workflow, the test list.

**Remediated 2026-10-30:** every improvement delivered — see [🌍Publishing/DELIVERY.md](../%F0%9F%8C%8DPublishing/DELIVERY.md#delivered-from-the-2026-10-30-audit).

## Context map
| Talks to | How (topic / endpoint / file / import) | Relationship |
|---|---|---|
| EDITORS.CAD.Like.audio | iframe at `js/site.js` `cad` + `#/drawing?host=acoustic`, same-origin `postMessage` protocol `cad.like.audio/host@1`; schema + samples vendored from the CAD's `contract/host@1/` | Customer–Supplier (CAD publishes the language, this side tests against it) |
| OS (bench, `OS/BIM/parts.json`) | `fetch` of `js/site.js` `catalogue`, relative to the page; published site carries a copy | Conformist, by one config point |
| Softapp launcher (WEB.Frontend-Assets / OsApi) | `display.json` (`group: "Design"`, `app: APK:Softapps/...`) | Published Language (manifest) |
| User files | `.acoustic-session.json` — `acoustic.like.audio/session@2`, reads `@1` | Published Language, versioned |
| GitHub Pages / FTPS (acoustics.like.audio) | `.github/workflows/deploy.yml` checks out the CAD (`dist/` → `cad/`, `contract/` for the drift test) and the catalogue | Build-time coupling |

No MQTT use — correct for an offline design tool.

## Scorecard
| Category | Score (0–3) | Finding |
|---|---|---|
| Coupling & Cohesion | 3 | The CAD and the catalogue are named once, in `js/site.js`, relative to the page; no module climbs the tree and the deploy rewrites nothing by pattern. |
| Boundary Integrity | 3 | All CAD traffic sits behind one adapter (`js/cad/cadLink.js`); session file has its own translation (`session.js`) and never stores the CAD's drawing. No third-party libraries at all. |
| Duplication Control | 3 | The protocol's shape is the CAD's published schema, vendored unchanged with a drift test; only the protocol string is restated, and a test holds it to the schema. |
| Testing & Contracts | 3 | 281 node:test cases, including a contract test of `cadLink.js` against the CAD's samples; CI runs it with the CAD checked out, then a frame smoke on the laid-out site. |
| Change management | 3 | Session format versioned `@2` with an `@1` migration path; protocol versioned `@1` with the CAD's written `@1` → `@2` rule; nightly CI rebuild picks up CAD changes. |
Score key: 3 meets the standard · 2 minor gaps · 1 significant gaps · 0 absent / violated.

## Findings
1. **Good — single adapter for the CAD.** `js/cad/cadLink.js` declares `HOST_PROTOCOL`, every send/receive goes through `connectCad()`, messages are origin-checked and protocol-checked. The heartbeat for a popped-out CAD (`PING_MS`/`DEAD_MS`) follows the house "unreachable is dead" rule.
2. **Good — tests gate delivery.** `package.json` runs `node --test tests/*.test.mjs`; the workflow's build job runs it before both the Pages and FTPS deploy.
3. **Good — versioned user file.** `js/model/session.js` `SESSION_FORMAT = 'acoustic.like.audio/session@2'`, with `session@1` drawings handed to the CAD once.
4. **Good — the CAD contract is tested from this side.** `tests/cadContract.test.mjs` against `vendor/cad.like.audio/contract/host@1/`.
