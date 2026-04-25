import { getGmailClient, hasCredentials, getCredentialsPath } from '../lib/client.mjs';
import { colorize, colors } from '../lib/utils.mjs';
import { isYamlOutput, printYaml } from '../lib/output.mjs';

function printUsage() {
    console.log(`
Usage: google-email labels [options]

List available Gmail labels.

Options:
  --help       Show this help

Examples:
  google-email labels
  google-email labels --yaml
`);
}

function normalizeLabel(label) {
    return {
        id: label.id,
        name: label.name,
        type: label.type,
        messageListVisibility: label.messageListVisibility,
        labelListVisibility: label.labelListVisibility,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
    };
}

export default async function labelsCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    if (!(await hasCredentials())) {
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

    try {
        const gmail = await getGmailClient();
        const response = await gmail.users.labels.list({ userId: 'me' });
        const labels = (response.data.labels || []).map(normalizeLabel).sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
        );

        if (isYamlOutput()) {
            printYaml({
                ok: true,
                total: labels.length,
                labels,
            });
            return;
        }

        if (labels.length === 0) {
            console.log(`${colorize('⊘', colors.yellow)} No labels found.`);
            return;
        }

        console.log(`\n🏷️  ${colorize(`${labels.length} label(s)`, colors.bright)}\n`);

        for (const label of labels) {
            const type = label.type ? ` (${label.type.toLowerCase()})` : '';
            const unread = Number.isFinite(label.messagesUnread) ? ` unread:${label.messagesUnread}` : '';
            const total = Number.isFinite(label.messagesTotal) ? ` total:${label.messagesTotal}` : '';
            console.log(`  ${colorize(label.name, colors.cyan)}${type}${unread}${total}`);
        }
    } catch (error) {
        if (isYamlOutput()) {
            printYaml({
                ok: false,
                error: {
                    code: 'LIST_LABELS_FAILED',
                    message: error.message,
                },
            });
        } else {
            console.error(`Error: ${error.message}`);
        }
        process.exit(1);
    }
}
