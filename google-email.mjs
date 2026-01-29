#!/usr/bin/env bun

import { fileURLToPath } from 'url';
import path from 'path';
import inboxCommand from './cli/commands/inbox.mjs';
import pullCommand from './cli/commands/pull.mjs';
import moveCommand from './cli/commands/move.mjs';
import archiveCommand from './cli/commands/archive.mjs';
import deleteCommand from './cli/commands/delete.mjs';
import planCommand from './cli/commands/plan.mjs';
import applyCommand from './cli/commands/apply.mjs';

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

  move <id> <folder>           Queue move to folder (offline)
  archive <id>                 Queue archive (offline)
  delete <id>                  Queue soft-delete (offline)

  plan                         Show pending mutations
  apply                        Apply pending mutations to Gmail

Options depend on the command. Use:
  google-email <command> --help

Examples:
  google-email inbox summary
  google-email inbox list --limit 20
  google-email inbox view 6498cec
  google-email inbox read 6498cec
  google-email pull --since 2026-01-01
  google-email move 6498cec "Work/Important"
  google-email archive 6498cec
  google-email plan
  google-email apply
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    const mainCommand = args[0];

    switch (mainCommand) {
        case 'inbox':
            await inboxCommand(args.slice(1));
            break;
        case 'pull':
            await pullCommand(args.slice(1));
            break;
        case 'move':
            await moveCommand(args.slice(1));
            break;
        case 'archive':
            await archiveCommand(args.slice(1));
            break;
        case 'delete':
            await deleteCommand(args.slice(1));
            break;
        case 'plan':
            await planCommand(args.slice(1));
            break;
        case 'apply':
            await applyCommand(args.slice(1));
            break;
        default:
            console.error(`Unknown command: ${mainCommand}`);
            printUsage();
            process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
