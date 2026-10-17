// Checks the Yandex Games build in dist-yandex/ against the platform's
// archive rules and packs it into release/qybeq-yandex-games-<version>.zip.
// Run through `npm run build:yandex`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const buildDir = join(root, 'dist-yandex')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const archive = join(root, 'release', `qybeq-yandex-games-${version}.zip`)
const maxBytes = 100 * 1024 * 1024

// URLs that are code, not links a player could follow: XML namespaces and
// React's own error-decoder address inside its production build.
const allowedUrls = [/^http:\/\/www\.w3\.org\//, /^https:\/\/react\.dev\/errors\//]
// Web-only pages and services that must never reach the archive.
const forbidden = ['privacy.html', 'support.html', 'how-to-play.html', 'mc.yandex', 'metrika/tag.js', 'mailto:', 'sdk.games.s3.yandex.net']
const textTypes = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest'])

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

if (!existsSync(buildDir)) {
  console.error('dist-yandex/ is missing: run `npm run build:yandex`.')
  process.exit(1)
}

const problems = []
const files = walk(buildDir).filter((file) => !file.endsWith('.DS_Store'))
let totalBytes = 0

// 1.22: index.html in the archive root.
const indexPath = join(buildDir, 'index.html')
if (!existsSync(indexPath)) problems.push('index.html is not in the archive root (1.22)')
else if (!readFileSync(indexPath, 'utf8').includes('<script src="/sdk.js"></script>')) {
  problems.push('index.html does not load the SDK from /sdk.js (1.19.1)')
}

for (const file of files) {
  const name = relative(buildDir, file).split('\\').join('/')
  totalBytes += statSync(file).size
  // 1.22: no spaces or Cyrillic (or any non-ASCII) in file and folder names.
  if (!/^[A-Za-z0-9._\-/]+$/.test(name)) problems.push(`file name "${name}" has spaces or non-Latin characters (1.22)`)
  if (!textTypes.has(extname(file))) continue
  const content = readFileSync(file, 'utf8')
  // 8.4.2: no links to external resources.
  for (const [url] of content.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
    if (!allowedUrls.some((pattern) => pattern.test(url))) problems.push(`${name}: external URL ${url} (8.4.2)`)
  }
  for (const needle of forbidden) {
    if (content.includes(needle)) problems.push(`${name}: contains "${needle}" (web-only)`)
  }
}

// 1.21: at most 100 MB unpacked.
if (totalBytes > maxBytes) problems.push(`the game is ${(totalBytes / 1048576).toFixed(1)} MB, over 100 MB (1.21)`)

if (problems.length) {
  console.error('The Yandex Games build does not meet the archive rules:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

mkdirSync(join(root, 'release'), { recursive: true })
rmSync(archive, { force: true })
try {
  execFileSync('zip', ['-r', '-X', '-q', archive, '.', '-x', '*.DS_Store'], { cwd: buildDir, stdio: 'inherit' })
} catch {
  console.error('Could not run `zip`; install it or pack dist-yandex/ by hand (index.html at the root).')
  process.exit(1)
}

const packed = statSync(archive).size
console.log(`Yandex Games archive: ${relative(root, archive)}`)
console.log(`  ${files.length} files, ${(totalBytes / 1048576).toFixed(2)} MB unpacked, ${(packed / 1048576).toFixed(2)} MB zipped`)
console.log('  checks passed: index.html at the root, /sdk.js, file names, size, no external links')
