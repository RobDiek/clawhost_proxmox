/**
 * GitHub Integration — connect repo for content publishing
 *
 * Agent writes MDX article → approve → publish to GitHub repo
 * → Cloudflare Pages / Vercel / Netlify auto-builds → live on site
 *
 * Uses @modelcontextprotocol/server-github MCP on VPS for agent access.
 * Uses GitHub REST API directly for publishing from management server.
 */

import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

// POST /integrations/github/save
export const saveGithubConfig = async (c: Context) => {
    try {
        const body = await c.req.json<{
            instanceId: string
            token: string       // GitHub Personal Access Token (fine-grained)
            repo: string        // "owner/repo" format
            branch?: string     // default: main
            contentPath?: string // path to content dir, e.g. "content/guides"
        }>()

        if (!body.instanceId || !body.token || !body.repo) {
            return fail(c, 'instanceId, token, and repo required', 400)
        }

        if (!body.repo.includes('/')) {
            return fail(c, 'repo must be in "owner/repo" format', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(body.instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        // Validate token by calling GitHub API
        const testRes = await fetch(`https://api.github.com/repos/${body.repo}`, {
            headers: {
                'Authorization': `Bearer ${body.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ClawFlow-SEO',
            },
        })
        if (testRes.status === 401) {
            return fail(c, 'Token לא תקף — ייתכן שפג תוקף או נמחק. צרו token חדש.', 400)
        }
        if (testRes.status === 403) {
            return fail(c, 'Token אין לו הרשאה מספקת. בדקו שסימנתם Contents: Read+Write + Pull requests: Read+Write בזמן יצירת ה-token.', 400)
        }
        if (testRes.status === 404) {
            return fail(c, `Repository "${body.repo}" לא נמצא, או שה-token לא נבחר לגשת אליו. בדקו: (1) האיות נכון (owner/repo), (2) בעת יצירת ה-token בחרתם "Only select repositories" ← ה-repo הזה בדיוק.`, 400)
        }
        if (testRes.status >= 400) {
            const errText = await testRes.text().catch(() => '')
            return fail(c, `GitHub API החזיר שגיאה ${testRes.status}: ${errText.substring(0, 200)}`, 400)
        }

        const repoData = await testRes.json() as { default_branch?: string; full_name?: string }

        // Save config
        const githubConfig = {
            token: body.token,
            repo: body.repo,
            branch: body.branch || repoData.default_branch || 'main',
            contentPath: body.contentPath || 'content/guides',
            connectedAt: new Date().toISOString(),
        }

        await db.update(instances)
            .set({ githubConfig: githubConfig as any })
            .where(eq(instances.id, body.instanceId))

        // Deploy GitHub MCP server to VPS + update SOUL with safety rules
        if (instance.ip) {
            try {
                await deployGithubMcpToVPS(instance.ip, instance.rootPassword || undefined, body.token)
                await updateSoulWithGithubTools(instance.ip, instance.rootPassword || undefined, githubConfig.repo, githubConfig.branch)
            } catch (err) {
                console.error('Failed to deploy GitHub MCP:', err)
            }
        }

        console.log(`GitHub connected for ${body.instanceId}: ${body.repo}`)
        return ok(c, { repo: body.repo, branch: githubConfig.branch }, 'GitHub connected.')
    } catch (err) {
        console.error('saveGithubConfig error:', err)
        return fail(c, 'Failed to save GitHub config', 500)
    }
}

// GET /integrations/github/status
export const getGithubStatus = async (c: Context) => {
    try {
        const instanceId = c.req.query('instanceId')
        if (!instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const config = instance.githubConfig as any
        if (!config?.token) return ok(c, { connected: false }, 'Not connected.')

        return ok(c, {
            connected: true,
            repo: config.repo,
            branch: config.branch,
            contentPath: config.contentPath,
        }, 'Connected.')
    } catch (err) {
        console.error('getGithubStatus error:', err)
        return fail(c, 'Failed', 500)
    }
}

// POST /integrations/github/disconnect
export const disconnectGithub = async (c: Context) => {
    try {
        const body = await c.req.json<{ instanceId: string }>()
        if (!body.instanceId) return fail(c, 'instanceId required', 400)

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(body.instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        await db.update(instances)
            .set({ githubConfig: null })
            .where(eq(instances.id, body.instanceId))

        // Remove MCP from VPS
        if (instance.ip) {
            try {
                await sshExec(instance.ip, `
                    systemctl stop openclaw-gateway &&
                    python3 -c "
import json
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.get('mcp', {}).get('servers', {}).pop('github', None)
with open(p, 'w') as f: json.dump(d, f, indent=2)
" &&
                    chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
                    systemctl start openclaw-gateway
                `, instance.rootPassword || undefined)
            } catch { /* best effort */ }
        }

        return ok(c, null, 'GitHub disconnected.')
    } catch (err) {
        console.error('disconnectGithub error:', err)
        return fail(c, 'Failed', 500)
    }
}

// POST /integrations/github/publish — publish content to GitHub repo
export const publishToGithub = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const config = instance.githubConfig as any
        if (!config?.token) return fail(c, 'GitHub not connected', 400)

        const body = await c.req.json<{
            filePath: string    // e.g. "content/guides/seo-pricing-2026.mdx"
            content: string     // full MDX content with frontmatter
            commitMessage: string
        }>()

        if (!body.filePath || !body.content) {
            return fail(c, 'filePath and content required', 400)
        }

        // Create or update file via GitHub API
        const apiUrl = `https://api.github.com/repos/${config.repo}/contents/${body.filePath}`

        // Check if file exists (for update — need sha)
        let existingSha: string | undefined
        try {
            const existing = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'ClawFlow-SEO',
                },
            })
            if (existing.ok) {
                const data = await existing.json() as { sha?: string }
                existingSha = data.sha
            }
        } catch { /* file doesn't exist — create new */ }

        // Create/update file
        const payload: Record<string, string> = {
            message: body.commitMessage || `Add ${body.filePath.split('/').pop()}`,
            content: Buffer.from(body.content).toString('base64'),
            branch: config.branch || 'main',
        }
        if (existingSha) payload.sha = existingSha

        const res = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'ClawFlow-SEO',
            },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json() as { message?: string }
            return fail(c, `GitHub API error: ${err.message || res.status}`, 502)
        }

        const result = await res.json() as { content?: { html_url?: string } }
        console.log(`Published to GitHub: ${config.repo}/${body.filePath}`)

        return ok(c, {
            url: result.content?.html_url || `https://github.com/${config.repo}/blob/${config.branch}/${body.filePath}`,
            repo: config.repo,
            filePath: body.filePath,
        }, 'Published to GitHub.')
    } catch (err) {
        console.error('publishToGithub error:', err)
        return fail(c, 'Failed to publish', 500)
    }
}

// Deploy GitHub MCP server to VPS
async function deployGithubMcpToVPS(ip: string, password: string | undefined, token: string): Promise<void> {
    console.log(`Deploying GitHub MCP server to ${ip}...`)

    const mcpConfig = {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: token,
        },
    }

    const mcpB64 = Buffer.from(JSON.stringify(mcpConfig)).toString('base64')

    await sshExec(ip, `
        systemctl stop openclaw-gateway &&
        python3 -c "
import json, base64, sys
cfg = json.loads(base64.b64decode(sys.argv[1]))
p = '/home/openclaw/.openclaw/openclaw.json'
with open(p) as f: d = json.load(f)
d.setdefault('mcp', {}).setdefault('servers', {})
d['mcp']['servers']['github'] = cfg
with open(p, 'w') as f: json.dump(d, f, indent=2)
print('github MCP configured')
" '${mcpB64}' &&
        chown openclaw:openclaw /home/openclaw/.openclaw/openclaw.json &&
        systemctl start openclaw-gateway
    `, password)

    console.log(`GitHub MCP server deployed to ${ip}`)
}

