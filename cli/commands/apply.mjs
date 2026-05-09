import { loadAllEmails, saveEmail } from '../lib/storage.mjs';
import { getGmailClient, hasCredentials, getCredentialsPath } from '../lib/client.mjs';
import { colorize, colors, getShortId, findEmailById } from '../lib/utils.mjs';
import { getPendingMutations } from './plan.mjs';
import { isYamlOutput, printYaml } from '../lib/output.mjs';
import { fetchEmailById } from './pull/fetch.mjs';

function printUsage() {
    console.log(`
Usage: google-email apply [id] [options]

Apply pending mutations to Gmail.
This syncs your offline changes to the remote server.

Arguments:
  [id]         Optional email hash ID or partial ID to apply only that email

Options:
  --dry-run    Show what would be done without making changes
  --help       Show this help

Examples:
  google-email apply
  google-email apply f86bca
  google-email apply --dry-run
  google-email apply f86bca --dry-run
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
                // Keep local read state so the message remains handled after sync.
                email.offline.read = true;
                delete email.offline.readQueuedAt;

                // Reconcile canonical fields for local cache consistency.
                email.isRead = true;
                if (Array.isArray(email.labelIds)) {
                    email.labelIds = email.labelIds.filter((label) => label !== 'UNREAD');
                }
                break;
            case 'unread':
                delete email.offline.unread;
                delete email.offline.unreadQueuedAt;

                // Mark local state as unread after successful sync.
                delete email.offline.read;
                delete email.offline.readQueuedAt;
                email.isRead = false;
                if (Array.isArray(email.labelIds) && !email.labelIds.includes('UNREAD')) {
                    email.labelIds.push('UNREAD');
                }
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
    const partialId = args.find((a) => !a.startsWith('-'));

    // Check for credentials
    if (!dryRun && !(await hasCredentials())) {
        const message = `Gmail credentials not found. Please download credentials.json from Google Cloud Console and place it at: ${getCredentialsPath()}`;
        if (isYamlOutput()) {
            printYaml({
                ok: false,
                error: {
                    code: 'MISSING_CREDENTIALS',
                    message,
                },
            });
        } else {
            console.error(`Error: Gmail credentials not found.`);
            console.error(`Please download credentials.json from Google Cloud Console`);
            console.error(`and place it at: ${getCredentialsPath()}`);
        }
        process.exit(1);
    }

    let emailEntries;
    if (partialId) {
        const result = await findEmailById(partialId);
        if (!result) {
            if (isYamlOutput()) {
                printYaml({ ok: false, error: { code: 'EMAIL_NOT_FOUND', id: partialId } });
            } else {
                console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
            }
            process.exit(1);
        }
        emailEntries = [result];
    } else {
        emailEntries = await loadAllEmails();
    }

    const pending = [];

    for (const { id, email } of emailEntries) {
        const mutations = getPendingMutations(email);
        if (mutations.length > 0) {
            pending.push({ id, email, mutations });
        }
    }

    if (pending.length === 0) {
        if (isYamlOutput()) {
            printYaml({
                ok: true,
                dryRun,
                pendingEmails: 0,
                totalActions: 0,
                successCount: 0,
                errorCount: 0,
                results: [],
            });
        } else {
            console.log(`\n${colorize('✓', colors.green)} No pending mutations to apply.`);
        }
        return;
    }

    const totalMutations = pending.reduce((sum, p) => sum + p.mutations.length, 0);

    if (!isYamlOutput()) {
        if (dryRun) {
            console.log(`\n${colorize('Dry run:', colors.yellow)} Would apply ${totalMutations} action(s) to ${pending.length} email(s):\n`);
        } else {
            console.log(`\n${colorize('Applying', colors.bright)} ${totalMutations} action(s) to ${pending.length} email(s)...\n`);
        }
    }

    let gmail = null;
    if (!dryRun) {
        gmail = await getGmailClient();
    }

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    for (const { id, email, mutations } of pending) {
        const shortId = colorize(getShortId(id), colors.cyan);
        const subject = email.subject || '(No Subject)';
        const truncatedSubject = subject.length > 40 ? subject.substring(0, 37) + '...' : subject;

        let emailErrorCount = 0;
        for (const mutation of mutations) {
            const actionDesc = formatAction(mutation);
            const resultEntry = {
                id,
                shortId: getShortId(id),
                subject,
                action: actionDesc,
            };

            if (dryRun) {
                if (!isYamlOutput()) {
                    console.log(`  ${shortId}\t${actionDesc}\t${truncatedSubject}`);
                }
                successCount++;
                results.push({ ...resultEntry, status: 'planned' });
            } else {
                try {
                    await applyMutation(gmail, email, mutation);
                    if (!isYamlOutput()) {
                        console.log(`  ${colorize('✓', colors.green)} ${shortId}\t${actionDesc}`);
                    }
                    successCount++;
                    results.push({ ...resultEntry, status: 'applied' });
                } catch (error) {
                    if (!isYamlOutput()) {
                        console.log(`  ${colorize('✗', colors.red)} ${shortId}\t${actionDesc}\t${error.message}`);
                    }
                    emailErrorCount++;
                    errorCount++;
                    results.push({ ...resultEntry, status: 'failed', error: error.message });
                }
            }
        }

        // Re-fetch from Gmail to sync local cache after all mutations applied successfully
        if (!dryRun && emailErrorCount === 0) {
            const fresh = await fetchEmailById(gmail, email.id);
            if (fresh) {
                fresh._stored_id = id;
                fresh._stored_at = email._stored_at;
                await saveEmail(id, fresh);
                if (!isYamlOutput()) {
                    console.log(`  ${colorize('↓', colors.cyan)} ${shortId}\tcache refreshed from remote`);
                }
            }
        }
    }

    if (isYamlOutput()) {
        printYaml({
            ok: errorCount === 0,
            dryRun,
            pendingEmails: pending.length,
            totalActions: totalMutations,
            successCount,
            errorCount,
            results,
        });
    } else {
        console.log();

        if (dryRun) {
            console.log(`${colorize('Dry run complete.', colors.yellow)} Run without --dry-run to apply changes.`);
        } else if (errorCount === 0) {
            console.log(`${colorize('✓', colors.green)} Successfully applied ${successCount} action(s).`);
        } else {
            console.log(`${colorize('⚠', colors.yellow)} Applied ${successCount} action(s), ${errorCount} failed.`);
        }
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
