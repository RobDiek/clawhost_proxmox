import appUpdater from '@/main/services/appUpdater'
import configStore from '@/main/services/configStore'
import processManager from '@/main/services/processManager'
import versionManager from '@/main/services/versionManager'
import nodeBinary from '@/main/services/nodeBinary'
import reverseProxy from '@/main/services/reverseProxy'
import dnsResolver from '@/main/services/dnsResolver'
import certManager from '@/main/services/certManager'

export {
    appUpdater,
    configStore,
    processManager,
    versionManager,
    nodeBinary,
    reverseProxy,
    dnsResolver,
    certManager
}