/**
 * Fetch unread emails from Gmail since a given date
 * @param {object} gmail - Gmail API client
 * @param {Date} sinceDate - Fetch emails received on or after this date
 * @returns {Promise<Array>} Array of email message objects
 */
export async function fetchUnreadEmails(gmail, sinceDate) {
    const emails = [];

    // Convert date to Gmail search format (YYYY/MM/DD)
    const sinceDateStr = formatGmailDate(sinceDate);
    const query = `is:unread in:inbox after:${sinceDateStr}`;

    try {
        let pageToken = null;

        do {
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 50,
                pageToken: pageToken,
            });

            const messages = response.data.messages || [];

            for (const msg of messages) {
                const fullMessage = await fetchFullMessage(gmail, msg.id);
                if (fullMessage) {
                    emails.push(fullMessage);
                }
            }

            pageToken = response.data.nextPageToken;
        } while (pageToken);
    } catch (error) {
        console.error('Error fetching emails:', error.message);
        throw error;
    }

    // Sort by date (newest first)
    emails.sort((a, b) => {
        const dateA = new Date(a.receivedDateTime);
        const dateB = new Date(b.receivedDateTime);
        return dateB - dateA;
    });

    return emails;
}

/**
 * Format date for Gmail search query
 * @param {Date} date - Date to format
 * @returns {string} Date in YYYY/MM/DD format
 */
function formatGmailDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

/**
 * Fetch full message details
 * @param {object} gmail - Gmail API client
 * @param {string} messageId - Message ID
 * @returns {Promise<object>} Normalized email object
 */
async function fetchFullMessage(gmail, messageId) {
    try {
        const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
        });

        return normalizeEmail(response.data);
    } catch (error) {
        console.error(`Warning: Failed to fetch message ${messageId}: ${error.message}`);
        return null;
    }
}

/**
 * Normalize Gmail API response to our standard format
 * @param {object} gmailMessage - Gmail API message object
 * @returns {object} Normalized email object
 */
function normalizeEmail(gmailMessage) {
    const headers = gmailMessage.payload?.headers || [];

    const getHeader = (name) => {
        const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
        return header?.value || '';
    };

    const from = parseEmailAddress(getHeader('From'));
    const to = parseEmailAddressList(getHeader('To'));
    const cc = parseEmailAddressList(getHeader('Cc'));
    const bcc = parseEmailAddressList(getHeader('Bcc'));

    const body = extractBody(gmailMessage.payload);

    return {
        id: gmailMessage.id,
        threadId: gmailMessage.threadId,
        subject: getHeader('Subject'),
        from: from,
        toRecipients: to,
        ccRecipients: cc,
        bccRecipients: bcc,
        receivedDateTime: new Date(parseInt(gmailMessage.internalDate)).toISOString(),
        isRead: !gmailMessage.labelIds?.includes('UNREAD'),
        labelIds: gmailMessage.labelIds || [],
        snippet: gmailMessage.snippet,
        body: body,
        webLink: `https://mail.google.com/mail/u/0/#inbox/${gmailMessage.id}`,
    };
}

/**
 * Parse email address string to object
 * @param {string} addressStr - Email address string like "Name <email@example.com>"
 * @returns {object} Object with name and address properties
 */
function parseEmailAddress(addressStr) {
    if (!addressStr) return null;

    const match = addressStr.match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
        return {
            name: match[1].replace(/^["']|["']$/g, '').trim(),
            address: match[2].trim(),
        };
    }

    return {
        name: '',
        address: addressStr.trim(),
    };
}

/**
 * Parse comma-separated email addresses
 * @param {string} addressStr - Comma-separated email addresses
 * @returns {Array} Array of email address objects
 */
function parseEmailAddressList(addressStr) {
    if (!addressStr) return [];

    // Split by comma, but be careful of commas in names
    const addresses = [];
    let current = '';
    let inQuotes = false;

    for (const char of addressStr) {
        if (char === '"') {
            inQuotes = !inQuotes;
            current += char;
        } else if (char === ',' && !inQuotes) {
            if (current.trim()) {
                const parsed = parseEmailAddress(current.trim());
                if (parsed) addresses.push(parsed);
            }
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        const parsed = parseEmailAddress(current.trim());
        if (parsed) addresses.push(parsed);
    }

    return addresses;
}

/**
 * Extract body content from message payload
 * @param {object} payload - Gmail message payload
 * @returns {object} Body object with contentType and content
 */
function extractBody(payload) {
    if (!payload) {
        return { contentType: 'text', content: '' };
    }

    // Try to find HTML body first, then plain text
    const htmlPart = findPart(payload, 'text/html');
    if (htmlPart) {
        return {
            contentType: 'html',
            content: decodeBase64(htmlPart.body?.data || ''),
        };
    }

    const textPart = findPart(payload, 'text/plain');
    if (textPart) {
        return {
            contentType: 'text',
            content: decodeBase64(textPart.body?.data || ''),
        };
    }

    // Fallback to main body
    if (payload.body?.data) {
        return {
            contentType: 'text',
            content: decodeBase64(payload.body.data),
        };
    }

    return { contentType: 'text', content: '' };
}

/**
 * Find a part by MIME type recursively
 * @param {object} part - Message part
 * @param {string} mimeType - MIME type to find
 * @returns {object|null} Found part or null
 */
function findPart(part, mimeType) {
    if (part.mimeType === mimeType) {
        return part;
    }

    if (part.parts) {
        for (const subPart of part.parts) {
            const found = findPart(subPart, mimeType);
            if (found) return found;
        }
    }

    return null;
}

/**
 * Decode base64 URL-safe encoded string
 * @param {string} data - Base64 URL-safe encoded string
 * @returns {string} Decoded string
 */
function decodeBase64(data) {
    if (!data) return '';

    // Replace URL-safe characters
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
}
