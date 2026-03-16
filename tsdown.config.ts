import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/react/index.ts',
    'src/providers/anthropic.ts',
    'src/providers/openai.ts',
  ],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  dts: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
})
