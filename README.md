# CheapTokens Skills

Agent skills for discounted Venice.ai credits.

This repo bundles:

1. **CheapTokens router skill** — key detection, same-day expiry awareness, discounted-credit routing, direct Venice spend, and attribution.
2. **Synced Venice API skills** — official Venice endpoint skills mirrored from [`veniceai/skills`](https://github.com/veniceai/skills), so agents know the full Venice model surface.

CheapTokens keys are Venice API keys. The point of this pack is to make that obvious and useful: agents can buy or receive discounted same-day Venice credits from [CheapTokens.ai](https://cheaptokens.ai), then use the full Venice API across text, code, image, video, music, audio, transcription, embeddings, search/scrape, characters, and more.

## Install / add to an agent

Use the whole repo if your runtime supports skill directories, or copy only the skill files you want.

### CheapTokens router only

Raw URL:

```text
https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/cheaptokens/SKILL.md
```

CheapTokens-hosted URL:

```text
https://cheaptokens.ai/SKILL.md
```

OpenClaw example:

```bash
mkdir -p ~/.openclaw/skills/cheaptokens
curl -fsSL https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/cheaptokens/SKILL.md \
  -o ~/.openclaw/skills/cheaptokens/SKILL.md
```

### Full CheapTokens + Venice skill pack

```bash
git clone https://github.com/alde1022/cheaptokens-skills.git
# Then point your agent runtime at ./cheaptokens-skills/skills
```

For Hermes, Claude Code, Codex-style harnesses, Cursor, Cline, OpenCode, OpenClaw, and similar runtimes, save the skill files wherever that runtime loads skills or persistent agent instructions.

## What the CheapTokens skill does

The CheapTokens skill lets an agent use a CheapTokens/Venice API key across Venice's model surface:

- text and coding via `/chat/completions`
- image generation/editing/upscale/background removal
- video generation/transcription
- music and long-form audio
- text-to-speech
- speech-to-text
- embeddings
- document parsing, web scrape/search, characters, and other Venice utilities

It handles:

1. CheapTokens key detection and status checks
2. same-day expiry awareness
3. Venice live model discovery
4. task-to-endpoint routing
5. direct Venice API calls using the provided key
6. attribution so users can verify when credits were actually spent
7. honest fallback when the key is expired, exhausted, or unsupported

## Relationship to Venice skills

This is **not a fork** of `veniceai/skills`.

It is a CheapTokens-branded skill pack that vendors/syncs Venice's public MIT-licensed skills and adds the CheapTokens router skill on top.

Mental model:

```text
CheapTokens skill = key detection, credit expiry, spend routing, attribution
Venice skills     = deeper Venice endpoint expertise and edge cases
```

For most text/coding tasks, the CheapTokens skill is enough by itself. For advanced image, video, audio, music, transcription, model traits, or provider-specific errors, install the full pack.

## Synced Venice source

Venice skills are synced from:

```text
https://github.com/veniceai/skills
```

See:

- [`vendor/VENICE-SKILLS-SOURCE.txt`](vendor/VENICE-SKILLS-SOURCE.txt)
- [`vendor/VENICE-SKILLS-LICENSE`](vendor/VENICE-SKILLS-LICENSE)

Update command:

```bash
scripts/update-venice-skills.sh
```

## Repo layout

```text
skills/
  cheaptokens/                  # CheapTokens router skill
  venice-api-overview/           # Synced from veniceai/skills
  venice-chat/
  venice-models/
  venice-image-generate/
  venice-video/
  ...
scripts/update-venice-skills.sh
vendor/VENICE-SKILLS-SOURCE.txt
vendor/VENICE-SKILLS-LICENSE
skills.json
```

## License

MIT.

The CheapTokens skill and repo scaffolding are © CheapTokens.ai. Synced Venice skills are © Venice.ai and distributed under MIT; see `vendor/VENICE-SKILLS-LICENSE`.
