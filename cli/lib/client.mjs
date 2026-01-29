import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(PROJECT_ROOT, 'token.json');
const CREDENTIALS_PATH = path.join(PROJECT_ROOT, 'credentials.json');

/**
 * Load saved credentials if they exist
 * @returns {Promise<object|null>}
 */
async function loadSavedCredentials() {
    try {
        const content = await fs.readFile(TOKEN_PATH, 'utf8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (error) {
        return null;
    }
}

/**
 * Save credentials to token file
 * @param {object} client - OAuth2 client
 */
async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;

    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });

    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Authorize with Gmail API
 * @returns {Promise<object>} Authorized OAuth2 client
 */
async function authorize() {
    let client = await loadSavedCredentials();
    if (client) {
        return client;
    }

    const content = await fs.readFile(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // For CLI, we need to do the OAuth flow
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('Authorize this app by visiting this URL:', authUrl);
    console.log('\nAfter authorization, paste the code here:');

    // Read code from stdin
    const code = await readLineFromStdin();

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    await saveCredentials(oAuth2Client);
    return oAuth2Client;
}

/**
 * Read a line from stdin
 * @returns {Promise<string>}
 */
function readLineFromStdin() {
    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Code: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/**
 * Get authenticated Gmail client
 * @returns {Promise<object>} Gmail API client
 */
export async function getGmailClient() {
    const auth = await authorize();
    return google.gmail({ version: 'v1', auth });
}

/**
 * Check if credentials file exists
 * @returns {Promise<boolean>}
 */
export async function hasCredentials() {
    try {
        await fs.access(CREDENTIALS_PATH);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get the credentials path for error messages
 * @returns {string}
 */
export function getCredentialsPath() {
    return CREDENTIALS_PATH;
}
