import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'

const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    PUBLIC_BASE_URL = 'https://cdn.clawhost.cloud/go'
} = process.env

if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
) {
    console.error(
        'publish-r2',
        new Error(
            'Missing required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET'
        )
    )
    process.exit(1)
}

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
    }
})

const pkg = JSON.parse(
    readFileSync(join(__dirname, '../package.json'), 'utf8')
) as { version: string }
const version = pkg.version

const upload = async (
    key: string,
    body: Buffer | string,
    contentType: string
): Promise<void> => {
    await s3.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType
        })
    )
    console.log(`uploaded ${key}`)
}

const findFiles = (dir: string, ext: string): string[] => {
    if (!existsSync(dir)) return []
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            out.push(...findFiles(full, ext))
        } else if (entry.endsWith(ext)) {
            out.push(full)
        }
    }
    return out
}

const publishMac = async (arch: 'x64' | 'arm64'): Promise<void> => {
    const zipDir = join(__dirname, `../out/make/zip/darwin/${arch}`)
    const zips = findFiles(zipDir, '.zip')
    if (zips.length === 0) {
        console.log(`skip darwin/${arch} — no zip found`)
        return
    }
    const zipPath = zips[0]
    const zipName = basename(zipPath)
    const prefix = `go/darwin/${arch}`
    const zipUrl = `${PUBLIC_BASE_URL}/darwin/${arch}/${zipName}`

    await upload(
        `${prefix}/${zipName}`,
        readFileSync(zipPath),
        'application/zip'
    )

    const manifest = {
        currentRelease: version,
        releases: [
            {
                version,
                updateTo: {
                    version,
                    pub_date: new Date().toISOString(),
                    name: version,
                    notes: '',
                    url: zipUrl
                }
            }
        ]
    }
    await upload(
        `${prefix}/RELEASES.json`,
        JSON.stringify(manifest, null, 2),
        'application/json'
    )
}

const publishWindows = async (): Promise<void> => {
    const squirrelDir = join(__dirname, '../out/make/squirrel.windows/x64')
    if (!existsSync(squirrelDir)) {
        console.log('skip win32/x64 — no squirrel output found')
        return
    }
    const prefix = 'go/win32/x64'
    for (const entry of readdirSync(squirrelDir)) {
        const full = join(squirrelDir, entry)
        if (!statSync(full).isFile()) continue
        const contentType = entry.endsWith('.nupkg')
            ? 'application/zip'
            : entry.endsWith('.exe')
              ? 'application/octet-stream'
              : 'text/plain'
        await upload(`${prefix}/${entry}`, readFileSync(full), contentType)
    }
}

const main = async (): Promise<void> => {
    console.log(`publishing version ${version} to R2`)
    await publishMac('x64')
    await publishMac('arm64')
    await publishWindows()
    console.log('done')
}

main().catch((error) => {
    console.error('publish-r2', error)
    process.exit(1)
})