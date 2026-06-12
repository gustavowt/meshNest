/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig, type PluginOption } from 'vite'
import electron from 'vite-plugin-electron/simple'

const srcAlias = {
  '@': path.resolve(__dirname, './src'),
}

const electronPlugins: PluginOption[] = process.env.VITEST
  ? []
  : [
      electron({
        main: {
          entry: 'electron/main/index.ts',
          vite: {
            resolve: { alias: srcAlias },
            build: {
              rollupOptions: {
                external: ['@duckdb/node-api', '@duckdb/node-bindings', '@huggingface/transformers'],
                output: { entryFileNames: 'main.js' },
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            resolve: { alias: srcAlias },
            build: {
              rollupOptions: {
                output: { entryFileNames: 'preload.cjs', format: 'cjs' },
              },
            },
          },
        },
      }),
    ]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    legacy(),
    ...electronPlugins
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
