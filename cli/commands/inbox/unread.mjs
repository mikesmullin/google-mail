import { saveEmail } from '../../lib/storage.mjs';
import { findEmailById, colorize, colors } from '../../lib/utils.mjs';

function printUsage() {
    console.log(`
Usage: google-email inbox unread <id>

Mark an email as unread (offline). Removes 'offline.read' from the file.

Arguments:
  <id>    Email hash ID, partial ID, or filename
          (e.g., f86bca, f86bca73ca8a, f86bca73ca8afaa2ed51d827e82d190644fc1ff1)

Examples:
  google-email inbox unread f86bca
  google-email inbox unread f86bca73ca8afaa2ed51d827e82d190644fc1ff1
  google-email inbox unread f86bca73ca8afaa2ed51d827e82d190644fc1ff1.md
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
        console.error(`${colorize('✗', colors.red)} Email not found: ${partialId}`);
        process.exit(1);
    }

    const { id, email } = result;

    if (!email.offline?.read) {
        console.log(`${colorize('⊘', colors.yellow)} Email already unread: ${id}`);
        return;
    }

    if (email.offline) {
        delete email.offline.read;
        delete email.offline.readAt;

        if (Object.keys(email.offline).length === 0) {
            delete email.offline;
        }
    }

    await saveEmail(id, email);

    const subject = email.subject || '(No Subject)';
    console.log(`${colorize('✓', colors.green)} Marked as unread: ${id}`);
    console.log(`  ${subject}`);
}
