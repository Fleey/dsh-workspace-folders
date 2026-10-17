// Build both faces into lib/:
//   lib/index.js  — Host plugin (ESM, Node built-ins only)
//   lib/client.js — Web client plugin wrapped for the page's Module Loader;
//                   React and @deepseek-ai/* come from the page's module table.
import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { build } from 'esbuild'

const root = new URL('..', import.meta.url)
const { name } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

await rm(new URL('lib', root), { recursive: true, force: true })

await build({
  absWorkingDir: root.pathname,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
})

await build({
  absWorkingDir: root.pathname,
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  external: ['react', 'react-dom', 'react/*', 'react-dom/*', '@deepseek-ai/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
  legalComments: 'none',
  logLevel: 'warning',
})

console.log('built lib/index.js and lib/client.js')
