#!/usr/bin/env bun

import { fileURLToPath } from 'url';
import path from 'path';
import inboxCommand from './cli/commands/inbox.mjs';
import pullCommand from './cli/commands/pull.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printUsage() {
    console.log(`
Usage: google-email <command> [options]

Commands:
  inbox summary                Show unread/read/total email counts
  inbox list                   List unread emails from storage
  inbox view <id>              Show a single email (print YAML)
  inbox read <id>              Mark an email as read (offline)
  inbox unread <id>            Mark an email as unread (offline)
  pull --since <date>          Fetch unread emails from Gmail

Options depend on the command. Use:
  google-email <command> --help

Examples:
  google-email inbox summary
  google-email inbox list --limit 20
  google-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  google-email inbox read 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  google-email pull --since 2026-01-01
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    const mainCommand = args[0];

    if (mainCommand === 'inbox') {
        await inboxCommand(args.slice(1));
    } else if (mainCommand === 'pull') {
        await pullCommand(args.slice(1));
    } else {
        console.error(`Unknown command: ${mainCommand}`);
        printUsage();
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
