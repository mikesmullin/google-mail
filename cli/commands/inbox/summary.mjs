import { loadAllEmails, isEmailRead, getEmailFolder } from '../../lib/storage.mjs';
import { isYamlOutput, printYaml } from '../../lib/output.mjs';

function printUsage() {
    console.log(`
Usage: google-email inbox summary

Show email counts by folder.

Examples:
  google-email inbox summary
`);
}

export default async function summaryCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const emails = await loadAllEmails();

    const folderCounts = {};

    for (const { email } of emails) {
        const folder = getEmailFolder(email);
        if (!folderCounts[folder]) {
            folderCounts[folder] = { unread: 0, read: 0, total: 0 };
        }

        folderCounts[folder].total++;
        if (isEmailRead(email)) {
            folderCounts[folder].read++;
        } else {
            folderCounts[folder].unread++;
        }
    }

    let totalUnread = 0;
    let totalRead = 0;
    let totalAll = 0;

    for (const counts of Object.values(folderCounts)) {
        totalUnread += counts.unread;
        totalRead += counts.read;
        totalAll += counts.total;
    }

    if (isYamlOutput()) {
        printYaml({
            ok: true,
            folders: folderCounts,
            overall: {
                unread: totalUnread,
                read: totalRead,
                total: totalAll,
            },
        });
        return;
    }

    console.log('\nFolder Summary:');
    console.log('===============');

    for (const [folder, counts] of Object.entries(folderCounts)) {
        console.log(`${folder}:`);
        console.log(`  Unread: ${counts.unread}`);
        console.log(`  Read:   ${counts.read}`);
        console.log(`  Total:  ${counts.total}`);
        console.log();
    }

    console.log('Overall:');
    console.log(`  Unread: ${totalUnread}`);
    console.log(`  Read:   ${totalRead}`);
    console.log(`  Total:  ${totalAll}`);
}