// ── Append GitHub tools section to SOUL.md with safety rules ──
// Teaches agents when + how to use github MCP; enforces PR flow for main branch.
async function updateSoulWithGithubTools(ip: string, password: string | undefined, repo: string, branch: string): Promise<void> {
    try {
        const soul = await sshExec(ip, 'cat /home/openclaw/.openclaw/workspace/SOUL.md 2>/dev/null || echo ""', password)
        if (soul.includes('GitHub MCP')) {
            console.log('SOUL already contains github section — skip')
            return
        }

        const section = `

## GitHub MCP — עריכת קוד האתר

שרת GitHub MCP מותקן. מחובר ל-**${repo}** (ענף ברירת מחדל: ${branch}).

**כלים זמינים** (המרכזיים):
- \`get_file_contents({owner, repo, path, branch})\` — קרא קובץ
- \`create_or_update_file({owner, repo, path, content, message, branch})\` — הוסף/ערוך קובץ (בסיס64 אוטומטי ב-MCP)
- \`push_files({owner, repo, branch, files[], message})\` — עדכון בצרור של מספר קבצים בקומיט אחד
- \`create_branch({owner, repo, branch, from_branch})\` — צור ענף חדש
- \`create_pull_request({owner, repo, title, head, base, body})\` — פתח PR לסקירה
- \`list_commits\`, \`search_code\`, \`search_repositories\`, \`create_issue\`

**⚠️ כלל בטיחות קריטי — חובה:**

1. **לעולם אל תדחוף ישירות לברנץ \`${branch}\` (המרכזי).** תמיד:
   - צור ענף \`agent/<short-description>\` (לדוגמה \`agent/add-faq-schema\`)
   - עשה commits לענף הזה
   - פתח PR ל-\`${branch}\` עם description ברור בעברית על מה שונה ולמה
   - המשתמש יסקור וימזג ידנית

2. **אל תערוך ללא הקשר.** לפני שאתה עורך:
   - קרא את הקובץ עם \`get_file_contents\`
   - שנה רק את המינימום הנדרש
   - אם אתה מוסיף תלות חדשה (npm, npm, import) — **הזכיר זאת במפורש ב-PR description**

3. **תוכן שיווקי vs קוד:**
   - תוכן (\`content/**/*.mdx\`, \`blog/*.md\`) — בדרך כלל בטוח לעריכה אבל עדיין דרך PR
   - קוד (\`app/**\`, \`components/**\`, \`.ts\`, \`.tsx\`) — **תמיד PR + שיקול זהיר**
   - config (\`next.config.ts\`, \`package.json\`, env files) — **אסור לערוך ללא בקשה מפורשת**

4. **PR description tempalte:**
\`\`\`
## מה שינוי
<תיאור קצר בעברית>

## למה
<הסבר + קישור לאסטרטגיה/אימות/issue>

## בדיקות שבוצעו
- [ ] קריאתי את הקובץ המקורי לפני עריכה
- [ ] רק השינוי המינימלי הדרוש
- [ ] אין תלויות חדשות (או: תלות X נוספה כי Y)

🤖 נוצר על ידי Flowmatic Agent
\`\`\`

**שגרת עבודה לדוגמה (שליח יוצר מאמר בלוג):**
\`\`\`js
// 1. Ensure branch exists
create_branch({ owner: '${repo.split('/')[0]}', repo: '${repo.split('/')[1]}', branch: 'agent/new-article-seo-2026', from_branch: '${branch}' })

// 2. Read current content dir for format reference
get_file_contents({ owner, repo, path: 'content/guides', branch: '${branch}' })

// 3. Create the article
create_or_update_file({
  owner, repo,
  path: 'content/guides/open-source-marketing-automation-2026.mdx',
  content: '<MDX with frontmatter + Hebrew body + Schema>',
  message: 'docs: add open-source marketing automation guide (2026 edition)',
  branch: 'agent/new-article-seo-2026'
})

// 4. Open PR for user approval
create_pull_request({
  owner, repo,
  title: 'תוכן: מדריך Open Source Marketing Automation 2026',
  head: 'agent/new-article-seo-2026',
  base: '${branch}',
  body: '<PR template...>'
})
\`\`\`

**עוגן הבטיחות האחרון:** גם אחרי merge — הבילד של Cloudflare Pages/Vercel ירוץ. אם הוא נכשל — הפרסום לא יתבצע. לכן אם יש ספק לגבי שינוי — עדיף לא לעשות merge.
`
        const b64 = Buffer.from(section, 'utf8').toString('base64')
        await sshExec(ip,
            `echo '${b64}' | base64 -d >> /home/openclaw/.openclaw/workspace/SOUL.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/SOUL.md`,
            password, 15000
        )
        await sshExec(ip, 'systemctl restart openclaw-gateway', password, 15000)
        console.log('SOUL.md updated with GitHub MCP + safety rules')
    } catch (err) {
        console.error('updateSoulWithGithubTools error (non-fatal):', err)
    }
}

