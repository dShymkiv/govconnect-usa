import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, isUnauthorized } from '../api'
import { useAuth } from '../authContext'
import { getVerifyUrl } from '../publicUrl'

const TYPE_META = {
  mDL: { label: "Driver's license", tone: 'mdl' },
  passport: { label: 'Passport', tone: 'passport' },
  studentId: { label: 'Student ID', tone: 'student' },
  marriageCertificate: { label: 'Marriage certificate', tone: 'marriage' },
  vehicleRegistration: { label: 'Vehicle registration', tone: 'vehicle' },
  criminalRecordCertificate: { label: 'No criminal record', tone: 'civil' },
  marriageLicense: { label: 'Marriage license', tone: 'marriage' },
}

const SERVICE_LABELS = {
  'dmv-schedule-appointment': 'Schedule a DMV Appointment',
  'dmv-schedule-cdl': 'Schedule a CDL Appointment',
  'dmv-manage-appointment': 'Cancel or Modify an Appointment',
  'dmv-real-id-upgrade': 'Get a REAL ID',
  'dmv-license-renewal': "Renew my Driver's License or ID Card",
  'dmv-teen-to-dl': 'Change Instruction Permit (Teen) to a DL',
  'dmv-new-license': 'New DL or Instruction Permit',
  'dmv-duplicate-license': "Replace my Driver's License or ID Card",
  'dmv-address-change': 'Change my Name or Address',
  'dmv-cdl-written': 'CDL Written Appointments',
  'dmv-cdl-drive': 'CDL Drive Appointments',
  'vehicle-reg-renewal': 'Vehicle Plates & Titles',
  'dmv-informal-hearing': 'Informal Hearings',
  'dmv-driving-record': 'Get my Driving Record',
  'irs-make-payment': 'Make a payment',
  'irs-refund-status': 'Refunds',
  'irs-transcript-request': 'Get Your Tax Record',
  'irs-payment-plan': 'Form 9465 — Installment Agreement',
  'irs-estimated-tax': 'Form 1040-ES — Estimated Tax',
  'irs-amend-status': 'Form 1040-X — Amended Return',
  'irs-form-w9': 'Form W-9 — Taxpayer ID',
  'irs-form-w4': 'Form W-4 — Withholding',
  'unemployment-application': 'Unemployment Benefits Application',
  'unemployment-weekly-cert': 'Weekly Certification',
  'unemployment-claim-status': 'Claim Status',
  'unemployment-appeal': 'Appeal a Determination',
  'unemployment-payment-method': 'Update Payment Method',
}

const STATUS_LABELS = {
  accepted: 'Accepted',
  approved: 'Approved',
  processing: 'Processing',
  received: 'Received',
  sent: 'Sent',
  submitted: 'Submitted',
  rejected: 'Rejected',
  pending: 'Pending',
  fulfilled: 'Fulfilled',
  awaiting_partner: 'Awaiting partner',
  unpaid: 'Unpaid',
  paid: 'Paid',
  dismissed: 'Dismissed',
}

function typeLabel(type) {
  return TYPE_META[type]?.label || type
}

function serviceLabel(serviceId, fallbackName) {
  return fallbackName || SERVICE_LABELS[serviceId] || serviceId
}

function statusLabel(status) {
  if (!status) return ''
  return STATUS_LABELS[status] || String(status).replace(/_/g, ' ')
}

function cardTone(type) {
  return TYPE_META[type]?.tone || 'civil'
}

function money(value) {
  return `$${Number(value).toFixed(2)}`
}

function renderServiceDetailRows(detail) {
  const r = detail?.result || {}
  const rows = [
    ['Tax year', r.taxYear],
    ['Status detail', r.statusLabel],
    ['Filing', r.filingType],
    ['Refund estimate', r.refundAmountEstimate != null ? money(r.refundAmountEstimate) : null],
    ['Estimated deposit', r.estimatedDepositDate],
    ['Confirmation', r.confirmationNumber],
    ['New expiration', r.newExpirationDate],
    ['Fee', r.feeAmount != null ? money(r.feeAmount) : null],
    ['Plate', r.plateNumber],
    ['Weekly benefit', r.weeklyBenefitEstimate != null ? `~$${Number(r.weeklyBenefitEstimate)}/wk` : null],
    ['Reason', r.reason],
    ['Estimated completion', r.estimatedCompletionDays != null ? `${r.estimatedCompletionDays} day(s)` : null],
    ['Mailing address', r.mailingAddress],
    ['Record type', r.recordType],
    ['Points', r.points != null ? String(r.points) : null],
    ['Delivery', r.deliveryMethod],
    ['State', r.state],
    ['Office location', r.officeLocation],
    ['Appointment', r.appointmentWindow],
    ['Bring to appointment', r.documentsNeeded],
    ['Transcript type', r.transcriptType],
    ['Balance due', r.balanceDue != null ? money(r.balanceDue) : null],
    ['Monthly payment', r.monthlyPayment != null ? money(r.monthlyPayment) : null],
    ['Estimated months', r.estimatedMonths],
    ['First payment due', r.firstPaymentDue],
    ['Quarter', r.quarter],
    ['Payment amount', r.paymentAmount != null ? money(r.paymentAmount) : null],
    ['Payment date', r.paymentDate],
    ['Claim ID', r.claimId],
    ['Hours worked', r.hoursWorked != null ? String(r.hoursWorked) : null],
    ['Job contacts', r.jobContacts != null ? String(r.jobContacts) : null],
    ['Week ending', r.weekEnding],
    ['Weeks remaining', r.weeksRemaining != null ? String(r.weeksRemaining) : null],
    ['Benefit year ends', r.benefitYearEnd],
    ['Determination ID', r.determinationId],
    ['Appeal reason', r.appealReason],
    ['Appeal deadline', r.appealDeadline],
    ['Hearing', r.hearingWindow],
    ['Payment method', r.paymentMethod],
    ['Effective date', r.effectiveDate],
    [
      'Registration #',
      detail.linkedDocuments?.vehicleRegistration?.documentNumber,
    ],
    ['License #', detail.linkedDocuments?.mDL?.documentNumber],
    [
      'Submitted',
      detail.createdAt ? new Date(detail.createdAt).toLocaleString() : null,
    ],
    ['Summary', r.message],
  ]

  return rows
    .filter(([, value]) => value != null && value !== '')
    .map(([label, value]) => (
      <div key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ))
}

