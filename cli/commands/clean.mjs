import fs from 'fs/promises';
import path from 'path';
import { getStorageDir } from '../lib/storage.mjs';
import { colorize, colors } from '../lib/utils.mjs';
import { isYamlOutput, printYaml } from '../lib/output.mjs';

function printUsage() {
    console.log(`
Usage: google-email clean

Delete local offline cache copies of emails from storage/.

Options:
  --help       Show this help

Examples:
  google-email clean
  google-email clean --yaml
`);
}

export default async function cleanCommand(args) {
    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const storageDir = getStorageDir();

    let files = [];
    try {
        files = await fs.readdir(storageDir);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            if (isYamlOutput()) {
                printYaml({
                    ok: false,
                    error: {
                        code: 'READ_STORAGE_FAILED',
                        message: error.message,
                    },
                });
            } else {
                console.error(`Error: ${error.message}`);
            }
            process.exit(1);
        }
    }

    const markdownFiles = files.filter((file) => file.endsWith('.md'));

    let deleted = 0;
    for (const file of markdownFiles) {
        await fs.unlink(path.join(storageDir, file));
        deleted++;
    }

    if (isYamlOutput()) {
        printYaml({
            ok: true,
            deleted,
            storageDir,
        });
        return;
    }

    if (deleted === 0) {
        console.log(`${colorize('⊘', colors.yellow)} No cached email files found in storage/.`);
        return;
    }

    console.log(`${colorize('✓', colors.green)} Deleted ${deleted} cached email file(s) from storage/.`);
}
