import { agentType as agentTypeConst } from '@openclaw/shared'
import { generateCloudInit, DOMAIN } from '@/controllers/agents/helpers'

const parseArg = (flag: string): string | null => {
    const idx = process.argv.indexOf(flag)
    if (idx === -1 || idx === process.argv.length - 1) return null
    return process.argv[idx + 1] || null
}

const usage = (): never => {
    console.error(`
Usage:
  bun scripts/preview-cloud-init.ts [options]

Options:
  --type <type>      'openclaw' or 'hermes' (default: hermes)
  --subdomain <sub>  Subdomain to template (default: preview-claw)

Prints the cloud-init YAML that would run on a fresh server for the given
agent type. Nothing is provisioned. Useful for reviewing what install.sh
would do before spending money on a real Hetzner box.
`)
    process.exit(1)
}

const rawType = parseArg('--type') || agentTypeConst.HERMES
if (process.argv.includes('--help') || process.argv.includes('-h')) usage()

const selectedType =
    rawType === agentTypeConst.OPENCLAW
        ? agentTypeConst.OPENCLAW
        : agentTypeConst.HERMES

const subdomain = parseArg('--subdomain') || 'preview-claw'
const fakePassword = 'PreviewPwd-replace-me'
const fakeToken = 'preview-token-replace-me'

const yaml = generateCloudInit(
    fakePassword,
    subdomain,
    DOMAIN,
    fakeToken,
    selectedType
)

console.log(yaml)