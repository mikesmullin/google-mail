import { loadAllEmails } from '../lib/storage.mjs';
import { colorize, colors, getShortId } from '../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: google-email plan

Show pending mutations queued for Gmail sync.
These operations will be applied when you run 'google-email apply'.

Examples:
  google-email plan
`);
}

/**
 * Get pending mutations from an email's offline state
 */
function getPendingMutations(email) {
    const mutations = [];
    const offline = email.offline || {};

    if (offline.read === true) {
        mutations.push({ type: 'read', queuedAt: offline.readQueuedAt });
    }

    if (offline.unread === true) {
        mutations.push({ type: 'unread', queuedAt: offline.unreadQueuedAt });
    }

    if (offline.archive === true) {
        mutations.push({ type: 'archive', queuedAt: offline.archiveQueuedAt });
    }

    if (offline.move) {
        mutations.push({ type: 'move', folder: offline.move, queuedAt: offline.moveQueuedAt });
    }

    if (offline.delete === true) {
        mutations.push({ type: 'delete', queuedAt: offline.deleteQueuedAt });
    }

    return mutations;
}

/**
 * Format a mutation for display
 */
function formatMutation(type, details = {}) {
    switch (type) {
        case 'read':
            return colorize('mark as read', colors.blue);
        case 'unread':
            return colorize('mark as unread', colors.blue);
        case 'archive':
            return colorize('archive', colors.yellow);
        case 'move':
            return colorize(`move to "${details.folder}"`, colors.magenta);
        case 'delete':
            return colorize('delete (trash)', colors.red);
        default:
            return type;
    }
}

export default async function planCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const emails = await loadAllEmails();
    const pending = [];

    for (const { id, email } of emails) {
        const mutations = getPendingMutations(email);
        if (mutations.length > 0) {
            pending.push({ id, email, mutations });
        }
    }

    if (pending.length === 0) {
        console.log(`\n${colorize('✓', colors.green)} No pending mutations.`);
        console.log(`  Use 'google-email archive', 'google-email move', or 'google-email delete' to queue changes.`);
        return;
    }

    console.log(`\n📋 ${colorize(`${pending.length} email(s)`, colors.bright)} with pending mutations:\n`);

    for (const { id, email, mutations } of pending) {
        const shortId = colorize(getShortId(id), colors.cyan);
        const subject = email.subject || '(No Subject)';
        const truncatedSubject = subject.length > 50 ? subject.substring(0, 47) + '...' : subject;

        console.log(`  ${shortId}\t${truncatedSubject}`);

        for (const mutation of mutations) {
            const action = formatMutation(mutation.type, mutation);
            console.log(`    → ${action}`);
        }
        console.log();
    }

    const totalMutations = pending.reduce((sum, p) => sum + p.mutations.length, 0);
    console.log(`${colorize('Plan:', colors.bright)} ${totalMutations} action(s) on ${pending.length} email(s)`);
    console.log(`\nRun 'google-email apply' to execute these changes on Gmail.`);
}

export { getPendingMutations };