const TAB_COPY = {
  wallet: {
    title: 'Documents',
    subtitle: 'Your digital wallet. Tap a card for details. Use Present only when a verifier needs to check a document.',
  },
  request: {
    title: 'Request a document',
    subtitle: 'Order certificates into your wallet in a few taps.',
  },
  vehicle: {
    title: 'Vehicle',
    subtitle: 'Registrations and fines for the cars linked to your account.',
  },
  dmv: {
    title: 'DMV services',
    subtitle: 'Book appointments, renew credentials, and manage plates — step by step.',
  },
  irs: {
    title: 'IRS / taxes',
    subtitle: 'Pay taxes, check refunds, and request your tax records.',
  },
  unemployment: {
    title: 'Unemployment benefits',
    subtitle: 'Apply, certify weekly, and manage your claim with your digital ID.',
  },
  verify: {
    title: 'Verify document',
    subtitle: 'Check a one-time QR presentation from a citizen wallet.',
  },
  security: {
    title: 'Security evidence',
    subtitle: 'Your recent audit events — HMAC integrity digests for thesis / advisor review.',
  },
}

function serviceCtaLabel(service) {
  if (service?.flow === 'appointment') return 'Book appointment'
  const map = {
    'irs-make-payment': 'Make a payment',
    'irs-refund-status': 'Check my refund',
    'irs-transcript-request': 'Get my tax record',
    'irs-payment-plan': 'Start installment plan',
    'irs-estimated-tax': 'Record a payment',
    'irs-amend-status': 'Check 1040-X status',
    'irs-form-w9': 'Fill Form W-9',
    'irs-form-w4': 'Fill Form W-4',
    'dmv-license-renewal': 'Start renewal',
    'dmv-duplicate-license': 'Replace my card',
    'dmv-address-change': 'Update name or address',
    'dmv-new-license': 'Start application',
    'dmv-teen-to-dl': 'Start upgrade',
    'dmv-driving-record': 'Order record',
    'vehicle-reg-renewal': 'Manage plates & titles',
    'unemployment-application': 'Start application',
    'unemployment-weekly-cert': 'Certify this week',
    'unemployment-claim-status': 'View claim status',
    'unemployment-appeal': 'File an appeal',
    'unemployment-payment-method': 'Update payments',
  }
  return map[service?.id] || 'Get started'
}

