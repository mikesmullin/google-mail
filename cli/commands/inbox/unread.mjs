import { saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';
import { isYamlOutput, printYaml } from '../../lib/output.mjs';

function printUsage() {
    console.log(`
Usage: google-email inbox unread <id>

Queue mark-as-unread operation (offline).
The actual Gmail operation is deferred until 'google-email apply'.

Arguments:
  <id>    Email hash ID, partial ID, or filename
          (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  google-email inbox unread f86bca
`);
}

export default async function unreadCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const partialId = args[0];
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

    if (email.offline?.unread === true) {
        if (isYamlOutput()) {
            printYaml({ ok: true, status: 'noop', action: 'unread', id, subject: email.subject || '(No Subject)' });
        } else {
            console.log(`${colorize('⊘', colors.yellow)} Email already queued for unread: ${id}`);
        }
        return;
    }

    if (!email.offline) {
        email.offline = {};
    }

    // Clear any pending read mutation
    delete email.offline.read;
    delete email.offline.readQueuedAt;

    email.offline.unread = true;
    email.offline.unreadQueuedAt = new Date().toISOString();

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    if (isYamlOutput()) {
        printYaml({ ok: true, status: 'queued', action: 'unread', id, subject });
    } else {
        console.log(`${colorize('✓', colors.green)} Queued mark as unread: ${id}`);
        console.log(`  ${subject}`);
        console.log(`\n  Run 'google-email plan' to review, 'google-email apply' to execute.`);
    }
}
