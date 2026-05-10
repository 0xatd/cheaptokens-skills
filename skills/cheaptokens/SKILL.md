---
name: cheaptokens
description: Use CheapTokens to spend a discounted Venice.ai API key on the user's current task. TRIGGER WHEN any of these are true — (a) the user pastes a Venice-looking API key (long opaque bearer token, sometimes labeled "Venice API key", "CheapTokens key", "discount key", or "CheapTokens credits"); (b) the user says phrasings like "use this key", "use my key", "use CheapTokens", "use cheap tokens", "use the CheapTokens key", "use this Venice key", "run this on CheapTokens", "route this through Venice", "do this with this Venice key", "swap to Venice for this", "use my cheap credits", "use the discounted key"; (c) the user invokes /cheaptokens; or (d) the agent needs cheap, ephemeral, OpenAI-compatible inference for burst workloads, experiments, or budget-capped runs. The skill is a single self-contained file — no install, no helper binary, no external dependency. It detects whether the key is a CheapTokens credit, discovers Venice's live capabilities (text, image, audio, video, embeddings) via /api/v1/models, triages the user's request against that capability map, and spends the key directly via HTTPS calls the agent already knows how to make. Hybrid replies (Venice + host) print one attribution line per provider so the user can verify which provider produced which bytes. Falls back to the host provider transparently on exhaustion, 401, or expiry at 23:59:59 UTC on the purchase date.
version: 3.0.0
author: CheapTokens.ai
homepage: https://cheaptokens.ai
source: https://github.com/alde1022/cheaptokens-skills
license: MIT
---

# CheapTokens — discounted Venice.ai credits for agents

