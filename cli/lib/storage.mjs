import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage');

/**
 * Parse a markdown email file with YAML front matter
 * @param {string} content - File content
 * @returns {object} Email object
 */
function parseMarkdownEmail(content) {
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) {
        throw new Error('Invalid markdown email format: missing front matter');
    }

    const frontMatter = frontMatterMatch[1];
    const email = yaml.load(frontMatter);

    const bodyMatch = content.match(/```(html|text)\n([\s\S]*?)\n```/);
    if (bodyMatch) {
        email.body = {
            contentType: bodyMatch[1],
            content: bodyMatch[2],
        };
    }

    return email;
}

/**
 * Load all emails from storage
 * @returns {Promise<Array>} Array of {id, filename, email} objects
 */
export async function loadAllEmails() {
    try {
        const files = await fs.readdir(STORAGE_DIR);
        const mdFiles = files.filter((f) => f.endsWith('.md'));

        const emails = [];
        for (const filename of mdFiles) {
            try {
                const filePath = path.join(STORAGE_DIR, filename);
                const content = await fs.readFile(filePath, 'utf8');
                const email = parseMarkdownEmail(content);
                const id = filename.replace('.md', '');
                emails.push({ id, filename, email });
            } catch (error) {
                console.error(`Warning: Failed to load ${filename}: ${error.message}`);
            }
        }

        return emails;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

/**
 * Load a single email by ID
 * @param {string} id - Email hash ID
 * @returns {Promise<object>} Email object or null if not found
 */
export async function loadEmail(id) {
    try {
        const filePath = path.join(STORAGE_DIR, `${id}.md`);
        const content = await fs.readFile(filePath, 'utf8');
        return parseMarkdownEmail(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

/**
 * Save an email (update existing)
 * @param {string} id - Email hash ID
 * @param {object} email - Email object
 */
export async function saveEmail(id, email) {
    const filePath = path.join(STORAGE_DIR, `${id}.md`);

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
 * Check if an email is marked as read (offline)
 * @param {object} email - Email object
 * @returns {boolean}
 */
export function isEmailRead(email) {
    return email?.offline?.read === true;
}

/**
 * Get folder name from email
 * @param {object} email - Email object
 * @returns {string}
 */
export function getEmailFolder(email) {
    return 'Inbox';
}

/**
 * Extract file ID from filename or path
 * @param {string} filenameOrId - Filename or ID
 * @returns {string}
 */
export function extractId(filenameOrId) {
    return filenameOrId.replace('.md', '').replace('.yml', '');
}

/**
 * Get the storage directory path
 * @returns {string}
 */
export function getStorageDir() {
    return STORAGE_DIR;
}
