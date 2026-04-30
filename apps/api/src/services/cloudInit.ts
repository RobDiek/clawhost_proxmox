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

    // HAS_* flags — substituted as text literals 'true'/'false' for install.sh
    // to read via /etc/openclaw/instance.env. Mustache-style block syntax is no
    // longer used (the bootstrap doesn't have inline conditionals — install.sh
    // does the if-checks at runtime).
    template = template.replace(/\{\{HAS_OLLAMA\}\}/g, vars.HAS_OLLAMA ? 'true' : 'false')
    template = template.replace(/\{\{HAS_BACKUP\}\}/g, vars.HAS_BACKUP ? 'true' : 'false')

    return template
}