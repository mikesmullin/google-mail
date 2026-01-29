import { saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: google-email inbox read <id>

Queue mark-as-read operation (offline).
The actual Gmail operation is deferred until 'google-email apply'.

Arguments:
  <id>    Email hash ID, partial ID, or filename
          (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  google-email inbox read f86bca
`);
}

export default async function readCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const partialId = args[0];
    const result = await findEmailById(partialId);

    if (!result) {
        console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
        process.exit(1);
    }

    const { id, email } = result;

    if (!email.offline) {
        email.offline = {};
    }

    if (email.offline.read === true) {
        console.log(`${colorize('⊘', colors.yellow)} Email already marked as read: ${id}`);
        return;
    }

    // Clear any pending unread mutation
    delete email.offline.unread;
    delete email.offline.unreadQueuedAt;

    email.offline.read = true;
    email.offline.readQueuedAt = new Date().toISOString();

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Queued mark as read: ${id}`);
    console.log(`  ${subject}`);
    console.log(`\n  Run 'google-email plan' to review, 'google-email apply' to execute.`);
}
