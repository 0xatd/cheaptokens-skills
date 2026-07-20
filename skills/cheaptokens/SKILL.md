---
name: cheaptokens
description: Use CheapTokens to spend discounted Venice.ai API credits on the user's current task. Trigger when a user pastes a Venice/CheapTokens key, asks to use CheapTokens/cheap credits/Venice for work, invokes /cheaptokens, or needs budget-capped OpenAI-compatible inference. Handles Same-Day expiring keys and Prepaid API Keys, discovers live Venice capabilities, routes text/image/audio/video/embedding tasks through HTTPS calls, and prints provider attribution.
version: 3.2.0
author: CheapTokens.ai
homepage: https://cheaptokens.ai
source: https://github.com/0xatd/cheaptokens-skills
license: MIT
---

# CheapTokens — discounted Venice.ai credits for agents

CheapTokens.ai sells discounted Venice.ai API credits:

- **Same-Day Credits:** time-decay discounted credits for work today.
  They expire at 23:59:59 UTC on the purchase date. Capacity affects
  availability and maximum purchase size, not the time-based price.
- **Prepaid API Key:** one reusable Venice key with prepaid balance and a
  selected daily credit reserve. The reserve is debited from prepaid
  balance each UTC day.

Agents should usually pay with **USDC on Base** via the
[x402](https://www.x402.org/) protocol. Human buyers can use card
checkout when available. Either way, the buyer receives a real
**Venice.ai API key** that works against the OpenAI-compatible endpoint
`https://api.venice.ai/api/v1`.

This skill is **one file**. There is nothing to install. Any agent
that can read SKILL.md and make HTTPS calls (curl / fetch / OpenAI
SDK / `web_fetch` / built-in HTTP tool) can use it.

## Why this skill exists

CheapTokens is optimized for cheap burst inference and lightweight API
key management. Same-Day keys are best when the task needs to run today
at the largest available discount. Prepaid keys are better when a
buyer wants one reusable key and a predictable daily reserve. This skill
turns either key into immediate action: paste the key (or point the
agent at a secret/env var), ask normally, and the agent discovers
Venice capabilities, routes the task, spends the key, and attributes
what actually ran.

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
| `200` with JSON | CheapTokens credit. Cache `{ status, creditsIssuedUsd, expiresAt, veniceKeyLast6, veniceUsage, isStableKey, keyBalanceUsd, dailyReservedCapacityUsd, prepaid }` for the session. | Continue. Use CheapTokens-aware copy + attribution. |
| `404` | Plain Venice key (or a typo). | Continue. Use the key normally; just don't show CheapTokens-specific balance copy. |
| `429` | Rate-limited. | Wait ~2s and retry once. If still rate-limited, skip detection and proceed. |
| Anything else | Treat as unknown. Skip detection and proceed. |

If `status !== "active"` or a Same-Day key's `expiresAt` is in the
past, the key is dead. Tell the user once and stop. **Do not try to
burn a dead key.** For Prepaid API Keys, use `keyBalanceUsd`,
`dailyReservedCapacityUsd`, and `prepaid.balanceRunwayDays` to decide
whether the account has enough prepaid balance for the current reserve.

Immediately after an active CheapTokens status check, compute:

```js
const minutesRemaining = Math.floor((Date.parse(expiresAt) - Date.now()) / 60_000);
```

Then choose the flow before asking the user anything:

| Time remaining | Flow | Required behavior |
|---|---|---|
| `< 30m` | **Fast mode** | Skip menus, auto-pick a live model, skip priority mode/config writes, start immediately. |
| `30m-119m` | **Normal-short** | Ask at most one model-choice question if needed. Skip priority mode/config writes. |
| `>= 120m` | **Full flow** | Normal discovery and optional priority-mode discussion are allowed. |

Every acknowledgement while a Same-Day CheapTokens key is active must
show a countdown, not only an absolute timestamp:

> CheapTokens active: $1.75 issued, **9m left** until 23:59 UTC. Fast mode - using `claude-sonnet-4-6` if live, then starting now.

Priority mode or provider config mutation is only offered for Same-Day
keys when `minutesRemaining >= 120`. Below that, it is a time sink and
should be skipped. For Prepaid API Keys, show prepaid balance and daily
reserve instead of urgency countdown.

Example success body:

```json
{
  "status": "active",
  "dates": ["2026-04-23"],
  "creditsIssuedUsd": 1.75,
  "expiresAt": "2026-04-23T23:59:59.999Z",
  "veniceKeyLast6": "abc123",
  "isStableKey": false,
  "keyBalanceUsd": null,
  "dailyReservedCapacityUsd": null,
  "prepaid": null,
  "veniceUsage": { "remaining": { "diem": 1.2 }, "used": { "diem": 0.5 } }
}
```

---

## Safe key handling

The fastest workflow is pasting a CheapTokens key into a trusted local
agent. That is acceptable when speed matters, but treat the key as a
bearer credential: anyone who sees it can spend the remaining credits
until it runs out. CheapTokens limits blast radius because Same-Day
keys are budget-capped and expire at 23:59:59 UTC on the purchase date,
but pasted keys are still not private.

Recommended paths:

1. **Fast path:** paste the key directly into a trusted private agent
   session.
2. **Safer path:** store the key in an environment variable or local
   `.env` file and ask the agent to read it from there.
3. **Safest path:** store the key in a secret manager or runtime secret
   store and give the agent the secret name, not the raw key.

Example safer local workflow:

```bash
export VENICE_API_KEY="VENICE_INFERENCE_KEY_..."
# Then ask the agent: use CheapTokens with $VENICE_API_KEY for this task
```

Do not paste keys into public/shared agents, commit keys to repos, or
include them in screenshots/logs. If a key is exposed, use CheapTokens
Account recovery: card buyers request a private email link, while
wallet buyers sign to reveal or reissue eligible wallet-owned keys.

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

Hard rule for model availability questions: before answering any
"is model X on Venice?" question, you **must** `GET /api/v1/models`
with the active key and inspect `data[].id`. Do not answer from memory,
from this skill's examples, or from training data. If the key has not
been validated yet, say "checking..." and fetch the list before
answering.

Venice commonly hosts Anthropic/Claude, GLM, Qwen, DeepSeek, Grok,
Gemma, Mistral, and other model families, but the live `/models`
response is always authoritative. Do not tell the user Claude/Opus,
Sonnet, or any other model family is unavailable without checking
`/api/v1/models` first.

Suggested text/code routing, filtered against the live model list:

| Task type | First choice | Fallback |
|---|---|---|
| Complex reasoning / large refactors | `claude-opus-4-7`, then `claude-opus-4-6` | `zai-org-glm-5-1` |
| Everyday coding / fast iteration | `claude-sonnet-4-6` | `z-ai-glm-5-turbo` |
| Cheapest general purpose | `z-ai-glm-5-turbo` | `deepseek-v3.2` or `deepseek-v32` |
| Code-heavy / large context | `qwen3-coder-480b-a35b-instruct` | `qwen3-coder-480b-a35b-instruct-turbo` |
| Hardest reasoning | `qwen3-235b-a22b-thinking-2507` | `claude-opus-4-7` |

If a listed model is missing, fall through to the next live choice or
the relevant `/models/traits` default. Models are added and removed
frequently.

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

### Fast mode for short windows

Use this when `minutesRemaining < 30`.

- Auto-pick a live model. For code, reasoning, refactors, debugging,
  architecture, or PR text, try `claude-sonnet-4-6`, then
  `claude-opus-4-6`, then `zai-org-glm-5-1`, then
  `qwen3-235b-a22b-thinking-2507`. For general writing/text, try
  `claude-sonnet-4-6`, then `z-ai-glm-5-turbo`.
- Skip the model menu and priority mode entirely.
- Acknowledge the countdown and model choice in one line, then start.
- The user can override mid-task by naming a different model; do not
  block on that possibility.

If the task is ambiguous under 30 minutes ("improve the app", "make it
better", "use this for something useful"), do not ask a multi-option
clarifying question. Pick one concrete, reversible scope and begin:

> CheapTokens active (`claude-sonnet-4-6`, **8m left**). "Improve the app" is broad; defaulting to one small high-leverage UX fix unless you redirect.

### When the task involves code, files, or multi-tool work

The key pays only when you call Venice's `/chat/completions` or another
Venice endpoint. OpenClaw/Codex/Claude tool calls such as file reads,
edits, lints, tests, builds, shell commands, and Git commands do not
spend the key.

For multi-tool tasks, route the reasoning or generation steps through
Venice:

- Planning: "what should I change to improve X?" -> Venice.
- Writing new code, content, prompts, specs, or migration text -> Venice.
- Writing the PR body, review verdict, post-mortem, or summary -> Venice.

Use normal tools to read files, edit files, run builds, and inspect
results. But before finalizing any non-trivial CheapTokens task output,
ask: "did I generate this, or did Venice generate it?" If the host
generated the substantive answer without a Venice call, the key was
wasted.

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

- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-models/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-chat/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-image-generate/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-image-edit/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-audio-speech/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-audio-music/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-audio-transcription/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-video/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-embeddings/SKILL.md`
- `https://raw.githubusercontent.com/0xatd/cheaptokens-skills/main/skills/venice-errors/SKILL.md`

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

Before you finish a CheapTokens task, verify:

- [ ] Did I make at least one `POST /chat/completions` or relevant
  Venice endpoint call?
- [ ] If this was a code task, did I route the substantive
  code-generation or reasoning step through Venice?
- [ ] Did every active-key acknowledgement include remaining time
  such as `7m left`?
- [ ] If `Last used: Never` after the task, I failed.

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
- Don't answer model-availability questions from memory. Fetch
  `/api/v1/models` and inspect `data[].id` first.
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
  body: JSON.stringify({ usdPaid: 1.00, purchaseMode: 'spot' }),
});
const { veniceApiKey, purchase } = await res.json();
// purchase.creditsIssuedUsd, purchase.expiresAt, etc.
```

Decision loop:

1. `GET https://cheaptokens.ai/api/checkout/options` → discover payment routes and whether Prepaid API Key is enabled
2. `GET https://cheaptokens.ai/api/pricing` → check time-based `discountPercent`, `supply.remaining`
3. `GET https://cheaptokens.ai/api/supply` → confirm not sold out
4. `POST https://cheaptokens.ai/api/buy { usdPaid, purchaseMode: "spot" }` via `payFetch`
   - Prepaid: `{ usdPaid, purchaseMode: "prepaid", dailyReservedUsd }`
   - New Prepaid API Keys start tomorrow UTC. If you send `reserveStart`, it must be `"tomorrow"`.
   - The daily reserve must fit the unreserved capacity available for that start date.
