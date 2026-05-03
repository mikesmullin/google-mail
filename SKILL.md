---
name: google-email
description: interact w/ Google Gmail inbox
---

# Google Email Skill

Canonical operational reference for this CLI.

## Global Behavior

Global flag (works with all commands):

```bash
google-email <command> ... --yaml
```

`--yaml` returns machine-readable YAML instead of ANSI/human text.

## Exact Command Inputs

Top-level command list:

```bash
google-email inbox summary
google-email inbox list --limit <n>
google-email inbox list --since <date>
google-email inbox list --all
google-email inbox view <id>
google-email inbox read <id>
google-email inbox unread <id>

google-email pull --since <date> [--limit <n>]

google-email move <id> <folder>
google-email archive <id>
google-email delete <id>

google-email plan
google-email apply [--dry-run]

google-email clear <id>
google-email clear --erase <id>

google-email labels
google-email clean
```

Date input formats accepted by `--since`:

```text
YYYY-MM-DD
yesterday
"N days ago"
```

## Exact Output Shapes (Representative)

### 1) `google-email inbox summary`

Human output:

```text
Folder Summary:
===============
Inbox:
  Unread: 219
  Read:   2
  Total:  221

Overall:
  Unread: 219
  Read:   2
  Total:  221
```

YAML output (`google-email inbox summary --yaml`):

```yaml
ok: true
folders:
  Inbox:
    unread: 219
    read: 2
    total: 221
overall:
  unread: 219
  read: 2
  total: 221
```

### 2) `google-email inbox list --limit 1`

Human output:

```text
📚 219 unread messages in cache (showing 1):

  1.	9016ec	 1h	Coinbase <info@mail.coinbase.com>	How to stay on top of the market
```

YAML output (`google-email inbox list --limit 1 --yaml`):

```yaml
ok: true
total: 219
showing: 1
limit: 1
includeRead: false
since: null
label: unread messages
emails:
  - index: 1
    id: 9016ec1f8ffd4077abb3443d0be5935139e0ff54
    shortId: 9016ec
    receivedDateTime: '2026-04-25T15:46:14.000Z'
    age: 1h
    sender: Coinbase <info@mail.coinbase.com>
    subject: How to stay on top of the market
    isRead: false
    hasPendingRemoval: false
```

### 3) `google-email inbox view <id>`

Input examples:

```bash
google-email inbox view 55e807
google-email inbox view 55e807b469aafdf0408fe39ead019b311d9d4cde
google-email inbox view 55e807b469aafdf0408fe39ead019b311d9d4cde.md
```

Output: YAML document of the email object (full metadata + body).

### 4) Queue state commands

Read:

```bash
google-email inbox read <id>
```

Human output:

```text
✓ Queued mark as read: <full-id>
  <subject>

  Run 'google-email plan' to review, 'google-email apply' to execute.
```

YAML output:

```yaml
ok: true
status: queued
action: read
id: <full-id>
subject: <subject>
```

Unread:

```bash
google-email inbox unread <id>
```

YAML output shape:

```yaml
ok: true
status: queued
action: unread
id: <full-id>
subject: <subject>
```

### 5) Queue mutation commands

Move:

```bash
google-email move <id> <folder>
```

YAML output:

```yaml
ok: true
status: queued
action: move
id: <full-id>
folder: <folder>
subject: <subject>
```

Archive:

```bash
google-email archive <id>
```

YAML output:

```yaml
ok: true
status: queued
action: archive
id: <full-id>
subject: <subject>
```

Delete:

```bash
google-email delete <id>
```

YAML output:

```yaml
ok: true
status: queued
action: delete
id: <full-id>
subject: <subject>
```

### 6) `google-email plan`

Human output:

```text
📋 2 email(s) with pending mutations:

  55e807	Utah drivers:
    → mark as read

Plan: 2 action(s) on 2 email(s)

Run 'google-email apply' to execute these changes on Gmail.
```

YAML output (`google-email plan --yaml`):

