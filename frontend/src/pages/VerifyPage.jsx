import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

const TYPE_LABELS = {
  mDL: "Driver's license",
  passport: 'Passport',
  studentId: 'Student ID',
  marriageCertificate: 'Marriage certificate',
  vehicleRegistration: 'Vehicle registration',
  criminalRecordCertificate: 'No criminal record',
  marriageLicense: 'Marriage license',
}

/** Guard against React StrictMode double-mount consuming a one-time code twice. */
const autoVerifyStarted = new Set()

export default function VerifyPage() {
  const { code: routeCode } = useParams()
  const [code, setCode] = useState(routeCode || '')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function runVerify(value) {
    const trimmed = String(value || '').trim()
    if (!trimmed) {
      setError('Enter a presentation code')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const data = await api.verifyPresentation(trimmed)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!routeCode) return
    setCode(routeCode)
    if (autoVerifyStarted.has(routeCode)) return
    autoVerifyStarted.add(routeCode)
    runVerify(routeCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCode])

  function onSubmit(e) {
    e.preventDefault()
    runVerify(code)
  }

  const doc = result?.document

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">GC</span>
          <span>
            <span className="brand-name">GovConnect</span>
            <span className="brand-sub">Document verification</span>
          </span>
        </div>
        <Link to="/" className="btn btn-ghost">
          Sign in
        </Link>
      </header>

      <main className="main verify-page">
        <div className="wallet-head">
          <div>
            <h1>Verify a document</h1>
            <p>
              Enter a one-time presentation code, or open the link from a citizen QR.
              Codes work once and expire in about two minutes.
            </p>
          </div>
        </div>

        <form className="panel verify-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="code">Presentation code</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              placeholder="Paste code from QR"
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        {result?.valid && doc && (
          <section className="panel verify-result">
            <p className="status status-approved">Valid presentation</p>
            <dl>
              <div>
                <dt>Type</dt>
                <dd>{TYPE_LABELS[doc.type] || doc.type}</dd>
              </div>
              <div>
                <dt>Full name</dt>
                <dd>{doc.fullName}</dd>
              </div>
              <div>
                <dt>Document number</dt>
                <dd>{doc.documentNumber}</dd>
              </div>
              <div>
                <dt>Issuer</dt>
                <dd>{doc.issuer}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{doc.state}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{doc.expiresAt ? String(doc.expiresAt).slice(0, 10) : 'N/A'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{doc.status}</dd>
              </div>
              <div>
                <dt>Verified at</dt>
                <dd>{result.verifiedAt}</dd>
              </div>
            </dl>
            <div className="disclosure-box">
              <strong>Selective disclosure</strong>
              <p className="muted">
                {result.disclosure?.note ||
                  'Only the claims above were shared for this verification.'}
              </p>
              <p>
                <span className="muted">Shared: </span>
                {(result.disclosure?.shared || Object.keys(doc)).join(', ')}
              </p>
              <p>
                <span className="muted">Not shared: </span>
                {(result.disclosure?.notShared || ['dateOfBirth', 'address']).join(', ')}
              </p>
            </div>
            <p className="muted">One-time code — already consumed and cannot be reused.</p>
          </section>
        )}
      </main>
    </>
  )
}
