import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export default function MarriageConfirmPage() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const data = await api.confirmMarriage({ phone, code })
      setResult(data)
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
            <span className="brand-sub">Marriage license confirmation</span>
          </span>
        </div>
        <Link to="/" className="btn btn-ghost">
          Sign in
        </Link>
      </header>

      <main className="main verify-page">
        <div className="wallet-head">
          <div>
            <h1>Confirm marriage license</h1>
            <p>
              Enter the mobile number that received the invitation SMS and the one-time
              confirmation code to approve the marriage license application.
            </p>
          </div>
        </div>

        {result?.confirmed ? (
          <section className="panel verify-result">
            <p className="status status-approved">Confirmed</p>
            <p>{result.message}</p>
            <p className="muted">The applicant’s wallet will show the license when they refresh.</p>
            <Link to="/" className="btn btn-primary">
              Go to sign in
            </Link>
          </section>
        ) : (
          <form className="panel verify-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="partner-phone">Your mobile number</label>
              <input
                id="partner-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+13125550100"
                autoComplete="tel"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="partner-code">SMS confirmation code</label>
              <input
                id="partner-code"
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits"
                required
              />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Confirming…' : 'Confirm securely'}
            </button>
          </form>
        )}
      </main>
    </>
  )
}
