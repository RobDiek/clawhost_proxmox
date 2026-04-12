#!/usr/bin/env node
/**
 * ms365-lite-mcp.js — Lightweight Microsoft 365 MCP Server
 *
 * Only exposes calendar + mail tools instead of 120+ from @softeria/ms-365-mcp-server.
 * Reduces token usage from ~135K to ~5K per session.
 *
 * Runs as stdio MCP server. Env vars:
 *   MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REFRESH_TOKEN, MS_TENANT_ID
 *
 * Optional env:
 *   MS365_SCOPES — comma-separated list of enabled scopes (default: "calendar,mail")
 */

const https = require('https');

// ── Config ──
const CLIENT_ID = process.env.MS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET || '';
const TENANT = process.env.MS_TENANT_ID || 'common';
let REFRESH_TOKEN = process.env.MS_REFRESH_TOKEN || '';
const ENABLED_SCOPES = (process.env.MS365_SCOPES || 'calendar,mail,contacts').split(',').map(s => s.trim());

let accessToken = '';
let tokenExpiresAt = 0;

// ── HTTP helper ──
function graphRequest(method, path, body) {
    return new Promise(async (resolve, reject) => {
        const token = await getAccessToken();
        const url = new URL('https://graph.microsoft.com/v1.0' + path);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(data ? JSON.parse(data) : { status: res.statusCode });
                } catch {
                    resolve({ raw: data, status: res.statusCode });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function getAccessToken() {
    return new Promise((resolve, reject) => {
        if (accessToken && Date.now() < tokenExpiresAt - 60000) {
            return resolve(accessToken);
        }
        const postData = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token',
            scope: 'https://graph.microsoft.com/.default offline_access',
        }).toString();

        const req = https.request({
            hostname: 'login.microsoftonline.com',
            path: `/${TENANT}/oauth2/v2.0/token`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        accessToken = json.access_token;
                        tokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
                        if (json.refresh_token) REFRESH_TOKEN = json.refresh_token;
                        resolve(accessToken);
                    } else {
                        reject(new Error('Token refresh failed: ' + (json.error_description || json.error || 'unknown')));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ── Tool Definitions ──

const CALENDAR_TOOLS = [
    {
        name: 'list-calendar-events',
        description: 'List calendar events within a date range. Returns subject, start, end, location, organizer.',
        inputSchema: {
            type: 'object',
            properties: {
                startDateTime: { type: 'string', description: 'ISO 8601 start (e.g. 2026-04-13T00:00:00Z)' },
                endDateTime: { type: 'string', description: 'ISO 8601 end (e.g. 2026-04-14T00:00:00Z)' },
                top: { type: 'number', description: 'Max results (default 20)', default: 20 },
            },
            required: ['startDateTime', 'endDateTime'],
        },
        handler: async (args) => {
            const start = encodeURIComponent(args.startDateTime);
            const end = encodeURIComponent(args.endDateTime);
            const top = args.top || 20;
            const result = await graphRequest('GET',
                `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$top=${top}&$select=subject,start,end,location,organizer,isAllDay,bodyPreview&$orderby=start/dateTime`
            );
            return { value: (result.value || []).map(e => ({
                id: e.id,
                subject: e.subject,
                start: e.start,
                end: e.end,
                location: e.location?.displayName || '',
                organizer: e.organizer?.emailAddress?.name || '',
                isAllDay: e.isAllDay,
                preview: e.bodyPreview?.slice(0, 100) || '',
            })) };
        },
    },
    {
        name: 'create-calendar-event',
        description: 'Create a new calendar event. Supports attendees, location, and reminders.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: 'Event title' },
                startDateTime: { type: 'string', description: 'ISO 8601 start time' },
                endDateTime: { type: 'string', description: 'ISO 8601 end time' },
                timeZone: { type: 'string', description: 'Time zone (e.g. Asia/Jerusalem)', default: 'Asia/Jerusalem' },
                location: { type: 'string', description: 'Location name' },
                body: { type: 'string', description: 'Event description (plain text)' },
                attendees: {
                    type: 'array',
                    items: { type: 'string', description: 'Email address' },
                    description: 'List of attendee email addresses',
                },
                isOnline: { type: 'boolean', description: 'Create as online meeting', default: false },
                reminderMinutes: { type: 'number', description: 'Reminder before event in minutes', default: 15 },
            },
            required: ['subject', 'startDateTime', 'endDateTime'],
        },
        handler: async (args) => {
            const tz = args.timeZone || 'Asia/Jerusalem';
            const event = {
                subject: args.subject,
                start: { dateTime: args.startDateTime, timeZone: tz },
                end: { dateTime: args.endDateTime, timeZone: tz },
                isReminderOn: true,
                reminderMinutesBeforeStart: args.reminderMinutes || 15,
            };
            if (args.location) event.location = { displayName: args.location };
            if (args.body) event.body = { contentType: 'Text', content: args.body };
            if (args.attendees?.length) {
                event.attendees = args.attendees.map(email => ({
                    emailAddress: { address: email },
                    type: 'required',
                }));
            }
            if (args.isOnline) event.isOnlineMeeting = true;
            return graphRequest('POST', '/me/events', event);
        },
    },
    {
        name: 'update-calendar-event',
        description: 'Update an existing calendar event by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID' },
                subject: { type: 'string', description: 'New title' },
                startDateTime: { type: 'string', description: 'New start time (ISO 8601)' },
                endDateTime: { type: 'string', description: 'New end time (ISO 8601)' },
                timeZone: { type: 'string', description: 'Time zone', default: 'Asia/Jerusalem' },
                location: { type: 'string', description: 'New location' },
                body: { type: 'string', description: 'New description' },
            },
            required: ['eventId'],
        },
        handler: async (args) => {
            const tz = args.timeZone || 'Asia/Jerusalem';
            const patch = {};
            if (args.subject) patch.subject = args.subject;
            if (args.startDateTime) patch.start = { dateTime: args.startDateTime, timeZone: tz };
            if (args.endDateTime) patch.end = { dateTime: args.endDateTime, timeZone: tz };
            if (args.location) patch.location = { displayName: args.location };
            if (args.body) patch.body = { contentType: 'Text', content: args.body };
            return graphRequest('PATCH', `/me/events/${args.eventId}`, patch);
        },
    },
    {
        name: 'delete-calendar-event',
        description: 'Delete a calendar event by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID to delete' },
            },
            required: ['eventId'],
        },
        handler: async (args) => {
            return graphRequest('DELETE', `/me/events/${args.eventId}`);
        },
    },
];

