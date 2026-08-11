---
name: minimax-image
description: Use when the user asks to generate an image, illustration, icon, hero art, sprite, or thumbnail via MiniMax, or when they want a one-shot text-to-image call without standing up a separate image pipeline.
---

# minimax-image

One-shot MiniMax text-to-image. Calls `POST /v1/image_generation` on
`https://api.minimaxi.com` with `Authorization: Bearer ${MINIMAX_API_KEY}`,
then writes the resulting image(s) to caller-supplied paths.

## When to use

- User asks for an image, illustration, icon, hero art, sprite,
  thumbnail, or mockup via MiniMax.
- User wants `n` variants of the same prompt for selection.
- DO NOT use for image editing, inpainting, or upscaling — those are
  different MiniMax endpoints not wrapped here.

## When NOT to use

- Edit / inpaint / outpaint an existing image.
- Reference-image conditioning — needs the file-upload endpoint.

## Recipe

Required: `--prompt`, and either `--out` (when `--n 1`) or `--out-dir`
(when `--n > 1`).

Optional + defaults:

| flag | default | notes |
|---|---|---|
| `--model` | `image-01` | |
| `--aspect_ratio` | `1:1` | `1:1` / `16:9` / `9:16` / `4:3` / `3:4` |
| `--n` | `1` | 1 – 4; `>1` requires `--out-dir` |
| `--response_format` | `base64` | or `url` (then 2 HTTP calls) |
| `--ext` | `png` | only used when `--n > 1`. **Note**: the current `image-01` model returns JPEG bytes regardless of this extension — name the file `.jpg` / `.jpeg` to match reality, or convert after the fact. |
| `--mkdir` | off | create parent / out-dir if missing |

Invocation (single image):

```bash
bash Panda/.claude/skills/minimax-image/bin/image.sh \
  --prompt "a cute panda reading a math book" \
  --aspect_ratio 16:9 \
  --out /abs/path/panda.png
```

Invocation (3 variants into a directory):

```bash
bash Panda/.claude/skills/minimax-image/bin/image.sh \
  --prompt "a cute panda reading a math book" \
  --n 3 \
  --out-dir /abs/path/panda-variants \
  --mkdir
```

Output filenames for `--n > 1`:
`<out-dir>/out-001.png`, `<out-dir>/out-002.png`, `<out-dir>/out-003.png`.

Success: `OK <bytes> bytes → <path>` (one line per image).
Failure: `ERROR <http_code>: <body>` (Authorization always stripped).

## Constraints (read before invoking)

1. **API key**: must be set in env as `MINIMAX_API_KEY`. If the user
   pastes a key in chat, do NOT echo it back and do NOT write it to
   `.env` for them — tell them to `export MINIMAX_API_KEY=...`
   themselves. Never include the key in the request body or URL.
2. **Output path**: the caller (you) must supply an absolute `--out`
   or `--out-dir` path. The script refuses to write to a directory,
   follow a symlink, or auto-create parents unless `--mkdir` is set.
3. **n=1 vs n>1**: you must pick one mode. `--n 1` + `--out-dir` is
   rejected; `--n 3` + `--out` is rejected.
4. **What you may do**: change prompt, model, aspect_ratio, n,
   response_format, ext, mkdir.
5. **What you must NOT do**: edit `MINIMAX_API_KEY`, edit the script
   silently, or invoke the API more than once per user request unless
   the user explicitly asked for multiple takes.
6. **Errors**: any `Authorization` / `Bearer` line in an error message
   is stripped before printing — do not re-introduce the key when
   reporting failures back to the user.
