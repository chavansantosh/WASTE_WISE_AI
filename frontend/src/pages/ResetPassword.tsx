import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import axios from 'axios'
import api from '../services/api'

export default function ResetPassword() {
  const navigate = useNavigate()
  const tokenProcessed = useRef(false)
  const [token, setToken] = useState('')
  const [tokenReady, setTokenReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [requested, setRequested] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (tokenProcessed.current) return
    tokenProcessed.current = true

    const resetToken = new URLSearchParams(
      window.location.hash.slice(1),
    ).get('token')
    setToken(resetToken ?? '')
    setTokenReady(true)

    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    }
  }, [])

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    const normalizedEmail = email.trim()
    const nextEmailError = !normalizedEmail
      ? 'Enter your email address.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ? 'Enter a valid email address.'
        : ''
    setEmailError(nextEmailError)
    if (nextEmailError) return

    setLoading(true)
    try {
      const response = await api.post('/auth/password-reset/request', {
        email: normalizedEmail,
      })
      setRequested(true)
      setMessage(
        response.data?.message ??
          'If an active account exists for that email, a password reset link will be sent.',
      )
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        const status = requestError.response?.status
        if (status === 429) {
          setError('Too many requests. Please wait before trying again.')
        } else if (status === 503) {
          setError('Password reset email is not configured. Contact support.')
        } else if (requestError.response) {
          setError('We could not request a reset link. Please try again.')
        } else {
          setError('Unable to reach the password-reset service. Try again.')
        }
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const nextPasswordError = !password
      ? 'Enter a new password.'
      : password.length < 8 || password.length > 128
        ? 'Use a password between 8 and 128 characters.'
        : ''
    const nextConfirmError = !confirmPassword
      ? 'Confirm your new password.'
      : password !== confirmPassword
        ? 'The passwords do not match.'
        : ''

    setPasswordError(nextPasswordError)
    setConfirmError(nextConfirmError)
    if (nextPasswordError || nextConfirmError || !token) return

    setLoading(true)
    try {
      await api.post('/auth/password-reset', { token, password })
      setToken('')
      navigate('/login', {
        replace: true,
        state: { passwordResetSuccess: true },
      })
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        const status = requestError.response?.status
        const detail = requestError.response?.data?.detail
        if (status === 400 && typeof detail === 'string') {
          setError(detail)
        } else if (status === 429) {
          setError('Too many attempts. Please wait before trying again.')
        } else if (status === 422) {
          setError('Choose a password between 8 and 128 characters.')
        } else if (requestError.response) {
          setError('We could not update your password. Please try again.')
        } else {
          setError('Unable to reach the password-reset service. Try again.')
        }
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!tokenReady) {
    return (
      <main className="auth-check" role="status" aria-live="polite">
        <span className="login-spinner" aria-hidden="true" />
        <span>Checking your reset link...</span>
      </main>
    )
  }

  const hasToken = Boolean(token)
  const heading = hasToken ? 'Choose a new password' : 'Reset your password'

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-story" aria-label="About Waste Wise AI">
          <div className="login-brand">
            <span className="login-brand-icon">
              <Leaf size={22} aria-hidden="true" />
            </span>
            <span>
              <strong>WASTE WISE AI</strong>
              <small>SUNRISE MART</small>
            </span>
          </div>
          <div className="login-story-copy">
            <span className="login-story-kicker">SECURE ACCOUNT RECOVERY</span>
            <h1>
              A fresh start
              <br />
              for your account.
            </h1>
            <p>
              {hasToken
                ? 'Set a new password to securely return to your workspace.'
                : 'Request a secure, one-time link to update your password.'}
            </p>
          </div>
          <div className="login-story-note">
            <span>
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <p>
              <strong>Your account stays protected</strong>
              Reset links are time-limited and can only be used once.
            </p>
          </div>
          <div className="login-orbit login-orbit-one" aria-hidden="true" />
          <div className="login-orbit login-orbit-two" aria-hidden="true" />
        </section>

        <section className="login-card" aria-labelledby="reset-title">
          <div className="login-card-heading">
            <span className="login-card-mark">
              <Leaf size={19} aria-hidden="true" />
            </span>
            <span className="login-mobile-brand">WASTE WISE AI</span>
            <span className="login-welcome">ACCOUNT RECOVERY</span>
            <h2 id="reset-title">{heading}</h2>
            <p>
              {hasToken
                ? 'Choose a password between 8 and 128 characters.'
                : 'Enter your account email. If it is registered, we will send a reset link.'}
            </p>
          </div>

          {requested && !hasToken ? (
            <div className="login-form">
              <p className="login-success" role="status">
                {message}
              </p>
              <p className="login-card-heading">
                Check your email for a reset link. It expires after 30 minutes.
              </p>
              <Link className="login-button" to="/login">
                Back to sign in
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          ) : hasToken ? (
            <form className="login-form" onSubmit={handleReset} noValidate>
              <div className="login-field">
                <label htmlFor="new-password">New password</label>
                <div
                  className={`login-input-wrap ${passwordError ? 'has-error' : ''}`}
                >
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                    aria-invalid={Boolean(passwordError)}
                    required
                  />
                  <button
                    className="login-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {passwordError && (
                  <span className="login-field-error">{passwordError}</span>
                )}
              </div>

              <div className="login-field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <div
                  className={`login-input-wrap ${confirmError ? 'has-error' : ''}`}
                >
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value)
                      if (confirmError) setConfirmError('')
                    }}
                    aria-invalid={Boolean(confirmError)}
                    required
                  />
                  <button
                    className="login-password-toggle"
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword((visible) => !visible)
                    }
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
                {confirmError && (
                  <span className="login-field-error">{confirmError}</span>
                )}
              </div>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}
              <button className="login-button" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="login-spinner" aria-hidden="true" />
                    Updating password...
                  </>
                ) : (
                  <>
                    Update password
                    <ArrowRight size={17} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleRequest} noValidate>
              <div className="login-field">
                <label htmlFor="email">Email address</label>
                <div
                  className={`login-input-wrap ${emailError ? 'has-error' : ''}`}
                >
                  <Mail size={18} aria-hidden="true" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (emailError) setEmailError('')
                    }}
                    aria-invalid={Boolean(emailError)}
                    required
                  />
                </div>
                {emailError && (
                  <span className="login-field-error">{emailError}</span>
                )}
              </div>
              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}
              <button className="login-button" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="login-spinner" aria-hidden="true" />
                    Sending link...
                  </>
                ) : (
                  <>
                    Send reset link
                    <ArrowRight size={17} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          )}

          <p className="login-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            <Link to="/login">Back to sign in</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
