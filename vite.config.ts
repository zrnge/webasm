import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A simple plugin to copy the wasm file to the public/ directory if it doesn't exist
function copyCapstoneWasm() {
  return {
    name: 'copy-capstone-wasm',
    buildStart() {
      const src = path.resolve(__dirname, 'node_modules/capstone-wasm/dist/capstone.wasm')
      const destDir = path.resolve(__dirname, 'public')
      const dest = path.resolve(destDir, 'capstone.wasm')
      
      if (fs.existsSync(src)) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }
        fs.copyFileSync(src, dest)
        console.log('Successfully copied capstone.wasm to public/')
      } else {
        console.warn('Warning: capstone.wasm not found in node_modules/capstone-wasm/dist/')
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), copyCapstoneWasm()],
  base: './',
})