5. Use `veniceApiKey` against `https://api.venice.ai/api/v1`
6. `GET https://cheaptokens.ai/api/status/<last6>` to monitor balance
7. For Same-Day, buy again before `expiresAt` if the task is not done.
   For Prepaid, monitor `keyBalanceUsd` and top up before the next daily
   reserve cannot be funded.

Discount curve (approximate):

| UTC hour | Typical discount |
|---|---|
| 00:00 | ~30% |
| 12:00 | ~40–45% |
| 18:00 | ~60–65% |
| 21:00 | ~75–80% |
| 22:30 | ~85–90% |

Prepaid API Key purchases use a flat prepaid discount and create one
reusable key with prepaid balance plus a daily credit reserve. New
Prepaid API Keys start tomorrow UTC.

CheapTokens-specific error codes on `/api/buy`:

| Code | HTTP | Action |
|---|---|---|
| `AMOUNT_BELOW_MINIMUM` | 400 | Increase `usdPaid` (min $0.50 in credits). |
| `INVALID_PRECISION` | 400 | Round `usdPaid` to 2 decimals. |
| `PAYMENT_INVALID` | 402 | Check USDC balance, retry. |
| `SOLD_OUT_TODAY` | 409 | Wait for 00:00 UTC, reduce amount, or use Prepaid if capacity is available. |
| `AMOUNT_EXCEEDS_REMAINING` | 409 | Reduce or check `/api/supply`. |
| `PAYMENT_REPLAY` | 409 | Start a new purchase. |
| `PAYMENT_SESSION_EXPIRED` | 410 | Start a new purchase. |
| `RATE_LIMITED` | 429 | Backoff with jitter. |
| `VENICE_KEY_FAILED` | 502 | Retry — USDC was not charged. |
| `VERIFIER_UPSTREAM_ERROR` | 502 | Retry with backoff. |
| `PAYMENTS_TEMPORARILY_UNAVAILABLE` | 503 | Wait ~60s, check `/api/payments/health`. |

