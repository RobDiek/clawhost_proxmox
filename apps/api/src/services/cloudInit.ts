import { readFileSync } from 'fs'
import { resolve } from 'path'

interface CloudInitVars {
    INSTANCE_ID: string
    SUBDOMAIN_NAME: string
    OPENCLAW_TOKEN: string
    AUTOMATION_TOOL: 'activepieces'
    AUTOMATION_PASSWORD: string
    ROOT_PASSWORD: string
    HAS_OLLAMA: boolean
    HAS_BACKUP: boolean
}

const AUTOMATION_PORTS: Record<string, number> = {
    activepieces: 8080,
}

export function renderCloudInit(vars: CloudInitVars): string {
    const templatePath = resolve(process.cwd(), '../../scripts/cloud-init-template.yaml')
    let template = readFileSync(templatePath, 'utf-8')

    // Replace all template variables
    template = template.replace(/\{\{INSTANCE_ID\}\}/g, vars.INSTANCE_ID)
    template = template.replace(/\{\{SUBDOMAIN_NAME\}\}/g, vars.SUBDOMAIN_NAME)
    template = template.replace(/\{\{OPENCLAW_TOKEN\}\}/g, vars.OPENCLAW_TOKEN)
    template = template.replace(/\{\{AUTOMATION_TOOL\}\}/g, vars.AUTOMATION_TOOL)
    template = template.replace(/\{\{AUTOMATION_PORT\}\}/g, String(AUTOMATION_PORTS[vars.AUTOMATION_TOOL]))
    template = template.replace(/\{\{AUTOMATION_PASSWORD\}\}/g, vars.AUTOMATION_PASSWORD)
    template = template.replace(/\{\{ROOT_PASSWORD\}\}/g, vars.ROOT_PASSWORD)
    template = template.replace(/\{\{MEM0_API_KEY\}\}/g, process.env.MEM0_API_KEY || '')

    // Automation: Activepieces only (n8n/Dify removed for license compliance)
    template = template.replace(/\{\{#IS_ACTIVEPIECES\}\}/g, '')
    template = template.replace(/\{\{\/IS_ACTIVEPIECES\}\}/g, '')

    // Conditional: Ollama
    if (vars.HAS_OLLAMA) {
        template = template.replace(/\{\{#HAS_OLLAMA\}\}/g, '')
        template = template.replace(/\{\{\/HAS_OLLAMA\}\}/g, '')
    } else {
        template = template.replace(/\{\{#HAS_OLLAMA\}\}[\s\S]*?\{\{\/HAS_OLLAMA\}\}/g, '')
    }

    // Twenty CRM removed (AGPLv3 license risk)

    // Conditional: Backup
    if (vars.HAS_BACKUP) {
        template = template.replace(/\{\{#HAS_BACKUP\}\}/g, '')
        template = template.replace(/\{\{\/HAS_BACKUP\}\}/g, '')
    } else {
        template = template.replace(/\{\{#HAS_BACKUP\}\}[\s\S]*?\{\{\/HAS_BACKUP\}\}/g, '')
    }

    return template
}
