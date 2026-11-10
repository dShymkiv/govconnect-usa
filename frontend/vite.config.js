import os from 'node:os'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function lanIPv4() {
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      const family = typeof net.family === 'string' ? net.family : String(net.family)
      if (family === 'IPv4' && !net.internal) return net.address
    }
  }
  return ''
}

const lan = lanIPv4()
const lanOrigin = lan ? `http://${lan}:5173` : ''

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  define: {
    __GC_DEV_LAN_ORIGIN__: JSON.stringify(lanOrigin),
  },
})
