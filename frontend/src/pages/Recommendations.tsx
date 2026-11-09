import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Package,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  getExpiryRisk,
  type ExpiryRiskResponse,
} from '../services/risk'

export default function Recommendations() {
  const [data, setData] = useState<ExpiryRiskResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRecommendations = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      setData(await getExpiryRisk())
    } catch {
      setError(
        'Unable to load recommendations. Check the backend connection and try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRecommendations()
  }, [loadRecommendations])

  const summaries = [
    {
      label: 'Actions required',
      value: data?.action_required_count,
      detail: 'Inventory that needs priority attention',
      icon: AlertTriangle,
      tone: 'red',
    },
    {
      label: 'High or critical risk',
      value: data
        ? data.critical_count + data.high_count
        : undefined,
      detail: 'Records approaching or past expiry',
      icon: ShieldAlert,
      tone: 'orange',
    },
    {
      label: 'Records reviewed',
      value: data?.total_records,
      detail: 'Inventory records assessed by expiry risk',
      icon: Package,
      tone: 'green',
    },
  ]

  const riskClassByLevel = {
    Critical: 'critical',
    High: 'high',
    Medium: 'medium',
    Low: 'low',
  } satisfies Record<
    ExpiryRiskResponse['alerts'][number]['expiry_risk'],
    string
  >

  return (
    <main className="page-content recommendations-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">ACTIONABLE INVENTORY INSIGHTS</span>
          <h1>Recommendations</h1>
          <p>
            Prioritize inventory actions using recorded stock and days-to-expiry
            data.
          </p>
        </div>
        <button
          type="button"
          className="refresh-button"
          onClick={() => void loadRecommendations()}
          disabled={loading}
          aria-label={loading ? 'Refreshing recommendations' : 'Refresh recommendations'}
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? 'icon-spin' : undefined}
          />
          {loading ? 'Refreshing...' : 'Refresh data'}
        </button>
      </section>

      {error && (
        <div className="dashboard-error" role="alert">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => void loadRecommendations()}>
            Try again
          </button>
        </div>
      )}

      <section className="dashboard-cards recommendation-summary" aria-label="Recommendation summary">
        {summaries.map((summary) => {
          const Icon = summary.icon

          return (
            <article className="dashboard-stat-card" key={summary.label}>
              <div className={`stat-icon ${summary.tone}`}>
                <Icon size={20} aria-hidden="true" />
              </div>
              <p className="stat-label">{summary.label}</p>
              <h2>
                {loading && !data || summary.value === undefined
                  ? '—'
                  : summary.value.toLocaleString('en-IN')}
              </h2>
              <p className="stat-detail">{summary.detail}</p>
            </article>
          )
        })}
      </section>

      <section className="dashboard-panel recommendations-panel">
        <div className="panel-heading">
          <div>
            <h2>Recommended inventory actions</h2>
            <p>
              Ordered by expiry risk. Recommendations reflect the current
              inventory records.
            </p>
          </div>
          <span className="panel-icon">
            <Clock3 size={20} aria-hidden="true" />
          </span>
        </div>

        {loading && !data ? (
          <div className="dashboard-loading" role="status" aria-live="polite">
            Loading inventory recommendations...
          </div>
        ) : data && data.alerts.length > 0 ? (
          <div className="recommendation-list">
            {data.alerts.map((item) => (
              <article
                className={`recommendation-item ${item.action_required ? 'action-required' : ''}`}
                key={item.inventory_id}
              >
                <span
                  className={`risk-level ${riskClassByLevel[item.expiry_risk]}`}
                >
                  {item.expiry_risk}
                </span>
                <div className="recommendation-item-content">
                  <div className="recommendation-item-heading">
                    <strong>{item.category} · Product #{item.product_id}</strong>
                    <span>Inventory #{item.inventory_id}</span>
                  </div>
                  <p>{item.recommended_action}</p>
                  <div className="recommendation-item-meta">
                    <span>
                      {item.remaining_stock.toLocaleString('en-IN', {
                        maximumFractionDigits: 2,
                      })}{' '}
                      units remaining
                    </span>
                    <span>
                      {item.days_to_expiry <= 0
                        ? `${Math.abs(item.days_to_expiry)} day(s) overdue`
                        : `${item.days_to_expiry} day(s) to expiry`}
                    </span>
                    {item.action_required && (
                      <span className="recommendation-priority">
                        Priority action
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : data ? (
          <div className="recommendations-empty">
            <Package size={32} aria-hidden="true" />
            <h3>No recommendations yet</h3>
            <p>
              Add inventory records to receive expiry-based actions for your
              stock.
            </p>
            <Link to="/inventory" className="dashboard-panel-link">
              Go to inventory <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="dashboard-loading" role="status">
            Recommendations are unavailable.
          </div>
        )}
      </section>

      <p className="recommendations-disclaimer">
        These actions are generated from recorded expiry-risk rules. Confirm
        stock quantities and food safety requirements before acting.
      </p>
    </main>
  )
}