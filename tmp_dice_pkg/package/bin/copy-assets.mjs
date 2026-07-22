#!/usr/bin/env node
import { cp, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(HERE, '..', 'public', '3d-dice')
const DEFAULT_TARGET = join('public', '3d-dice')

const USAGE = `@lambersond/3d-dice-engine — copy-assets

Copies the dice textures & sounds into a directory your web server serves
statically, so the renderer can fetch them at runtime.

Usage:
  npx @lambersond/3d-dice-engine copy-assets [targetDir]

  targetDir   Destination directory (default: ${DEFAULT_TARGET})

The default pairs with @lambersond/3d-dice-core's default assetPath of "/3d-dice/".
If you copy assets elsewhere, pass a matching assetPath to the DiceRenderer.`

function parseArgs(argv) {
  const args = argv.slice(2).filter(a => a !== 'copy-assets')
  if (args.includes('-h') || args.includes('--help')) return { help: true }
  return { target: args.find(a => !a.startsWith('-')) ?? DEFAULT_TARGET }
}

async function main() {
  const { help, target } = parseArgs(process.argv)
  if (help) {
    console.log(USAGE)
    return
  }

  try {
    await stat(SOURCE)
  } catch {
    console.error(`✖ Could not find bundled assets at ${SOURCE}`)
    process.exitCode = 1
    return
  }

  const dest = isAbsolute(target) ? target : resolve(process.cwd(), target)
  await cp(SOURCE, dest, { recursive: true })
  console.log(`✔ Copied 3d-dice assets → ${dest}`)
}

main().catch(error => {
  console.error('✖ Failed to copy 3d-dice assets:', error.message)
  process.exitCode = 1
})
