import { useCallback, useEffect, useState, type ReactNode } from 'react'
import axios from 'axios'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import api from '../services/api'

type SessionStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'error'

const ACCESS_TOKEN_STORAGE_KEY = 'wastewise_access_token'
const USER_STORAGE_KEY = 'wastewise_user'

export default function ProtectedRoute({
  children,
}: {
  children: ReactNode
}) {
  const location = useLocation()
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [retry, setRetry] = useState(0)

  const validateSession = useCallback(async (signal: AbortSignal) => {
    const token = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    if (!token) {
      setStatus('unauthenticated')
      return
    }

    setStatus('checking')
    try {
      await api.get('/auth/me', { signal })
      if (!signal.aborted) setStatus('authenticated')
    } catch (error: unknown) {
      if (signal.aborted) return

      if (
        axios.isAxiosError(error) &&
        (error.response?.status === 401 || error.response?.status === 403)
      ) {
        sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
        sessionStorage.removeItem(USER_STORAGE_KEY)
        setStatus('unauthenticated')
      } else {
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void validateSession(controller.signal)
    return () => controller.abort()
  }, [retry, validateSession])

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (status === 'error') {
    return (
      <main className="auth-check auth-check-error" role="alert">
        <ShieldAlert size={20} aria-hidden="true" />
        <span>
          We could not verify your session. Check the backend connection and
          try again.
        </span>
        <button type="button" onClick={() => setRetry((attempt) => attempt + 1)}>
          Try again
        </button>
      </main>
    )
  }

  if (status === 'checking') {
    return (
      <main className="auth-check" role="status" aria-live="polite">
        <span className="login-spinner" aria-hidden="true" />
        <span>Checking your secure session...</span>
      </main>
    )
  }

  return children
}
