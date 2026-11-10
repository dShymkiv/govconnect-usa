/**
 * Origins for QR / phone demos.
 * Loopback (localhost) is unreachable from a phone camera, so in dev we prefer the LAN URL.
 */

function lanOriginFromVite() {
  try {
    // Injected by vite.config.js in development
    return typeof __GC_DEV_LAN_ORIGIN__ === 'string' ? __GC_DEV_LAN_ORIGIN__ : ''
  } catch {
    return ''
  }
}

export function getPublicAppOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL
  if (configured) return String(configured).replace(/\/$/, '')

  if (typeof window === 'undefined') return ''

  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const lan = lanOriginFromVite()
    if (lan) return lan.replace(/\/$/, '')
  }
  return window.location.origin
}

export function getVerifyUrl(presentationCode) {
  const code = encodeURIComponent(String(presentationCode || '').trim())
  return `${getPublicAppOrigin()}/verify/${code}`
}

/** API base URL — when the UI is opened via LAN IP, talk to the API on the same host. */
export function getApiBaseUrl() {
  const fromEnv = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001'
  if (typeof window === 'undefined') return fromEnv.replace(/\/$/, '')

  const pageHost = window.location.hostname
  if (pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1') {
    try {
      const u = new URL(fromEnv, window.location.origin)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        u.hostname = pageHost
        return u.toString().replace(/\/$/, '')
      }
    } catch {
      return `http://${pageHost}:3001`
    }
  }
  return String(fromEnv).replace(/\/$/, '')
}