```yaml
ok: true
pendingEmails: 2
totalActions: 2
pending:
  - id: 55e807b469aafdf0408fe39ead019b311d9d4cde
    shortId: '55e807'
    subject: 'Utah drivers:'
    mutations:
      - type: read
```

### 7) `google-email apply [--dry-run]`

Human dry-run output:

```text
Dry run: Would apply 2 action(s) to 2 email(s):
  55e807	mark read	Utah drivers:
Dry run complete. Run without --dry-run to apply changes.
```

YAML output (`google-email apply --dry-run --yaml`):

```yaml
ok: true
dryRun: true
pendingEmails: 2
totalActions: 2
successCount: 2
errorCount: 0
results:
  - id: 55e807b469aafdf0408fe39ead019b311d9d4cde
    shortId: '55e807'
    subject: 'Utah drivers:'
    action: mark read
    status: planned
```

Successful non-dry-run YAML shape:

```yaml
ok: true
dryRun: false
pendingEmails: <n>
totalActions: <n>
successCount: <n>
errorCount: 0
results:
  - id: <full-id>
    shortId: <short-id>
    subject: <subject>
    action: <action>
    status: applied
```

### 8) `google-email pull --since <date> [--limit <n>]`

Human output (representative):

```text
Fetching unread emails since: 2026-04-18
Processing limit: 1
Found 126 unread emails.
⊘ Skipped (exists): (9016ec+How to stay on top of the market)

Summary:
  Available:  126
  Processed:  1
  Written:    0
  Skipped:    1
```

YAML output (`google-email pull --since "7 days ago" --limit 1 --yaml`):

```yaml
ok: true
since: '2026-04-18T00:00:00.000Z'
limit: 1
available: 126
processed: 1
written: 0
updated: 0
skipped: 1
remoteChanges: 0
results:
  - id: 9016ec1f8ffd4077abb3443d0be5935139e0ff54
    shortId: 9016ec
    subject: How to stay on top of the market
    status: skipped  # 'written' | 'updated' | 'skipped'
    transitions: []   # populated when status = 'updated'
gone: []             # list of {id, subject, transitions} for emails gone from unread inbox
```

Transition object shape (appears in `results[].transitions`, `gone[].transitions`,
and stored in `email.offline.transitions[]` inside each cached `.md` file):

```yaml
type: <string>       # see types below
from: [<labelId>, …] # label set before this pull
to:   [<labelId>, …] # label set after this pull
added:   [<labelId>, …]
removed: [<labelId>, …]
detectedAt: '<ISO-8601>'
```

**One example per transition type:**

`new` — email first written to local cache (no `from` state):

```yaml
# Not a transition entry — status: 'written' in the pull result.
# Indicates the email did not exist locally before this pull.
# No entry is appended to offline.transitions for this case.
```

`read` — email was marked read remotely (UNREAD label disappeared):

```yaml
type: read
from: [UNREAD, INBOX, CATEGORY_UPDATES]
to:   [INBOX, CATEGORY_UPDATES]
added: []
removed: [UNREAD]
detectedAt: '2026-05-02T10:00:00.000Z'
```

`unread` — email was marked unread remotely (UNREAD label re-appeared):

```yaml
type: unread
from: [INBOX, CATEGORY_UPDATES]
to:   [UNREAD, INBOX, CATEGORY_UPDATES]
added: [UNREAD]
removed: []
detectedAt: '2026-05-02T10:00:00.000Z'
```

`archived` — email removed from INBOX (archived in Gmail):

```yaml
type: archived
from: [UNREAD, INBOX, CATEGORY_UPDATES]
to:   [UNREAD, CATEGORY_UPDATES]
added: []
removed: [INBOX]
detectedAt: '2026-05-02T10:00:00.000Z'
```

`deleted` — email moved to trash (TRASH label added) or permanently deleted (404):

```yaml
# Trashed via Gmail UI
type: deleted
from: [UNREAD, INBOX]
to:   [TRASH]
added: [TRASH]
removed: [UNREAD, INBOX]
detectedAt: '2026-05-02T10:00:00.000Z'

# Permanently deleted (Gmail API returned 404)
type: deleted
from: [UNREAD, INBOX]
to:   []
added: []
removed: [UNREAD, INBOX]
detectedAt: '2026-05-02T10:00:00.000Z'
```

