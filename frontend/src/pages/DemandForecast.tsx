
import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  ChartNoAxesCombined,
  Info,
  PackageSearch,
  IndianRupee,
  ReceiptText,
  TrendingUp,
} from 'lucide-react'
import {
  getSales,
  getHistoricalDemoForecasts,
  type Sale,
  type HistoricalDemoForecastResponse,
} from '../services/predictions'

export default function DemandForecast() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
  const [forecastDays, setForecastDays] = useState(7)
  const [historicalDemo, setHistoricalDemo] =
    useState<HistoricalDemoForecastResponse | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState('')

  const loadSales = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      setSales(await getSales())
    } catch {
      setError(
        'Unable to load sales data. Please check the backend connection.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSales()
  }, [loadSales])

  useEffect(() => {
    let cancelled = false

    setForecastLoading(true)
    setForecastError('')
    setHistoricalDemo(null)

    getHistoricalDemoForecasts(forecastDays)
      .then((data) => {
        if (!cancelled) {
          setHistoricalDemo(data)
          setSelectedProduct((current) =>
            current !== null && data.product_ids.includes(current)
              ? current
              : data.product_ids[0] ?? null,
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setForecastError(
            'Unable to load the model forecast. Please check the backend connection.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setForecastLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [forecastDays])

  const forecast =
    historicalDemo?.forecasts.find(
      (item) => item.product_id === selectedProduct,
    ) ?? null

  const totalTransactions = sales.length

  const totalQuantitySold = sales.reduce(
    (total, sale) => total + sale.quantity,
    0,
  )

  const totalRevenue = sales.reduce(
    (total, sale) => total + sale.total_amount,
    0,
  )
  const salesUnavailable = loading || (Boolean(error) && sales.length === 0)

  const productsTracked = new Set(
    sales.map((sale) => sale.product_id),
  ).size

  const selectedProductName =
    selectedProduct === null
      ? 'No historical model selected'
      : `Historical product ID ${selectedProduct}`

  return (
    <main className="page-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">HISTORICAL / DEMO MODEL OUTPUT</p>
          <h1>Historical Demand Forecasts</h1>
          <p>
            These model projections use a historical demo dataset and are not
            live store forecasts.
          </p>
        </div>
      </section>

      {error && (
        <div className="sales-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSales()}>
            Retry
          </button>
        </div>
      )}

      <section className="dashboard-cards">
        <article className="dashboard-stat-card">
          <div className="stat-icon blue">
            <PackageSearch size={22} aria-hidden="true" />
          </div>
          <h3>Products with sales</h3>
          <p>{salesUnavailable ? '—' : productsTracked.toLocaleString('en-IN')}</p>
          <span className="stat-detail">Distinct products in returned records</span>
        </article>

        <article className="dashboard-stat-card">
          <div className="stat-icon green">
            <ChartNoAxesCombined size={22} aria-hidden="true" />
          </div>
          <h3>Selected horizon</h3>
          <p>Next {forecastDays} days</p>
          <span className="stat-detail">Choose 7, 14, or 30 days below</span>
        </article>

        <article className="dashboard-stat-card">
          <div className="stat-icon purple">
            <CalendarDays size={22} aria-hidden="true" />
          </div>
          <h3>Sales History</h3>
          <p>
            {salesUnavailable
              ? '—'
              : `${totalTransactions.toLocaleString('en-IN')} transactions`}
          </p>
          <span className="stat-detail">
            From the latest sales records returned
          </span>
        </article>
      </section>

      <section className="dashboard-panel">
        <div className="dashboard-heading">
          <div>
            <h2>Sales Overview</h2>
            <p>Summary calculated from recorded transactions.</p>
          </div>
        </div>

        <div className="dashboard-cards">
          <article className="dashboard-stat-card">
            <div className="stat-icon blue">
              <ReceiptText size={22} />
            </div>
            <h3>Total Quantity Sold</h3>
            <p>
              {loading
                ? '—'
                : salesUnavailable
                  ? '—'
                  : totalQuantitySold.toLocaleString('en-IN')}
            </p>
          </article>

          <article className="dashboard-stat-card">
            <div className="stat-icon green">
              <IndianRupee size={22} />
            </div>
            <h3>Total Sales Revenue</h3>
            <p>
              {salesUnavailable
                ? '—'
                : `₹${totalRevenue.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </p>
          </article>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="dashboard-heading">
          <div>
            <h2>Historical / Demo Demand Models</h2>
            <p>
              Historical model IDs are separate from the current product
              catalogue; no product mapping is assumed.
            </p>
          </div>
        </div>

        {historicalDemo && (
          <div className="historical-model-info">
            <div className="historical-model-info-heading">
              <span className="historical-model-info-icon" aria-hidden="true">
                <Info size={19} />
              </span>
              <div>
                <strong>Historical demo data — not live store demand</strong>
                <p>
                  These model IDs are separate from the current product
                  catalogue. No product mapping is assumed.
                </p>
              </div>
            </div>

            <div className="historical-model-metrics">
              <div className="historical-model-metric">
                <span>Training records</span>
                <strong>
                  {historicalDemo.dataset_rows.toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="historical-model-metric historical-model-date-range">
                <span>Dataset date range</span>
                <strong>{historicalDemo.dataset_start_date}</strong>
                <small>to</small>
                <strong>{historicalDemo.dataset_end_date}</strong>
              </div>
            </div>

            <div className="historical-model-product-ids">
              <span>Supported historical product IDs</span>
              <div>
                {historicalDemo.product_ids.map((productId) => (
                  <span key={productId}>{productId}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="forecast-controls">
          <label>
            Select Historical Model
            <select
              value={selectedProduct ?? ''}
              onChange={(event) =>
                setSelectedProduct(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              disabled={!historicalDemo?.product_ids.length}
            >
              {historicalDemo?.product_ids.map((productId) => (
                <option key={productId} value={productId}>
                  Historical demo · Product ID {productId}
                </option>
              ))}
            </select>
          </label>

          <label>
            Forecast Period
            <select
              value={forecastDays}
              onChange={(event) =>
                setForecastDays(Number(event.target.value))
              }
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>
        </div>

        {forecastLoading && (
          <p className="forecast-status">
            Loading historical demo model forecasts...
          </p>
        )}

        {forecastError && (
          <div className="sales-error" role="alert">
            {forecastError}
          </div>
        )}

        {forecast && !forecastLoading && (
          <>
            <div className="dashboard-cards forecast-summary">
              <article className="dashboard-stat-card">
                <div className="stat-icon blue">
                  <PackageSearch size={22} aria-hidden="true" />
                </div>
                <h3>Selected Historical Model</h3>
                <p>{selectedProductName}</p>
              </article>

              <article className="dashboard-stat-card">
                <div className="stat-icon green">
                  <TrendingUp size={22} aria-hidden="true" />
                </div>
                <h3>Demo Predicted Demand</h3>
                <p>
                  {forecast.total_predicted_demand.toLocaleString('en-IN', {
                    maximumFractionDigits: 2,
                  })}{' '}
                  units
                </p>
              </article>

              <article className="dashboard-stat-card">
                <div className="stat-icon purple">
                  <CalendarDays size={22} aria-hidden="true" />
                </div>
                <h3>Forecast Period</h3>
                <p>{forecast.forecast_horizon_days} days</p>
              </article>
            </div>

            <div className="forecast-table-wrapper">
              <h3>Daily Demand Predictions</h3>
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Predicted Demand</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.forecast.map((item) => (
                    <tr key={item.date}>
                      <td>
                        {new Date(
                          `${item.date}T00:00:00`,
                        ).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        {item.predicted_units.toFixed(2)} units
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dashboard-tip">
              <span className="forecast-info-icon">
                <Info size={20} strokeWidth={2.5} />
                </span>
              <div>
                <strong>Forecast information</strong>
                <p>
                  Model: {forecast.model_type}. This is a historical/demo
                  projection based on calendar features. It is not a forecast
                  for the live store or its current catalogue.
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="dashboard-panel forecast-readiness-panel">
        <div className="dashboard-heading">
          <div>
            <h2>Forecast Readiness</h2>
            <p>
              Reliable demand estimates depend on sufficient historical sales.
            </p>
          </div>
        </div>

        <div className="forecast-readiness-content">
          <div className="dashboard-tip forecast-readiness-message">
            <span className="forecast-readiness-icon" aria-hidden="true">
              <AlertCircle size={19} />
            </span>
            <div>
              <strong>
                {loading
                  ? 'Checking sales history...'
                  : totalTransactions < 30
                    ? 'More sales history is recommended'
                    : 'Sales history is available for evaluation'}
              </strong>
              <p>
                {loading
                  ? 'Loading recorded sales from the backend.'
                  : totalTransactions === 0
                    ? 'No sales transactions were returned. Record sales before evaluating demand patterns.'
                    : `Currently ${totalTransactions} sales transaction${
                        totalTransactions === 1 ? '' : 's'
                      } across ${productsTracked} product${
                        productsTracked === 1 ? '' : 's'
                      }. This limited history is not enough to establish dependable future demand patterns. Collect more dated sales records before relying on forecasts.`}
              </p>
            </div>
          </div>

          <div className="forecast-readiness-stats" aria-label="Sales history counts">
            <article className="forecast-readiness-stat">
              <span className="forecast-readiness-stat-icon transaction">
                <ReceiptText size={17} aria-hidden="true" />
              </span>
              <span className="forecast-readiness-stat-copy">
                <small>Sales transactions</small>
                <strong>
                  {salesUnavailable
                    ? '—'
                    : totalTransactions.toLocaleString('en-IN')}
                </strong>
              </span>
            </article>
            <article className="forecast-readiness-stat">
              <span className="forecast-readiness-stat-icon product">
                <PackageSearch size={17} aria-hidden="true" />
              </span>
              <span className="forecast-readiness-stat-copy">
                <small>Products sold</small>
                <strong>
                  {salesUnavailable
                    ? '—'
                    : productsTracked.toLocaleString('en-IN')}
                </strong>
              </span>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
