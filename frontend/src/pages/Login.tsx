
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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

interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  user: {
    id: number
    email: string
    full_name: string
    is_active: boolean
  }
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()

  const passwordResetSuccess =
    (location.state as { passwordResetSuccess?: boolean } | null)
      ?.passwordResetSuccess === true

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const normalizedEmail = email.trim()

    const nextEmailError = !normalizedEmail
      ? 'Enter your email address.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ? 'Enter a valid email address.'
        : ''

    const nextPasswordError = password ? '' : 'Enter your password.'

    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)

    if (nextEmailError || nextPasswordError) return

    setLoading(true)

    try {
      const response = await api.post<LoginResponse>('/auth/login', {
        email: normalizedEmail,
        password,
      })

      sessionStorage.setItem(
        'wastewise_access_token',
        response.data.access_token,
      )

      sessionStorage.setItem(
        'wastewise_user',
        JSON.stringify(response.data.user),
      )

      navigate('/dashboard', { replace: true })
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        const status = requestError.response?.status

        if (status === 401) {
          setError('That email and password combination was not recognized.')
        } else if (status === 403) {
          setError('This account is inactive. Contact your administrator.')
        } else if (requestError.response) {
          setError('We could not sign you in. Please try again.')
        } else {
          setError(
            'Unable to reach the sign-in service. Check your connection and try again.',
          )
        }
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

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
            <span className="login-story-kicker">
              SMARTER STOCK. LESS WASTE.
            </span>
            <h1>
              Make every
              <br />
              product count.
            </h1>
            <p>
              A clearer view of your inventory helps you make thoughtful
              decisions for your store and your community.
            </p>
          </div>

          <div className="login-story-note">
            <span>
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <p>
              <strong>Your workspace, securely</strong>
              Sign in to continue to your inventory dashboard.
            </p>
          </div>

          <div className="login-orbit login-orbit-one" aria-hidden="true" />
          <div className="login-orbit login-orbit-two" aria-hidden="true" />
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-heading">
            <span className="login-card-mark">
              <Leaf size={19} aria-hidden="true" />
            </span>
            <span className="login-mobile-brand">WASTE WISE AI</span>
            <span className="login-welcome">WELCOME BACK</span>
            <h2 id="login-title">Sign in to your account</h2>
            <p>Enter your account details to access your workspace.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {passwordResetSuccess && (
              <p className="login-success" role="status">
                Your password was updated. Sign in with your new password.
              </p>
            )}

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
                  aria-describedby={emailError ? 'email-error' : undefined}
                  required
                />
              </div>

              {emailError && (
                <span className="login-field-error" id="email-error">
                  {emailError}
                </span>
              )}
            </div>

            <div style={{ textAlign: 'right', marginTop: '-8px' }}>
              <Link
                to="/reset-password"
                style={{
                  color: '#16a34a',
                  fontWeight: 600,
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                Forgot Password?
              </Link>
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div
                className={`login-input-wrap ${passwordError ? 'has-error' : ''}`}
              >
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (passwordError) setPasswordError('')
                  }}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? 'password-error' : undefined
                  }
                  required
                />

                <button
                  className="login-password-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff size={17} aria-hidden="true" />
                  ) : (
                    <Eye size={17} aria-hidden="true" />
                  )}
                </button>
              </div>

              {passwordError && (
                <span className="login-field-error" id="password-error">
                  {passwordError}
                </span>
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
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p className="login-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            Secure access to your store workspace
          </p>
        </section>
      </div>
    </main>
  )
}
