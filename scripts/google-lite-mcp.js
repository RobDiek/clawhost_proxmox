#!/usr/bin/env node
/**
 * google-lite-mcp.js — Lightweight Google Workspace MCP Server
 *
 * Only exposes Calendar + Gmail + Contacts tools instead of 25-30 from @presto-ai/google-workspace-mcp.
 * Reduces token usage from ~12K to ~4K per session.
 *
 * Runs as stdio MCP server. Env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *
 * Optional:
 *   GOOGLE_SCOPES — comma-separated (default: "calendar,gmail,contacts")
 */

const https = require('https');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
let REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const ENABLED_SCOPES = (process.env.GOOGLE_SCOPES || 'calendar,gmail,contacts').split(',').map(s => s.trim());

let accessToken = '';
let tokenExpiresAt = 0;

// ── HTTP helpers ──
function googleRequest(method, hostname, path, body, extraHeaders) {
    return new Promise(async (resolve, reject) => {
        const token = await getAccessToken();
        const url = new URL(`https://${hostname}${path}`);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...extraHeaders,
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(data ? JSON.parse(data) : { status: res.statusCode }); }
                catch { resolve({ raw: data, status: res.statusCode }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function calendarApi(method, path, body) {
    return googleRequest(method, 'www.googleapis.com', `/calendar/v3${path}`, body);
}

function gmailApi(method, path, body) {
    return googleRequest(method, 'gmail.googleapis.com', `/gmail/v1/users/me${path}`, body);
}

function contactsApi(method, path, body) {
    return googleRequest(method, 'people.googleapis.com', `/v1${path}`, body);
}

function getAccessToken() {
    return new Promise((resolve, reject) => {
        if (accessToken && Date.now() < tokenExpiresAt - 60000) return resolve(accessToken);
        const postData = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }).toString();
        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        accessToken = json.access_token;
                        tokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
                        resolve(accessToken);
                    } else reject(new Error('Token refresh failed: ' + (json.error_description || json.error)));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ── Calendar Tools ──
const CALENDAR_TOOLS = [
    {
        name: 'list-calendar-events',
        description: 'List calendar events within a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                timeMin: { type: 'string', description: 'RFC3339 start (e.g. 2026-04-13T00:00:00+03:00)' },
                timeMax: { type: 'string', description: 'RFC3339 end' },
                maxResults: { type: 'number', description: 'Max results (default 20)', default: 20 },
                calendarId: { type: 'string', description: 'Calendar ID (default: primary)', default: 'primary' },
            },
            required: ['timeMin', 'timeMax'],
        },
        handler: async (args) => {
            const calId = encodeURIComponent(args.calendarId || 'primary');
            const params = `timeMin=${encodeURIComponent(args.timeMin)}&timeMax=${encodeURIComponent(args.timeMax)}&maxResults=${args.maxResults || 20}&singleEvents=true&orderBy=startTime`;
            const result = await calendarApi('GET', `/calendars/${calId}/events?${params}`);
            return { events: (result.items || []).map(e => ({
                id: e.id, summary: e.summary, start: e.start, end: e.end,
                location: e.location || '', description: (e.description || '').slice(0, 200),
                attendees: (e.attendees || []).map(a => a.email),
            })) };
        },
    },
    {
        name: 'create-calendar-event',
        description: 'Create a new calendar event.',
        inputSchema: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: 'Event title' },
                startDateTime: { type: 'string', description: 'RFC3339 start time' },
                endDateTime: { type: 'string', description: 'RFC3339 end time' },
                timeZone: { type: 'string', description: 'Time zone (e.g. Asia/Jerusalem)', default: 'Asia/Jerusalem' },
                location: { type: 'string', description: 'Location' },
                description: { type: 'string', description: 'Description' },
                attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
                calendarId: { type: 'string', default: 'primary' },
            },
            required: ['summary', 'startDateTime', 'endDateTime'],
        },
        handler: async (args) => {
            const tz = args.timeZone || 'Asia/Jerusalem';
            const event = {
                summary: args.summary,
                start: { dateTime: args.startDateTime, timeZone: tz },
                end: { dateTime: args.endDateTime, timeZone: tz },
            };
            if (args.location) event.location = args.location;
            if (args.description) event.description = args.description;
            if (args.attendees?.length) event.attendees = args.attendees.map(e => ({ email: e }));
            const calId = encodeURIComponent(args.calendarId || 'primary');
            return calendarApi('POST', `/calendars/${calId}/events`, event);
        },
    },
    {
        name: 'update-calendar-event',
        description: 'Update an existing calendar event.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string' },
                summary: { type: 'string' },
                startDateTime: { type: 'string' },
                endDateTime: { type: 'string' },
                timeZone: { type: 'string', default: 'Asia/Jerusalem' },
                location: { type: 'string' },
                description: { type: 'string' },
                calendarId: { type: 'string', default: 'primary' },
            },
            required: ['eventId'],
        },
        handler: async (args) => {
            const tz = args.timeZone || 'Asia/Jerusalem';
            const patch = {};
            if (args.summary) patch.summary = args.summary;
            if (args.startDateTime) patch.start = { dateTime: args.startDateTime, timeZone: tz };
            if (args.endDateTime) patch.end = { dateTime: args.endDateTime, timeZone: tz };
            if (args.location) patch.location = args.location;
            if (args.description) patch.description = args.description;
            const calId = encodeURIComponent(args.calendarId || 'primary');
            return calendarApi('PATCH', `/calendars/${calId}/events/${args.eventId}`, patch);
        },
    },
    {
        name: 'delete-calendar-event',
        description: 'Delete a calendar event.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string' },
                calendarId: { type: 'string', default: 'primary' },
            },
            required: ['eventId'],
        },
        handler: async (args) => {
            const calId = encodeURIComponent(args.calendarId || 'primary');
            return calendarApi('DELETE', `/calendars/${calId}/events/${args.eventId}`);
        },
    },
];

