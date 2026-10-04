import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  entry: { 'visual-runtime': 'tests/visual-runtime.jsx' }, outDir: '.test-build', clean: false,
  format: 'iife', platform: 'browser', dts: false,
  deps: { alwaysBundle: ['react', 'react-dom', 'scheduler'], onlyBundle: false },
})
