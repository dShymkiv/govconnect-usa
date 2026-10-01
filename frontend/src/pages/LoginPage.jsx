import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../authContext'

export default function LoginPage() {
  const { token, loginSession } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('credentials')
  const [phone, setPhone] = useState('+13129609078')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [masked, setMasked] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (token) return <Navigate to="/wallet" replace />

  async function sendCode(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.requestOtp(phone, password)
      setMasked(res.phoneMasked)
      setDevCode(res.devCode || '')
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function confirmCode(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.verifyOtp({ phone, password, code })
      loginSession(res)
      navigate('/wallet')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">GC</span>
          <span>
            <span className="brand-name">GovConnect</span>
            <span className="brand-sub">USA digital services</span>
          </span>
        </div>
      </header>

      <section className="hero-login">
        <div className="hero-copy">
          <h1>GovConnect</h1>
          <p>
            One secure digital identity for your documents and government services —
            inspired by Ukraine’s Diia, built for a U.S. prototype.
          </p>
        </div>

        <div className="panel">
          {step === 'credentials' ? (
            <form onSubmit={sendCode}>
              <h2>Sign in</h2>
              {error && <p className="error">{error}</p>}
              <div className="field">
                <label htmlFor="phone">Mobile number</label>
                <input
                  id="phone"
                  name="phone"
                  autoComplete="tel"
                  placeholder="+1 312 960 9078"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={confirmCode}>
              <h2>Enter SMS code</h2>
              <p className="hint">Sent to {masked || phone}</p>
              {error && <p className="error">{error}</p>}
              <div className="field">
                <label htmlFor="otp">6-digit code</label>
                <input
                  id="otp"
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={loading || code.length < 6}>
                {loading ? 'Checking…' : 'Sign in'}
              </button>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setStep('credentials')
                    setCode('')
                    setError('')
                  }}
                >
                  Back
                </button>
              </div>
              {devCode && (
                <div className="dev-banner">
                  Dev code: <strong>{devCode}</strong>
                </div>
              )}
            </form>
          )}
        </div>
      </section>
    </>
  )
}
