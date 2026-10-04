// @dc/flexlayer is installed from git and ships TypeScript sources only, so compile it once after install.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'node_modules', '@dc', 'flexlayer')

if (!existsSync(pkg)) process.exit(0)
if (existsSync(join(pkg, 'dist', 'index.js'))) process.exit(0)

const tsc = createRequire(join(root, 'package.json')).resolve('typescript/bin/tsc')
execFileSync(process.execPath, [tsc, '-p', pkg, '--typeRoots', join(root, 'node_modules', '@types')], {
  stdio: 'inherit',
})