`labels_changed` — any other label change that doesn't match the above patterns
(e.g. user label added/removed, moved between categories):

```yaml
type: labels_changed
from: [UNREAD, INBOX, CATEGORY_UPDATES]
to:   [UNREAD, INBOX, Label_12345678]
added: [Label_12345678]
removed: [CATEGORY_UPDATES]
detectedAt: '2026-05-02T10:00:00.000Z'
```

Transitions accumulate across pulls — they are appended to `offline.transitions[]`,
never overwritten. The full history is visible via `google-email inbox view <id> --yaml`.

Human output fields added to summary:

```text
  Updated:        <n>   # emails with detected remote label changes
  Remote changes: <n>   # emails gone from unread inbox (probed via Gmail API)
```

### 9) `google-email clear [--erase] <id>`

Clear pending (unapplied) offline mutations for a specific email. Preserves
remote-state transition history (`offline.transitions`).

```bash
google-email clear <id>          # wipe queued mutations
google-email clear --erase <id>  # delete local cache file entirely
```

Human output (mutations cleared):

```text
✓ Cleared 2 pending mutation(s) for: <full-id>
  <subject>
  Cleared: delete, archive
```

YAML output (`google-email clear <id> --yaml`):

```yaml
ok: true
status: cleared        # or 'noop' | 'erased'
id: <full-id>
subject: <subject>
cleared:               # omitted on 'erased'
  - delete
  - archive
```

`--erase` YAML output:

```yaml
ok: true
status: erased
id: <full-id>
subject: <subject>
```

### 10) `google-email labels`

Human output (representative):

```text
🏷️  18 label(s)

  INBOX (system) unread:10 total:200
  Personal (user) unread:2 total:40
```

YAML output (`google-email labels --yaml`):

```yaml
ok: true
total: 18
labels:
  - id: INBOX
    name: INBOX
    type: system
    messageListVisibility: show
    labelListVisibility: labelShow
    messagesTotal: 200
    messagesUnread: 10
    threadsTotal: 120
    threadsUnread: 7
```

### 11) `google-email clean`

Human output:

```text
✓ Deleted 221 cached email file(s) from storage/.
```

YAML output (`google-email clean --yaml`):

```yaml
ok: true
deleted: 221
storageDir: /workspace/cli/google-email/storage
```

No-op human output when empty:

```text
⊘ No cached email files found in storage/.
```

## Error Output Patterns

Missing credentials (YAML mode):

```yaml
ok: false
error:
  code: MISSING_CREDENTIALS
  message: Gmail credentials not found. Please download credentials.json from Google Cloud Console and place it at: <path>
```

Common YAML error codes by command:

- `pull`: `INVALID_ARGUMENTS`, `MISSING_CREDENTIALS`, `PULL_FAILED`
- `labels`: `MISSING_CREDENTIALS`, `LIST_LABELS_FAILED`
- `clean`: `READ_STORAGE_FAILED`
- ID-based commands: `EMAIL_NOT_FOUND`
- `clear`: `MISSING_ID`, `EMAIL_NOT_FOUND`

## Operational Notes

- `inbox read/unread`, `move`, `archive`, `delete` queue local mutations.
- `plan` shows queued mutations.
- `apply` pushes queued mutations to Gmail.
- `clear <id>` rolls back queued mutations without applying them. Use `--erase` to remove the cached file entirely.
- `inbox list` unread mode hides items with pending removal (`delete/archive/move`) and local read state.
- Partial ID matching is supported for all ID-based commands.
- `pull` now detects remote label changes on every execution:
  - For emails returned by the query: label diffs vs. cached copy → stored in `email.offline.transitions`.
  - For cached emails within the pull window not returned by the query: probed via `messages.get(minimal)` to detect read/archive/delete → stored in `email.offline.transitions`.
  - Transitions accumulate across pulls — they are never overwritten, only appended.
