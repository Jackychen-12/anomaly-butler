import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base 用相对路径，GitHub Pages 的子路径下也能直接打开
export default defineConfig({ base: './', plugins: [react(), tailwindcss()] })
