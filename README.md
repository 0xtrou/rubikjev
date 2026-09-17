<div align="center">

# 🧊 JEV SOLVES THE CUBE 🗿

**You scramble like a menace. Jev — the in-house AI solver — judges the chaos, roasts you, and cooks the solve live.**

[![Live Site](https://img.shields.io/badge/→_rubikjev.solo.engineer-live-8b5cf6?style=for-the-badge)](https://rubikjev.solo.engineer)
[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Three.js](https://img.shields.io/badge/Three.js-r3f-white?style=for-the-badge&logo=three.js)](https://threejs.org)
[![Tailwind](https://img.shields.io/badge/Tailwind_v4-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com)

[![TypeSafe Jev](https://img.shields.io/badge/judged_by-Jev_System_One-34d399?style=flat-square)](https://www.typesafe.ai)
[![shadcn/ui](https://img.shields.io/badge/ui-shadcn%2Fui-000?style=flat-square)](https://ui.shadcn.com)
[![Vercel](https://img.shields.io/badge/deployed_on-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com)
[![Compliance](https://img.shields.io/badge/MCA-compliance_mapped-emerald?style=flat-square)](./COMPLIANCE.md)

[![GitHub](https://img.shields.io/badge/GitHub-0xtrou-181717?style=for-the-badge&logo=github)](https://github.com/0xtrou)
[![X](https://img.shields.io/badge/@__trou3-follow-black?style=for-the-badge&logo=x)](https://x.com/_trou3)
[![GitHub Followers](https://img.shields.io/github/followers/0xtrou?style=flat-square&label=followers)](https://github.com/0xtrou)
[![Stars](https://img.shields.io/github/stars/0xtrou/rubikjev?style=flat-square&label=stars)](https://github.com/0xtrou/rubikjev/stargazers)

*An AI-gamified twisty puzzle — scramble it, gamble it, watch Jev cook.* 🎰

<img src="https://rubikjev.solo.engineer/opengraph-image" alt="Jev Solves The Cube" width="820"/>

</div>

---

## ✨ What is this?

A one-page, no-scroll Rubik's cube playground with an AI attitude:

1. 🌪️ **You scramble** — pick a preset (*Chill → Spicy → GIGACHAD → 🤯 UNHINGED*), mash the manual turn buttons, or unleash a **custom number of turns** (up to 4900).
2. 🧠 **Jev judges** — a System One judgment model rates your chaos: one of **five meme tiers**, a **1–5 star difficulty rating**, and exactly one roast.
3. 🤖 **Jev solves** — the exact solution streams move-by-move over SSE while the 3D cube executes it at adaptive speed.
4. 🎰 **You gamble** — bank the XP, or feed it to **Jev's Gambit**: a double-or-nothing slot machine (×2, ×3, ×5, ×10… or 💀 bust).

Plus: XP, ranks (*NPC → Mid Scrambler → Certified Cook → GIGACHAD → Sigma Orchestrator*), badges, run stats, confetti, victory spins, and a live feed that never stops talking.

## 🕹️ How to play

| Step | Action |
|---|---|
| 1 | Choose a preset or hand-scramble / unleash custom turns |
| 2 | Hit **SCRAMBLE** — the cube shakes while chaos is applied |
| 3 | Hit **SOLVE WITH JEV** — verdict streams in, cube animates the solve |
| 4 | Watch the ✅ SOLVED banner with your run stats |
| 5 | **🏦 Bank** the XP… or **🎲 double or nothing** it on the slot |
| 6 | Climb the ranks: NPC → Mid Scrambler → Certified Cook → GIGACHAD → Sigma Orchestrator |

## 🏗️ Architecture

```text
┌────────────────────────── browser ──────────────────────────┐
│  Next.js App Router · React Three Fiber · Tailwind v4       │
│  shadcn/ui · zustand (localStorage) · canvas-confetti       │
│  receives ONLY curated game events (SSE)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │  POST /api/solve
                               │  { history: ["R","U'",…] }
┌──────────────────────────────▼──────────────────────────────┐
│  /api/solve  (server-only route)                            │
│  • validates + simplifies the scramble                      │
│  • exact solution = simplified inverse (deterministic)      │
│  • judgment pass via engine adapter  ──►  JEV (AI verdict)  │
│  • projects raw inference → gameplay values (never leaked)  │
│  • streams curated events: meta ▸ move ▸ done               │
└─────────────────────────────────────────────────────────────┘
```

**The cube engine** (adapted from [buuing/Rubiks-Cube](https://github.com/buuing/Rubiks-Cube), the most-starred Three.js cube, rebuilt for React Three Fiber) solves by exact inverse-of-history with move simplification — verified in CI-style harnesses: `scripts/cube-math-check.mjs` (200 randomized trials) and `scripts/cube-stress-large.mjs` (500-turn scrambles). Every cubie returns home, always.

## 🔐 Security & compliance

The AI provider is a deliberate implementation detail:

| Secret | Where it lives |
|---|---|
| `JEV_ENGINE_API_KEY` | Server env only (Vercel Secret / `.env.local`) — **never** `NEXT_PUBLIC_*` |
| `JEV_ENGINE_BASE_URL` | Server env only — the engine endpoint is **not hardcoded anywhere** |
| Raw inference (questions, criteria, probabilities, model ids, latency) | Stays inside the API route — never logged, never streamed |
| Client bundle | Zero provider strings (verified by bundle grep — see `COMPLIANCE.md §5`) |

The client receives exactly four curated event types — `meta`, `move`, `done`, `error` — signed `engine: "jev-stream/1"`, plus a generic token count.

📄 **[COMPLIANCE.md](./COMPLIANCE.md)** maps every obligation of the engine's Master Customer Agreement (license scope §2.1–2.3, credentials §2.4, input/output handling §4, end-user disclosures §5, publicity §15.4) to the exact files and mechanisms that satisfy it — including the deliberate no-benchmarks rule (§2.3f) and the provider-anonymized public copy.

## 🚀 Getting started

```bash
# 1. install
pnpm install

# 2. configure the engine (server-only secrets)
echo 'JEV_ENGINE_API_KEY=<your-key>'  >> .env.local
echo 'JEV_ENGINE_BASE_URL=<endpoint>' >> .env.local

# 3. run
pnpm dev        # http://localhost:3000

# 4. verify the cube math anytime
node scripts/cube-math-check.mjs
node scripts/cube-stress-large.mjs
```

## ⚙️ Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `node scripts/cube-math-check.mjs` | 200-trial scramble/solve correctness harness |
| `node scripts/cube-stress-large.mjs` | 500-turn scramble stress harness |

## 📁 Project map

```text
src/
├── app/
│   ├── api/solve/route.ts        🔒 judgment + SSE stream (server-only)
│   ├── opengraph-image.tsx       dynamic OG image (ImageResponse)
│   ├── layout.tsx                fonts · metadata · JSON-LD · Analytics
│   ├── robots.ts · sitemap.ts · manifest.ts · icon.svg
│   └── page.tsx                  the one-page game
├── components/
│   ├── cube/RubiksCube.tsx       3D engine (r3f pivot-group turns)
│   ├── cube/CubeStage.tsx        canvas, lights, camera
│   ├── legal.tsx                 consent · privacy · disclaimer
│   ├── ErrorBoundary.tsx         localStorage corruption shield
│   └── Logo.tsx
├── lib/
│   ├── cube.ts                   move engine (validate · invert · simplify)
│   ├── store.ts                  XP · badges · run stats (persisted)
│   └── memes.ts                  tier banks · roasts · ranks
└── server/
    └── jev-engine.ts             🔒 single engine choke point (server-only)
```

## 🙏 Credits

- **Cube model** adapted from [buuing/Rubiks-Cube](https://github.com/buuing/Rubiks-Cube) — the most-starred Three.js Rubik's cube.
- **Font vibes** from [Bruno Simon's portfolio](https://bruno-simon.com) (Amatic SC + Nunito).
- **Judgments** by [Jev](https://www.typesafe.ai) via the TypeSafe System One API — probabilistic, for fun, never a fact.

## 🫡 Author

<div align="center">

### **Tró** · *0xtrou*

the one who taught Jev to cook 👨‍🍳

[![GitHub](https://img.shields.io/badge/github-0xtrou-181717?style=for-the-badge&logo=github)](https://github.com/0xtrou)
[![X](https://img.shields.io/badge/x-%40_trou3-black?style=for-the-badge&logo=x)](https://x.com/_trou3)

**enjoyed the chaos? drop a ⭐ — Jev counts the stars too**

</div>

## ⚠️ Disclaimer

Fan-made demo, provided *as is*, for entertainment only. Not affiliated with
Rubik's Brand Ltd or Spin Master Ltd — "Rubik's Cube" is a trademark of its
respective owner; this project simulates a classic 3×3 twisty puzzle. AI output
is probabilistic and may be inaccurate. Scores and XP have no value outside
this site. See the in-app **Disclaimer**, **Privacy & Cookies**, and
**Experimental Notice** for the full text.

---

<div align="center">

**🗿 scramble. cook. gamble. we move.**

*— Tró · [0xtrou](https://github.com/0xtrou) · [@_trou3](https://x.com/_trou3)*

</div>
