# CheapTokens Skills

Portable agent skills for using [CheapTokens.ai](https://cheaptokens.ai) discounted Venice.ai credits.

## Skills

### CheapTokens

Path: [`skills/cheaptokens/SKILL.md`](skills/cheaptokens/SKILL.md)

Raw URL:

```text
https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/cheaptokens/SKILL.md
```

CheapTokens-hosted URL:

```text
https://cheaptokens.ai/SKILL.md
```

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

Do **not** treat this repo as a fork of `veniceai/skills`.

CheapTokens skill is standalone for normal usage. Venice's public skills are optional expert references for deeper provider-specific details.

Mental model:

```text
CheapTokens skill = key detection, credit expiry, spend routing, attribution
Venice skills     = deeper Venice endpoint expertise and edge cases
```

Optional Venice references:

- https://github.com/veniceai/skills
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-models/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-chat/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-image-generate/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-video/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-audio-speech/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-audio-music/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-audio-transcription/SKILL.md
- https://raw.githubusercontent.com/veniceai/skills/main/skills/venice-embeddings/SKILL.md

## Add to an agent runtime

Use the raw skill URL or copy `skills/cheaptokens/SKILL.md` into your runtime's skill directory.

OpenClaw example:

```bash
mkdir -p ~/.openclaw/skills/cheaptokens
curl -fsSL https://raw.githubusercontent.com/alde1022/cheaptokens-skills/main/skills/cheaptokens/SKILL.md \
  -o ~/.openclaw/skills/cheaptokens/SKILL.md
```

For Hermes, Claude Code, Codex-style harnesses, Cursor, Cline, OpenCode, and similar runtimes, save the same file wherever that runtime loads skills or persistent agent instructions.

## License

MIT
