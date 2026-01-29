import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { getStorageDir } from '../../lib/storage.mjs';

/**
 * Generate SHA1 hash from Gmail message ID
 * @param {string} gmailId - The Gmail message ID
 * @returns {string} SHA1 hash
 */
function hashGmailId(gmailId) {
    return createHash('sha1').update(gmailId).digest('hex');
}

/**
 * Format email reference for output
 * @param {string} id - Email ID (hash)
 * @param {string} subject - Email subject
 * @param {number} maxLen - Maximum subject length
 * @returns {string} Formatted reference
 */
function formatEmailRef(id, subject, maxLen = 64) {
    const truncated = subject.length > maxLen ? subject.substring(0, maxLen) + '...' : subject;
    return `(${id.substring(0, 6)}+${truncated})`;
}

/**
 * Check if email file already exists
 * @param {string} hash - SHA1 hash of email ID
 * @returns {Promise<boolean>}
 */
async function fileExists(hash) {
    try {
        await fs.access(path.join(getStorageDir(), `${hash}.md`));
        return true;
    } catch {
        return false;
    }
}

/**
 * Write email to Markdown file with YAML front matter
 * @param {string} hash - SHA1 hash of email ID
 * @param {object} email - Email data object
 */
async function writeEmailToMarkdown(hash, email) {
    const filePath = path.join(getStorageDir(), `${hash}.md`);

    const { body, ...emailWithoutBody } = email;
    const bodyContent = body?.content || '';
    const bodyContentType = body?.contentType || 'html';

    const emailForFrontMatter = {
        ...emailWithoutBody,
        body: { contentType: bodyContentType },
    };

    const frontMatter = yaml.dump(emailForFrontMatter, {
        indent: 2,
        lineWidth: -1,
        flowLevel: -1,
    });

    let formattedBody = bodyContent;
    if (bodyContentType === 'html') {
        formattedBody = bodyContent.replace(/></g, '>\n<').replace(/\r\n/g, '\n');
    }

    const mdContent = `---
${frontMatter}---

# ${email.subject || '(No Subject)'}

\`\`\`${bodyContentType}
${formattedBody}
\`\`\`
`;

    await fs.writeFile(filePath, mdContent, 'utf8');
}

/**
 * Process a single email: store locally (leaves remote mail unmodified)
 * @param {object} gmail - Gmail API client (unused, kept for API compatibility)
 * @param {object} email - Email object
 * @returns {Promise<{written: boolean}>}
 */
export async function processEmail(gmail, email) {
    const hash = hashGmailId(email.id);
    const exists = await fileExists(hash);

    if (!exists) {
        const emailWithHash = {
            ...email,
            _stored_id: hash,
            _stored_at: new Date().toISOString(),
        };

        await writeEmailToMarkdown(hash, emailWithHash);
        console.log(`✓ Stored: ${formatEmailRef(hash, email.subject)}`);
    } else {
        console.log(`⊘ Skipped (exists): ${formatEmailRef(hash, email.subject)}`);
    }

    return { written: !exists };
}