const MAIL_TOOLS = [
    {
        name: 'list-mail-messages',
        description: 'List recent email messages from inbox. Returns subject, from, date, preview.',
        inputSchema: {
            type: 'object',
            properties: {
                folder: { type: 'string', description: 'Folder name (inbox, sentitems, drafts)', default: 'inbox' },
                top: { type: 'number', description: 'Max results (default 10)', default: 10 },
                filter: { type: 'string', description: 'OData filter (e.g. isRead eq false)' },
                search: { type: 'string', description: 'Search query' },
            },
        },
        handler: async (args) => {
            const folder = args.folder || 'inbox';
            const top = args.top || 10;
            let path = `/me/mailFolders/${folder}/messages?$top=${top}&$select=subject,from,receivedDateTime,bodyPreview,isRead,importance&$orderby=receivedDateTime desc`;
            if (args.filter) path += `&$filter=${encodeURIComponent(args.filter)}`;
            if (args.search) path += `&$search="${encodeURIComponent(args.search)}"`;
            const result = await graphRequest('GET', path);
            return { value: (result.value || []).map(m => ({
                id: m.id,
                subject: m.subject,
                from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '',
                fromEmail: m.from?.emailAddress?.address || '',
                date: m.receivedDateTime,
                preview: m.bodyPreview?.slice(0, 200) || '',
                isRead: m.isRead,
                importance: m.importance,
            })) };
        },
    },
    {
        name: 'read-mail-message',
        description: 'Read the full content of an email message by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                messageId: { type: 'string', description: 'Message ID' },
            },
            required: ['messageId'],
        },
        handler: async (args) => {
            const result = await graphRequest('GET',
                `/me/messages/${args.messageId}?$select=subject,from,toRecipients,ccRecipients,body,receivedDateTime,hasAttachments`
            );
            return {
                subject: result.subject,
                from: result.from?.emailAddress,
                to: (result.toRecipients || []).map(r => r.emailAddress),
                cc: (result.ccRecipients || []).map(r => r.emailAddress),
                date: result.receivedDateTime,
                body: result.body?.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000) || '',
                hasAttachments: result.hasAttachments,
            };
        },
    },
    {
        name: 'send-mail',
        description: 'Send an email. Supports to, cc, bcc, subject, body (HTML or text).',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Recipient email addresses',
                },
                cc: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'CC email addresses',
                },
                subject: { type: 'string', description: 'Email subject' },
                body: { type: 'string', description: 'Email body (plain text or HTML)' },
                isHtml: { type: 'boolean', description: 'Whether body is HTML', default: false },
            },
            required: ['to', 'subject', 'body'],
        },
        handler: async (args) => {
            const message = {
                subject: args.subject,
                body: {
                    contentType: args.isHtml ? 'HTML' : 'Text',
                    content: args.body,
                },
                toRecipients: args.to.map(email => ({ emailAddress: { address: email } })),
            };
            if (args.cc?.length) {
                message.ccRecipients = args.cc.map(email => ({ emailAddress: { address: email } }));
            }
            return graphRequest('POST', '/me/sendMail', { message, saveToSentItems: true });
        },
    },
    {
        name: 'reply-to-mail',
        description: 'Reply to an email message.',
        inputSchema: {
            type: 'object',
            properties: {
                messageId: { type: 'string', description: 'Original message ID to reply to' },
                comment: { type: 'string', description: 'Reply text' },
                replyAll: { type: 'boolean', description: 'Reply to all recipients', default: false },
            },
            required: ['messageId', 'comment'],
        },
        handler: async (args) => {
            const action = args.replyAll ? 'replyAll' : 'reply';
            return graphRequest('POST', `/me/messages/${args.messageId}/${action}`, {
                comment: args.comment,
            });
        },
    },
];

