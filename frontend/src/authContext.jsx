import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AUTH_EXPIRED_EVENT } from './api'

const AuthContext = createContext(null)
const TOKEN_KEY = 'gc_access'
const REFRESH_KEY = 'gc_refresh'
const USER_KEY = 'gc_user'

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem(REFRESH_KEY))
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  })

  const logout = useCallback(() => {
    clearStorage()
    setToken(null)
    setRefreshToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [logout])

  const loginSession = useCallback(({ accessToken, refreshToken: rt, user: nextUser }) => {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, rt)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setToken(accessToken)
    setRefreshToken(rt)
    setUser(nextUser)
  }, [])

  const value = useMemo(
    () => ({
      token,
      refreshToken,
      user,
      loginSession,
      logout,
    }),
    [token, refreshToken, user, loginSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
