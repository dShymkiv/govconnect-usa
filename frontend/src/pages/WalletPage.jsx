import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, API_URL, isUnauthorized } from '../api'
import { useAuth } from '../authContext'

const TYPE_META = {
  mDL: { label: "Driver's license", tone: 'mdl' },
  passport: { label: 'Passport', tone: 'passport' },
  studentId: { label: 'Student ID', tone: 'student' },
  marriageCertificate: { label: 'Marriage certificate', tone: 'marriage' },
  vehicleRegistration: { label: 'Vehicle registration', tone: 'vehicle' },
  criminalRecordCertificate: { label: 'No criminal record', tone: 'civil' },
  marriageLicense: { label: 'Marriage license', tone: 'marriage' },
}

function typeLabel(type) {
  return TYPE_META[type]?.label || type
}

function cardTone(type) {
  return TYPE_META[type]?.tone || 'civil'
}

const TAB_COPY = {
  wallet: {
    title: 'Documents',
    subtitle: 'Digital wallet — tap a card for details or QR presentation.',
  },
  request: {
    title: 'Request a document',
    subtitle: 'Order certificates and forms; tax filings stay outside the wallet.',
  },
  vehicle: {
    title: 'Vehicle',
    subtitle: 'Registration, plates, and traffic/parking fines for your vehicles.',
  },
}