const CONTACTS_TOOLS = [
    {
        name: 'list-contacts',
        description: 'List contacts from the user\'s address book. Returns name, email, phone, company.',
        inputSchema: {
            type: 'object',
            properties: {
                top: { type: 'number', description: 'Max results (default 20)', default: 20 },
                search: { type: 'string', description: 'Search by name or email' },
            },
        },
        handler: async (args) => {
            const top = args.top || 20;
            let path = `/me/contacts?$top=${top}&$select=displayName,emailAddresses,mobilePhone,businessPhones,companyName,jobTitle&$orderby=displayName`;
            if (args.search) path += `&$search="${encodeURIComponent(args.search)}"`;
            const result = await graphRequest('GET', path);
            return { value: (result.value || []).map(c => ({
                id: c.id,
                name: c.displayName,
                emails: (c.emailAddresses || []).map(e => e.address),
                phone: c.mobilePhone || (c.businessPhones || [])[0] || '',
                company: c.companyName || '',
                title: c.jobTitle || '',
            })) };
        },
    },
    {
        name: 'get-contact',
        description: 'Get full details of a contact by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                contactId: { type: 'string', description: 'Contact ID' },
            },
            required: ['contactId'],
        },
        handler: async (args) => {
            return graphRequest('GET', `/me/contacts/${args.contactId}?$select=displayName,givenName,surname,emailAddresses,mobilePhone,businessPhones,homePhones,companyName,jobTitle,department,birthday,personalNotes`);
        },
    },
    {
        name: 'create-contact',
        description: 'Create a new contact in the address book.',
        inputSchema: {
            type: 'object',
            properties: {
                givenName: { type: 'string', description: 'First name' },
                surname: { type: 'string', description: 'Last name' },
                email: { type: 'string', description: 'Email address' },
                phone: { type: 'string', description: 'Mobile phone number' },
                company: { type: 'string', description: 'Company name' },
                jobTitle: { type: 'string', description: 'Job title' },
                notes: { type: 'string', description: 'Personal notes' },
            },
            required: ['givenName'],
        },
        handler: async (args) => {
            const contact = { givenName: args.givenName };
            if (args.surname) contact.surname = args.surname;
            if (args.email) contact.emailAddresses = [{ address: args.email, name: `${args.givenName} ${args.surname || ''}`.trim() }];
            if (args.phone) contact.mobilePhone = args.phone;
            if (args.company) contact.companyName = args.company;
            if (args.jobTitle) contact.jobTitle = args.jobTitle;
            if (args.notes) contact.personalNotes = args.notes;
            return graphRequest('POST', '/me/contacts', contact);
        },
    },
    {
        name: 'delete-contact',
        description: 'Delete a contact by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                contactId: { type: 'string', description: 'Contact ID to delete' },
            },
            required: ['contactId'],
        },
        handler: async (args) => {
            return graphRequest('DELETE', `/me/contacts/${args.contactId}`);
        },
    },
];

