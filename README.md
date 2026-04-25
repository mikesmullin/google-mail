# Google Email

`google-email` is a Gmail-oriented CLI that stores emails as local Markdown + YAML for offline processing and scripted automation.

## What It Is For

- Pull unread Gmail messages into a local cache (`storage/`)
- Perform offline triage and queue mutations (read/unread/move/archive/delete)
- Apply queued mutations back to Gmail
- Emit machine-readable YAML output for automation (`--yaml`)

## Installation

1. Install dependencies:

```bash
bun install
```

2. Configure Google Cloud:

- Enable Gmail API for your project
- Create OAuth 2.0 Desktop App credentials
- Save credentials as `credentials.json` in the project root

3. Optional global link:

```bash
bun link
```

## Authentication

On first Gmail-backed command, the CLI starts OAuth flow and stores token data in `token.json`.

Scope used:

- `https://www.googleapis.com/auth/gmail.modify`

## Documentation Split

- `README.md` (this file): high-level overview, purpose, install
- `SKILL.md`: complete operational reference with exact commands and output examples

## Security Notes

- Do not commit `credentials.json` or `token.json`
- `storage/` contains full email content
