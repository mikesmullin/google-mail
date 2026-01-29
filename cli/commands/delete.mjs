import { saveEmail } from '../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: google-email delete <id>

Queue a soft-delete operation (offline). Moves email to trash.
The actual Gmail operation is deferred until 'google-email apply'.

Arguments:
  <id>    Email hash ID, partial ID, or filename

Examples:
  google-email delete f86bca
  google-email delete f86bca73ca8afaa2ed51d827e82d190644fc1ff1
`);
}

export default async function deleteCommand(args) {
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

    if (email.offline.delete === true) {
        console.log(`${colorize('⊘', colors.yellow)} Email already queued for delete: ${id}`);
        return;
    }

    email.offline.delete = true;
    email.offline.deleteQueuedAt = new Date().toISOString();

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Queued for delete: ${id}`);
    console.log(`  ${subject}`);
    console.log(`\n  Run 'google-email plan' to review, 'google-email apply' to execute.`);
}