// ── Build tool list based on enabled scopes ──
function getEnabledTools() {
    const tools = [];
    if (ENABLED_SCOPES.includes('calendar')) tools.push(...CALENDAR_TOOLS);
    if (ENABLED_SCOPES.includes('mail')) tools.push(...MAIL_TOOLS);
    if (ENABLED_SCOPES.includes('contacts')) tools.push(...CONTACTS_TOOLS);
    return tools;
}

// ── MCP Protocol (stdio JSON-RPC) ──

const tools = getEnabledTools();
const toolMap = Object.fromEntries(tools.map(t => [t.name, t]));

function sendResponse(id, result) {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
    process.stdout.write(msg + '\n');
}

function sendError(id, code, message) {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
    process.stdout.write(msg + '\n');
}

function sendNotification(method, params) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    process.stdout.write(msg + '\n');
}

async function handleRequest(req) {
    const { id, method, params } = req;

    switch (method) {
        case 'initialize':
            sendResponse(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: {
                    name: 'ms365-lite',
                    version: '1.0.0',
                },
            });
            // Send initialized notification
            sendNotification('notifications/initialized', {});
            break;

        case 'tools/list':
            sendResponse(id, {
                tools: tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                })),
            });
            break;

        case 'tools/call': {
            const toolName = params?.name;
            const toolArgs = params?.arguments || {};
            const tool = toolMap[toolName];
            if (!tool) {
                sendResponse(id, {
                    content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
                    isError: true,
                });
                break;
            }
            try {
                const result = await tool.handler(toolArgs);
                sendResponse(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (err) {
                sendResponse(id, {
                    content: [{ type: 'text', text: `Error: ${err.message}` }],
                    isError: true,
                });
            }
            break;
        }

        case 'ping':
            sendResponse(id, {});
            break;

        default:
            if (id) sendError(id, -32601, `Method not found: ${method}`);
            break;
    }
}

// ── Main: read JSON-RPC from stdin ──
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    // Process line-delimited JSON
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
            try {
                handleRequest(JSON.parse(line));
            } catch (err) {
                process.stderr.write(`Parse error: ${err.message}\n`);
            }
        }
    }
});

process.stdin.on('end', () => process.exit(0));
process.stderr.write(`ms365-lite MCP server started (scopes: ${ENABLED_SCOPES.join(',')})\n`);