export default function WalletPage() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('wallet')
  const [documents, setDocuments] = useState([])
  const [catalog, setCatalog] = useState([])
  const [requests, setRequests] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [fines, setFines] = useState([])
  const [selected, setSelected] = useState(null)
  const [docFines, setDocFines] = useState([])
  const [presentation, setPresentation] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const reloadWallet = useCallback(async () => {
    const data = await api.wallet(token)
    setDocuments(data.documents || [])
  }, [token])

  const reloadRequests = useCallback(async () => {
    const [cat, reqs] = await Promise.all([
      api.documentCatalog(token),
      api.documentRequests(token),
    ])
    setCatalog(cat.catalog || [])
    setRequests(reqs.requests || [])
  }, [token])

  const reloadVehicles = useCallback(async () => {
    const [v, f] = await Promise.all([api.vehicles(token), api.vehicleFines(token)])
    setVehicles(v.vehicles || [])
    setFines(f.fines || [])
  }, [token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await Promise.all([reloadWallet(), reloadRequests(), reloadVehicles()])
      } catch (err) {
        if (cancelled) return
        if (isUnauthorized(err)) {
          logout()
          navigate('/', { replace: true })
          return
        }
        setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadWallet, reloadRequests, reloadVehicles, logout, navigate])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  async function openDocument(id) {
    setError('')
    setPresentation(null)
    setDocFines([])
    try {
      const data = await api.document(token, id)
      setSelected(data.document)
      if (data.document.type === 'vehicleRegistration') {
        const f = await api.vehicleFines(token, { documentId: id })
        setDocFines(f.fines || [])
      }
    } catch (err) {
      handleApiError(err)
    }
  }

  async function createQr() {
    if (!selected) return
    setError('')
    setQrLoading(true)
    try {
      const data = await api.present(token, selected.id)
      setPresentation(data)
    } catch (err) {
      handleApiError(err)
    } finally {
      setQrLoading(false)
    }
  }

  async function requestDocument(item) {
    setError('')
    setBusyId(item.id)
    try {
      const payload = {}
      if (item.id === 'irs-ss4') payload.entityName = `${user?.firstName || 'Citizen'} LLC`
      if (item.id === 'criminal-record-certificate') payload.purpose = 'employment'
      if (item.id === 'marriage-license') payload.spouseName = 'Partner Name'
      if (item.id === 'student-id-issue') {
        payload.institution = 'Northeastern Illinois University'
        payload.program = "Master's — Computer Science"
      }

      const res = await api.submitDocumentRequest(token, {
        requestTypeId: item.id,
        payload,
      })
      await reloadRequests()
      if (res.request?.status === 'fulfilled' && res.request?.addsToWallet !== false) {
        await reloadWallet()
        setTab('wallet')
      }
    } catch (err) {
      handleApiError(err)
    } finally {
      setBusyId(null)
    }
  }

  async function payFine(fineId) {
    setError('')
    setBusyId(fineId)
    try {
      await api.payFine(token, fineId)
      await reloadVehicles()
      if (selected?.type === 'vehicleRegistration') {
        const f = await api.vehicleFines(token, { documentId: selected.id })
        setDocFines(f.fines || [])
      }
    } catch (err) {
      handleApiError(err)
    } finally {
      setBusyId(null)
    }
  }

  function signOut() {
    logout()
    navigate('/')
  }

  function handleApiError(err) {
    if (isUnauthorized(err)) {
      logout()
      navigate('/', { replace: true })
      return true
    }
    setError(err.message)
    return false
  }

  const unpaidCount = fines.filter((f) => f.status === 'unpaid').length
  const copy = TAB_COPY[tab]

  function selectNav(next) {
    setTab(next)
    setMenuOpen(false)
  }

  const navItems = [
    { id: 'wallet', label: 'Wallet', active: true },
    {
      id: 'vehicle',
      label: 'Vehicle',
      badge: unpaidCount || null,
      active: true,
    },
    { id: 'request', label: 'Request document', active: true },
    { id: 'dmv', label: 'DMV services', active: false, soon: true },
    { id: 'irs', label: 'IRS / taxes', active: false, soon: true },
    { id: 'unemployment', label: 'Unemployment benefits', active: false, soon: true },
    { id: 'verify', label: 'Verify document (QR)', active: false, soon: true },
  ]

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="brand">
            <span className="brand-mark">GC</span>
            <span>
              <span className="brand-name">GovConnect</span>
              <span className="brand-sub">
                {user ? `${user.firstName} ${user.lastName}` : 'Wallet'}
                {user?.isStudent ? ' · Student' : ''}
              </span>
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div
        className={`drawer-backdrop ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />

      <aside className={`side-drawer ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
        <div className="drawer-head">
          <div className="brand">
            <span className="brand-mark">GC</span>
            <span className="brand-name">Menu</span>
          </div>
          <button
            type="button"
            className="drawer-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <nav className="drawer-nav">
          <p className="drawer-section-label">Available now</p>
          {navItems
            .filter((item) => item.active)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={`drawer-link ${tab === item.id ? 'active' : ''}`}
                onClick={() => selectNav(item.id)}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </button>
            ))}

          <p className="drawer-section-label">Coming soon</p>
          {navItems
            .filter((item) => !item.active)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className="drawer-link disabled"
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                <span>{item.label}</span>
                <span className="nav-soon">Soon</span>
              </button>
            ))}
        </nav>
      </aside>

      <main className="main">
        <div className="wallet-head">
          <div>
            <h1>{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="hint">Loading…</p>
        ) : tab === 'wallet' ? (
          documents.length === 0 ? (
            <div className="empty">No documents yet. Use “Request document” to order one.</div>
          ) : (
            <div className="doc-grid">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className={`doc-card ${cardTone(doc.type)}`}
                  onClick={() => openDocument(doc.id)}
                >
                  <div>
                    <div className="doc-type">{typeLabel(doc.type)}</div>
                    <p className="doc-title">{doc.displayName}</p>
                  </div>
                  <div className="doc-meta">
                    <span>{doc.documentNumberMasked}</span>
                    <span>{doc.state}</span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : tab === 'vehicle' ? (
          vehicles.length === 0 ? (
            <div className="empty">No vehicles in your wallet yet.</div>
          ) : (
            <div className="vehicle-section">
              {vehicles.map((v) => {
                const related = fines.filter((f) => f.vehicleDocumentId === v.documentId)
                const unpaid = related.filter((f) => f.status === 'unpaid')
                return (
                  <section key={v.documentId} className="vehicle-block">
                    <div className="vehicle-header">
                      <div>
                        <h2>
                          {v.year} {v.make} {v.model}
                        </h2>
                        <p className="muted">
                          Plate <strong>{v.plateNumber}</strong> · {v.state}
                          {v.vinMasked ? ` · VIN ${v.vinMasked}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => openDocument(v.documentId)}
                      >
                        Open registration
                      </button>
                    </div>

                    <h3 className="fines-title">
                      Fines {unpaid.length ? `· ${unpaid.length} unpaid` : ''}
                    </h3>
                    {related.length === 0 ? (
                      <p className="muted">No citations for this vehicle.</p>
                    ) : (
                      <ul className="fines-list">
                        {related.map((fine) => (
                          <li key={fine.id} className="fine-item">
                            <div>
                              <strong>{fine.title}</strong>
                              <div className="muted">
                                {fine.citationNumber} · {fine.agency}
                              </div>
                              <div className="muted">
                                {fine.location} · issued {fine.issuedAt?.slice(0, 10)}
                              </div>
                            </div>
                            <div className="fine-actions">
                              <span className={`status status-${fine.status}`}>
                                {fine.status} · ${Number(fine.amount).toFixed(2)}
                              </span>
                              {fine.status === 'unpaid' && (
                                <button
                                  type="button"
                                  className="btn btn-primary fine-pay"
                                  disabled={busyId === fine.id}
                                  onClick={() => payFine(fine.id)}
                                >
                                  {busyId === fine.id ? 'Paying…' : 'Pay'}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          )
        ) : (
          <>
            <div className="request-grid">
              {catalog.map((item) => (
                <article key={item.id} className="request-card">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <div className="request-meta">
                    <span>{item.agency}</span>
                    <span>
                      {item.addsToWallet === false
                        ? 'Confirmation only'
                        : item.fulfillment === 'instant'
                          ? 'Instant → wallet'
                          : `~${item.estimatedDays} days`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === item.id}
                    onClick={() => requestDocument(item)}
                  >
                    {busyId === item.id ? 'Submitting…' : 'Submit request'}
                  </button>
                </article>
              ))}
            </div>

            {requests.length > 0 && (
              <section className="request-history">
                <h2>Your requests</h2>
                <ul>
                  {requests.map((r) => (
                    <li key={r.id}>
                      <strong>{r.name}</strong>
                      <span className={`status status-${r.status}`}>{r.status}</span>
                      <span className="muted">{r.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{typeLabel(selected.type)}</h3>
            <dl>
              <div>
                <dt>Full name</dt>
                <dd>{selected.fullName}</dd>
              </div>
              <div>
                <dt>Document number</dt>
                <dd>{selected.documentNumber}</dd>
              </div>
              {selected.plateNumber && (
                <div>
                  <dt>Plate</dt>
                  <dd>{selected.plateNumber}</dd>
                </div>
              )}
              <div>
                <dt>Issuer</dt>
                <dd>{selected.issuer}</dd>
              </div>
              {selected.institution && (
                <div>
                  <dt>Institution</dt>
                  <dd>{selected.institution}</dd>
                </div>
              )}
              {selected.spouseName && (
                <div>
                  <dt>Spouse</dt>
                  <dd>{selected.spouseName}</dd>
                </div>
              )}
              <div>
                <dt>Expires</dt>
                <dd>{selected.expiresAt ? selected.expiresAt.slice(0, 10) : 'N/A'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selected.status}</dd>
              </div>
            </dl>

            {selected.type === 'vehicleRegistration' && (
              <div className="modal-fines">
                <h4>Vehicle fines</h4>
                {docFines.length === 0 ? (
                  <p className="muted">No citations linked to this registration.</p>
                ) : (
                  <ul className="fines-list">
                    {docFines.map((fine) => (
                      <li key={fine.id} className="fine-item compact">
                        <div>
                          <strong>{fine.title}</strong>
                          <div className="muted">
                            {fine.citationNumber} · ${Number(fine.amount).toFixed(2)}
                          </div>
                        </div>
                        <span className={`status status-${fine.status}`}>{fine.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!presentation ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={createQr}
                disabled={qrLoading}
              >
                {qrLoading ? 'Generating QR…' : 'Show QR code'}
              </button>
            ) : (
              <div className="qr-box">
                <p className="qr-title">Scan to verify</p>
                <div className="qr-frame">
                  <QRCodeSVG
                    value={`${API_URL}${presentation.qrPayload?.verifyPath || `/api/v1/verify/${presentation.presentationCode}`}`}
                    size={180}
                    level="M"
                    includeMargin
                  />
                </div>
                <p className="muted qr-hint">
                  One-time code · valid ~2 minutes
                  <br />
                  <code>{presentation.presentationCode}</code>
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPresentation(null)
                    createQr()
                  }}
                >
                  Refresh QR
                </button>
              </div>
            )}

            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