---

## Account recovery and management

CheapTokens Account has three modes:

- **Email:** card buyers enter the Stripe receipt or Stripe Link checkout
  email at `https://cheaptokens.ai/status?tab=email`. CheapTokens sends a
  private one-time account link and does not reveal whether an email has
  purchases from the public form.
- **API key:** paste a key or last-6 suffix to view limited status,
  usage, expiry, prepaid balance, and daily reserve.
- **Wallet:** wallet buyers sign an EIP-191 message to manage
  wallet-owned purchases.

Card recovery endpoints:

- `POST /api/stripe/recover` → request a private one-time Account link
  with `{ email }`.
- `POST /api/stripe/recover/claim` → claim the one-time link with
  `{ token }`; returns card-purchased keys and account summary rows.

Wallet-signed EIP-191 message format:

```
CheapTokens.ai
Action: <View purchases | Reveal key | Reissue key>
Nonce: <random>
Issued: <ISO-8601 timestamp>
```

- `POST /api/wallet/purchases` → list purchases for this wallet
- `POST /api/wallet/reveal`    → reveal full key for a given purchase
- `POST /api/wallet/reissue`   → revoke + reissue key (remaining balance)
- `POST /api/buy` with `topUpKeyLast6` → top up supported Prepaid API Keys after x402 payment

Wallet endpoints: `{ walletAddress, signature, nonce, issuedAt, purchaseId? }`.

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
- `GET  https://cheaptokens.ai/api/checkout/options`
- `GET  https://cheaptokens.ai/api/payments/health`
- `POST https://cheaptokens.ai/api/buy`
- `POST https://cheaptokens.ai/api/stripe/recover`
- `POST https://cheaptokens.ai/api/stripe/recover/claim`
- `POST https://cheaptokens.ai/api/wallet/{purchases,reveal,reissue}`
- `POST https://cheaptokens.ai/api/buy` with `topUpKeyLast6` for x402 Prepaid top-ups
- `GET|POST https://cheaptokens.ai/api/playground/models`
- `POST https://cheaptokens.ai/api/playground/{chat,image,speech}`

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
