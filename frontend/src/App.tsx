import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  Activity,
  Bell,
  ChartNoAxesCombined,
  Leaf,
  LayoutDashboard,
  LogOut,
  Package,
  Recycle,
  Search,
  Settings,
  Sprout,
  ReceiptText,
  ShieldAlert,
  Warehouse,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Inventory from './pages/Inventory'
import ExpiryRisk from './pages/ExpiryRisk'
import DemandForecast from './pages/DemandForecast'
import SalesHistory from './pages/SalesHistory'
import ModelMetrics from './pages/ModelMetrics'
import Recommendations from './pages/Recommendations'
import WasteReports from './pages/WasteReports'
import SettingsPage from './pages/Settings'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import ProtectedRoute from './components/ProtectedRoute'
import api from './services/api'
import packageJson from '../package.json'

type BackendStatus = 'Checking' | 'Connected' | 'Disconnected'
type Theme = 'light' | 'dark'

interface NavigationItem {
  to: string
  label: string
  icon: LucideIcon
  comingSoon?: boolean
}

const DISPLAY_NAME_STORAGE_KEY = 'wastewise_display_name'
const THEME_STORAGE_KEY = 'wastewise_theme'
const ACCESS_TOKEN_STORAGE_KEY = 'wastewise_access_token'
const USER_STORAGE_KEY = 'wastewise_user'

const navigation: NavigationItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/sales-history', label: 'Sales History', icon: ReceiptText },
  { to: '/demand-forecast', label: 'Forecasts', icon: TrendingUp },
  { to: '/expiry-risk', label: 'Expiry Risk', icon: ShieldAlert },
  {
    to: '/recommendations',
    label: 'Recommendations',
    icon: ChartNoAxesCombined,
  },
  {
    to: '/waste-reports',
    label: 'Waste Insights',
    icon: Recycle,
  },
  { to: '/model-metrics', label: 'Model Metrics', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/sales-history': 'Sales History',
  '/demand-forecast': 'Demand Forecasting',
  '/expiry-risk': 'Expiry Risk',
  '/recommendations': 'Recommendations',
  '/waste-reports': 'Waste Reports',
  '/model-metrics': 'Model Metrics',
  '/settings': 'Settings',
}

function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>('Checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const checkBackend = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus('Checking')
    setErrorMessage(null)

    try {
      const response = await api.get<{ status?: string }>('/health', {
        signal: controller.signal,
      })
      if (!controller.signal.aborted) {
        if (response.data.status === 'healthy') {
          setStatus('Connected')
        } else {
          setStatus('Disconnected')
          setErrorMessage('The health endpoint did not report a healthy status.')
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setStatus('Disconnected')
        setErrorMessage(
          error instanceof Error ? error.message : 'The health check failed.',
        )
      }
    }
  }, [])

  useEffect(() => {
    void checkBackend()
    const intervalId = window.setInterval(() => {
      void checkBackend()
    }, 30_000)

    return () => {
      window.clearInterval(intervalId)
      controllerRef.current?.abort()
    }
  }, [checkBackend])

  return { status, errorMessage, checkBackend }
}

function AppLayout() {
  const navigate = useNavigate()
  const { status: backendStatus, errorMessage, checkBackend } = useBackendStatus()
  const { pathname } = useLocation()
  const pageTitle = pageTitles[pathname] ?? 'Dashboard'
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim() || 'Workspace user',
  )
  const [theme, setTheme] = useState<Theme>(
    () => localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const saveDisplayName = (name: string) => {
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, name)
    setDisplayName(name)
  }

  const saveTheme = (nextTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    setTheme(nextTheme)
  }

  const profileInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  const handleLogout = () => {
    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    sessionStorage.removeItem(USER_STORAGE_KEY)
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Leaf size={25} />
          </span>
          <div>
            <strong>WASTE WISE AI</strong>
            <span>SMART INVENTORY</span>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <nav className="navigation" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon, comingSoon }) =>
            comingSoon ? (
              <span
                key={to}
                className="nav-item nav-item-disabled"
                aria-disabled="true"
                title={`${label} will be available when this feature is implemented.`}
              >
                <Icon
                  size={19}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  focusable="false"
                />
                <span className="nav-item-label">{label}</span>
                <span className="nav-item-badge">Soon</span>
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
                aria-current={pathname === to ? 'page' : undefined}
              >
                <Icon
                  size={19}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  focusable="false"
                />
                <span className="nav-item-label">{label}</span>
              </NavLink>
            ),
          )}
        </nav>

        <div className="sidebar-impact" role="note">
          <div className="sidebar-impact-art" aria-hidden="true">
            <span>
              <Leaf size={17} />
            </span>
            <span>
              <Recycle size={19} />
            </span>
            <span>
              <Sprout size={16} />
            </span>
          </div>
          <strong>Waste less, grow more.</strong>
          <p>Smarter stock decisions start with a clearer picture.</p>
        </div>

        <div className="sidebar-backend-status">
          <div
            className={`api-status ${
              backendStatus === 'Connected'
                ? 'connected'
                : backendStatus === 'Disconnected'
                  ? 'unavailable'
                  : 'checking'
            }`}
            role="status"
            aria-live="polite"
          >
            <span className="connection-dot" aria-hidden="true" />
            <span className="api-status-label">Backend API</span>
            <span className="api-status-value">{backendStatus}</span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-heading">
            <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
              <span>Workspace</span>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{pageTitle}</span>
            </nav>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            {pathname === '/dashboard' && (
              <label className="topbar-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={dashboardSearch}
                  onChange={(event) => setDashboardSearch(event.target.value)}
                  placeholder="Search products..."
                  aria-label="Filter dashboard inventory and waste charts"
                />
              </label>
            )}
            <NavLink
              to="/expiry-risk"
              className="topbar-icon-button"
              aria-label="View expiry risk alerts"
              title="View expiry risk alerts"
            >
              <Bell size={18} aria-hidden="true" />
            </NavLink>
            <div className="topbar-account">
              <div className="topbar-profile" aria-label="Workspace user">
                <span className="profile-avatar" aria-hidden="true">
                  {profileInitials}
                </span>
                <div className="profile-details">
                  <strong>{displayName}</strong>
                  <span>WASTE WISE AI</span>
                </div>
              </div>
              <button
                type="button"
                className="logout-button"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={16} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Dashboard
                productSearch={dashboardSearch}
              />
            }
          />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/sales-history" element={<SalesHistory />} />
          <Route path="/expiry-risk" element={<ExpiryRisk />} />
          <Route path="/demand-forecast" element={<DemandForecast />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/waste-reports" element={<WasteReports />} />
          <Route path="/model-metrics" element={<ModelMetrics />} />
          <Route
            path="/settings"
            element={
              <SettingsPage
                displayName={displayName}
                onSaveDisplayName={saveDisplayName}
                theme={theme}
                onThemeChange={saveTheme}
                backendStatus={backendStatus}
                backendError={errorMessage}
                onCheckConnection={checkBackend}
                version={packageJson.version}
                apiBaseUrl={api.defaults.baseURL ?? '/api/v1'}
              />
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}