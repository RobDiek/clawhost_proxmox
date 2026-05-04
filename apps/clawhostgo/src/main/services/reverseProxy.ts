import http from 'http'
import https from 'https'
import fs from 'fs'
import net from 'net'
import configStore from '@/main/services/configStore'
import certManager from '@/main/services/certManager'

const PROXY_PORT = 18700
const HTTPS_PROXY_PORT = 18701
let server: http.Server | null = null
let httpsServer: https.Server | null = null

const extractSubdomain = (host: string | undefined): string | null => {
    if (!host) return null
    const hostname = host.split(':')[0]
    if (!hostname.endsWith('.clawhost')) return null
    return hostname.replace('.clawhost', '')
}

const resolveAgent = (
    subdomain: string
): { port: number; gatewayToken: string } | null => {
    const agent = configStore.findAgentBySubdomain(subdomain)
    if (!agent) return null
    return { port: agent.port, gatewayToken: agent.gatewayToken }
}

const handleRequest = (
    req: http.IncomingMessage,
    res: http.ServerResponse
): void => {
    const subdomain = extractSubdomain(req.headers.host)
    if (!subdomain) {
        res.writeHead(404)
        res.end()
        return
    }

    const agent = resolveAgent(subdomain)
    if (!agent) {
        res.writeHead(404)
        res.end()
        return
    }

    const needsToken =
        !!agent.gatewayToken &&
        req.method === 'GET' &&
        !(req.url || '').includes('token=')

    if (needsToken) {
        const url = req.url || '/'
        const separator = url.includes('?') ? '&' : '?'
        res.writeHead(302, {
            Location: `${url}${separator}token=${agent.gatewayToken}`
        })
        res.end()
        return
    }

    const proxyHeaders = {
        ...req.headers,
        'x-real-ip': '127.0.0.1',
        'x-forwarded-for': '127.0.0.1',
        'x-forwarded-proto': 'https'
    }

    const proxyReq = http.request(
        {
            hostname: '127.0.0.1',
            port: agent.port,
            path: req.url,
            method: req.method,
            headers: proxyHeaders
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
            proxyRes.pipe(res)
        }
    )

    proxyReq.on('error', () => {
        res.writeHead(502)
        res.end()
    })

    req.pipe(proxyReq)
}

const handleUpgrade = (
    req: http.IncomingMessage,
    socket: net.Socket,
    head: Buffer
): void => {
    const subdomain = extractSubdomain(req.headers.host)
    if (!subdomain) {
        socket.destroy()
        return
    }

    const agent = resolveAgent(subdomain)
    if (!agent) {
        socket.destroy()
        return
    }

    const proxySocket = net.connect(agent.port, '127.0.0.1', () => {
        const requestLine = `${req.method} ${req.url} HTTP/1.1\r\n`
        let headers = ''
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
            headers += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`
        }
        headers += 'X-Real-IP: 127.0.0.1\r\n'
        headers += 'X-Forwarded-For: 127.0.0.1\r\n'
        headers += 'X-Forwarded-Proto: https\r\n'
        proxySocket.write(requestLine + headers + '\r\n')
        if (head.length > 0) {
            proxySocket.write(head)
        }
        proxySocket.pipe(socket)
        socket.pipe(proxySocket)
    })

    proxySocket.on('error', () => {
        socket.destroy()
    })

    socket.on('error', () => {
        proxySocket.destroy()
    })
}

const start = (): void => {
    if (server) return

    server = http.createServer(handleRequest)
    server.on('upgrade', handleUpgrade)
    server.listen(PROXY_PORT, '127.0.0.1')

    const certPaths = certManager.getCertPaths()
    if (certPaths) {
        httpsServer = https.createServer(
            {
                key: fs.readFileSync(certPaths.key),
                cert: fs.readFileSync(certPaths.cert),
                ca: fs.readFileSync(certPaths.ca)
            },
            handleRequest
        )
        httpsServer.on('upgrade', handleUpgrade)
        httpsServer.listen(HTTPS_PROXY_PORT, '127.0.0.1')
    }
}

const reloadCerts = (): void => {
    if (!httpsServer) return
    const certPaths = certManager.getCertPaths()
    if (!certPaths) return
    httpsServer.setSecureContext({
        key: fs.readFileSync(certPaths.key),
        cert: fs.readFileSync(certPaths.cert),
        ca: fs.readFileSync(certPaths.ca)
    })
}

const stop = (): void => {
    if (server) {
        server.close()
        server = null
    }
    if (httpsServer) {
        httpsServer.close()
        httpsServer = null
    }
}

const reverseProxy = { start, stop, reloadCerts }

export default reverseProxy