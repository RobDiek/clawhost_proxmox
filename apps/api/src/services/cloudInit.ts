import { readFileSync } from 'fs'
import { resolve } from 'path'

interface CloudInitVars {
    INSTANCE_ID: string
    SUBDOMAIN_NAME: string
    OPENCLAW_TOKEN: string
    AUTOMATION_TOOL: 'n8n' | 'activepieces'
    AUTOMATION_PASSWORD: string
    ROOT_PASSWORD: string
    HAS_OLLAMA: boolean
}

const AUTOMATION_PORTS: Record<string, number> = {
    n8n: 5678,
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

    if (vars.HAS_OLLAMA) {
        template = template.replace(/\{\{#HAS_OLLAMA\}\}/g, '')
        template = template.replace(/\{\{\/HAS_OLLAMA\}\}/g, '')
    } else {
        template = template.replace(/\{\{#HAS_OLLAMA\}\}[\s\S]*?\{\{\/HAS_OLLAMA\}\}/g, '')
    }

    return template
}
