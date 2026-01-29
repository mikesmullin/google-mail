import { loadAllEmails, saveEmail } from '../lib/storage.mjs';
import { getGmailClient, hasCredentials, getCredentialsPath } from '../lib/client.mjs';
import { colorize, colors, getShortId } from '../lib/utils.mjs';
import { getPendingMutations } from './plan.mjs';

function printUsage() {
    console.log(`
Usage: google-email apply [options]

Apply all pending mutations to Gmail.
This syncs your offline changes to the remote server.

Options:
  --dry-run    Show what would be done without making changes
  --help       Show this help

Examples:
  google-email apply
  google-email apply --dry-run
`);
}

/**
 * Get or create a label by name
 */
async function getOrCreateLabel(gmail, labelName) {
    const response = await gmail.users.labels.list({ userId: 'me' });
    const labels = response.data.labels || [];

    const existing = labels.find((l) => l.name === labelName);
    if (existing) {
        return existing.id;
    }

    const createResponse = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
        },
    });

    return createResponse.data.id;
}

/**
 * Apply a single mutation to Gmail
 */
async function applyMutation(gmail, email, mutation) {
    const messageId = email.id; // Gmail message ID

    switch (mutation.type) {
        case 'read':
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['UNREAD'],
                },
            });
            break;

        case 'unread':
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    addLabelIds: ['UNREAD'],
                },
            });
            break;

        case 'archive':
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['INBOX'],
                },
            });
            break;

        case 'move':
            const labelId = await getOrCreateLabel(gmail, mutation.folder);
            await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    addLabelIds: [labelId],
                    removeLabelIds: ['INBOX'],
                },
            });
            break;

        case 'delete':
            await gmail.users.messages.trash({
                userId: 'me',
                id: messageId,
            });
            break;

        default:
            throw new Error(`Unknown mutation type: ${mutation.type}`);
    }
}

/**
 * Clear applied mutations from offline state
 */
function clearMutations(email, mutations) {
    if (!email.offline) return;

    for (const mutation of mutations) {
        switch (mutation.type) {
            case 'read':
                delete email.offline.read;
                delete email.offline.readQueuedAt;
                break;
            case 'unread':
                delete email.offline.unread;
                delete email.offline.unreadQueuedAt;
                break;
            case 'archive':
                delete email.offline.archive;
                delete email.offline.archiveQueuedAt;
                break;
            case 'move':
                delete email.offline.move;
                delete email.offline.moveQueuedAt;
                break;
            case 'delete':
                delete email.offline.delete;
                delete email.offline.deleteQueuedAt;
                break;
        }
    }

    // Mark as synced
    email.offline.syncedAt = new Date().toISOString();

    // Clean up empty offline object
    const keys = Object.keys(email.offline).filter(k => k !== 'syncedAt');
    if (keys.length === 0) {
        delete email.offline;
    }
}

export default async function applyCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const dryRun = args.includes('--dry-run');

    // Check for credentials
    if (!dryRun && !(await hasCredentials())) {
        console.error(`Error: Gmail credentials not found.`);
        console.error(`Please download credentials.json from Google Cloud Console`);
        console.error(`and place it at: ${getCredentialsPath()}`);
        process.exit(1);
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
        console.log(`\n${colorize('✓', colors.green)} No pending mutations to apply.`);
        return;
    }

    const totalMutations = pending.reduce((sum, p) => sum + p.mutations.length, 0);

    if (dryRun) {
        console.log(`\n${colorize('Dry run:', colors.yellow)} Would apply ${totalMutations} action(s) to ${pending.length} email(s):\n`);
    } else {
        console.log(`\n${colorize('Applying', colors.bright)} ${totalMutations} action(s) to ${pending.length} email(s)...\n`);
    }

    let gmail = null;
    if (!dryRun) {
        gmail = await getGmailClient();
    }

    let successCount = 0;
    let errorCount = 0;

    for (const { id, email, mutations } of pending) {
        const shortId = colorize(getShortId(id), colors.cyan);
        const subject = email.subject || '(No Subject)';
        const truncatedSubject = subject.length > 40 ? subject.substring(0, 37) + '...' : subject;

        for (const mutation of mutations) {
            const actionDesc = formatAction(mutation);

            if (dryRun) {
                console.log(`  ${shortId}\t${actionDesc}\t${truncatedSubject}`);
                successCount++;
            } else {
                try {
                    await applyMutation(gmail, email, mutation);
                    console.log(`  ${colorize('✓', colors.green)} ${shortId}\t${actionDesc}`);
                    successCount++;
                } catch (error) {
                    console.log(`  ${colorize('✗', colors.red)} ${shortId}\t${actionDesc}\t${error.message}`);
                    errorCount++;
                }
            }
        }

        // Clear mutations and save if not dry run and all succeeded
        if (!dryRun && errorCount === 0) {
            clearMutations(email, mutations);
            await saveEmail(id, email);
        }
    }

    console.log();

    if (dryRun) {
        console.log(`${colorize('Dry run complete.', colors.yellow)} Run without --dry-run to apply changes.`);
    } else if (errorCount === 0) {
        console.log(`${colorize('✓', colors.green)} Successfully applied ${successCount} action(s).`);
    } else {
        console.log(`${colorize('⚠', colors.yellow)} Applied ${successCount} action(s), ${errorCount} failed.`);
    }
}

function formatAction(mutation) {
    switch (mutation.type) {
        case 'read':
            return 'mark read';
        case 'unread':
            return 'mark unread';
        case 'archive':
            return 'archive';
        case 'move':
            return `move → ${mutation.folder}`;
        case 'delete':
            return 'delete';
        default:
            return mutation.type;
    }
}
