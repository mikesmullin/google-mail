# Google Email

Gmail CLI for email management.

## Features

- **Email Management**: Read, search, and process inbox emails
- **ETL to Markdown**: Extract unread emails to a flat-file Markdown database with YAML front matter

## Prerequisites

- Bun runtime (v1.0+)
- Google Cloud Project with Gmail API enabled
- OAuth 2.0 credentials (credentials.json)

## Installation

1. Install deps
```bash
bun install
```

2. Set up Google Cloud credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable Gmail API
   - Create OAuth 2.0 credentials (Desktop app type)
   - Download as `credentials.json` and place in project root

## Authentication

On first use, you'll be prompted to authorize via OAuth 2.0. The tool will:
1. Display an authorization URL
2. Ask you to paste the authorization code
3. Store the refresh token in `token.json` for future use

Required scopes:
- `https://www.googleapis.com/auth/gmail.modify` - Read and modify emails

## Usage

### Pull & Store Emails (ETL)
Fetch unread emails since a given date and store as Markdown files in `storage/`:

```bash
# Fetch emails from the last 7 days
bun google-email.mjs pull --since "7 days ago"

# Fetch emails since yesterday
bun google-email.mjs pull --since yesterday

# Fetch emails since a specific date (YYYY-MM-DD)
bun google-email.mjs pull --since 2026-01-01
```

#### Pull Script Details

- **Fetches**: All unread emails received on or after the specified date
- **Ordering**: Newest to oldest (most recent first)
- **Pagination**: Automatically handles pagination
- **Storage**: Each email is saved as a Markdown file under `storage/<id>.md` where `id` is a SHA1 hash of the Gmail message ID
- **Deduplication**: Files are never overwritten; re-running the script skips existing files
- **Content**: Emails are stored as Markdown with YAML frontmatter:
  - **Frontmatter**: Email metadata (id, from, recipients, timestamps, etc.)
  - **Body**: Email body stored as a code block (HTML or Text)
  - Custom fields: `_stored_id` (SHA1 hash) and `_stored_at` (storage timestamp)

#### Date Format Examples

- `YYYY-MM-DD` - Exact date at midnight UTC (e.g., `2026-01-01`)
- `yesterday` - Yesterday at midnight UTC
- `N days ago` - N days before now at midnight UTC (e.g., `"7 days ago"`, `"1 days ago"`)

## Offline CLI - Markdown Database

After pulling emails to storage, use the `google-email` command to query and manage the offline database. This command works entirely offline without connecting to Gmail.

### Setup

Link the binary globally:
```bash
cd /path/to/google-email
bun link
```

Then use from anywhere:
```bash
google-email inbox summary
google-email inbox list --limit 20
google-email inbox view f86bca
google-email inbox read f86bca
google-email inbox unread f86bca
```

### ID Matching (Git-style)

All commands accepting an `<id>` parameter support partial ID matching like Git:

```bash
# Full ID
google-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b

# Short ID (first 6 chars)
google-email inbox view 6498ce

# Any prefix
google-email inbox view 6498cec18d67

# Filename format
google-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b.md
```

As long as the prefix is unique, it will match the email. If ambiguous, you'll get an error with all matching IDs.

### Commands

#### `google-email inbox summary`
Show email counts by folder (unread, read, total).

```bash
google-email inbox summary
```

Output:
```
Folder Summary:
===============
Inbox:
  Unread: 46
  Read:   1
  Total:  47

Overall:
  Unread: 46
  Read:   1
  Total:  47
```

#### `google-email inbox list`
List unread emails from storage (newest first). Omits emails marked `offline.read: true` unless `--all` is passed.

Options:
- `-l, --limit <n>` - Maximum emails to show (default: 10)
- `--since <date>` - Only show emails after this date (same formats as pull script)
- `-a, --all` - Include read emails (marked `offline.read: true`)

Examples:
```bash
# Show 20 unread emails (default newest first)
google-email inbox list --limit 20

# Show emails from yesterday
google-email inbox list --since yesterday --limit 10

# Show all emails including read ones
google-email inbox list --all --limit 50

# Show emails from specific date
google-email inbox list --since 2026-01-01
```

Output format: `<short_id> / <relative_date> / <sender_name> <sender_email>`
```
Showing 3 of 46 emails:

f86bca / Today 10:00 / Science Operations <ScienceOperations@company.com>
Science record review request

cda64a / Today 9:46 / Alice Johnson <alice@company.com>
Re: [team] Project update (PR #537)

8fb5bf / Today 9:01 / U.S. Payroll <payroll@company.com>
Payroll for 2026

... and 43 more
```

#### `google-email inbox view <id>`
Display a single email (print full YAML). Supports partial ID matching.

```bash
# Full ID
google-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b

# Short ID
google-email inbox view 6498ce
```

#### `google-email inbox read <id>`
Mark an email as read (offline only, updates Markdown file). Adds `offline.read: true` and `offline.readAt` timestamp.

```bash
google-email inbox read 6498ce
```

Output:
```
✓ Marked as read: 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  [Admin] - Password Reset
```

#### `google-email inbox unread <id>`
Mark an email as unread (offline only, removes `offline.read` from file).

```bash
google-email inbox unread 6498ce
```

Output:
```
✓ Marked as unread: 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  [Admin] - Password Reset
```

### Offline Metadata

Custom metadata is stored in each Markdown file under the `offline` key in YAML front matter:
```yaml
offline:
  read: true              # Whether marked as read offline
  readAt: '2026-01-05T...' # Timestamp when marked as read
```

## Troubleshooting

### Authentication Issues
1. Ensure `credentials.json` exists in project root
2. Delete `token.json` and re-authenticate
3. Check that Gmail API is enabled in your Google Cloud project

## Security Notes

- OAuth tokens are cached locally in `token.json` (auto-generated)
- Never commit `token.json` or `credentials.json` to version control
- Storage directory contains full email content
  - Consider using git to version control `storage/` dir with daily snapshot cadence
