import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  entry: { panel: 'src/client/panel.jsx' }, outDir: '.test-build', format: 'esm', platform: 'node',
  dts: false, deps: { neverBundle: ['react', 'react/jsx-runtime', 'lucide-react'] },
})
