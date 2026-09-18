# COMPLIANCE.md — TypeSafe MCA compliance map

How this codebase implements the obligations of the TypeSafe **Master Customer
Agreement** (see https://docs.typesafe.ai/legal → MCA, Privacy Policy, DPA) and
its own provider-secrecy requirements.

> ⚠️ Internal working document. Summarizes obligations; not legal advice, and
> not a reproduction of the agreement. The Order's Usage Limits sit on top of
> everything below.

## 1. Governing model (one paragraph)

TypeSafe grants a license to integrate their API into **Customer Applications
used by End Users** (MCA §2.1–2.2) — i.e. public deployment of this site is the
intended use. Outputs (§4.2) are assigned to us and may be shown publicly. The
constraints live in §2.3 (restrictions), §2.4 (credentials), §5 (obligations),
§15.4 (publicity), and the Order's Usage Limits. Everything below enforces
those, with the additional business rule that **the provider's identity,
endpoint, model ids, and inference telemetry are secrets** (env-only,
server-only).

## 2. Compliance map

| # | Obligation (MCA ref) | Implementation in this repo | Files | Status |
|---|---|---|---|---|
| 1 | Integrate API only via Customer Applications for End Users (§2.1–2.2) | Public web app; the AI is a gameplay feature, not the product being resold | `src/app/page.tsx`, `src/app/api/solve/route.ts` | ✅ |
| 2 | No standalone-service offering (§2.3a) | Endpoint `/api/solve` serves only this app's game loop; no passthrough/proxy API surface, no key distribution | `route.ts` | ✅ |
| 3 | No model distillation / competing product from Output (§2.3b) | Outputs (tiers, stars, roasts) are rendered once and never stored for training; run stats persist locally in the visitor's browser only | `src/lib/store.ts` | ✅ |
| 4 | No reverse engineering / derivative Services (§2.3c–d) | SDK used as documented | `src/server/jev-engine.ts` | ✅ |
| 5 | Proprietary notices untouched (§2.3e) | No notices modified or removed | — | ✅ |
| 6 | **No publishing benchmarks / performance information about the Services (§2.3f)** | Judge latency, model id (`jev-*`), confidence and probability data are **never sent to the client or logged**. Client sees only generic usage facts per owner decision: tokens consumed + app wall time. "BENCH" framing renamed to "RUN STATS" | `route.ts` (projection), `src/app/page.tsx` (stats panel) | ✅ (owner-approved scope) |
| 7 | No interference / circumvention (§2.3g–h) | Standard Next.js route; no protection mechanisms touched | — | ✅ |
| 8 | Usage Limits (§2.3k) | In-memory per-IP rate limiter (12 runs/min) + strict move-syntax validation + 400-move history cap | `route.ts`, `src/lib/cube.ts` | ✅ (limiter is per-instance; consider shared store if scaled out) |
| 9 | Use per Documentation / lawful use (§2.3l–m) | Legal pages + Acceptable Use section; unlawful-content input rejected by validation | `src/components/legal.tsx` | ✅ |
| 10 | Access Credentials confidentiality (§2.4, §14) | Key exists **only** as server env secret (`JEV_ENGINE_API_KEY`); never `NEXT_PUBLIC_*`, never logged, never in client bundle (verified by bundle grep) | `.env.local`, Vercel env | ✅ |
| 11 | Input minimization (§4.1) | Only the visitor's move sequence is transmitted; no identifiers, no cookies attached to engine calls | `route.ts` | ✅ |
| 12 | Output ownership → display permitted (§4.2) | Verdicts/roasts streamed as curated game events and rendered publicly | `route.ts` → `page.tsx` | ✅ |
| 13 | Disclosures & notices to End Users (§5) | Consent banner (first visit), Privacy & Cookies dialog, Disclaimer dialog, Experimental Notice, Meet Jev dialog | `src/components/legal.tsx`, `page.tsx` | ✅ |
| 14 | End-user responsibility (§5) | Acceptable Use section assigns visitor responsibility; operator responsibility acknowledged | `legal.tsx` | ✅ |
| 15 | Accuracy disclaimers mirrored (§9/§10) | "Experimental · AI-generated" badge + probabilistic-output notices | `page.tsx`, `legal.tsx` | ✅ |
| 16 | **Publicity — no use of provider name/brand (§15.4)** | Provider name, brand, URLs, and model ids absent from all client-visible surfaces (audit: `grep -rni typesafe src/` returns only server-side adapter + env var names). "Jev" is positioned as this site's own solver persona | everywhere | ✅ (residual: see §4) |
| 17 | DPA / Privacy (pp) | Site itself stores nothing but functional localStorage; consent banner + cookie disclosure; no advertising trackers. Page views measured via Vercel Web Analytics (cookieless, anonymized, aggregated — no personal data) | `legal.tsx`, `layout.tsx` | ✅ |

## 3. Infrastructure secrecy measures

- **Secret env vars (server only):** `JEV_ENGINE_API_KEY`, `JEV_ENGINE_BASE_URL`.
  No provider URL or key is hardcoded anywhere; the endpoint is configured, not
  committed. Local dev uses `.env.local` (gitignored).
- **Server-only adapter:** all SDK access goes through
  `src/server/jev-engine.ts` (anti-corruption layer). Client code cannot import
  it (server-only module used exclusively by `app/api/solve/route.ts`).
- **Client boundary:** SSE stream carries only curated events
  (`meta`/`waypoint`/`move`/`done`/`error`) signed `engine: "jev-stream/1"`, plus generic
  token count. No questions, criteria, probabilities, confidence, usage
  breakdowns, model ids, or provider references.
- **Bundle audit:** `grep -rli typesafe .next/static/` → empty. Server chunks
  are never shipped to browsers.
- **Package aliasing:** the judgment SDK is aliased as `jev-engine`
  (`package.json`) so the provider scope name does not appear in imports.

## 4. Residual risks / open items

1. **"Jev" name (§15.4):** the persona name originated as the provider's model
   name. Mitigated by positioning Jev as an in-house persona; a one-line
   written OK from the provider would fully close this.
2. **Tokens + wall time on public pages (§2.3f):** kept per owner decision as
   generic usage facts. If interpretation tightens, the stats panel is the only
   place to strip.
3. **Rate limiter is per-instance** (in-memory). Horizontal scaling would need
   a shared limiter (e.g. Upstash/Redis) to keep §2.3k guarantees.
4. **Degraded mode:** if the engine is unreachable the game continues with a
   heuristic judge and `tokens: 0`; this is intentional availability behavior,
   not a compliance issue.

## 5. Re-audit checklist

```bash
# 1. no provider strings in source (expect only the adapter file + env names)
grep -rni "typesafe\|system one\|jev-latest\|jev-1\." src/ package.json
# 2. no provider strings in the client bundle (expect empty)
pnpm build && grep -rli typesafe .next/static/
# 3. stream shows only curated fields
curl -sN -X POST https://rubikjev.solo.engineer/api/solve \
  -H 'content-type: application/json' -d '{"history":["R","U","R'"'"'"]}'
```