// ── Gmail Tools ──
const GMAIL_TOOLS = [
    {
        name: 'list-emails',
        description: 'List recent emails. Returns subject, from, date, snippet.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Gmail search query (e.g. "is:unread", "from:boss@co.il")' },
                maxResults: { type: 'number', default: 10 },
                labelIds: { type: 'array', items: { type: 'string' }, description: 'Label IDs (e.g. INBOX, SENT)' },
            },
        },
        handler: async (args) => {
            let path = `/messages?maxResults=${args.maxResults || 10}`;
            if (args.query) path += `&q=${encodeURIComponent(args.query)}`;
            if (args.labelIds?.length) path += `&labelIds=${args.labelIds.join(',')}`;
            const list = await gmailApi('GET', path);
            if (!list.messages?.length) return { emails: [], total: 0 };
            // Fetch details for each message (batch)
            const emails = [];
            for (const msg of list.messages.slice(0, 10)) {
                const detail = await gmailApi('GET', `/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
                const headers = detail.payload?.headers || [];
                const getHeader = (name) => (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
                emails.push({
                    id: detail.id,
                    subject: getHeader('Subject'),
                    from: getHeader('From'),
                    date: getHeader('Date'),
                    snippet: detail.snippet || '',
                    labelIds: detail.labelIds || [],
                });
            }
            return { emails, total: list.resultSizeEstimate || emails.length };
        },
    },
    {
        name: 'read-email',
        description: 'Read full content of an email by ID.',
        inputSchema: {
            type: 'object',
            properties: { messageId: { type: 'string' } },
            required: ['messageId'],
        },
        handler: async (args) => {
            const detail = await gmailApi('GET', `/messages/${args.messageId}?format=full`);
            const headers = detail.payload?.headers || [];
            const getHeader = (name) => (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
            // Extract body
            let body = '';
            function extractBody(part) {
                if (part.body?.data) body += Buffer.from(part.body.data, 'base64url').toString('utf-8');
                if (part.parts) part.parts.forEach(extractBody);
            }
            if (detail.payload) extractBody(detail.payload);
            return {
                subject: getHeader('Subject'), from: getHeader('From'), to: getHeader('To'),
                date: getHeader('Date'), body: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000),
            };
        },
    },
    {
        name: 'send-email',
        description: 'Send an email.',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Recipient email' },
                subject: { type: 'string' },
                body: { type: 'string', description: 'Email body (plain text)' },
                cc: { type: 'string', description: 'CC email' },
            },
            required: ['to', 'subject', 'body'],
        },
        handler: async (args) => {
            let raw = `To: ${args.to}\nSubject: ${args.subject}\nContent-Type: text/plain; charset=utf-8\n`;
            if (args.cc) raw += `Cc: ${args.cc}\n`;
            raw += `\n${args.body}`;
            const encoded = Buffer.from(raw).toString('base64url');
            return gmailApi('POST', '/messages/send', { raw: encoded });
        },
    },
    {
        name: 'reply-to-email',
        description: 'Reply to an email thread.',
        inputSchema: {
            type: 'object',
            properties: {
                messageId: { type: 'string', description: 'Original message ID' },
                body: { type: 'string', description: 'Reply text' },
            },
            required: ['messageId', 'body'],
        },
        handler: async (args) => {
            const orig = await gmailApi('GET', `/messages/${args.messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`);
            const headers = orig.payload?.headers || [];
            const getHeader = (name) => (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
            const subject = getHeader('Subject').startsWith('Re:') ? getHeader('Subject') : `Re: ${getHeader('Subject')}`;
            let raw = `To: ${getHeader('From')}\nSubject: ${subject}\nIn-Reply-To: ${getHeader('Message-ID')}\nReferences: ${getHeader('Message-ID')}\nContent-Type: text/plain; charset=utf-8\n\n${args.body}`;
            const encoded = Buffer.from(raw).toString('base64url');
            return gmailApi('POST', '/messages/send', { raw: encoded, threadId: orig.threadId });
        },
    },
];

// ── Contacts Tools ──
const CONTACTS_TOOLS = [
    {
        name: 'list-contacts',
        description: 'List contacts from Google Contacts.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (name or email)' },
                pageSize: { type: 'number', default: 20 },
            },
        },
        handler: async (args) => {
            let path = `/people/me/connections?pageSize=${args.pageSize || 20}&personFields=names,emailAddresses,phoneNumbers,organizations`;
            if (args.query) {
                path = `/people:searchContacts?query=${encodeURIComponent(args.query)}&pageSize=${args.pageSize || 20}&readMask=names,emailAddresses,phoneNumbers,organizations`;
            }
            const result = await contactsApi('GET', path);
            const connections = result.connections || result.results?.map(r => r.person) || [];
            return { contacts: connections.map(c => ({
                resourceName: c.resourceName,
                name: c.names?.[0]?.displayName || '',
                email: c.emailAddresses?.[0]?.value || '',
                phone: c.phoneNumbers?.[0]?.value || '',
                company: c.organizations?.[0]?.name || '',
                title: c.organizations?.[0]?.title || '',
            })) };
        },
    },
    {
        name: 'create-contact',
        description: 'Create a new Google contact.',
        inputSchema: {
            type: 'object',
            properties: {
                givenName: { type: 'string' },
                familyName: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                company: { type: 'string' },
            },
            required: ['givenName'],
        },
        handler: async (args) => {
            const person = { names: [{ givenName: args.givenName, familyName: args.familyName || '' }] };
            if (args.email) person.emailAddresses = [{ value: args.email }];
            if (args.phone) person.phoneNumbers = [{ value: args.phone }];
            if (args.company) person.organizations = [{ name: args.company }];
            return contactsApi('POST', '/people:createContact', person);
        },
    },
];

// ── Build tools by scope ──
function getEnabledTools() {
    const tools = [];
    if (ENABLED_SCOPES.includes('calendar')) tools.push(...CALENDAR_TOOLS);
    if (ENABLED_SCOPES.includes('gmail')) tools.push(...GMAIL_TOOLS);
    if (ENABLED_SCOPES.includes('contacts')) tools.push(...CONTACTS_TOOLS);
    return tools;
}

// ── MCP Protocol (stdio JSON-RPC) ──
const tools = getEnabledTools();
const toolMap = Object.fromEntries(tools.map(t => [t.name, t]));

function sendResponse(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendNotification(method, params) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

async function handleRequest(req) {
    const { id, method, params } = req;
    switch (method) {
        case 'initialize':
            sendResponse(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'google-lite', version: '1.0.0' },
            });
            sendNotification('notifications/initialized', {});
            break;
        case 'tools/list':
            sendResponse(id, { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
            break;
        case 'tools/call': {
            const tool = toolMap[params?.name];
            if (!tool) { sendResponse(id, { content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }], isError: true }); break; }
            try {
                const result = await tool.handler(params?.arguments || {});
                sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (err) {
                sendResponse(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
            }
            break;
        }
        case 'ping': sendResponse(id, {}); break;
        default: if (id) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }) + '\n'); break;
    }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) { try { handleRequest(JSON.parse(line)); } catch (e) { process.stderr.write(`Parse error: ${e.message}\n`); } }
    }
});
process.stdin.on('end', () => process.exit(0));
process.stderr.write(`google-lite MCP server started (scopes: ${ENABLED_SCOPES.join(',')})\n`);
