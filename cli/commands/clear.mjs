import fs from 'fs/promises';
import path from 'path';
import { saveEmail, getStorageDir } from '../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../lib/utils.mjs';
import { isYamlOutput, printYaml } from '../lib/output.mjs';
import { getPendingMutations } from './plan.mjs';

// Keys in email.offline that represent queued mutations (not observations)
const MUTATION_KEYS = [
    'read', 'readQueuedAt',
    'unread', 'unreadQueuedAt',
    'archive', 'archiveQueuedAt',
    'move', 'moveQueuedAt',
    'delete', 'deleteQueuedAt',
];

function printUsage() {
    console.log(`
Usage: google-email clear [--erase] <id>

Clear pending (unapplied) offline mutations for a specific email.
Preserves remote-state observations (transitions, detectedAt history).

Arguments:
  <id>      Email hash ID, partial ID, or filename

Options:
  --erase   Delete the local cache file entirely instead of just clearing mutations
  --help    Show this help message

Examples:
  google-email clear f86bca
  google-email clear --erase f86bca
`);
}

export default async function clearCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    let erase = false;
    const filteredArgs = args.filter((a) => {
        if (a === '--erase') { erase = true; return false; }
        return true;
    });

    const partialId = filteredArgs[0];
    if (!partialId) {
        if (isYamlOutput()) {
            printYaml({ ok: false, error: { code: 'MISSING_ID', message: '<id> argument is required' } });
        } else {
            console.error(`Error: <id> argument is required`);
            printUsage();
        }
        process.exit(1);
    }

    const result = await findEmailById(partialId);

    if (!result) {
        if (isYamlOutput()) {
            printYaml({ ok: false, error: { code: 'EMAIL_NOT_FOUND', id: partialId } });
        } else {
            console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
        }
        process.exit(1);
    }

    const { id, email } = result;
    const subject = email.subject || '(No Subject)';

    if (erase) {
        const filePath = path.join(getStorageDir(), `${id}.md`);
        await fs.unlink(filePath);

        if (isYamlOutput()) {
            printYaml({ ok: true, status: 'erased', id, subject });
        } else {
            console.log(`${colorize('✓', colors.green)} Erased local cache: ${id}`);
            console.log(`  ${subject}`);
        }
        return;
    }

    // Collect what was cleared for reporting
    const cleared = getPendingMutations(email);

    if (cleared.length === 0) {
        if (isYamlOutput()) {
            printYaml({ ok: true, status: 'noop', id, subject, message: 'No pending mutations to clear' });
        } else {
            console.log(`${colorize('⊘', colors.yellow)} No pending mutations for: ${id}`);
        }
        return;
    }

    // Strip all mutation keys from email.offline, preserve everything else (e.g. transitions)
    if (email.offline) {
        for (const key of MUTATION_KEYS) {
            delete email.offline[key];
        }
    }

    await saveEmail(id, email);

    if (isYamlOutput()) {
        printYaml({
            ok: true,
            status: 'cleared',
            id,
            subject,
            cleared: cleared.map((m) => m.type),
        });
    } else {
        console.log(`${colorize('✓', colors.green)} Cleared ${cleared.length} pending mutation(s) for: ${id}`);
        console.log(`  ${subject}`);
        console.log(`  Cleared: ${cleared.map((m) => m.type).join(', ')}`);
    }
}
