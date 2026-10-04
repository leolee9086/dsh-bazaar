import { defineConfig } from 'tsdown'

/** 由宿主模块表提供、不能打进包里的模块。 */
const EXTERNALS = new Set(['react', 'react/jsx-runtime'])

// 只打包浏览器侧：host 侧是纯 JS，直接从 src/host.js 加载，不经过构建。
// banner/footer 是 DSH 客户端模块表的约定形式，react 由宿主提供、不打进包里。
export default defineConfig({
  entry: { client: 'src/client/index.jsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  inputOptions: { resolve: { mainFields: ['module', 'main'] } },
  target: 'es2022',
  dts: false,
  sourcemap: true,
  // react 与 react/jsx-runtime 都由宿主模块表提供：打进包里反而在浏览器里找不到，
  // 而且会和宿主那份 React 变成两个实例（hooks 当场坏掉）。
  deps: { neverBundle: specifier => EXTERNALS.has(specifier), alwaysBundle: specifier => !EXTERNALS.has(specifier) },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-bazaar", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
