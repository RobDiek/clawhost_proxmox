import type { CertPaths } from '@/ts/Interfaces'

import fs from 'fs'
import path from 'path'
import os from 'os'
import forge from 'node-forge'
import configStore from '@/main/services/configStore'

const CERTS_DIR = path.join(os.homedir(), '.clawnodego', 'certs')
const CA_KEY_PATH = path.join(CERTS_DIR, 'ca.key')
const CA_CERT_PATH = path.join(CERTS_DIR, 'ca.crt')
const SERVER_KEY_PATH = path.join(CERTS_DIR, 'server.key')
const SERVER_CERT_PATH = path.join(CERTS_DIR, 'server.crt')
const VALIDITY_DAYS = 825

const isCaValid = (): boolean => {
    try {
        if (!fs.existsSync(CA_CERT_PATH) || !fs.existsSync(CA_KEY_PATH))
            return false
        const caPem = fs.readFileSync(CA_CERT_PATH, 'utf-8')
        const cert = forge.pki.certificateFromPem(caPem)
        return cert.validity.notAfter > new Date()
    } catch {
        return false
    }
}

const generateCa = (): void => {
    const caKeys = forge.pki.rsa.generateKeyPair(2048)
    const caCert = forge.pki.createCertificate()
    caCert.publicKey = caKeys.publicKey
    caCert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16))
    caCert.validity.notBefore = new Date()
    caCert.validity.notAfter = new Date(
        Date.now() + VALIDITY_DAYS * 24 * 60 * 60 * 1000
    )
    caCert.setSubject([{ name: 'commonName', value: 'ClawNode Local CA' }])
    caCert.setIssuer([{ name: 'commonName', value: 'ClawNode Local CA' }])
    caCert.setExtensions([
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true }
    ])
    caCert.sign(caKeys.privateKey, forge.md.sha256.create())

    fs.writeFileSync(CA_KEY_PATH, forge.pki.privateKeyToPem(caKeys.privateKey))
    fs.writeFileSync(CA_CERT_PATH, forge.pki.certificateToPem(caCert))
}

const getAllSubdomains = (): string[] => {
    const config = configStore.readConfig()
    return config.agents.map((c) => c.subdomain).filter(Boolean)
}

const generateServerCert = (subdomains: string[]): void => {
    const caKeyPem = fs.readFileSync(CA_KEY_PATH, 'utf-8')
    const caCertPem = fs.readFileSync(CA_CERT_PATH, 'utf-8')
    const caKey = forge.pki.privateKeyFromPem(caKeyPem)
    const caCert = forge.pki.certificateFromPem(caCertPem)

    const altNames = subdomains.map((s) => ({
        type: 2,
        value: `${s}.clawnode`
    }))
    altNames.push({ type: 2, value: 'clawnode' })

    const serverKeys = forge.pki.rsa.generateKeyPair(2048)
    const serverCert = forge.pki.createCertificate()
    serverCert.publicKey = serverKeys.publicKey
    serverCert.serialNumber = forge.util.bytesToHex(
        forge.random.getBytesSync(16)
    )
    serverCert.validity.notBefore = new Date()
    serverCert.validity.notAfter = new Date(
        Date.now() + VALIDITY_DAYS * 24 * 60 * 60 * 1000
    )
    serverCert.setSubject([{ name: 'commonName', value: 'clawnode' }])
    serverCert.setIssuer(caCert.subject.attributes)
    serverCert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames }
    ])
    serverCert.sign(caKey, forge.md.sha256.create())

    fs.writeFileSync(
        SERVER_KEY_PATH,
        forge.pki.privateKeyToPem(serverKeys.privateKey)
    )
    fs.writeFileSync(SERVER_CERT_PATH, forge.pki.certificateToPem(serverCert))
}

const ensureCerts = (): boolean => {
    try {
        if (!fs.existsSync(CERTS_DIR)) {
            fs.mkdirSync(CERTS_DIR, { recursive: true })
        }
        if (!isCaValid()) {
            generateCa()
        }
        const subdomains = getAllSubdomains()
        generateServerCert(subdomains)
        return true
    } catch {
        return false
    }
}

const regenerateServerCert = (): boolean => {
    try {
        if (!isCaValid()) return false
        const subdomains = getAllSubdomains()
        generateServerCert(subdomains)
        return true
    } catch {
        return false
    }
}

const getCertPaths = (): CertPaths | null => {
    if (
        !fs.existsSync(SERVER_KEY_PATH) ||
        !fs.existsSync(SERVER_CERT_PATH) ||
        !fs.existsSync(CA_CERT_PATH)
    ) {
        return null
    }
    return { key: SERVER_KEY_PATH, cert: SERVER_CERT_PATH, ca: CA_CERT_PATH }
}

const getCaCertPath = (): string => CA_CERT_PATH

const certManager = {
    ensureCerts,
    regenerateServerCert,
    getCertPaths,
    getCaCertPath,
    isCaValid
}

export default certManager