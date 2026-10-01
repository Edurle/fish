import { defineConfig } from 'vite'

export default defineConfig({
  // --host 便于手机在同一局域网访问调试
  server: {
    host: true,
    port: 5173,
  },
})
