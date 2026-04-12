import type {
    ClawMetricsResponse,
    ClawVersionsResponse,
    ClawFilesResponse,
    ReadClawFileResponse,
    Plan,
    BillingOrder
} from '@/ts/Interfaces'

import { clawFileType } from '@openclaw/shared'

const demoMetrics: ClawMetricsResponse = {
    cpu: {
        usagePercent: 23,
        cores: 2
    },
    memory: {
        total: 4294967296,
        used: 1503238553,
        available: 2791728743
    },
    disk: {
        total: 42949672960,
        used: 12884901888,
        available: 30064771072,
        usagePercent: 30
    },
    loadAvg: {
        load1: 0.42,
        load5: 0.38,
        load15: 0.31
    },
    network: {
        rxBytes: 2147483648,
        txBytes: 536870912,
        interface: 'eth0'
    },
    processes: [
        { pid: 1, user: 'root', cpu: 0.1, mem: 0.5, command: 'systemd' },
        { pid: 847, user: 'openclaw', cpu: 12.3, mem: 8.2, command: 'openclaw-gateway' },
        { pid: 912, user: 'openclaw', cpu: 8.7, mem: 15.4, command: 'openclaw' },
        { pid: 1024, user: 'openclaw', cpu: 2.1, mem: 3.8, command: 'node' },
        { pid: 1156, user: 'root', cpu: 0.3, mem: 1.2, command: 'sshd' }
    ],
    uptime: '12d 4h 32m',
    timestamp: Date.now()
}

const demoVersions: ClawVersionsResponse = {
    currentVersion: '2026.3.28',
    latestVersion: '2026.3.28',
    versions: [
        {
            version: '2026.3.28',
            publishedAt: '2026-03-28T10:00:00Z',
            downloads: 14520
        },
        {
            version: '2026.3.15',
            publishedAt: '2026-03-15T10:00:00Z',
            downloads: 31200
        },
        {
            version: '2026.2.20',
            publishedAt: '2026-02-20T10:00:00Z',
            downloads: 48700
        },
        {
            version: '2026.2.5',
            publishedAt: '2026-02-05T10:00:00Z',
            downloads: 52100
        },
        {
            version: '2026.1.18',
            publishedAt: '2026-01-18T10:00:00Z',
            downloads: 67300
        }
    ]
}

const demoFiles: ClawFilesResponse = {
    files: [
        { path: 'openclaw.json', name: 'openclaw.json', fileType: clawFileType.json },
        { path: '.env', name: '.env', fileType: clawFileType.text },
        { path: 'tools/browser.ts', name: 'browser.ts', fileType: clawFileType.typescript },
        { path: 'tools/search.ts', name: 'search.ts', fileType: clawFileType.typescript },
        { path: 'prompts/system.md', name: 'system.md', fileType: clawFileType.markdown }
    ]
}

const demoFileContent: ReadClawFileResponse = {
    content: JSON.stringify({
        version: '2026.3.28',
        model: 'claude-sonnet-4-5-20250514',
        contextWindow: '200k',
        browser: { enabled: true },
        commands: { enabled: true },
        tools: ['computer', 'bash', 'text_editor', 'mcp'],
        gateway: {
            port: 18789,
            auth: true
        }
    }, null, 4),
    path: 'openclaw.json'
}

const demoPlan: Plan = {
    id: 'cx22',
    name: 'CX22',
    cpu: 2,
    memory: 4,
    disk: 40,
    priceMonthly: 5.29,
    priceYearly: 50.99,
    architecture: 'x86'
}

const demoBillingOrders: BillingOrder[] = [
    {
        id: 'demo-order-1',
        status: 'paid',
        subtotalAmount: 529,
        discountAmount: 0,
        totalAmount: 529,
        taxAmount: 0,
        currency: 'usd',
        billingReason: 'subscription_cycle',
        productName: 'CX22',
        productId: 'demo-product',
        subscriptionId: 'demo-sub-1',
        discountName: null,
        createdAt: '2026-04-01T00:00:00Z'
    },
    {
        id: 'demo-order-2',
        status: 'paid',
        subtotalAmount: 529,
        discountAmount: 0,
        totalAmount: 529,
        taxAmount: 0,
        currency: 'usd',
        billingReason: 'subscription_cycle',
        productName: 'CX22',
        productId: 'demo-product',
        subscriptionId: 'demo-sub-1',
        discountName: null,
        createdAt: '2026-03-01T00:00:00Z'
    },
    {
        id: 'demo-order-3',
        status: 'paid',
        subtotalAmount: 529,
        discountAmount: 0,
        totalAmount: 529,
        taxAmount: 0,
        currency: 'usd',
        billingReason: 'subscription_create',
        productName: 'CX22',
        productId: 'demo-product',
        subscriptionId: 'demo-sub-1',
        discountName: null,
        createdAt: '2026-02-01T00:00:00Z'
    }
]

const demoTerminalOutput = [
    '\x1b[32mopenclaw@personal-claw\x1b[0m:\x1b[34m~\x1b[0m$ openclaw status',
    '',
    '\x1b[1mOpenClaw v2026.3.28\x1b[0m',
    '',
    '  Gateway:    \x1b[32m● running\x1b[0m  (port 18789)',
    '  Instance:   \x1b[32m● active\x1b[0m   (claude-sonnet-4-5)',
    '  Sessions:   2 active',
    '  Memory:     1.2 GB / 4 GB',
    '  Uptime:     12d 4h 32m',
    '',
    '\x1b[32mopenclaw@personal-claw\x1b[0m:\x1b[34m~\x1b[0m$ \x1b[?25h'
].join('\r\n')

export {
    demoMetrics,
    demoVersions,
    demoFiles,
    demoFileContent,
    demoPlan,
    demoBillingOrders,
    demoTerminalOutput
}