CheapTokens.ai sells **discounted same-day Venice.ai API credits**
using a time-decay pricing model (≈25% off at 00:00 UTC, up to ~75%
off near 23:00 UTC). Pay with **USDC on Base** via the
[x402](https://www.x402.org/) protocol. You receive a real
**Venice.ai API key** that works against the OpenAI-compatible
endpoint `https://api.venice.ai/api/v1`. No signup, no account, no
browser required.

This skill is **one file**. There is nothing to install. Any agent
that can read SKILL.md and make HTTPS calls (curl / fetch / OpenAI
SDK / `web_fetch` / built-in HTTP tool) can use it.

---

## Honest execution model — read this first

The hosting agent (OpenClaw, Claude Code, Cursor, Codex, Cline,
aider, etc.) is running on some default model. That host provider
is what generates the conversational tokens you see in chat. **The
agent cannot transparently swap the provider behind its own
generation mid-session.** If a user hands you a CheapTokens/Venice
key and you *say* "switched to Venice" without executing a real
HTTPS call against `api.venice.ai`, every token you produced still
came from the host provider. That is a silent lie.

The only mechanism that actually spends the user's key is an
outbound HTTPS call to `https://api.venice.ai/api/v1/<endpoint>`
made by the agent. This skill teaches the agent (1) when to do
that, (2) which Venice endpoint matches the user's ask, and (3)
how to print an attribution line that lets the user verify after
the fact which bytes came from Venice and which came from the host.

If the agent has no HTTP tool at all, it cannot use the key. Say so
plainly and stop. Do not invent attribution.

---

## Step 1 — Detect: is this a CheapTokens key?

Run this **once** per key per session, not on every turn.

```http
GET https://cheaptokens.ai/api/status/<LAST6>
```

Where `<LAST6>` is the last 6 characters of the pasted key.

| Response | Meaning | Action |
|---|---|---|
| `200` with JSON | CheapTokens credit. Cache `{ status, creditsIssuedUsd, expiresAt, veniceKeyLast6, veniceUsage }` for the session. | Continue. Use CheapTokens-aware copy + attribution. |
| `404` | Plain Venice key (or a typo). | Continue. Use the key normally; just don't show CheapTokens-specific balance copy. |
| `429` | Rate-limited. | Wait ~2s and retry once. If still rate-limited, skip detection and proceed. |
| Anything else | Treat as unknown. Skip detection and proceed. |

If `status !== "active"` or `expiresAt` is in the past, the key is
dead. Tell the user once and stop. **Do not try to burn a dead
key.**

Example success body:

```json
{
  "status": "active",
  "dates": ["2026-04-23"],
  "creditsIssuedUsd": 1.75,
  "expiresAt": "2026-04-23T23:59:59.999Z",
  "veniceKeyLast6": "abc123",
  "veniceUsage": { "lastUsedAt": "...", "trailingSevenDays": 0.5 }
}
```

---

## Step 2 — Discover live capabilities

Before you tell a user what Venice can or can't do, ask Venice.
**Never hardcode model IDs or modality assumptions.** Models rotate.
This CheapTokens skill is standalone: it includes the core Venice model
discovery and endpoint routing rules below. Separate Venice skills are
optional expert references, not dependencies.

```http
GET https://api.venice.ai/api/v1/models
Authorization: Bearer <KEY>
```

Optional `?type=` filter. Cache results for the session. Prefer one
`/models?type=all` call when budget/latency permits, then filter locally.
For smaller probes, query only the modalities relevant to the ask.

Model type filters:

| `type` | What it means | Main endpoint(s) |
|---|---|---|
| `text` | Chat/completions models. This includes ordinary writing, reasoning, coding, tool use, structured output, and multimodal-input chat when the model advertises those capabilities. | `POST /chat/completions` |
| `code` | A filtered view of text models where `model_spec.capabilities.optimizedForCode === true`. Code is still served through `/chat/completions`; this is a selection hint, not a separate API. | `POST /chat/completions` |
| `image` | Text-to-image generation. | `POST /image/generate`, `POST /images/generations` |
| `inpaint` | Image edit / multi-edit / background removal / some upscale-capable models. | `POST /image/edit`, `/image/multi-edit`, `/image/background-remove` |
| `upscale` | Image/video upscale-capable models when exposed separately. | `POST /image/upscale`, video upscale via `/video/*` |
| `video` | Text-to-video, image-to-video, video-to-video/upscale, video transcription support. | `POST /video/quote`, `/video/queue`, `/video/retrieve`, `/video/complete`, `/video/transcriptions` |
| `music` | Async music, songs, long-form audio, soundtracks, long narration. | `POST /audio/quote`, `/audio/queue`, `/audio/retrieve`, `/audio/complete` |
| `tts` | Text-to-speech / voice generation. | `POST /audio/speech` |
| `asr` | Speech-to-text transcription. | `POST /audio/transcriptions` |
| `embedding` | Vector embeddings for retrieval/RAG/clustering/dedup. | `POST /embeddings` |
| `all` | Full catalog. Use this when deciding across modalities. | All of the above |

Each row's `model_spec` exposes `capabilities`, `constraints`, and
`pricing`. Treat that as the source of truth for what the model can
do and what it costs.

Text/code selection rule: for coding tasks, first look for `type=code` or
`type=text` models with `optimizedForCode`; if none are available, pick the
best text reasoning/default model from traits. Do not tell the user Venice
cannot code unless both `text` and `code` discovery fail or the key cannot
call `/chat/completions`.

Trait shortcuts to avoid hardcoding IDs:

```http
GET https://api.venice.ai/api/v1/models/traits?type=text
GET https://api.venice.ai/api/v1/models/traits?type=code
GET https://api.venice.ai/api/v1/models/traits?type=image
GET https://api.venice.ai/api/v1/models/traits?type=video
GET https://api.venice.ai/api/v1/models/traits?type=tts
```

Returns a `data` map like
`{ "default": "<id>", "fastest": "<id>", "default_reasoning": "<id>",
"highest_quality": "<id>", "default_vision": "<id>",
"function_calling_default": "<id>", ... }`. Use these instead of
baking model names into prompts.

---

## Step 3 — Triage the user's ask against live capabilities

Classify the request, then route:

1. **Fully on Venice.** The request maps to one or more capabilities
   that Venice currently exposes. Spend the key directly. Print one
   Venice attribution line.
2. **Hybrid.** Some of the request is on Venice (e.g. script,
   prompts, captions, transcript) and some is on the host (e.g. an
   image / video / audio model the host has but Venice doesn't, or
   vice versa). **Spend the key on the Venice-doable parts first.**
   Then complete the rest on the host. Print one attribution line
   per provider used.
3. **Not on Venice at all.** Tell the user precisely what's missing
   in the *live* capability map (don't guess). Then immediately
   spend the key on adjacent text artifacts (script, shot list,
   prompts, captions, transcript notes) so the credit isn't wasted.
   Print a Venice attribution line for the artifacts you produced
   and a host attribution line for whatever the host model
   ultimately ships.

You **may** use the host provider for routing decisions, parsing
non-generative tool output (file reads, lints), and brief glue
wording ("Here's what Venice produced:"). You **must not** use the
host provider to rewrite, embellish, or translate Venice output
before returning it.

---

## Expiry-aware urgency

After detection you know `expiresAt`. Use it.

| Time remaining | Behavior |
|---|---|
| > 6h | Normal. Confirm before large host-side spends; act normally on Venice. |
| ≤ 6h | Bias toward acting now on anything Venice can satisfy. |
| ≤ 1h | Stop asking for confirmation on cheap text spend (chat, embeddings, transcripts, TTS, image prompts). Just do it. |
| ≤ 30m | Last-call mode. Produce something useful with the remaining credit, or surface a hard blocker. Do not let the key idle to zero. |

**Idle, expiring CheapTokens keys are a failure mode.** If the user
is non-responsive and the key is about to expire, execute the
highest-leverage Venice spend you can justify (a script, a
transcript, a content batch, a model probe report) and report
results.

---

## Step 4 — Pick endpoints based on the ask

Below are the endpoints the skill knows about. All authenticated
with `Authorization: Bearer <KEY>` against
`https://api.venice.ai/api/v1`. The agent calls them directly via
its existing HTTP tool — **no helper required.**

This file contains the core routing and request-shape knowledge needed to
use CheapTokens without any separate Venice skill. If a runtime also has
Venice-specific skills installed, it may consult them for deeper endpoint
quirks, but it must not require them for normal text/code, image, video,
audio, music, transcription, or embedding tasks.

Optional deeper references, if available or if a rare edge case appears:

- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-models/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-chat/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-image-generate/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-image-edit/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-audio-speech/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-audio-music/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-audio-transcription/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-video/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-embeddings/SKILL.md`
- `https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/venice-errors/SKILL.md`

That's a one-time HTTP read, not an install.

### Text generation — `POST /chat/completions`

OpenAI-compatible. Sync. Use for: chat, drafting, summarization,
analysis, code, structured output, function calling, multimodal
input (images, audio, video URLs).

```http
POST /chat/completions
{
  "model": "<id from /models/traits?type=text or /models?type=text>",
  "messages": [{"role":"user","content":"..."}],
  "stream": false
}
```

Notable Venice-only knobs (under `venice_parameters`):
`enable_web_search` (`off|auto|on`), `enable_x_search`,
`enable_web_scraping`, `enable_web_citations`, `character_slug`,
`strip_thinking_response`, `disable_thinking`, `enable_e2ee`. Or
encode them as model suffixes like `:enable_web_search=on`.

Multimodal `messages[].content` parts: `text`, `image_url` (URL or
base64 data URL), `input_audio` (base64 only), `video_url` (URL or
base64 data URL).

### Embeddings — `POST /embeddings`

OpenAI-compatible. Sync. Use for: retrieval, RAG, clustering, dedup.

```http
POST /embeddings
{
  "model": "<id from /models?type=embedding>",
  "input": "..."
}
```

Batch up to 2048 strings per call. `encoding_format: "base64"`
shrinks payload ~4×.

### Image generation — `POST /image/generate`

Sync. Venice-native, full control (negatives, CFG, seed, up to 4
variants). For OpenAI-compatible drop-in, use `POST /images/generations`.

```http
POST /image/generate
{
  "model": "<id from /models?type=image>",
  "prompt": "...",
  "negative_prompt": "...",
  "width": 1024, "height": 1024,
  "cfg_scale": 7.5, "steps": 8, "seed": 0,
  "variants": 1, "format": "webp",
  "style_preset": "<from GET /image/styles>",
  "safe_mode": true
}
```

Some models use `aspect_ratio` + `resolution` instead of
width/height. Check `model_spec.constraints` on `/models?type=image`.

### Image edit — `/image/edit`, `/image/multi-edit`, `/image/upscale`, `/image/background-remove`

All sync. Return binary `image/png`. Inputs accept base64, file
upload, or HTTPS URL. Max 25 MB; image dims 65,536–33,177,600 px.

```http
POST /image/edit
{ "model": "qwen-edit", "prompt": "...", "image": "<base64 or URL>", "aspect_ratio": "16:9" }

POST /image/multi-edit         // note: uses "modelId", not "model"
{ "modelId": "qwen-edit", "prompt": "...", "images": ["<URL or base64>", ...] }

POST /image/upscale
{ "image": "<base64>", "scale": 2, "enhance": true, "enhanceCreativity": 0.5, "replication": 0.35 }

POST /image/background-remove
{ "image": "<base64>" }    // OR { "image_url": "https://..." }
```

### Text-to-speech — `POST /audio/speech`

Sync. OpenAI-compatible. Use for narration, voice replies, UI
audio. Up to 4096 chars per call.

```http
POST /audio/speech
{
  "model": "<id from /models?type=tts>",
  "voice": "<voice from model_spec.voices>",
  "input": "...",
  "response_format": "mp3",
  "speed": 1.0,
  "streaming": false
}
```

Voices are model-specific. Wrong combo = `400`.

### Music / long-form audio — async

Quote → queue → poll → complete.

```http
POST /audio/quote      { "model": "<music model>", "duration_seconds": 60 }
POST /audio/queue      { "model": "...", "prompt": "...", "duration_seconds": 60, "lyrics_prompt": "...", "voice": "...", "language_code": "en", "speed": 1.0, "force_instrumental": false }
POST /audio/retrieve   { "model": "...", "queue_id": "..." }   // JSON while PROCESSING; binary audio when done
POST /audio/complete   { "model": "...", "queue_id": "..." }   // free server storage
```

### Speech-to-text — `POST /audio/transcriptions`

Sync. Multipart only (no base64).

```
file=@meeting.m4a
model=<id from /models?type=asr>
response_format=json|text|verbose_json|srt|vtt
timestamps=true|false
language=en
```

Max file size 25 MB on this endpoint.

### Video generation + transcription — async + sync

```http
POST /video/quote      { "model": "<video model>", "duration": "5s", "aspect_ratio": "16:9", "resolution": "720p", "audio": true }
POST /video/queue      { "model": "...", "prompt": "...", "negative_prompt": "...", "duration": "5s", "aspect_ratio": "16:9", "resolution": "720p", "audio": true, "image_url": "...", "audio_url": "...", "video_url": "...", "reference_image_urls": [...] }
POST /video/retrieve   { "model": "...", "queue_id": "..." }   // JSON while PROCESSING; binary video/mp4 when done; OR JSON with download_url for VPS-backed models
POST /video/complete   { "model": "...", "queue_id": "..." }
POST /video/transcriptions   { "url": "https://www.youtube.com/watch?v=...", "response_format": "json" }
```

Video uses **duration enums** (`2s..30s` or `Auto`), not seconds.
Pricing isn't on `/models` — always `POST /video/quote` first.
`download_url` (when present) expires in 24h.

### Document parsing, web scrape, and search — `/augment/*`

Use when the task needs retrieval/source material before generation.
These are optional utility spends but useful for agent workflows.

```http
POST /augment/text-parser     // multipart file PDF/DOCX/XLSX/TXT ≤ 25 MB
file=@doc.pdf
response_format=json|text

POST /augment/scrape
{ "url": "https://example.com/article" }     // returns markdown

POST /augment/search
{ "query": "...", "limit": 10, "search_provider": "brave" }
```

Pattern: parse/scrape/search first, then pass the extracted text into
`/chat/completions` for summarization, coding, analysis, or structured
output. Do not claim web/search ability unless the endpoint succeeds or a
chat model advertises `supportsWebSearch` and you enabled it.

### Characters — `/characters` + `character_slug`

Use when the user asks for a Venice public character/persona.

```http
GET /characters?search=...&limit=20
GET /characters/{slug}
POST /chat/completions
{ "model": "<text model>", "messages": [...], "venice_parameters": { "character_slug": "<slug>" } }
```

### Responses API — `POST /responses` (alpha)

Use only when the caller specifically needs OpenAI Responses-style typed
output blocks. Otherwise prefer `/chat/completions`, which is broader and
more stable.

```http
POST /responses
{ "model": "<text model>", "input": "Explain this in one paragraph." }
```

### Crypto RPC — `/crypto/rpc/*`

Use only for explicit on-chain JSON-RPC requests. Not needed for ordinary
CheapTokens key spend.

```http
GET /crypto/rpc/networks
POST /crypto/rpc/base-mainnet
{ "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1 }
```

---

## Step 5 — Attribution

Every reply that consumed Venice credit must end with an
attribution footer.

CheapTokens-detected key, text response:

```
[via CheapTokens → Venice:<model> · $<creditsIssuedUsd> issued · expires <expiresAt> · <usage.total_tokens> tok]
```

Plain Venice key (no CheapTokens detection):

```
[via Venice:<model> · <usage.total_tokens> tok]
```

Non-text Venice spend (image/audio/video):

```
[via CheapTokens → Venice:<model> · <unit count, e.g. "1 image" / "60s audio" / "5s 720p video">]
```

Hybrid replies:

```
[via CheapTokens → Venice:<text-model> · <N> tok]   ← script / captions
[via host:<host-model>]                              ← rendered video / image
```

If you cannot produce an attribution line for a given reply, **you
did not use the key for that reply**. Say so plainly. Do not invent
footers.

---

## Step 6 — Errors and fallback

Venice error shapes (from `venice-errors`):

| Code | What it means | Action |
|---|---|---|
| `400` | Bad request shape (Zod). | Fix and re-send. Don't retry. |
| `401` | Auth failed / key revoked. | Tell user once. Fall back to host. |
| `402` | Out of credit / x402 payment required. | Tell user once. Offer `https://cheaptokens.ai/buy`. Fall back. |
| `403` | Not entitled (beta / Pro / region). | Don't retry. Investigate. |
| `415` | Wrong `Content-Type`. | Fix headers. Don't retry. |
| `422` | Content policy violation. Audio paths may include `suggested_prompt`. | If `suggested_prompt` is present and user consents, retry once with it. Otherwise stop. |
| `429` | Rate limited. | Honor `X-RateLimit-Reset` / `Retry-After`. Backoff with jitter. |
| `500` / `503` / `504` | Provider-side. | Exponential backoff (0.5s → 30s, ≤5 retries). |

Detection signals for "fall back transparently":

- HTTP `401` from Venice → key invalid / revoked → fall back.
- HTTP `402` or response body mentions `insufficient credits` /
  `quota exceeded` / `out of credits` → fall back.
- CheapTokens status endpoint returns `status !== "active"` or
  `expiresAt` past → fall back.
- HTTP `5xx` after one retry → fall back.

On fallback, send the user **one** clean line, not a wall of
diagnostics:

> CheapTokens credits look exhausted (Venice 402). I'm switching
> back to my default provider for the rest of this session. Want
> me to open `https://cheaptokens.ai/buy` for a fresh key?

Then continue on the host provider. Do not paper over the fallback
silently.

---

## Don'ts

- Don't say "switched to Venice" / "using your key now" if you did
  not just complete an HTTPS call to Venice. Use the endpoints or
  admit you can't.
- Don't hit `/api/status/{last6}` on every turn — once per key per
  session is plenty.
- Don't hardcode model IDs, voices, or modality assumptions —
  always validate against `/models` and `/models/traits`.
- Don't retry a dead key. `status: inactive`, `401`, `402`,
  `expiresAt` past → fall back.
- Don't rewrite Venice output before returning it. Relay verbatim
  + attribution.
- Don't leak the key into logs, CI artifacts, or persisted shell
  history. Use environment vars or in-memory variables.

---

## Buying credits programmatically (wallet-aware agents)

For agents with a USDC-funded Base wallet, buy directly via x402:

```bash
npm install viem x402-fetch
```

```js
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { wrapFetchWithPayment } from 'x402-fetch';

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wallet  = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') });
const payFetch = wrapFetchWithPayment(fetch, wallet, BigInt(1_000_000)); // max $1.00 USDC

const res = await payFetch('https://cheaptokens.ai/api/buy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usdPaid: 1.00 }),
});
const { veniceApiKey, purchase } = await res.json();
// purchase.creditsIssuedUsd, purchase.expiresAt, etc.
```

Decision loop:

1. `GET https://cheaptokens.ai/api/pricing` → check `discountPercent`, `supply.remaining`
2. `GET https://cheaptokens.ai/api/supply` → confirm not sold out
3. `POST https://cheaptokens.ai/api/buy { usdPaid }` via `payFetch`
4. Use `veniceApiKey` against `https://api.venice.ai/api/v1`
5. `GET https://cheaptokens.ai/api/status/<last6>` to monitor balance
6. Before `expiresAt`, buy again if the task isn't done

Discount curve (approximate):

| UTC hour | Typical discount |
|---|---|
| 00:00 | ~25% |
| 12:00 | ~30–35% |
| 18:00 | ~45–50% |
| 21:00 | ~60–65% |
| 22:30 | ~70–75% |

Reservations (future dates): flat 25% with no time curve.

CheapTokens-specific error codes on `/api/buy`:

| Code | HTTP | Action |
|---|---|---|
| `AMOUNT_BELOW_MINIMUM` | 400 | Increase `usdPaid` (min $0.50 in credits). |
| `INVALID_PRECISION` | 400 | Round `usdPaid` to 2 decimals. |
| `PAYMENT_INVALID` | 402 | Check USDC balance, retry. |
| `SOLD_OUT_TODAY` | 409 | Wait for 00:00 UTC or reserve a future date. |
| `AMOUNT_EXCEEDS_REMAINING` | 409 | Reduce or check `/api/supply`. |
| `PAYMENT_REPLAY` | 409 | Start a new purchase. |
| `PAYMENT_SESSION_EXPIRED` | 410 | Start a new purchase. |
| `RATE_LIMITED` | 429 | Backoff with jitter. |
| `VENICE_KEY_FAILED` | 502 | Retry — USDC was not charged. |
| `VERIFIER_UPSTREAM_ERROR` | 502 | Retry with backoff. |
| `PAYMENTS_TEMPORARILY_UNAVAILABLE` | 503 | Wait ~60s, check `/api/payments/health`. |

---

## Account recovery (no accounts — wallet is identity)

Wallet-signed EIP-191 messages. Format:

```
CheapTokens.ai
Action: <View purchases | Reveal key | Reissue key>
Nonce: <random>
Issued: <ISO-8601 timestamp>
```

- `POST /api/wallet/purchases` → list purchases for this wallet
- `POST /api/wallet/reveal`    → reveal full key for a given purchase
- `POST /api/wallet/reissue`   → revoke + reissue key (same balance)

All three: `{ walletAddress, signature, nonce, issuedAt, purchaseId? }`.

---

## Blockchain summary

| Field | Value |
|---|---|
| Chain | Base (8453) or Base Sepolia (84532) |
| Asset | USDC |
| USDC (Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Protocol | x402 `exact` scheme (EIP-712 signed USDC authorization) |
| `payTo` address | Read dynamically from the `402` response — do not hardcode |

---

## Quick reference

CheapTokens endpoints:

- `GET  https://cheaptokens.ai/api/status/<last6>`
- `GET  https://cheaptokens.ai/api/pricing`
- `GET  https://cheaptokens.ai/api/supply`
- `GET  https://cheaptokens.ai/api/payments/health`
- `POST https://cheaptokens.ai/api/buy`
- `POST https://cheaptokens.ai/api/wallet/{purchases,reveal,reissue}`

Venice endpoints (auth: `Authorization: Bearer <KEY>`):

- `GET  /api/v1/models[?type=...]`, `/models/traits[?type=...]`, `/models/compatibility_mapping`
- `POST /api/v1/chat/completions`
- `POST /api/v1/embeddings`
- `POST /api/v1/image/generate`, `/images/generations`, `/image/styles`
- `POST /api/v1/image/edit`, `/image/multi-edit`, `/image/upscale`, `/image/background-remove`
- `POST /api/v1/audio/speech`
- `POST /api/v1/audio/quote`, `/audio/queue`, `/audio/retrieve`, `/audio/complete`
- `POST /api/v1/audio/transcriptions`
- `POST /api/v1/video/quote`, `/video/queue`, `/video/retrieve`, `/video/complete`, `/video/transcriptions`

That's the whole skill. Paste a key. Use it. Verify the attribution.