// POST /hosting/instances/:id/integrations/github/test
// End-to-end verification: read repo, create agent branch, write test file, open PR, cleanup
export const testGithubIntegration = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const config = (instance.githubConfig as any) || {}
        if (!config.token || !config.repo) return fail(c, 'GitHub not connected', 400)

        const [owner, repoName] = String(config.repo).split('/')
        const branch = config.branch || 'main'
        const testBranch = `agent/flowmatic-smoke-test-${Date.now()}`
        const headers = {
            'Authorization': `Bearer ${config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'ClawFlow-SEO',
        }
        const steps: Array<{ step: string; ok: boolean; detail?: string }> = []

        // 1. Get default branch SHA (needed to create new branch from it)
        const refRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`, { headers })
        if (!refRes.ok) {
            steps.push({ step: 'read-default-branch', ok: false, detail: `${refRes.status} ${await refRes.text().catch(() => '')}`.substring(0, 200) })
            return ok(c, { steps, passed: false }, 'Test failed')
        }
        const refData = await refRes.json() as { object?: { sha?: string } }
        const baseSha = refData.object?.sha
        if (!baseSha) return ok(c, { steps: [{ step: 'read-default-branch', ok: false, detail: 'no SHA' }], passed: false })
        steps.push({ step: 'read-default-branch', ok: true, detail: `SHA ${baseSha.substring(0, 7)}` })

        // 2. Create test branch
        const createBranchRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
            method: 'POST', headers,
            body: JSON.stringify({ ref: `refs/heads/${testBranch}`, sha: baseSha }),
        })
        if (!createBranchRes.ok) {
            let hint = ''
            let diagnosis = ''
            let repoOwnerType: string | null = null
            let authedUser: string | null = null
            let errorBody: any = null
            try { errorBody = await createBranchRes.json() } catch {}

            if (createBranchRes.status === 403) {
                // Gather diagnostic context
                const [repoDetailsRes, userRes] = await Promise.all([
                    fetch(`https://api.github.com/repos/${owner}/${repoName}`, { headers }).then(r => r.ok ? r.json() as Promise<any> : null).catch(() => null),
                    fetch('https://api.github.com/user', { headers }).then(r => r.ok ? r.json() as Promise<any> : null).catch(() => null),
                ])
                repoOwnerType = repoDetailsRes?.owner?.type || null
                authedUser = userRes?.login || null

                const errMsg = (errorBody?.message || '').toLowerCase()

                // Priority 1: org PAT approval pending
                if (repoOwnerType === 'Organization' && (errMsg.includes('resource not accessible') || errMsg.includes('not accessible by personal access token'))) {
                    diagnosis = 'org_pat_pending_approval'
                    hint = `ה-repo ב-organization "${owner}". נראה שה-Token ממתין לאישור admin. היכנסו ל-github.com/organizations/${owner}/settings/personal-access-tokens-requests → Approve.`
                }
                // Priority 2: not a member / wrong owner
                else if (repoOwnerType === 'Organization' && authedUser) {
                    diagnosis = 'wrong_resource_owner'
                    hint = `ה-Token נוצר על ידי "${authedUser}" אבל ה-repo שייך ל-"${owner}" (organization). ודאו שבעת יצירת ה-Token בחרתם Resource owner="${owner}" (לא החשבון האישי).`
                }
                // Priority 3: write permissions missing
                else if (errMsg.includes('write') || errMsg.includes('permission')) {
                    diagnosis = 'write_blocked'
                    hint = 'ל-Token חסרה הרשאת כתיבה. צרו Token חדש ובחרו Contents: Read and write + Pull requests: Read and write.'
                }
                // Fallback — include raw error
                else {
                    diagnosis = 'forbidden'
                    hint = `GitHub החזיר 403${errorBody?.message ? ' (' + errorBody.message + ')' : ''}. זה לרוב אחת משלוש בעיות: (1) Resource owner של ה-Token שגוי, (2) הרשאות Contents/Pull-requests לא Read+Write, (3) organization ממתין לאישור ה-Token.`
                }
            } else if (createBranchRes.status === 422) {
                diagnosis = 'branch_exists'
                hint = 'ענף בדיקה עם השם הזה כבר קיים — תופעה נדירה. נסו שוב.'
            } else if (createBranchRes.status === 404) {
                diagnosis = 'refs_not_accessible'
                hint = 'הטוקן יכול לקרוא את ה-repo אך אין לו גישה ל-refs. בדקו שה-Token סומן Contents: Read and write.'
            } else {
                hint = `HTTP ${createBranchRes.status}${errorBody?.message ? ': ' + errorBody.message : ''}`
            }
            steps.push({
                step: 'create-test-branch', ok: false,
                detail: `HTTP ${createBranchRes.status}` + (hint ? ' · ' + hint.substring(0, 120) : '')
            })
            return ok(c, {
                steps, passed: false, diagnosis, hint,
                context: { repoOwner: owner, repoOwnerType, authedUser }
            }, 'Test incomplete')
        }
        steps.push({ step: 'create-test-branch', ok: true, detail: `${testBranch}` })

        // 3. Create test file in that branch
        const testFilePath = `.flowmatic-agent-smoke-test.md`
        const testContent = `# Smoke Test\n\nThis file was created by Flowmatic agent smoke test at ${new Date().toISOString()}.\n\nIt confirms:\n- Token has Contents write\n- Branch creation works\n- File commits work\n- PR creation works\n\nSafe to delete.\n`
        const writeRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${testFilePath}`, {
            method: 'PUT', headers,
            body: JSON.stringify({
                message: 'test: flowmatic agent smoke test',
                content: Buffer.from(testContent).toString('base64'),
                branch: testBranch,
            }),
        })
        steps.push({ step: 'write-test-file', ok: writeRes.ok, detail: `HTTP ${writeRes.status}` })
        if (!writeRes.ok) return ok(c, { steps, passed: false })

        // 4. Open PR
        const prRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls`, {
            method: 'POST', headers,
            body: JSON.stringify({
                title: '🧪 Flowmatic agent smoke test (safe to close/delete)',
                head: testBranch, base: branch,
                body: `This is an automated smoke test from Flowmatic dashboard.\n\nIf you see this PR — the GitHub integration is working correctly:\n- ✅ Token authentication\n- ✅ Branch creation\n- ✅ File writes\n- ✅ PR creation\n\nSafe to **close without merging** + delete the branch.\n\nCreated: ${new Date().toISOString()}`,
            }),
        })
        const prData = await prRes.json().catch(() => null) as { html_url?: string; number?: number } | null
        steps.push({
            step: 'create-pr', ok: prRes.ok,
            detail: prRes.ok ? `#${prData?.number} ${prData?.html_url}` : `HTTP ${prRes.status}`
        })

        return ok(c, {
            steps,
            passed: steps.every(s => s.ok),
            prUrl: prData?.html_url || null,
            testBranch,
            cleanupHint: 'Close the PR + delete the branch manually, or use /github/test-cleanup',
        }, 'Smoke test complete')
    } catch (err) {
        console.error('testGithubIntegration error:', err)
        return fail(c, 'Test failed', 500)
    }
}
