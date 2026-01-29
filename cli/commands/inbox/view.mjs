import { findEmailById } from '../../lib/utils.mjs';
import yaml from 'js-yaml';

function printUsage() {
    console.log(`
Usage: google-email inbox view <id>

Display a single email from storage (prints YAML).

Arguments:
  <id>    Email hash ID, partial ID, or filename
          - Full: 6498cec18d676f08ff64932bf93e7ec33c0adb2b
          - Partial: 6498cec (as long as unique)
          - Filename: 6498cec18d676f08ff64932bf93e7ec33c0adb2b.md

Examples:
  google-email inbox view 6498cec
  google-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b
  google-email inbox view 6498cec18d676f08ff64932bf93e7ec33c0adb2b.md
`);
}

export default async function viewCommand(args) {
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        return;
    }

    const partialId = args[0];
    const result = await findEmailById(partialId);

    if (!result) {
        console.error(`Email not found: ${partialId}`);
        process.exit(1);
    }

    const { email } = result;
    const ymlContent = yaml.dump(email, {
        indent: 2,
        lineWidth: -1,
        flowLevel: -1,
    });

    console.log(ymlContent);
}
