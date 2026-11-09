import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleUserRound,
  Building2,
  Info,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Server,
  Sun,
  Warehouse,
} from 'lucide-react'
import {
  DEFAULT_COMPANY_PROFILE,
  getCompanyProfile,
  saveCompanyProfile,
  type CompanyProfile,
} from '../services/companyProfile'

type Theme = 'light' | 'dark'
type BackendStatus = 'Checking' | 'Connected' | 'Disconnected'
type ImageKind = 'logo' | 'hero_photo'

const MAX_COMPANY_IMAGE_BYTES = 5 * 1024 * 1024
const SUPPORTED_COMPANY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface SettingsProps {
  displayName: string
  onSaveDisplayName: (name: string) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  backendStatus: BackendStatus
  backendError: string | null
  onCheckConnection: () => Promise<void>
  version: string
  apiBaseUrl: string
}

export default function SettingsPage({
  displayName,
  onSaveDisplayName,
  theme,
  onThemeChange,
  backendStatus,
  backendError,
  onCheckConnection,
  version,
  apiBaseUrl,
}: SettingsProps) {
  const [nameDraft, setNameDraft] = useState(displayName)
  const [profileFeedback, setProfileFeedback] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const [themeError, setThemeError] = useState<string | null>(null)
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(
    DEFAULT_COMPANY_PROFILE,
  )
  const [companyProfileLoading, setCompanyProfileLoading] = useState(true)
  const [companyProfileSaving, setCompanyProfileSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [heroPhotoFile, setHeroPhotoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState(
    DEFAULT_COMPANY_PROFILE.logo_url,
  )
  const [heroPhotoPreview, setHeroPhotoPreview] = useState(
    DEFAULT_COMPANY_PROFILE.hero_photo_url,
  )
  const [companyProfileFeedback, setCompanyProfileFeedback] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    let active = true
    void getCompanyProfile()
      .then((profile) => {
        if (active) {
          setCompanyProfile(profile)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCompanyProfileFeedback({
            kind: 'error',
            message:
              error instanceof Error
                ? `Could not load company profile: ${error.message}`
                : 'Could not load company profile.',
          })
        }
      })
      .finally(() => {
        if (active) {
          setCompanyProfileLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(companyProfile.logo_url)
      return
    }
    const previewUrl = URL.createObjectURL(logoFile)
    setLogoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [companyProfile.logo_url, logoFile])

  useEffect(() => {
    if (!heroPhotoFile) {
      setHeroPhotoPreview(companyProfile.hero_photo_url)
      return
    }
    const previewUrl = URL.createObjectURL(heroPhotoFile)
    setHeroPhotoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [companyProfile.hero_photo_url, heroPhotoFile])

  useEffect(() => {
    setNameDraft(displayName)
  }, [displayName])

  const saveProfile = () => {
    const name = nameDraft.trim()
    if (!name) {
      setProfileFeedback({
        kind: 'error',
        message: 'Display name cannot be empty.',
      })
      return
    }

    try {
      onSaveDisplayName(name)
      setProfileFeedback({
        kind: 'success',
        message: 'Display name saved on this device.',
      })
    } catch (error) {
      setProfileFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? `Could not save your display name: ${error.message}`
            : 'Could not save your display name.',
      })
    }
  }

  const selectTheme = (nextTheme: Theme) => {
    try {
      onThemeChange(nextTheme)
      setThemeError(null)
    } catch (error) {
      setThemeError(
        error instanceof Error
          ? `Could not save the theme preference: ${error.message}`
          : 'Could not save the theme preference.',
      )
    }
  }

  const selectCompanyImage = (
    kind: ImageKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    if (!SUPPORTED_COMPANY_IMAGE_TYPES.includes(file.type)) {
      setCompanyProfileFeedback({
        kind: 'error',
        message: 'Choose a JPEG, PNG, or WebP image.',
      })
      event.currentTarget.value = ''
      return
    }

    if (file.size > MAX_COMPANY_IMAGE_BYTES) {
      setCompanyProfileFeedback({
        kind: 'error',
        message: 'Company images must be 5 MB or smaller.',
      })
      event.currentTarget.value = ''
      return
    }

    if (kind === 'logo') {
      setLogoFile(file)
    } else {
      setHeroPhotoFile(file)
    }
    setCompanyProfileFeedback(null)
  }

  const saveCompanyBranding = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    const companyName = companyProfile.company_name.trim()
    const tagline = companyProfile.tagline.trim()
    if (!companyName || !tagline) {
      setCompanyProfileFeedback({
        kind: 'error',
        message: 'Company name and tagline cannot be blank.',
      })
      return
    }

    setCompanyProfileSaving(true)
    setCompanyProfileFeedback(null)
    try {
      const savedProfile = await saveCompanyProfile({
        company_name: companyName,
        tagline,
        ...(logoFile ? { logo: logoFile } : {}),
        ...(heroPhotoFile ? { hero_photo: heroPhotoFile } : {}),
      })
      setCompanyProfile(savedProfile)
      setLogoFile(null)
      setHeroPhotoFile(null)
      setCompanyProfileFeedback({
        kind: 'success',
        message: 'Company branding saved.',
      })
    } catch (error: unknown) {
      setCompanyProfileFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? `Could not save company branding: ${error.message}`
            : 'Could not save company branding.',
      })
    } finally {
      setCompanyProfileSaving(false)
    }
  }

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <main className="settings-page">
      <header className="settings-heading">
        <p className="eyebrow">PREFERENCES & WORKSPACE</p>
        <h2>Settings</h2>
        <p>Manage your workspace details, connection, and appearance.</p>
      </header>

      <div className="settings-grid">
        <section
          className="settings-card settings-company-card"
          aria-labelledby="company-profile-settings-title"
        >
          <div className="settings-card-heading">
            <span className="settings-icon"><Building2 size={19} /></span>
            <div>
              <h3 id="company-profile-settings-title">Company Branding</h3>
              <p>Manage the business identity shown on your dashboard</p>
            </div>
          </div>

          <form onSubmit={(event) => void saveCompanyBranding(event)}>
            <div className="settings-company-fields">
              <label className="settings-field">
                <span>Company name</span>
                <input
                  value={companyProfile.company_name}
                  onChange={(event) => {
                    setCompanyProfile({
                      ...companyProfile,
                      company_name: event.target.value,
                    })
                    setCompanyProfileFeedback(null)
                  }}
                  maxLength={120}
                  required
                  disabled={companyProfileLoading || companyProfileSaving}
                />
              </label>
              <label className="settings-field">
                <span>Company tagline</span>
                <input
                  value={companyProfile.tagline}
                  onChange={(event) => {
                    setCompanyProfile({
                      ...companyProfile,
                      tagline: event.target.value,
                    })
                    setCompanyProfileFeedback(null)
                  }}
                  maxLength={180}
                  required
                  disabled={companyProfileLoading || companyProfileSaving}
                />
              </label>
            </div>

            <div className="settings-company-uploads">
              <div className="settings-company-upload">
                <label className="settings-field" htmlFor="company-logo-upload">
                  <span>Company logo</span>
                  <input
                    id="company-logo-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => selectCompanyImage('logo', event)}
                    disabled={companyProfileLoading || companyProfileSaving}
                  />
                </label>
                <div className="settings-company-preview logo" aria-live="polite">
                  <img src={logoPreview} alt="Company logo preview" />
                </div>
                <p className="settings-company-hint">
                  JPEG, PNG, or WebP. Maximum 5 MB.
                </p>
              </div>
              <div className="settings-company-upload">
                <label className="settings-field" htmlFor="company-hero-upload">
                  <span>Dashboard hero photo</span>
                  <input
                    id="company-hero-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => selectCompanyImage('hero_photo', event)}
                    disabled={companyProfileLoading || companyProfileSaving}
                  />
                </label>
                <div className="settings-company-preview hero" aria-live="polite">
                  <img src={heroPhotoPreview} alt="Dashboard hero photo preview" />
                </div>
                <p className="settings-company-hint">
                  JPEG, PNG, or WebP. Maximum 5 MB.
                </p>
              </div>
            </div>

            <div className="settings-form-footer">
              <button
                className="settings-action-button"
                type="submit"
                disabled={companyProfileLoading || companyProfileSaving}
              >
                {companyProfileSaving ? (
                  <RefreshCw size={16} className="settings-spinning" />
                ) : (
                  <Save size={16} />
                )}
                {companyProfileSaving ? 'Saving branding' : 'Save branding'}
              </button>
              {companyProfileFeedback && (
                <p
                  className={`settings-feedback ${companyProfileFeedback.kind}`}
                  role={companyProfileFeedback.kind === 'error' ? 'alert' : 'status'}
                >
                  {companyProfileFeedback.kind === 'success' ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <AlertCircle size={15} />
                  )}
                  {companyProfileFeedback.message}
                </p>
              )}
            </div>
          </form>
        </section>

        <section className="settings-card" aria-labelledby="workspace-settings-title">
          <div className="settings-card-heading">
            <span className="settings-icon"><Warehouse size={19} /></span>
            <div>
              <h3 id="workspace-settings-title">Workspace</h3>
              <p>Your application details</p>
            </div>
          </div>
          <dl className="settings-details">
            <div>
              <dt>Application name</dt>
              <dd>Waste Wise AI</dd>
            </div>
            <div>
              <dt>Workspace description</dt>
              <dd>Inventory intelligence for smarter stock decisions and less food waste.</dd>
            </div>
            <div>
              <dt>Application version</dt>
              <dd><span className="settings-version">v{version}</span></dd>
            </div>
          </dl>
        </section>

        <section className="settings-card" aria-labelledby="profile-settings-title">
          <div className="settings-card-heading">
            <span className="settings-icon"><CircleUserRound size={19} /></span>
            <div>
              <h3 id="profile-settings-title">User Profile</h3>
              <p>Customize your local workspace profile</p>
            </div>
          </div>
          <div className="settings-profile-preview">
            <span className="settings-profile-avatar" aria-hidden="true">{initials}</span>
            <div>
              <strong>{displayName}</strong>
              <span>Workspace user</span>
            </div>
          </div>
          <label className="settings-field">
            <span>Display name</span>
            <input
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value)
                setProfileFeedback(null)
              }}
              maxLength={60}
              autoComplete="name"
            />
          </label>
          <div className="settings-form-footer">
            <button className="settings-action-button" onClick={saveProfile}>
              <Save size={16} />
              Save profile
            </button>
            {profileFeedback && (
              <p className={`settings-feedback ${profileFeedback.kind}`} role="status">
                {profileFeedback.kind === 'success'
                  ? <CheckCircle2 size={15} />
                  : <AlertCircle size={15} />}
                {profileFeedback.message}
              </p>
            )}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="connection-settings-title">
          <div className="settings-card-heading">
            <span className="settings-icon"><Server size={19} /></span>
            <div>
              <h3 id="connection-settings-title">Backend Connection</h3>
              <p>Health status from the configured API</p>
            </div>
          </div>
          <div className="settings-connection-row">
            <span className={`settings-connection-indicator ${backendStatus.toLowerCase()}`}>
              <span aria-hidden="true" />
              {backendStatus}
            </span>
            <button
              className="settings-secondary-button"
              onClick={() => void onCheckConnection()}
              disabled={backendStatus === 'Checking'}
            >
              <RefreshCw
                size={15}
                className={backendStatus === 'Checking' ? 'settings-spinning' : ''}
              />
              Check connection
            </button>
          </div>
          {backendStatus === 'Disconnected' && backendError && (
            <p className="settings-connection-error" role="alert">
              <AlertCircle size={15} />
              {backendError}
            </p>
          )}
          <div className="settings-endpoint">
            <span>Backend API URL</span>
            <code>{apiBaseUrl}</code>
          </div>
          <p className="settings-hint">
            Connection status is checked automatically and can be refreshed above.
          </p>
        </section>

        <section className="settings-card" aria-labelledby="appearance-settings-title">
          <div className="settings-card-heading">
            <span className="settings-icon"><Palette size={19} /></span>
            <div>
              <h3 id="appearance-settings-title">Appearance</h3>
              <p>Choose your preferred application theme</p>
            </div>
          </div>
          <div className="settings-theme-options" role="radiogroup" aria-label="Theme">
            <button
              className={`settings-theme-option ${theme === 'light' ? 'selected' : ''}`}
              role="radio"
              aria-checked={theme === 'light'}
              onClick={() => selectTheme('light')}
            >
              <span className="settings-theme-preview light"><Sun size={20} /></span>
              <span>
                <strong>Light</strong>
                <small>Bright and clear</small>
              </span>
              {theme === 'light' && <Check size={17} aria-hidden="true" />}
            </button>
            <button
              className={`settings-theme-option ${theme === 'dark' ? 'selected' : ''}`}
              role="radio"
              aria-checked={theme === 'dark'}
              onClick={() => selectTheme('dark')}
            >
              <span className="settings-theme-preview dark"><Moon size={19} /></span>
              <span>
                <strong>Dark</strong>
                <small>Comfortable in low light</small>
              </span>
              {theme === 'dark' && <Check size={17} aria-hidden="true" />}
            </button>
          </div>
          {themeError && <p className="settings-feedback error" role="alert">{themeError}</p>}
        </section>

        <section className="settings-card settings-about-card" aria-labelledby="about-settings-title">
          <div className="settings-card-heading">
            <span className="settings-icon"><Info size={19} /></span>
            <div>
              <h3 id="about-settings-title">About Waste Wise AI</h3>
              <p>Tools for more informed inventory decisions</p>
            </div>
          </div>
          <p className="settings-about-copy">
            Waste Wise AI brings inventory, sales, and model-generated insights
            together to support efficient operations and help reduce food waste.
          </p>
          <div className="settings-stack" aria-label="Technology stack">
            {['React', 'TypeScript', 'FastAPI', 'Python', 'Machine Learning'].map(
              (technology) => <span key={technology}>{technology}</span>,
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
