import { getGmailClient, hasCredentials, getCredentialsPath } from '../lib/client.mjs';
import { getStorageDir } from '../lib/storage.mjs';
import { parseDate } from '../lib/utils.mjs';
import { fetchUnreadEmails } from './pull/fetch.mjs';
import { processEmail } from './pull/process.mjs';
import { isYamlOutput, printYaml } from '../lib/output.mjs';
import fs from 'fs/promises';

function printUsage() {
    console.log(`
Usage: google-email pull --since <date> [options]

Required:
  --since <date>  Fetch unread emails since this date
                  Accepted formats:
                    - YYYY-MM-DD (e.g., 2026-01-01)
                    - yesterday
                    - N days ago (e.g., "7 days ago")

Options:
  -l, --limit <n>  Limit processing to first N emails (optional)
  --help            Show this help message

Examples:
  google-email pull --since 2026-01-01
  google-email pull --since yesterday --limit 5
  google-email pull --since "7 days ago"
`);
}

function parseArgs(args) {
    let sinceDate = null;
    let limit = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--since') {
            if (i + 1 < args.length) {
                sinceDate = parseDate(args[i + 1]);
                i++;
            } else {
                throw new Error('--since requires a date argument');
            }
        } else if (args[i] === '-l' || args[i] === '--limit') {
            if (i + 1 < args.length) {
                limit = parseInt(args[i + 1], 10);
                if (isNaN(limit) || limit <= 0) {
                    throw new Error('--limit must be a positive number');
                }
                i++;
            } else {
                throw new Error('--limit requires a number');
            }
        }
    }

    if (!sinceDate) {
        throw new Error('--since date is required');
    }

    return { sinceDate, limit };
}

async function ensureStorageDir() {
    const storageDir = getStorageDir();
    try {
        await fs.mkdir(storageDir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

export default async function pullCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    let sinceDate, limit;
    try {
        const parsed = parseArgs(args);
        sinceDate = parsed.sinceDate;
        limit = parsed.limit;
    } catch (error) {
        if (isYamlOutput()) {
            printYaml({ ok: false, error: { code: 'INVALID_ARGUMENTS', message: error.message } });
        } else {
            console.error(`Error: ${error.message}`);
            printUsage();
        }
        process.exit(1);
    }

    // Check for credentials
    if (!(await hasCredentials())) {
        const message = `Gmail credentials not found. Please download credentials.json from Google Cloud Console and place it at: ${getCredentialsPath()}`;
        if (isYamlOutput()) {
            printYaml({ ok: false, error: { code: 'MISSING_CREDENTIALS', message } });
        } else {
            console.error(`Error: Gmail credentials not found.`);
            console.error(`Please download credentials.json from Google Cloud Console`);
            console.error(`and place it at: ${getCredentialsPath()}`);
        }
        process.exit(1);
    }

    if (!isYamlOutput()) {
        console.log(`Fetching unread emails since: ${sinceDate.toISOString().split('T')[0]}`);
        if (limit) {
            console.log(`Processing limit: ${limit}`);
        }
    }

    try {
        const gmail = await getGmailClient();
        await ensureStorageDir();

        const emails = await fetchUnreadEmails(gmail, sinceDate);

        if (emails.length === 0) {
            if (isYamlOutput()) {
                printYaml({
                    ok: true,
                    since: sinceDate.toISOString(),
                    limit,
                    available: 0,
                    processed: 0,
                    written: 0,
                    skipped: 0,
                    results: [],
                });
            } else {
                console.log('No unread emails found.');
            }
            return;
        }

        if (!isYamlOutput()) {
            console.log(`Found ${emails.length} unread emails.`);
        }

        let written = 0;
        let skipped = 0;
        let processed = 0;
        const results = [];

        for (const email of emails) {
            if (limit && processed >= limit) {
                if (!isYamlOutput()) {
                    console.log(`\nReached processing limit of ${limit}. Stopping.`);
                }
                break;
            }

            const result = await processEmail(gmail, email);

            if (result.written) {
                written++;
                if (!isYamlOutput()) {
                    console.log(`✓ Stored: ${result.reference}`);
                }
            } else {
                skipped++;
                if (!isYamlOutput()) {
                    console.log(`⊘ Skipped (exists): ${result.reference}`);
                }
            }
            processed++;
            results.push({
                id: result.id,
                shortId: result.id.substring(0, 6),
                subject: result.subject,
                status: result.written ? 'written' : 'skipped',
            });
        }

        if (isYamlOutput()) {
            printYaml({
                ok: true,
                since: sinceDate.toISOString(),
                limit,
                available: emails.length,
                processed,
                written,
                skipped,
                results,
            });
        } else {
            console.log(`\nSummary:`);
            console.log(`  Available:  ${emails.length}`);
            console.log(`  Processed:  ${processed}`);
            console.log(`  Written:    ${written}`);
            console.log(`  Skipped:    ${skipped}`);
        }
    } catch (error) {
        if (isYamlOutput()) {
            printYaml({ ok: false, error: { code: 'PULL_FAILED', message: error.message } });
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}
