import { saveEmail } from '../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: google-email move <id> <folder>

Queue a move operation (offline). Adds label and archives email.
The actual Gmail operation is deferred until 'google-email apply'.

Arguments:
  <id>      Email hash ID, partial ID, or filename
  <folder>  Target folder/label name (e.g., "Work", "Personal")

Examples:
  google-email move f86bca Work
  google-email move f86bca "Important/Projects"
`);
}

export default async function moveCommand(args) {
    if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const partialId = args[0];
    const folder = args[1];

    const result = await findEmailById(partialId);

    if (!result) {
        console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
        process.exit(1);
    }

    const { id, email } = result;

    if (!email.offline) {
        email.offline = {};
    }

    if (email.offline.move === folder) {
        console.log(`${colorize('⊘', colors.yellow)} Email already queued for move to "${folder}": ${id}`);
        return;
    }

    email.offline.move = folder;
    email.offline.moveQueuedAt = new Date().toISOString();

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Queued move to "${folder}": ${id}`);
    console.log(`  ${subject}`);
    console.log(`\n  Run 'google-email plan' to review, 'google-email apply' to execute.`);
}
