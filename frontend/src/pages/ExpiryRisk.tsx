import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Package,
  PieChart as PieChartIcon,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getExpiryRisk, type ExpiryRiskResponse } from '../services/risk'
import { getProducts, type Product } from '../services/products'

const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'] as const
type RiskLevel = (typeof RISK_LEVELS)[number]

const RISK_COLORS: Record<RiskLevel, string> = {
  Critical: '#ed5666',
  High: '#f0a52b',
  Medium: '#f2cf45',
  Low: '#42b883',
}

const formatUnits = (value: number) =>
  `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} units`

const formatExpiryTiming = (days: number) =>
  days < 0
    ? `${Math.abs(days)} day(s) overdue`
    : days === 0
      ? 'Expires today'
      : `${days} day(s) to expiry`

export default function ExpiryRisk() {
  const [data, setData] = useState<ExpiryRiskResponse | null>(null)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState(false)
  const [error, setError] = useState('')

  const loadRisk = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getExpiryRisk()
      setData(result)
    } catch {
      setError(
        'Unable to load expiry risk data. Please check that the backend is running.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProducts = useCallback(async () => {
    setProductsLoading(true)
    setProductsError(false)

    try {
      setProducts(await getProducts(true))
    } catch {
      setProducts([])
      setProductsError(true)
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRisk()
    void loadProducts()
  }, [loadProducts, loadRisk])

  const summaryCards = [
    {
      label: 'Inventory records',
      value: data?.total_records,
      icon: Package,
      tone: 'neutral',
    },
    {
      label: 'Critical Risk',
      value: data?.critical_count,
      icon: AlertTriangle,
      tone: 'critical',
    },
    {
      label: 'High Risk',
      value: data?.high_count,
      icon: Clock,
      tone: 'high',
    },
    {
      label: 'Action Required',
      value: data?.action_required_count,
      icon: ShieldAlert,
      tone: 'warning',
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
  const riskCounts = RISK_LEVELS.map((level) => ({
    name: level,
    records:
      data?.alerts.filter((item) => item.expiry_risk === level).length ?? 0,
    remainingStock:
      data?.alerts
        .filter((item) => item.expiry_risk === level)
        .reduce((total, item) => total + item.remaining_stock, 0) ?? 0,
    fill: RISK_COLORS[level],
  }))
  const visibleRiskCounts = riskCounts.filter((item) => item.records > 0)
  const riskByCategory = [
    ...new Set((data?.alerts ?? []).map((item) => item.category)),
  ].map((category) => {
    const categoryAlerts =
      data?.alerts.filter((item) => item.category === category) ?? []

    return {
      category,
      Critical: categoryAlerts.filter(
        (item) => item.expiry_risk === 'Critical',
      ).length,
      High: categoryAlerts.filter((item) => item.expiry_risk === 'High').length,
      Medium: categoryAlerts.filter((item) => item.expiry_risk === 'Medium')
        .length,
      Low: categoryAlerts.filter((item) => item.expiry_risk === 'Low').length,
      totalRecords: categoryAlerts.length,
    }
  })
  const productsById = new Map(
    (products ?? []).map((product) => [product.product_id, product]),
  )
  const getProductLabel = (productId: number) => {
    if (productsLoading) return `Loading product (ID: ${productId})`
    if (productsError) return `Product name unavailable (ID: ${productId})`

    return (
      productsById.get(productId)?.name ??
      `Unmatched product (ID: ${productId})`
    )
  }
  const actionRequiredAlerts =
    data?.alerts.filter((item) => item.action_required) ?? []

  return (
    <main className="page-content expiry-risk-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">INVENTORY MONITORING</span>
          <h1>Inventory Risk</h1>
          <p>
            Monitor expiry exposure and prioritize the records that need
            attention.
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={() => {
            void loadRisk()
            void loadProducts()
          }}
          disabled={loading || productsLoading}
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? 'icon-spin' : undefined}
          />
          {loading || productsLoading ? 'Refreshing...' : 'Refresh data'}
        </button>
      </section>

      {error && (
        <div className="dashboard-error" role="alert">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => void loadRisk()}>
            Try again
          </button>
        </div>
      )}

      <section
        className="dashboard-cards expiry-risk-cards"
        aria-label="Expiry risk summary"
      >
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <article
              className={`dashboard-stat-card risk-summary-card risk-summary-${card.tone}`}
              key={card.label}
            >
              <div className={`stat-icon ${card.tone}`}>
                <Icon size={21} aria-hidden="true" />
              </div>
              <p className="stat-label">{card.label}</p>
              <h2>{loading || card.value === undefined ? '—' : card.value}</h2>
            </article>
          )
        })}
      </section>

      <section className="risk-chart-panel risk-category-panel">
        <div className="risk-panel-heading">
          <div>
            <span className="risk-panel-kicker">RISK PROFILE</span>
            <h2>Expiry risk by category</h2>
            <p>
              Actual inventory records grouped by risk level, with affected
              record totals by category.
            </p>
          </div>
          <span className="risk-panel-icon">
            <BarChart3 size={19} aria-hidden="true" />
          </span>
        </div>

        {loading && !data ? (
          <div className="risk-chart-empty" role="status" aria-live="polite">
            Loading expiry risk data...
          </div>
        ) : data && riskByCategory.length > 0 ? (
          <>
            <div className="risk-category-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={riskByCategory}
                  margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
                  barCategoryGap="38%"
                >
                  <CartesianGrid
                    stroke="#e9f0eb"
                    strokeDasharray="3 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#758479', fontSize: 11 }}
                    tickMargin={12}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#829087', fontSize: 10 }}
                    width={34}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(36, 134, 91, 0.06)' }}
                    content={({ active, payload, label }) => {
                      const category = riskByCategory.find(
                        (item) => item.category === String(label),
                      )

                      return active && category ? (
                        <div className="risk-chart-tooltip">
                          <strong>{category.category}</strong>
                          <span>
                            {category.totalRecords.toLocaleString('en-IN')}{' '}
                            affected records
                          </span>
                          {payload
                            ?.filter((entry) => Number(entry.value) > 0)
                            .map((entry) => (
                              <small key={String(entry.dataKey)}>
                                <i
                                  style={{
                                    backgroundColor: String(entry.color),
                                  }}
                                />
                                {String(entry.name)}: {entry.value}
                              </small>
                            ))}
                        </div>
                      ) : null
                    }}
                  />
                  {RISK_LEVELS.map((level) => (
                    <Bar
                      key={level}
                      dataKey={level}
                      name={level}
                      stackId="risk"
                      fill={RISK_COLORS[level]}
                      radius={level === 'Low' ? [5, 5, 0, 0] : undefined}
                      maxBarSize={56}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="risk-category-totals" aria-label="Records by category">
              {riskByCategory.map((item) => (
                <div key={item.category}>
                  <span>{item.category}</span>
                  <strong>
                    {item.totalRecords.toLocaleString('en-IN')} records
                  </strong>
                </div>
              ))}
            </div>
            <div className="risk-chart-legend">
              {riskCounts.map((item) => (
                <span key={item.name}>
                  <i style={{ backgroundColor: item.fill }} />
                  {item.name}
                  <strong>{item.records}</strong>
                </span>
              ))}
            </div>
          </>
        ) : !error ? (
          <div className="risk-chart-empty">
            <Package size={28} aria-hidden="true" />
            <span>No inventory records to chart.</span>
          </div>
        ) : (
          <div className="risk-chart-empty" role="status">
            Expiry risk distribution is unavailable.
          </div>
        )}
      </section>

      <section className="risk-chart-panel risk-actions-panel">
        <div className="risk-panel-heading">
          <div>
            <span className="risk-panel-kicker">DATA-BASED NEXT STEPS</span>
            <h2>Recommended Actions</h2>
            <p>
              Actions supplied by the existing expiry-risk rules for records
              marked as requiring attention.
            </p>
          </div>
          <span className="risk-panel-icon risk-panel-icon-orange">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
        </div>

        {loading && !data ? (
          <div className="risk-chart-empty" role="status" aria-live="polite">
            Loading recommended actions...
          </div>
        ) : actionRequiredAlerts.length > 0 ? (
          <div className="risk-action-list">
            {actionRequiredAlerts.map((item) => (
              <article
                className={`risk-action-item risk-row-${riskClassByLevel[item.expiry_risk]}`}
                key={item.inventory_id}
              >
                <span
                  className={`risk-level ${riskClassByLevel[item.expiry_risk]}`}
                >
                  {item.expiry_risk}
                </span>
                <div className="risk-action-copy">
                  <strong>
                    Inventory #{item.inventory_id} ·{' '}
                    {getProductLabel(item.product_id)}
                  </strong>
                  <p>{item.recommended_action}</p>
                  <span>
                    {formatExpiryTiming(item.days_to_expiry)}
                    {' · '}
                    {formatUnits(item.remaining_stock)} available
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : !error ? (
          <div className="risk-chart-empty">
            <ShieldCheck size={26} aria-hidden="true" />
            <span>No records are currently flagged for action.</span>
          </div>
        ) : (
          <div className="risk-chart-empty" role="status">
            Recommended actions are unavailable.
          </div>
        )}
      </section>

      <section className="risk-chart-grid" aria-label="Expiry risk breakdowns">
        <article className="risk-chart-panel">
          <div className="risk-panel-heading">
            <div>
              <span className="risk-panel-kicker">REMAINING STOCK</span>
              <h2>Units by risk level</h2>
              <p>Sum of remaining stock reported for each risk class.</p>
            </div>
            <span className="risk-panel-icon risk-panel-icon-orange">
              <Package size={19} aria-hidden="true" />
            </span>
          </div>
          {loading && !data ? (
            <div className="risk-chart-empty">Loading stock by risk...</div>
          ) : data && data.alerts.length > 0 ? (
            <div className="risk-stock-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={riskCounts}
                  layout="vertical"
                  margin={{ top: 8, right: 30, left: 8, bottom: 8 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid
                    stroke="#e9f0eb"
                    strokeDasharray="3 6"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#829087', fontSize: 10 }}
                    tickMargin={8}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#526357', fontSize: 11 }}
                    width={68}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(36, 134, 91, 0.06)' }}
                    contentStyle={{
                      border: '1px solid #dce8df',
                      borderRadius: 10,
                      backgroundColor: '#ffffff',
                      color: '#30473a',
                      boxShadow: '0 8px 24px rgba(28, 68, 45, 0.12)',
                    }}
                    formatter={(value) => [formatUnits(Number(value)), 'Remaining stock']}
                  />
                  <Bar
                    dataKey="remainingStock"
                    name="Remaining stock"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={28}
                  >
                    {riskCounts.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="risk-chart-empty">No remaining stock data to chart.</div>
          )}
        </article>

        <article className="risk-chart-panel">
          <div className="risk-panel-heading">
            <div>
              <span className="risk-panel-kicker">RECORD MIX</span>
              <h2>Alerts by risk level</h2>
              <p>Share of inventory records in each risk class.</p>
            </div>
            <span className="risk-panel-icon">
              <PieChartIcon size={19} aria-hidden="true" />
            </span>
          </div>
          {loading && !data ? (
            <div className="risk-chart-empty">Loading risk distribution...</div>
          ) : visibleRiskCounts.length > 0 ? (
            <div className="risk-donut-layout">
              <div className="risk-donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={visibleRiskCounts}
                      dataKey="records"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="#ffffff"
                      strokeWidth={3}
                    >
                      {visibleRiskCounts.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        border: '1px solid #dce8df',
                        borderRadius: 10,
                        backgroundColor: '#ffffff',
                        color: '#30473a',
                        boxShadow: '0 8px 24px rgba(28, 68, 45, 0.12)',
                      }}
                      formatter={(value) => [
                        `${Number(value).toLocaleString('en-IN')} records`,
                        'Risk level',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="risk-donut-center">
                  <strong>{data?.total_records ?? 0}</strong>
                  <span>RECORDS</span>
                </div>
              </div>
              <div className="risk-donut-legend">
                {riskCounts.map((item) => (
                  <div key={item.name}>
                    <i style={{ backgroundColor: item.fill }} />
                    <span>{item.name}</span>
                    <strong>{item.records}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="risk-chart-empty">No risk records to distribute.</div>
          )}
        </article>
      </section>

      <section className="risk-chart-panel expiry-alerts-panel">
        <div className="risk-panel-heading">
          <div>
            <span className="risk-panel-kicker">PRIORITIZED WORKLIST</span>
            <h2>Priority Inventory Records</h2>
            <p>
              High-risk and critical records appear first. Product names use
              exact catalogue ID matches only.
            </p>
          </div>
          <span className="risk-order-badge">
            <ShieldAlert size={15} aria-hidden="true" />
            Highest risk first
          </span>
        </div>

        {loading && !data ? (
          <div className="risk-chart-empty" role="status" aria-live="polite">
            Loading expiry risk data...
          </div>
        ) : data && data.alerts.length > 0 ? (
          <div className="expiry-table-scroll">
            <table className="expiry-table">
              <thead>
                <tr>
                  <th>Inventory ID</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Available stock</th>
                  <th>Expiry timing</th>
                  <th>Risk level</th>
                </tr>
              </thead>
              <tbody>
                {data.alerts.map((item) => (
                  <tr
                    className={`risk-row-${riskClassByLevel[item.expiry_risk]}`}
                    key={item.inventory_id}
                  >
                    <td>
                      <span className="expiry-record-id">
                        #{item.inventory_id}
                      </span>
                    </td>
                    <td>
                      <strong className="risk-product-name">
                        {getProductLabel(item.product_id)}
                      </strong>
                      <span className="risk-product-id">
                        Product ID: {item.product_id}
                      </span>
                    </td>
                    <td>{item.category}</td>
                    <td>{formatUnits(item.remaining_stock)}</td>
                    <td>
                      <span
                        className={`risk-expiry-timing risk-expiry-${riskClassByLevel[item.expiry_risk]}`}
                      >
                        {formatExpiryTiming(item.days_to_expiry)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`risk-level ${riskClassByLevel[item.expiry_risk]}`}
                      >
                        {item.expiry_risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !error ? (
          <div className="risk-chart-empty">
            <Package size={28} aria-hidden="true" />
            <span>No inventory risk alerts are available.</span>
          </div>
        ) : (
          <div className="risk-chart-empty" role="status">
            Expiry risk alerts are unavailable.
          </div>
        )}
      </section>

      <p className="inventory-disclaimer">
        Risk levels are based on recorded days to expiry. Remaining stock is
        calculated from opening stock plus units received minus units sold.
      </p>
    </main>
  )
}
