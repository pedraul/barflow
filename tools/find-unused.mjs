import fs from 'fs'
import path from 'path'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
const IGNORE = ['node_modules', 'dist', 'frontend/dist', '.git', 'database/backups', 'backups']
const EXT = ['.js', '.jsx', '.mjs', '.ts', '.tsx', '.json', '.css', '.html', '.md']

function walk(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (IGNORE.some((ig)=> full.includes(path.sep + ig + path.sep) || full.endsWith(path.sep + ig))) continue
      results = results.concat(walk(full))
    } else {
      if (EXT.includes(path.extname(full).toLowerCase())) results.push(full)
    }
  }
  return results
}

function rel(p) { return path.relative(ROOT, p).replaceAll('\\','/') }

const allFiles = walk(ROOT)
const contents = {}
for (const f of allFiles) {
  try { contents[f] = fs.readFileSync(f,'utf8') } catch(e) { contents[f] = '' }
}

// Build a quick lookup of references
const filenames = allFiles.map(f => ({
  full: f,
  rel: rel(f),
  base: path.basename(f),
  nameNoExt: path.basename(f, path.extname(f)),
}))

// Determine known entry points to exclude
const usedSet = new Set()
// package.json main
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'))
  if (pkg.main) usedSet.add(path.join(ROOT, pkg.main))
} catch {}
// common entry points
const commonEntries = [
  'backend/server.js', 'server.js', 'frontend/index.html', 'frontend/src/main.jsx', 'frontend/src/main.js', 'frontend/src/index.jsx', 'frontend/src/index.js'
]
for (const e of commonEntries) {
  const p = path.join(ROOT, e)
  if (fs.existsSync(p)) usedSet.add(p)
}

// Search references: for each file A, see if other files mention its name or rel path
for (const A of filenames) {
  for (const B of filenames) {
    if (A.full === B.full) continue
    const hay = contents[B.full] || ''
    if (!hay) continue
    // Look for import/require or path refs
    if (hay.includes(A.base) || hay.includes(A.nameNoExt) || hay.includes('/' + A.rel) || hay.includes(A.rel)) {
      usedSet.add(A.full)
      break
    }
  }
}

// Files that are not in usedSet are candidates
const unused = filenames.filter(f => !usedSet.has(f.full)).map(f => f.rel)

const outPath = path.join(ROOT, 'unused-files.txt')
fs.writeFileSync(outPath, unused.join('\n'))
console.log('Scanned', allFiles.length, 'files. Found', unused.length, 'candidate unused files. Wrote to', outPath)
