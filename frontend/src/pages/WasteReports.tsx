import { useCallback, useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertCircle,
  BarChart3,
  Database,
  Leaf,
  RefreshCw,
  Recycle,
} from 'lucide-react'

import {
  getWasteReport,
  type WasteReport,
} from '../services/waste'

function formatMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00`)

  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Date unavailable'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString()
}

function formatUnits(value: number): string {
  return `${Number(value).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })} units`
}

export default function WasteReports() {
  const [report, setReport] = useState<WasteReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      setReport(await getWasteReport())
    } catch {
      setError(
        'Unable to load waste report data. Check the backend connection and try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const summary = report?.summary
  const cards = [
    {
      label: 'Total predicted waste',
      value: summary ? formatUnits(summary.predicted_waste_units) : '—',
      detail: 'Sum of persisted model estimates',
      icon: Leaf,
      tone: 'green',
    },
    {
      label: 'Predictions saved',
      value: summary
        ? summary.prediction_count.toLocaleString('en-IN')
        : '—',
      detail: 'Saved prediction records',
      icon: Database,
      tone: 'teal',
    },
    {
      label: 'Average predicted waste',
      value: summary ? formatUnits(summary.average_predicted_waste_units) : '—',
      detail: 'Average estimate per prediction',
      icon: BarChart3,
      tone: 'orange',
    },
    {
      label: 'Products represented',
      value: report
        ? report.product_breakdown.length.toLocaleString('en-IN')
        : '—',
      detail: 'Products with saved predictions',
      icon: Recycle,
      tone: 'blue',
    },
  ]

  const hasPredictions = Boolean(summary && summary.prediction_count > 0)
  const chartData = (report?.monthly_trend ?? []).map((item) => ({
    ...item,
    month_label: formatMonth(item.month),
  }))

  return (
    <main className="page-content waste-reports-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">WASTE ESTIMATE REPORTING</span>
          <h1>Waste Reports</h1>
          <p>
            Review saved food-waste predictions over time and by product or
            model.
          </p>
        </div>
        <button
          type="button"
          className="refresh-button"
          onClick={() => void loadReport()}
          disabled={loading}
          aria-label={loading ? 'Refreshing waste report' : 'Refresh waste report'}
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? 'icon-spin' : undefined}
          />
          {loading ? 'Refreshing...' : 'Refresh data'}
        </button>
      </section>

      <div className="waste-report-notice" role="note">
        <AlertCircle size={17} aria-hidden="true" />
        <p>
          This report contains model-predicted waste, not measured or confirmed
          food waste.
        </p>
      </div>

      {error && (
        <div className="dashboard-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => void loadReport()}>
            Try again
          </button>
        </div>
      )}

      <section className="dashboard-cards waste-report-cards" aria-label="Waste report summary">
        {cards.map((card) => {
          const Icon = card.icon

          return (
            <article className="dashboard-stat-card" key={card.label}>
              <div className={`stat-icon ${card.tone}`}>
                <Icon size={20} aria-hidden="true" />
              </div>
              <p className="stat-label">{card.label}</p>
              <h2>{loading && !report ? '—' : card.value}</h2>
              <p className="stat-detail">{card.detail}</p>
            </article>
          )
        })}
      </section>

      {loading && !report ? (
        <div className="dashboard-loading" role="status" aria-live="polite">
          Loading waste report data...
        </div>
      ) : report && hasPredictions ? (
        <>
          <section className="waste-report-grid">
            <article className="dashboard-panel waste-report-chart-panel">
              <div className="panel-heading">
                <div>
                  <h2>Monthly predicted waste</h2>
                  <p>Sum of saved predictions by month</p>
                </div>
                <span className="panel-icon">
                  <BarChart3 size={20} aria-hidden="true" />
                </span>
              </div>
              {chartData.length > 0 ? (
                <div className="waste-report-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month_label" />
                      <YAxis />
                      <Tooltip
                        formatter={(value) => [
                          `${Number(value).toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })} units`,
                          'Predicted waste',
                        ]}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Bar
                        dataKey="predicted_waste_units"
                        name="Predicted waste"
                        fill="#218653"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="waste-report-empty-chart">
                  <p>No monthly trend available for these prediction dates.</p>
                </div>
              )}
            </article>

            <article className="dashboard-panel waste-report-breakdown-panel">
              <div className="panel-heading">
                <div>
                  <h2>By product</h2>
                  <p>Accumulated predicted waste</p>
                </div>
                <span className="panel-icon">
                  <Recycle size={20} aria-hidden="true" />
                </span>
              </div>
              <div className="waste-breakdown-list">
                {report.product_breakdown.map((item) => (
                  <div className="waste-breakdown-row" key={item.product_id}>
                    <div>
                      <strong>{item.product_name || `Product #${item.product_id}`}</strong>
                      <span>
                        {item.prediction_count}{' '}
                        {item.prediction_count === 1 ? 'prediction' : 'predictions'}
                      </span>
                    </div>
                    <strong>{formatUnits(item.predicted_waste_units)}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="dashboard-panel waste-model-panel">
            <div className="panel-heading">
              <div>
                <h2>Model breakdown</h2>
                <p>Saved estimates grouped by model type</p>
              </div>
            </div>
            <div className="waste-model-list">
              {report.model_breakdown.map((item) => (
                <div className="waste-model-row" key={item.model_type}>
                  <strong>{item.model_type}</strong>
                  <span>{item.prediction_count} predictions</span>
                  <strong>{formatUnits(item.predicted_waste_units)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-panel waste-history-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent prediction records</h2>
                <p>
                  Showing the latest {report.recent_predictions.length} records
                  from saved history
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="waste-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Inventory ID</th>
                    <th>Model</th>
                    <th>Predicted waste</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent_predictions.map((item) => (
                    <tr key={item.prediction_id}>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>
                        {item.product_name || `Product #${item.product_id}`}
                        {item.product_name && (
                          <span className="waste-history-product-id">
                            #{item.product_id}
                          </span>
                        )}
                      </td>
                      <td>#{item.inventory_id}</td>
                      <td>{item.model_type}</td>
                      <td>{formatUnits(item.predicted_waste_units)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : !error ? (
        <section className="dashboard-panel waste-report-no-data">
          <Leaf size={32} aria-hidden="true" />
          <h2>No waste predictions saved yet</h2>
          <p>
            Save a waste prediction from an inventory record to build this
            report. No example figures are shown.
          </p>
        </section>
      ) : (
        <div className="dashboard-loading" role="status">
          Waste report data is unavailable.
        </div>
      )}
    </main>
  )
}