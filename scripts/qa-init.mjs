import fs from 'node:fs/promises'
import path from 'node:path'

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function main() {
  const root = process.cwd()
  const dirs = ['work/inputs', 'work/outputs', 'work/rules', 'work/scan'].map((p) => path.join(root, p))
  await Promise.all(dirs.map(ensureDir))
  process.stdout.write(`Created/verified:\n${dirs.map((d) => `- ${d}`).join('\n')}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`)
  process.exitCode = 1
})