const SERVICE_TABS = new Set(['dmv', 'irs', 'unemployment'])


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
  const [qrConsent, setQrConsent] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrCopied, setQrCopied] = useState('')
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0)
  const [auditEvents, setAuditEvents] = useState([])
  const [auditMeta, setAuditMeta] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [serviceCatalog, setServiceCatalog] = useState([])
  const [serviceRequests, setServiceRequests] = useState([])
  const [serviceForms, setServiceForms] = useState({})
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyResult, setVerifyResult] = useState(null)
  const [serviceDetail, setServiceDetail] = useState(null)
  const [appointmentService, setAppointmentService] = useState(null)
  const [appointmentStep, setAppointmentStep] = useState(1)
  const [activeService, setActiveService] = useState(null)
  const [docRequestItem, setDocRequestItem] = useState(null)
  const [docRequestForm, setDocRequestForm] = useState({})
  const [docRequestNotice, setDocRequestNotice] = useState('')

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

  const reloadServices = useCallback(
    async (category) => {
      const [cat, reqs] = await Promise.all([
        api.servicesCatalog(token, category),
        api.serviceRequests(token, category),
      ])
      setServiceCatalog(cat.services || [])
      setServiceRequests(reqs.requests || [])
      const defaults = {}
      for (const s of cat.services || []) {
        defaults[s.id] = {}
        for (const field of s.fields || []) {
          // Never auto-fill required fields — user must choose/enter explicitly
          if (field.default != null && field.required !== true) {
            defaults[s.id][field.key] = field.default
          }
        }
      }
      setServiceForms(defaults)
    },
    [token],
  )

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
    if (!SERVICE_TABS.has(tab)) return
    let cancelled = false
    ;(async () => {
      try {
        setError('')
        await reloadServices(tab)
      } catch (err) {
        if (cancelled) return
        handleApiError(err)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reloadServices])

  useEffect(() => {
    if (tab !== 'security') return
    loadAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  async function openDocument(id) {
    setError('')
    setPresentation(null)
    setQrConsent(false)
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
    if (!qrConsent) {
      setError('Confirm disclosure consent before presenting a document.')
      return
    }
    setError('')
    setQrCopied('')
    setQrLoading(true)
    try {
      const data = await api.present(token, selected.id)
      setPresentation(data)
      if (data.expiresAt) {
        const ms = new Date(data.expiresAt).getTime() - Date.now()
        setQrSecondsLeft(Math.max(0, Math.ceil(ms / 1000)))
      }
    } catch (err) {
      handleApiError(err)
    } finally {
      setQrLoading(false)
    }
  }

  useEffect(() => {
    if (!presentation?.expiresAt) {
      setQrSecondsLeft(0)
      return undefined
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((new Date(presentation.expiresAt).getTime() - Date.now()) / 1000),
      )
      setQrSecondsLeft(left)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [presentation])

  async function copyVerifyLink() {
    if (!presentation?.presentationCode) return
    const url = getVerifyUrl(presentation.presentationCode)
    try {
      await navigator.clipboard.writeText(url)
      setQrCopied('link')
    } catch {
      setError('Could not copy link — select the URL manually.')
    }
  }

  async function copyPresentationCode() {
    if (!presentation?.presentationCode) return
    try {
      await navigator.clipboard.writeText(presentation.presentationCode)
      setQrCopied('code')
    } catch {
      setError('Could not copy code — select it manually.')
    }
  }

  async function loadAudit() {
    setError('')
    try {
      const data = await api.securityAudit(token, 25)
      setAuditEvents(data.events || [])
      setAuditMeta(data.assurance || null)
    } catch (err) {
      handleApiError(err)
    }
  }

  function openDocRequest(item) {
    setError('')
    setDocRequestNotice('')
    const defaults = {}
    for (const field of item.fields || []) {
      if (field.default != null && field.required !== true) {
        defaults[field.key] = field.default
      }
    }
    setDocRequestForm(defaults)
    setDocRequestItem(item)
  }

  function closeDocRequest() {
    setDocRequestItem(null)
    setDocRequestForm({})
  }

  function updateDocRequestField(key, value) {
    setDocRequestForm((prev) => ({ ...prev, [key]: value }))
  }

  function canSubmitDocRequest(item) {
    for (const field of item.fields || []) {
      if (!fieldIsRequired(field, docRequestForm)) continue
      const value = docRequestForm[field.key]
      if (value == null || String(value).trim() === '') return false
      if (field.positive === true && !(Number(value) > 0)) return false
      if (field.nonNegative === true && Number(value) < 0) return false
      if (field.min != null && Number(value) < Number(field.min)) return false
    }
    return true
  }

  function renderDocRequestField(field) {
    const fieldId = `docreq-${field.key}`
    const value = docRequestForm[field.key] ?? (field.required ? '' : field.default ?? '')

    if (field.type === 'select' && (field.options || []).length <= 6) {
      return (
        <div className="field" key={field.key}>
          <label>{field.label}</label>
          <div className="choice-grid">
            {(field.options || []).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`choice-card${value === opt.value ? ' is-selected' : ''}`}
                onClick={() => updateDocRequestField(field.key, opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (field.type === 'select') {
      return (
        <div className="field" key={field.key}>
          <label htmlFor={fieldId}>{field.label}</label>
          <select
            id={fieldId}
            value={value}
            onChange={(e) => updateDocRequestField(field.key, e.target.value)}
            required={field.required}
          >
            <option value="">Select…</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )
    }

    return (
      <div className="field" key={field.key}>
        <label htmlFor={fieldId}>{field.label}</label>
        <input
          id={fieldId}
          type={
            field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
          }
          value={value}
          onChange={(e) => updateDocRequestField(field.key, e.target.value)}
          required={field.required}
          placeholder={field.placeholder || (field.required ? 'Required' : 'Optional')}
          autoComplete="off"
        />
      </div>
    )
  }

  async function submitDocRequest() {
    if (!docRequestItem) return
    setError('')
    setDocRequestNotice('')
    if (!canSubmitDocRequest(docRequestItem)) {
      setError('Please complete all required fields.')
      return
    }
    setBusyId(docRequestItem.id)
    try {
      const res = await api.submitDocumentRequest(token, {
        requestTypeId: docRequestItem.id,
        payload: docRequestForm,
      })
      await reloadRequests()
      if (res.request?.status === 'awaiting_partner') {
        const url = res.request.partnerConfirmUrl || '/marriage-confirm'
        const hint = res.request.devPartnerCode
          ? ` Partner code (dev): ${res.request.devPartnerCode}`
          : ''
        setDocRequestNotice(
          `Invite sent. Partner confirms at ${url}.${hint}`,
        )
        closeDocRequest()
        return
      }
      closeDocRequest()
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

  function walletOptionsForField(field) {
    if (field?.type !== 'walletDocument') return []
    if (field.documentType === 'vehicleRegistration') {
      return vehicles
        .filter((v) => v.status === 'active')
        .map((v) => ({
          id: v.documentId,
          label: [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle',
          meta: v.plateNumber || v.documentId.slice(0, 8),
        }))
    }
    return documents
      .filter((d) => d.type === field.documentType && d.status === 'active')
      .map((d) => ({
        id: d.id,
        label: TYPE_META[d.type]?.label || d.type,
        meta: d.documentNumberMasked || d.id.slice(0, 8),
      }))
  }

  function fieldIsRequired(field, form) {
    if (field.required === true) return true
    const when = field.requiredWhen
    if (!when || typeof when !== 'object') return false
    return Object.entries(when).every(([depKey, allowed]) => {
      const current = String(form?.[depKey] ?? '')
      const list = Array.isArray(allowed) ? allowed.map(String) : [String(allowed)]
      return list.includes(current)
    })
  }

  function canSubmitService(service) {
    const form = serviceForms[service.id] || {}
    for (const field of service.fields || []) {
      if (!fieldIsRequired(field, form)) continue
      const value = form[field.key]
      if (value == null || String(value).trim() === '') return false
      if (field.positive === true && !(Number(value) > 0)) return false
      if (field.nonNegative === true && Number(value) < 0) return false
      if (field.min != null && Number(value) < Number(field.min)) return false
    }
    return true
  }

  function serviceDisplayName(request) {
    const fromCatalog = serviceCatalog.find((s) => s.id === request.serviceId)?.name
    return serviceLabel(request.serviceId, request.serviceName || fromCatalog)
  }

  function isAppointmentFlow(service) {
    return service?.flow === 'appointment'
  }

  function seedServiceDefaults(service) {
    const defaults = {}
    for (const field of service.fields || []) {
      // Optional fields only — required dates/selects stay empty until user acts
      if (field.default != null && field.required !== true) {
        defaults[field.key] = field.default
      }
    }
    setServiceForms((prev) => ({
      ...prev,
      [service.id]: { ...(prev[service.id] || {}), ...defaults },
    }))
  }

  function openAppointment(service) {
    setError('')
    setActiveService(null)
    seedServiceDefaults(service)
    setAppointmentService(service)
    setAppointmentStep(1)
  }

  function closeAppointment() {
    setAppointmentService(null)
    setAppointmentStep(1)
  }

  function openService(service) {
    setError('')
    if (isAppointmentFlow(service)) {
      openAppointment(service)
      return
    }
    setAppointmentService(null)
    seedServiceDefaults(service)
    setActiveService(service)
  }

  function closeService() {
    setActiveService(null)
  }

  function renderFriendlyField(service, field) {
    const fieldId = `${service.id}-${field.key}`
    const value =
      serviceForms[service.id]?.[field.key] ??
      (field.required ? '' : field.default ?? '')

    if (field.type === 'walletDocument') {
      const options = walletOptionsForField(field)
      if (options.length === 0) {
        return (
          <div className="field" key={field.key}>
            <label>{field.label}</label>
            <p className="empty-hint">
              You don’t have this document in your wallet yet. Add it from Request a
              document, then come back here.
            </p>
          </div>
        )
      }
      if (options.length <= 6) {
        return (
          <div className="field" key={field.key}>
            <label>{field.label}</label>
            <p className="field-hint">Tap the vehicle this request is for.</p>
            <div className="choice-grid">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`choice-card${value === opt.id ? ' is-selected' : ''}`}
                  onClick={() => updateServiceField(service.id, field.key, opt.id)}
                >
                  <span className="choice-title">{opt.label}</span>
                  <span className="choice-meta">{opt.meta}</span>
                </button>
              ))}
            </div>
          </div>
        )
      }
      return (
        <div className="field" key={field.key}>
          <label htmlFor={fieldId}>{field.label}</label>
          <select
            id={fieldId}
            value={value}
            onChange={(e) => updateServiceField(service.id, field.key, e.target.value)}
            required={field.required}
          >
            <option value="">Choose…</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} · {opt.meta}
              </option>
            ))}
          </select>
        </div>
      )
    }

    if (field.type === 'select' && (field.options || []).length <= 6) {
      return (
        <div className="field" key={field.key}>
          <label>{field.label}</label>
          <div className="choice-grid">
            {(field.options || []).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`choice-card${value === opt.value ? ' is-selected' : ''}`}
                onClick={() => updateServiceField(service.id, field.key, opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (field.type === 'select') {
      return (
        <div className="field" key={field.key}>
          <label htmlFor={fieldId}>{field.label}</label>
          <select
            id={fieldId}
            value={value}
            onChange={(e) => updateServiceField(service.id, field.key, e.target.value)}
            required={field.required}
          >
            <option value="">Select…</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )
    }

    return (
      <div className="field" key={field.key}>
        <label htmlFor={fieldId}>{field.label}</label>
        <input
          id={fieldId}
          type={
            field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
          }
          value={value}
          onChange={(e) => updateServiceField(service.id, field.key, e.target.value)}
          required={fieldIsRequired(field, serviceForms[service.id] || {})}
          min={field.min != null ? field.min : field.nonNegative ? 0 : undefined}
          placeholder={field.required ? 'Required' : 'Optional'}
        />
      </div>
    )
  }

  function appointmentPurposeField(service) {
    return (service?.fields || []).find((f) =>
      ['serviceType', 'examType', 'vehicleClass', 'hearingType', 'action'].includes(f.key),
    )
  }

  function appointmentCanContinue(step, service) {
    const form = serviceForms[service.id] || {}
    if (step === 1) {
      const purpose = appointmentPurposeField(service)
      if (purpose && !String(form[purpose.key] || '').trim()) return false
      if (service.id === 'dmv-manage-appointment' && !String(form.confirmationNumber || '').trim()) {
        return false
      }
      if (service.id === 'dmv-informal-hearing' && !String(form.noticeId || '').trim()) {
        return false
      }
      return true
    }
    if (step === 2) return Boolean(form.appointmentDate)
    if (step === 3) return Boolean(form.state && form.location)
    return true
  }

  async function submitService(
    service,
    { closeAppointmentFlow = false, closeServiceFlow = false } = {},
  ) {
    setError('')
    if (!canSubmitService(service)) {
      setError('Please complete the highlighted fields to continue.')
      return
    }
    setBusyId(service.id)
    try {
      const res = await api.submitService(token, {
        serviceId: service.id,
        payload: serviceForms[service.id] || {},
      })
      await reloadServices(tab)
      if (closeAppointmentFlow) closeAppointment()
      if (closeServiceFlow) closeService()
      if (res.request) setServiceDetail(res.request)
    } catch (err) {
      handleApiError(err)
    } finally {
      setBusyId(null)
    }
  }

  async function runInAppVerify(e) {
    e?.preventDefault?.()
    setError('')
    setVerifyResult(null)
    setBusyId('verify')
    try {
      const data = await api.verifyPresentation(verifyCode.trim())
      setVerifyResult(data)
    } catch (err) {
      handleApiError(err)
    } finally {
      setBusyId(null)
    }
  }

  function updateServiceField(serviceId, key, value) {
    setServiceForms((prev) => {
      const next = { ...(prev[serviceId] || {}), [key]: value }
      // Changing state clears office so the user must pick a matching location
      if (key === 'state') next.location = ''
      return { ...prev, [serviceId]: next }
    })
  }

  function appointmentLocationsForState(service, stateCode) {
    const field = (service?.fields || []).find((f) => f.key === 'location')
    const options = field?.options || []
    if (!stateCode) return []
    return options.filter(
      (o) => !o.state || o.state === '*' || o.state === stateCode,
    )
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
    { id: 'wallet', label: 'Wallet' },
    {
      id: 'vehicle',
      label: 'Vehicle',
      badge: unpaidCount || null,
    },
    { id: 'request', label: 'Request document' },
    { id: 'dmv', label: 'DMV services' },
    { id: 'irs', label: 'IRS / taxes' },
    { id: 'unemployment', label: 'Unemployment benefits' },
    { id: 'verify', label: 'Verify document (QR)' },
    { id: 'security', label: 'Security evidence' },
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
          {navItems.map((item) => (
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
                                {statusLabel(fine.status)} · ${Number(fine.amount).toFixed(2)}
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
        ) : tab === 'request' ? (
          <>
            {docRequestNotice && <p className="status status-processing">{docRequestNotice}</p>}
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
                        : item.fulfillment === 'dual_party'
                          ? 'Partner confirm required'
                          : item.fulfillment === 'instant'
                            ? 'Instant → wallet'
                            : `~${item.estimatedDays} days`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === item.id}
                    onClick={() => openDocRequest(item)}
                  >
                    {item.fulfillment === 'dual_party'
                      ? 'Start secure application'
                      : item.fields?.length
                        ? 'Fill in & request'
                        : 'Request this document'}
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
                      <span className={`status status-${r.status}`}>{statusLabel(r.status)}</span>
                      <span className="muted">{r.message}</span>
                      {r.devPartnerCode && (
                        <span className="muted">Partner code (dev): {r.devPartnerCode}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : SERVICE_TABS.has(tab) ? (
          <>
            <div className="request-grid">
              {serviceCatalog.map((service) => (
                <article key={service.id} className="request-card service-tile">
                  <div className="service-tile-body">
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                  </div>
                  <div className="request-meta">
                    <span>{service.agency}</span>
                    <span>
                      {isAppointmentFlow(service)
                        ? '3 quick steps'
                        : service.requiredDocumentTypes?.length
                          ? `Uses: ${service.requiredDocumentTypes.map(typeLabel).join(', ')}`
                          : 'Ready to start'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openService(service)}
                  >
                    {serviceCtaLabel(service)}
                  </button>
                </article>
              ))}
            </div>

            <section className="request-history">
              <h2>Your recent activity</h2>
              {serviceRequests.length === 0 ? (
                <p className="empty-hint">
                  Nothing here yet. Choose a service above — we’ll guide you through each
                  step.
                </p>
              ) : (
                <ul>
                  {serviceRequests.map((r) => (
                    <li key={r.id} className="history-row">
                      <div className="history-main">
                        <strong>{serviceDisplayName(r)}</strong>
                        <span className={`status status-${r.status}`}>
                          {statusLabel(r.status)}
                        </span>
                        <span className="muted">
                          {r.result?.statusLabel ||
                            r.result?.message ||
                            r.result?.confirmationNumber ||
                            ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => setServiceDetail(r)}
                      >
                        View details
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : tab === 'security' ? (
          <section className="panel security-panel">
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={loadAudit}>
                Refresh
              </button>
              {auditMeta && (
                <span className="muted">
                  Session AAL {auditMeta.sessionAal || '—'} · IAL{' '}
                  {auditMeta.sessionIal || '—'}
                </span>
              )}
            </div>
            {auditEvents.length === 0 ? (
              <p className="empty-hint">
                No recent events for this account yet. Sign in, open a document QR, or submit
                a service — then refresh.
              </p>
            ) : (
              <ul className="audit-list">
                {auditEvents.map((ev) => (
                  <li key={ev.id} className="audit-row">
                    <div>
                      <strong>{ev.action}</strong>
                      <span
                        className={`status status-${ev.outcome === 'success' ? 'approved' : 'rejected'}`}
                      >
                        {ev.outcome}
                      </span>
                    </div>
                    <div className="muted">
                      {ev.ts?.replace('T', ' ').slice(0, 19)}
                      {ev.resource ? ` · ${String(ev.resource).slice(0, 8)}…` : ''}
                    </div>
                    {ev.integrityPreview && (
                      <code className="audit-integrity">HMAC {ev.integrityPreview}</code>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">
              Append-only audit trail supports the security evaluation criterion (evidence via
              tests/audit). Digests are truncated in the citizen view.
            </p>
          </section>
        ) : (
          <form className="panel verify-form" onSubmit={runInAppVerify}>
            <div className="field">
              <label htmlFor="in-app-code">Presentation code</label>
              <input
                id="in-app-code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="Paste code from QR"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busyId === 'verify'}>
              {busyId === 'verify' ? 'Verifying…' : 'Verify'}
            </button>
            {verifyResult?.valid && (
              <div className="verify-result-inline">
                <p className="status status-approved">Valid</p>
                <p>
                  <strong>{typeLabel(verifyResult.document?.type)}</strong>
                  {' · '}
                  {verifyResult.document?.fullName}
                </p>
                <p className="muted">
                  {verifyResult.document?.documentNumber} · {verifyResult.document?.issuer}
                </p>
              </div>
            )}
          </form>
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
                <dd>{statusLabel(selected.status) || selected.status}</dd>
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
                        <span className={`status status-${fine.status}`}>
                          {statusLabel(fine.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="present-panel">
              <h4>Present to a verifier</h4>
              <p className="muted">
                Optional. You do <strong>not</strong> need this for DMV, IRS, or other
                services — only when someone must check this document (demo / officer).
              </p>

              {!presentation ? (
                <div className="qr-consent">
                  <label className="consent-row">
                    <input
                      type="checkbox"
                      checked={qrConsent}
                      onChange={(e) => setQrConsent(e.target.checked)}
                    />
                    <span>
                      I consent to share only: type, full name, document number, issuer,
                      state, expiry, and status. DOB and address stay in my wallet.
                    </span>
                  </label>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={createQr}
                    disabled={qrLoading || !qrConsent}
                  >
                    {qrLoading ? 'Creating…' : 'Create one-time presentation'}
                  </button>
                </div>
              ) : (
                <div className="qr-box">
                  <p className="qr-title">
                    {qrSecondsLeft > 0
                      ? `Valid for ${Math.floor(qrSecondsLeft / 60)}:${String(
                          qrSecondsLeft % 60,
                        ).padStart(2, '0')}`
                      : 'Expired — create a new presentation'}
                  </p>

                  <a
                    className="btn btn-primary"
                    href={`/verify/${encodeURIComponent(presentation.presentationCode)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open verify page (recommended for demo)
                  </a>
                  <p className="muted qr-hint">
                    Most reliable on one computer: opens the verifier page in a new tab.
                  </p>

                  <div className="qr-frame">
                    <QRCodeSVG
                      value={getVerifyUrl(presentation.presentationCode)}
                      size={180}
                      level="M"
                      includeMargin
                    />
                  </div>
                  <p className="muted qr-hint">
                    Phone scan needs the same Wi‑Fi and the LAN link below (not localhost).
                  </p>
                  <code className="qr-url">{getVerifyUrl(presentation.presentationCode)}</code>
                  <p className="muted">
                    Or paste this code in <strong>Verify document (QR)</strong>:
                    <br />
                    <code className="qr-url">{presentation.presentationCode}</code>
                  </p>

                  <div className="btn-row qr-actions">
                    <button type="button" className="btn btn-ghost" onClick={copyVerifyLink}>
                      {qrCopied === 'link' ? 'Link copied' : 'Copy link'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={copyPresentationCode}
                    >
                      {qrCopied === 'code' ? 'Code copied' : 'Copy code'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={createQr}
                      disabled={qrLoading}
                    >
                      New code
                    </button>
                  </div>
                  {presentation.disclosureNote && (
                    <p className="muted">{presentation.disclosureNote}</p>
                  )}
                </div>
              )}
            </div>

            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {serviceDetail && (
        <div
          className="modal-backdrop"
          onClick={() => setServiceDetail(null)}
          role="presentation"
        >
          <div
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="appointment-kicker">Result</p>
            <h3>{serviceDisplayName(serviceDetail)}</h3>
            <p className="muted">{serviceDetail.agency}</p>
            <p className={`status status-${serviceDetail.status}`}>
              {statusLabel(serviceDetail.status)}
            </p>
            <dl>{renderServiceDetailRows(serviceDetail)}</dl>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setServiceDetail(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {docRequestItem && (
        <div className="modal-backdrop" onClick={closeDocRequest} role="presentation">
          <div
            className="modal modal-wide appointment-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="appointment-kicker">{docRequestItem.agency}</p>
            <h3>{docRequestItem.name}</h3>
            <p className="muted service-modal-lead">{docRequestItem.description}</p>

            {docRequestItem.id === 'marriage-license' && (
              <div className="appointment-panel">
                <h4>Partner confirmation</h4>
                <p className="muted">
                  Enter your partner’s legal name and mobile number. They receive a
                  one-time SMS code and must confirm the application before the license
                  is issued to your wallet.
                </p>
              </div>
            )}

            {docRequestItem.id === 'irs-ss4' && (
              <div className="appointment-panel">
                <h4>IRS Form SS-4</h4>
                <p className="muted">
                  Fields follow IRS Form SS-4 instructions. Full SSN/ITIN/EIN is never
                  collected — last 4 digits only. Confirmation stays with this request,
                  not in the wallet.
                </p>
              </div>
            )}

            {(docRequestItem.fields || []).length === 0 ? (
              <div className="appointment-panel">
                <h4>Ready when you are</h4>
                <p className="muted">No extra details needed for this request.</p>
              </div>
            ) : (
              <div className="appointment-panel">
                <h4>Required details</h4>
                {(docRequestItem.fields || []).map((field) => renderDocRequestField(field))}
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="btn-row appointment-nav">
              <button type="button" className="btn btn-ghost" onClick={closeDocRequest}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busyId === docRequestItem.id || !canSubmitDocRequest(docRequestItem)
                }
                onClick={submitDocRequest}
              >
                {busyId === docRequestItem.id
                  ? 'Submitting…'
                  : docRequestItem.fulfillment === 'dual_party'
                    ? 'Send partner invite'
                    : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeService && (
        <div className="modal-backdrop" onClick={closeService} role="presentation">
          <div
            className="modal modal-wide appointment-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="appointment-kicker">{activeService.agency}</p>
            <h3>{activeService.name}</h3>
            <p className="muted service-modal-lead">{activeService.description}</p>

            {(activeService.fields || []).length === 0 ? (
              <div className="appointment-panel">
                <h4>Ready when you are</h4>
                <p className="muted">
                  We’ll use the documents already in your wallet. No extra details needed.
                </p>
              </div>
            ) : (
              <div className="appointment-panel">
                <h4>A few details</h4>
                <p className="muted">Fill these in — we’ll keep it short.</p>
                {(activeService.fields || []).map((field) =>
                  renderFriendlyField(activeService, field),
                )}
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="btn-row appointment-nav">
              <button type="button" className="btn btn-ghost" onClick={closeService}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyId === activeService.id || !canSubmitService(activeService)}
                onClick={() =>
                  submitService(activeService, { closeServiceFlow: true })
                }
              >
                {busyId === activeService.id
                  ? 'Submitting…'
                  : serviceCtaLabel(activeService)}
              </button>
            </div>
          </div>
        </div>
      )}

      {appointmentService && (
        <div className="modal-backdrop" onClick={closeAppointment} role="presentation">
          <div
            className="modal modal-wide appointment-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="appointment-kicker">Book appointment</p>
            <h3>{appointmentService.name}</h3>
            <ol className="appointment-steps" aria-label="Booking steps">
              <li className={appointmentStep === 1 ? 'is-active' : appointmentStep > 1 ? 'is-done' : ''}>
                1. Purpose
              </li>
              <li className={appointmentStep === 2 ? 'is-active' : appointmentStep > 2 ? 'is-done' : ''}>
                2. Date
              </li>
              <li className={appointmentStep === 3 ? 'is-active' : ''}>3. Location</li>
            </ol>

            {appointmentStep === 1 && (
              <div className="appointment-panel">
                <h4>What would you like to do?</h4>
                <p className="muted">Choose the reason for your visit.</p>
                {(() => {
                  const purpose = appointmentPurposeField(appointmentService)
                  if (!purpose) return null
                  return (
                    <div className="choice-grid" role="listbox" aria-label={purpose.label}>
                      {(purpose.options || []).map((opt) => {
                        const selected =
                          serviceForms[appointmentService.id]?.[purpose.key] === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={`choice-card${selected ? ' is-selected' : ''}`}
                            onClick={() =>
                              updateServiceField(
                                appointmentService.id,
                                purpose.key,
                                opt.value,
                              )
                            }
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
                {appointmentService.id === 'dmv-manage-appointment' && (
                  <div className="field">
                    <label htmlFor="appt-confirmation">Appointment confirmation #</label>
                    <input
                      id="appt-confirmation"
                      value={
                        serviceForms[appointmentService.id]?.confirmationNumber ?? ''
                      }
                      onChange={(e) =>
                        updateServiceField(
                          appointmentService.id,
                          'confirmationNumber',
                          e.target.value,
                        )
                      }
                      placeholder="e.g. APT-AB12CD34"
                      required
                    />
                  </div>
                )}
                {appointmentService.id === 'dmv-informal-hearing' && (
                  <div className="field">
                    <label htmlFor="appt-notice">Notice / case ID</label>
                    <input
                      id="appt-notice"
                      value={serviceForms[appointmentService.id]?.noticeId ?? ''}
                      onChange={(e) =>
                        updateServiceField(appointmentService.id, 'noticeId', e.target.value)
                      }
                      placeholder="Enter the ID from your notice"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {appointmentStep === 2 && (
              <div className="appointment-panel">
                <h4>Which date works for you?</h4>
                <p className="muted">Pick a day for your office visit.</p>
                <div className="field">
                  <label htmlFor="appt-date">Appointment date</label>
                  <input
                    id="appt-date"
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={serviceForms[appointmentService.id]?.appointmentDate ?? ''}
                    onChange={(e) =>
                      updateServiceField(
                        appointmentService.id,
                        'appointmentDate',
                        e.target.value,
                      )
                    }
                    required
                  />
                </div>
              </div>
            )}

            {appointmentStep === 3 && (
              <div className="appointment-panel">
                <h4>Where should we book it?</h4>
                <p className="muted">
                  Choose your state first, then an office in that state.
                </p>
                <div className="field">
                  <label htmlFor="appt-state">State</label>
                  <select
                    id="appt-state"
                    value={serviceForms[appointmentService.id]?.state ?? ''}
                    onChange={(e) =>
                      updateServiceField(appointmentService.id, 'state', e.target.value)
                    }
                    required
                  >
                    <option value="">Select state…</option>
                    {(
                      appointmentService.fields.find((f) => f.key === 'state')?.options ||
                      []
                    ).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appt-location">Office location</label>
                  <select
                    id="appt-location"
                    value={serviceForms[appointmentService.id]?.location ?? ''}
                    onChange={(e) =>
                      updateServiceField(
                        appointmentService.id,
                        'location',
                        e.target.value,
                      )
                    }
                    required
                    disabled={!serviceForms[appointmentService.id]?.state}
                  >
                    <option value="">
                      {serviceForms[appointmentService.id]?.state
                        ? 'Select office…'
                        : 'Select a state first…'}
                    </option>
                    {appointmentLocationsForState(
                      appointmentService,
                      serviceForms[appointmentService.id]?.state,
                    ).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="appointment-summary">
                  <strong>Summary</strong>
                  <p>
                    {(appointmentPurposeField(appointmentService)?.options || []).find(
                      (o) =>
                        o.value ===
                        serviceForms[appointmentService.id]?.[
                          appointmentPurposeField(appointmentService)?.key
                        ],
                    )?.label || 'Purpose not set'}
                    <br />
                    {serviceForms[appointmentService.id]?.appointmentDate || 'Date not set'}
                    <br />
                    {(
                      appointmentService.fields.find((f) => f.key === 'state')?.options ||
                      []
                    ).find((o) => o.value === serviceForms[appointmentService.id]?.state)
                      ?.label || 'State not set'}
                    {' · '}
                    {appointmentLocationsForState(
                      appointmentService,
                      serviceForms[appointmentService.id]?.state,
                    ).find(
                      (o) => o.value === serviceForms[appointmentService.id]?.location,
                    )?.label || 'Office not set'}
                  </p>
                </div>
              </div>
            )}

            {error && <p className="error">{error}</p>}

            <div className="btn-row appointment-nav">
              <button type="button" className="btn btn-ghost" onClick={closeAppointment}>
                Cancel
              </button>
              {appointmentStep > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAppointmentStep((s) => s - 1)}
                >
                  Back
                </button>
              )}
              {appointmentStep < 3 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!appointmentCanContinue(appointmentStep, appointmentService)}
                  onClick={() => setAppointmentStep((s) => s + 1)}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    busyId === appointmentService.id ||
                    !appointmentCanContinue(3, appointmentService) ||
                    !canSubmitService(appointmentService)
                  }
                  onClick={() =>
                    submitService(appointmentService, { closeAppointmentFlow: true })
                  }
                >
                  {busyId === appointmentService.id ? 'Booking…' : 'Confirm appointment'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
