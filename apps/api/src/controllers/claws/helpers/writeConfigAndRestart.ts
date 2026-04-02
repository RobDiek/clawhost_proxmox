import executeSSH from '@/services/ssh'
import BASE_DIR from '@/controllers/claws/helpers/baseDir'

const writeConfigAndRestart = async (
    ip: string,
    rootPassword: string,
    config: Record<string, unknown>,
    envContent?: string
): Promise<void> => {
    const configJson = JSON.stringify(config, null, 4)
    const configB64 = Buffer.from(configJson).toString('base64')
    let writeCommand = `echo '${configB64}' | base64 -d > ${BASE_DIR}/openclaw.json`

    if (envContent !== undefined) {
        const envB64 = Buffer.from(envContent).toString('base64')
        writeCommand += ` && echo '${envB64}' | base64 -d > ${BASE_DIR}/.env`
    }

    await executeSSH(
        ip,
        rootPassword,
        `${writeCommand} && (su - openclaw -c "openclaw doctor --fix" || true) && systemctl restart openclaw-gateway`,
        20000
    )
}

export default writeConfigAndRestart