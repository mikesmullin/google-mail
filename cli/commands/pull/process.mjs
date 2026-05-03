import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { getStorageDir, loadAllEmails, loadEmail, saveEmail } from '../../lib/storage.mjs';

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
 * Process a single email: store locally, or detect label changes if already cached.
 * @param {object} gmail - Gmail API client
 * @param {object} email - Email object (freshly fetched from remote)
 * @returns {Promise<{written: boolean, updated: boolean, id: string, subject: string, transitions: Array}>}
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
        return {
            written: true,
            updated: false,
            id: hash,
            subject: email.subject,
            reference: formatEmailRef(hash, email.subject),
            transitions: [],
        };
    }

    // Email already cached — check for label changes since last pull
    const cached = await loadEmail(hash);
    const cachedLabelIds = cached.labelIds || [];
    const remoteLabelIds = email.labelIds || [];

    const now = new Date().toISOString();
    const transition = computeLabelTransition(cachedLabelIds, remoteLabelIds, now);

    if (transition) {
        if (!cached.offline) cached.offline = {};
        if (!cached.offline.transitions) cached.offline.transitions = [];
        cached.offline.transitions.push(transition);

        // Refresh live fields from remote
        cached.labelIds = remoteLabelIds;
        cached.isRead = email.isRead;
        cached.snippet = email.snippet;

        await saveEmail(hash, cached);
    }

    return {
        written: false,
        updated: !!transition,
        id: hash,
        subject: email.subject,
        reference: formatEmailRef(hash, email.subject),
        transitions: transition ? [transition] : [],
    };
}

/**
 * Compute label transitions between cached and remote label sets.
 * Returns null if there are no changes.
 */
function computeLabelTransition(cachedLabelIds, remoteLabelIds, detectedAt) {
    const cachedSet = new Set(cachedLabelIds);
    const remoteSet = new Set(remoteLabelIds);

    const added = remoteLabelIds.filter((l) => !cachedSet.has(l));
    const removed = cachedLabelIds.filter((l) => !remoteSet.has(l));

    if (added.length === 0 && removed.length === 0) return null;

    // Determine primary transition type from the most significant label change
    let type = 'labels_changed';
    if (added.includes('TRASH')) {
        type = 'deleted';
    } else if (removed.includes('INBOX') && !remoteSet.has('INBOX')) {
        type = 'archived';
    } else if (removed.includes('UNREAD') && !remoteSet.has('UNREAD')) {
        type = 'read';
    } else if (added.includes('UNREAD') && !cachedSet.has('UNREAD')) {
        type = 'unread';
    }

    return { type, from: cachedLabelIds, to: remoteLabelIds, added, removed, detectedAt };
}

/**
 * Detect emails that were cached within the pull window but are no longer present
 * in the remote unread inbox results. Probes Gmail to determine the current state
 * and records a transition in the local cache file.
 *
 * @param {object} gmail - Gmail API client
 * @param {Date} sinceDate - The start of the current pull window
 * @param {Set<string>} fetchedGmailIds - Set of Gmail message IDs returned by this pull
 * @returns {Promise<Array>} Array of {id, subject, transitions} for emails with detected changes
 */
export async function detectGoneEmails(gmail, sinceDate, fetchedGmailIds) {
    const allCached = await loadAllEmails();
    const sinceMs = sinceDate.getTime();
    const results = [];

    for (const { id: hash, email: cached } of allCached) {
        const receivedMs = new Date(cached.receivedDateTime || 0).getTime();

        // Only consider emails within the pull window
        if (receivedMs < sinceMs) continue;

        // Already present in this pull — handled by processEmail
        if (fetchedGmailIds.has(cached.id)) continue;

        // Only probe emails that were last seen as UNREAD in INBOX
        const cachedLabels = cached.labelIds || [];
        if (!cachedLabels.includes('UNREAD') || !cachedLabels.includes('INBOX')) continue;

        // User already queued a local delete — skip to avoid noise
        if (cached.offline?.delete === true) continue;

        try {
            const response = await gmail.users.messages.get({
                userId: 'me',
                id: cached.id,
                format: 'minimal',
            });

            const remoteLabelIds = response.data.labelIds || [];
            const now = new Date().toISOString();
            const transition = computeLabelTransition(cachedLabels, remoteLabelIds, now);

            if (transition) {
                if (!cached.offline) cached.offline = {};
                if (!cached.offline.transitions) cached.offline.transitions = [];
                cached.offline.transitions.push(transition);

                cached.labelIds = remoteLabelIds;
                cached.isRead = !remoteLabelIds.includes('UNREAD');

                await saveEmail(hash, cached);
                results.push({ id: hash, subject: cached.subject, transitions: [transition] });
            }
        } catch (error) {
            const statusCode = error.code || error.status || error?.response?.status;
            if (statusCode === 404) {
                // Message permanently deleted from Gmail
                const now = new Date().toISOString();
                const transition = {
                    type: 'deleted',
                    from: cachedLabels,
                    to: [],
                    added: [],
                    removed: cachedLabels,
                    detectedAt: now,
                };
                if (!cached.offline) cached.offline = {};
                if (!cached.offline.transitions) cached.offline.transitions = [];
                cached.offline.transitions.push(transition);

                await saveEmail(hash, cached);
                results.push({ id: hash, subject: cached.subject, transitions: [transition] });
            } else {
                console.error(`Warning: Failed to probe message ${cached.id}: ${error.message}`);
            }
        }
    }

    return results;
}
