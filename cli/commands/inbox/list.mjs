import { loadAllEmails, isEmailRead } from '../../lib/storage.mjs';
import {
    colorize,
    colors,
    formatSender,
    getShortId,
    parseDate,
} from '../../lib/utils.mjs';

const DEFAULT_LIMIT = 10;

function printUsage() {
    console.log(`
Usage: google-email inbox list [options]

List unread emails from storage (newest first).

Options:
  -l, --limit <n>    Maximum emails to list (default: ${DEFAULT_LIMIT})
  --since <date>     Only show emails after this date
                     Formats: YYYY-MM-DD, yesterday, "N days ago"
  -a, --all          Include read emails (marked offline.read: true)
  --help             Show this help

Examples:
  google-email inbox list
  google-email inbox list --limit 20
  google-email inbox list --since 2026-01-01
  google-email inbox list --since yesterday --all
`);
}

function parseArgs(args) {
    let limit = DEFAULT_LIMIT;
    let sinceDate = null;
    let includeRead = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-l' || args[i] === '--limit') {
            if (i + 1 < args.length) {
                limit = parseInt(args[i + 1], 10);
                if (isNaN(limit) || limit <= 0) {
                    throw new Error('--limit must be a positive number');
                }
                i++;
            }
        } else if (args[i] === '--since') {
            if (i + 1 < args.length) {
                sinceDate = parseDate(args[i + 1]);
                i++;
            }
        } else if (args[i] === '-a' || args[i] === '--all') {
            includeRead = true;
        }
    }

    return { limit, sinceDate, includeRead };
}

/**
 * Check if email has pending mutations that would remove it from inbox
 */
function hasPendingRemoval(email) {
    const offline = email.offline || {};
    return offline.delete === true || offline.archive === true || !!offline.move;
}

function filterEmails(emails, sinceDate, includeRead) {
    let filtered = emails.filter(({ email }) => {
        if (includeRead) return true;
        // Hide read emails and those queued for removal
        return !isEmailRead(email) && !hasPendingRemoval(email);
    });

    if (sinceDate) {
        filtered = filtered.filter(({ email }) => {
            const receivedDate = new Date(email.receivedDateTime);
            return receivedDate >= sinceDate;
        });
    }

    return filtered;
}

function sortEmailsByDate(emails) {
    return emails.sort(({ email: a }, { email: b }) => {
        const dateA = new Date(a.receivedDateTime);
        const dateB = new Date(b.receivedDateTime);
        return dateB - dateA;
    });
}

/**
 * Format age as compact string (e.g., "2h", "1d", "3w", "2mo")
 */
function formatAge(isoDateString) {
    const date = new Date(isoDateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMins < 60) {
        return `${diffMins}m`;
    } else if (diffHours < 24) {
        return `${diffHours}h`;
    } else if (diffDays < 7) {
        return `${diffDays}d`;
    } else if (diffWeeks < 5) {
        return `${diffWeeks}w`;
    } else {
        return `${diffMonths}mo`;
    }
}

/**
 * Truncate string to max length with ellipsis
 */
function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 3) + '...';
}

function printEmail(index, id, email) {
    const num = String(index + 1).padStart(3);
    const shortId = getShortId(id);
    const age = formatAge(email.receivedDateTime).padStart(3);
    const sender = formatSender(email);
    const subject = email.subject || '(No Subject)';

    // Calculate available width for subject (assuming ~100 char terminal)
    const truncatedSubject = truncate(subject, 50);

    const numColorized = colorize(num, colors.dim);
    const idColorized = colorize(shortId, colors.cyan);
    const ageColorized = colorize(age, colors.magenta);
    const senderColorized = colorize(sender, colors.blue);
    const subjectColorized = colorize(truncatedSubject, colors.bright);

    console.log(`${numColorized}.\t${idColorized}\t${ageColorized}\t${senderColorized}\t${subjectColorized}`);
}

export default async function listCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const { limit, sinceDate, includeRead } = parseArgs(args);

    let emails = await loadAllEmails();
    emails = filterEmails(emails, sinceDate, includeRead);
    emails = sortEmailsByDate(emails);

    if (emails.length === 0) {
        console.log('No emails found.');
        return;
    }

    const showing = Math.min(limit, emails.length);
    const label = includeRead ? 'messages' : 'unread messages';
    console.log(`\n📚 ${emails.length} ${label} in cache (showing ${showing}):\n`);

    for (let i = 0; i < showing; i++) {
        const { id, email } = emails[i];
        printEmail(i, id, email);
    }
}
