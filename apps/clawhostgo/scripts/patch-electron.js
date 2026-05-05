const p = require('path')
const f = require('fs')

const electronDir = p.join(__dirname, '..', 'node_modules', 'electron')

if (!f.existsSync(electronDir)) {
    process.exit(0)
}

const distDir = p.join(electronDir, 'dist')
const oldApp = p.join(distDir, 'Electron.app')
const newApp = p.join(distDir, 'ClawHostGo.app')
const pathFile = p.join(electronDir, 'path.txt')
const src = p.join(__dirname, '..', 'resources', 'icon.icns')

if (f.existsSync(oldApp)) {
    f.renameSync(oldApp, newApp)
}

const appDir = f.existsSync(newApp) ? newApp : oldApp
f.writeFileSync(pathFile, 'ClawHostGo.app/Contents/MacOS/Electron')

const plist = p.join(appDir, 'Contents', 'Info.plist')
if (f.existsSync(plist)) {
    let c = f.readFileSync(plist, 'utf8')
    c = c.replace(
        /<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
        '<key>CFBundleDisplayName</key>\n\t<string>ClawHostGo</string>'
    )
    c = c.replace(
        /<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/,
        '<key>CFBundleName</key>\n\t<string>ClawHostGo</string>'
    )
    f.writeFileSync(plist, c)
}

const icns = p.join(appDir, 'Contents', 'Resources', 'electron.icns')
const icnsDir = p.dirname(icns)
if (f.existsSync(src) && f.existsSync(icnsDir)) {
    f.copyFileSync(src, icns)
}
