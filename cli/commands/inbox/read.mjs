import { saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: google-email inbox read <id>

Mark an email as read (offline). Adds 'offline.read: true' to the file.

Arguments:
  <id>    Email hash ID, partial ID, or filename
          (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  google-email inbox read f86bca
  google-email inbox read f86bca73ca8afaa2ed51d827e82d190644fc1ff1
  google-email inbox read f86bca73ca8afaa2ed51d827e82d190644fc1ff1.md
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

    email.offline.read = true;
    email.offline.readAt = new Date().toISOString();

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Marked as read: ${id}`);
    console.log(`  ${subject}`);
}
