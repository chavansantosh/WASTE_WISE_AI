
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  ChartNoAxesCombined,
  IndianRupee,
  Leaf,
  Package,
  ReceiptText,
  Recycle,
  RefreshCw,
  ShoppingBasket,
  Sprout,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getCatalogueDemandForecast,
  getDailySalesSummary,
  type CatalogueForecastItem,
  type DailySalesRecord,
  type DemandForecastResponse,
} from '../services/predictions'
import {
  getInventoryRecords,
  type InventoryRecord,
} from '../services/inventory'
import { getExpiryRisk, type ExpiryRiskResponse } from '../services/risk'
import { getProducts, type Product } from '../services/products'
import { getWasteReport, type WasteReport } from '../services/waste'
import {
  DEFAULT_COMPANY_PROFILE,
  getCompanyProfile,
  type CompanyProfile,
} from '../services/companyProfile'
import {
  getDashboardSummary,
  type DashboardSummary,
} from '../services/dashboard'
import ProductThumbnail from '../components/ProductThumbnail'

const CATEGORY_COLORS = {
  dairy: '#16866A',
  testItem: '#E5A33D',
  additional: ['#79BFA1', '#9AD3B6', '#5CA987', '#B4DCC8'],
}

const EXPIRY_RISK_COLORS: Record<
  ExpiryRiskResponse['alerts'][number]['expiry_risk'],
  string
> = {
  Critical: '#C35E63',
  High: '#E5A33D',
  Medium: '#79BFA1',
  Low: '#16866A',
}

const EXPIRY_RISK_LEVELS: ExpiryRiskResponse['alerts'][number]['expiry_risk'][] =
  ['Critical', 'High', 'Medium', 'Low']

const CHART_TOOLTIP_STYLE = {
  border: '1px solid #dce9df',
  borderRadius: 12,
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  boxShadow: '0 12px 30px rgba(27, 67, 45, 0.13)',
  padding: '9px 12px',
}

const CHART_AXIS_TICK = {
  fill: '#78877d',
  fontSize: 10,
  fontWeight: 500,
}

const formatUnits = (value: number) =>
  `${Number(value).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })} units`

const barChartAxisMax = (max: number) => {
  const extendedMax = max === 0 ? 1 : max * 1.1
  const magnitude = 10 ** Math.floor(Math.log10(extendedMax))
  const normalizedMax = extendedMax / magnitude
  const niceMax =
    normalizedMax <= 1
      ? 1
      : normalizedMax <= 2
        ? 2
        : normalizedMax <= 2.5
          ? 2.5
          : normalizedMax <= 5
            ? 5
            : 10

  return niceMax * magnitude
}

const getCategoryColor = (name: string, index: number) => {
  const normalizedName = name.trim().toLocaleLowerCase()

  if (normalizedName === 'dairy') {
    return CATEGORY_COLORS.dairy
  }

  if (normalizedName === 'test item') {
    return CATEGORY_COLORS.testItem
  }

  return CATEGORY_COLORS.additional[index % CATEGORY_COLORS.additional.length]
}

type AnalyticsData = {
  inventory: InventoryRecord[] | null
  expiryRisk: ExpiryRiskResponse | null
  products: Product[] | null
  sales: DailySalesRecord[] | null
  waste: WasteReport | null
  forecasts: ProductForecastResult[] | null
}

type ProductForecastResult = {
  productId: number
  productName: string
  status: CatalogueForecastItem['status'] | 'error'
  forecast: DemandForecastResponse | null
  unavailableReason?: string
}

const EMPTY_ANALYTICS: AnalyticsData = {
  inventory: null,
  expiryRisk: null,
  products: null,
  sales: null,
  waste: null,
  forecasts: null,
}

const FORECAST_SERIES_COLORS = [
  '#218653',
  '#d77d2e',
  '#5279a4',
  '#9569a7',
  '#4e9a98',
  '#c35e63',
]

const isValidProductForecast = (
  forecast: DemandForecastResponse,
  productId: number,
) =>
  forecast.product_id === productId &&
  forecast.forecast_source === 'live_store_sales' &&
  Number.isInteger(forecast.forecast_horizon_days) &&
  forecast.forecast_horizon_days > 0 &&
  Number.isFinite(forecast.total_predicted_demand) &&
  forecast.total_predicted_demand >= 0 &&
  Array.isArray(forecast.forecast) &&
  forecast.forecast.length > 0 &&
  forecast.forecast_horizon_days === forecast.forecast.length &&
  forecast.forecast_start_date === forecast.forecast[0].date &&
  forecast.forecast_end_date ===
    forecast.forecast[forecast.forecast.length - 1].date &&
  forecast.forecast.every(
    (item) =>
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      !Number.isNaN(Date.parse(`${item.date}T00:00:00Z`)) &&
      new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10) ===
        item.date &&
      Number.isFinite(item.predicted_units) &&
      item.predicted_units >= 0,
  )

const formatSaleDate = (date: string) => {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
}

const formatCurrency = (value: number) =>
  `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatDisplayTitle = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase()}`,
    )

const formatSalesSummaryDate = (date: string) => {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
}

const formatWasteMonth = (month: string) => {
  const parsed = new Date(`${month}-01T12:00:00`)
  return Number.isNaN(parsed.getTime())
    ? month
    : parsed.toLocaleDateString(undefined, {
        month: 'short',
        year: '2-digit',
      })
}

interface DashboardProps {
  productSearch: string
}

export default function Dashboard({
  productSearch,
}: DashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [analytics, setAnalytics] = useState<AnalyticsData>(EMPTY_ANALYTICS)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsErrors, setAnalyticsErrors] = useState<Record<string, string>>({})
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(
    DEFAULT_COMPANY_PROFILE,
  )
  const [companyProfileError, setCompanyProfileError] = useState('')

  useEffect(() => {
    let active = true
    void getCompanyProfile()
      .then((profile) => {
        if (active) {
          setCompanyProfile(profile)
          setCompanyProfileError('')
        }
      })
      .catch((error: unknown) => {
        console.error('Could not load company profile.', error)
        if (active) {
          setCompanyProfileError(
            'Company branding could not be loaded. Showing the default branding.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setAnalyticsLoading(true)
    setError('')
    setAnalyticsErrors({})

    const results = await Promise.allSettled([
      getDashboardSummary(),
      getInventoryRecords(),
      getExpiryRisk(),
      getProducts(true),
      getDailySalesSummary(),
      getWasteReport(),
      getCatalogueDemandForecast(7),
    ])

    const [
      summaryResult,
      inventory,
      expiryRisk,
      products,
      sales,
      waste,
      forecasts,
    ] = results

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value)
    } else {
      setError('Could not load dashboard data. Check that the backend is running.')
    }

    setAnalytics({
      inventory: inventory.status === 'fulfilled' ? inventory.value : null,
      expiryRisk:
        expiryRisk.status === 'fulfilled' ? expiryRisk.value : null,
      products: products.status === 'fulfilled' ? products.value : null,
      sales: sales.status === 'fulfilled' ? sales.value.daily_sales : null,
      waste: waste.status === 'fulfilled' ? waste.value : null,
      forecasts:
        products.status === 'fulfilled'
          ? products.value.map((product) => {
              const result =
                forecasts.status === 'fulfilled'
                  ? forecasts.value.forecasts.find(
                      (item) => item.product_id === product.product_id,
                    )
                  : undefined
              const forecast =
                result?.status === 'available' &&
                result.forecast &&
                isValidProductForecast(result.forecast, product.product_id)
                  ? result.forecast
                  : null
              const status = !result
                ? 'error'
                : result.status === 'available' && !forecast
                  ? 'error'
                  : result.status

              return {
                productId: product.product_id,
                productName: product.name,
                status,
                forecast,
                unavailableReason: !result
                  ? forecasts.status === 'fulfilled'
                    ? 'No forecast availability record was returned for this product.'
                    : 'Forecast availability could not be checked.'
                  : result.status === 'available' && !forecast
                    ? 'The forecast API returned invalid or mismatched values.'
                    : result.unavailable_reason ?? undefined,
              }
            })
          : null,
    })

    const errors: Record<string, string> = {}
    results.slice(1).forEach((result, index) => {
      if (result.status === 'rejected') {
        errors[
          ['inventory', 'expiryRisk', 'products', 'sales', 'waste', 'forecasts'][
            index
          ]
        ] = 'Unable to load chart data.'
      }
    })

    setAnalyticsErrors(errors)
    setLoading(false)
    setAnalyticsLoading(false)
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const productNames = new Map(
    (analytics.products ?? []).map((product: Product) => [
      product.product_id,
      product.name,
    ]),
  )
  const productsById = new Map(
    (analytics.products ?? []).map((product: Product) => [
      product.product_id,
      product,
    ]),
  )
  const normalizedSearch = productSearch.trim().toLocaleLowerCase()

  const matchesProductSearch = (name: string, productId: number) =>
    !normalizedSearch ||
    name.toLocaleLowerCase().includes(normalizedSearch) ||
    String(productId).includes(normalizedSearch)

  const stockByProduct = new Map<number, number>()
  const stockByCategory = new Map<string, number>()
  const categoryByProduct = new Map<number, string>()

  for (const record of analytics.inventory ?? []) {
    const remaining = Math.max(
      0,
      record.opening_stock + record.units_received - record.units_sold,
    )

    stockByProduct.set(
      record.product_id,
      (stockByProduct.get(record.product_id) ?? 0) + remaining,
    )

    stockByCategory.set(
      record.category,
      (stockByCategory.get(record.category) ?? 0) + remaining,
    )
    categoryByProduct.set(record.product_id, record.category)
  }

  const inventoryChartData = [...stockByProduct.entries()]
    .map(([productId, units]) => ({
      name: productNames.get(productId) ?? `Product #${productId}`,
      productId,
      units,
      category: categoryByProduct.get(productId) ?? '',
    }))
    .filter((item) => matchesProductSearch(item.name, item.productId))
    .sort((a, b) => b.units - a.units)
    .slice(0, 7)

  const totalStockRemaining = [...stockByProduct.values()].reduce(
    (total, units) => total + units,
    0,
  )

  const categoryChartData = [...stockByCategory.entries()]
    .filter(([, units]) => units > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const totalCategorizedStock = categoryChartData.reduce(
    (total, item) => total + item.value,
    0,
  )

  const inventoryTrendByDate = new Map<
    string,
    { units: number; records: number }
  >()
  for (const record of analytics.inventory ?? []) {
    const remaining = Math.max(
      0,
      record.opening_stock + record.units_received - record.units_sold,
    )
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(record.inventory_date) ||
      !Number.isFinite(remaining)
    ) {
      continue
    }

    const dateValues = inventoryTrendByDate.get(record.inventory_date) ?? {
      units: 0,
      records: 0,
    }
    dateValues.units += remaining
    dateValues.records += 1
    inventoryTrendByDate.set(record.inventory_date, dateValues)
  }
  const inventoryTrendData = [...inventoryTrendByDate.entries()]
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const expiryRiskCounts = new Map<
    ExpiryRiskResponse['alerts'][number]['expiry_risk'],
    number
  >([
    ['Critical', 0],
    ['High', 0],
    ['Medium', 0],
    ['Low', 0],
  ])
  for (const alert of analytics.expiryRisk?.alerts ?? []) {
    expiryRiskCounts.set(
      alert.expiry_risk,
      (expiryRiskCounts.get(alert.expiry_risk) ?? 0) + 1,
    )
  }
  const expiryRiskChartData = [{
    name: 'Inventory records',
    Critical: expiryRiskCounts.get('Critical') ?? 0,
    High: expiryRiskCounts.get('High') ?? 0,
    Medium: expiryRiskCounts.get('Medium') ?? 0,
    Low: expiryRiskCounts.get('Low') ?? 0,
  }]
  const expiryRiskTotal = [...expiryRiskCounts.values()].reduce(
    (total, count) => total + count,
    0,
  )
  const activeExpiryRiskLevels = EXPIRY_RISK_LEVELS.filter(
    (level) => (expiryRiskCounts.get(level) ?? 0) > 0,
  )
  const firstActiveExpiryRisk = activeExpiryRiskLevels[0]
  const lastActiveExpiryRisk =
    activeExpiryRiskLevels[activeExpiryRiskLevels.length - 1]

  const salesByDate = new Map<
    string,
    { quantity: number; revenue: number; transactions: number }
  >()

  for (const sale of analytics.sales ?? []) {
    const totals = salesByDate.get(sale.sale_date) ?? {
      quantity: 0,
      revenue: 0,
      transactions: 0,
    }

    totals.quantity += sale.quantity_sold
    totals.revenue += sale.revenue
    totals.transactions += sale.transaction_count
    salesByDate.set(sale.sale_date, totals)
  }

  const salesChartData = [...salesByDate.entries()]
    .map(([date, totals]) => ({
      date,
      quantity: totals.quantity,
      revenue: totals.revenue,
      transactions: totals.transactions,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalSalesQuantity = salesChartData.reduce(
    (total, item) => total + item.quantity,
    0,
  )
  const totalSalesRevenue = salesChartData.reduce(
    (total, item) => total + item.revenue,
    0,
  )
  const totalSalesTransactions = salesChartData.reduce(
    (total, item) => total + item.transactions,
    0,
  )

  const formatSalesAxisDate = (date: string) => formatSalesSummaryDate(date)

  const formatSalesAxisRevenue = (value: number) =>
    `₹${Number(value).toLocaleString('en-IN', {
      notation: 'compact',
      maximumFractionDigits: 1,
    })}`

  const wasteChartData = (analytics.waste?.product_breakdown ?? [])
    .filter(
      (item) =>
        item.prediction_count > 0 &&
        Number.isFinite(item.predicted_waste_units) &&
        item.predicted_waste_units >= 0,
    )
    .map((item) => ({
      name:
        item.product_name ??
        productNames.get(item.product_id) ??
        `Product #${item.product_id}`,
      productId: item.product_id,
      category:
        productsById.get(item.product_id)?.category ?? 'Category unavailable',
      waste: item.predicted_waste_units,
    }))
    .filter((item) => matchesProductSearch(item.name, item.productId))
    .sort((a, b) => b.waste - a.waste)
  const wasteSummary = analytics.waste?.summary
  const wasteMonthlyData = (analytics.waste?.monthly_trend ?? [])
    .filter(
      (item) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(item.month) &&
        item.prediction_count > 0 &&
        Number.isFinite(item.predicted_waste_units) &&
        item.predicted_waste_units >= 0,
    )
    .map((item) => ({
      month: item.month,
      waste: item.predicted_waste_units,
      predictionCount: item.prediction_count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const availableForecasts = (analytics.forecasts ?? []).filter(
    (item): item is ProductForecastResult & {
      forecast: DemandForecastResponse
    } => item.forecast !== null,
  )
  const activeCatalogueProducts = (analytics.products ?? []).filter(
    (product) => product.is_active,
  )
  const catalogueForecastByProduct = new Map(
    (analytics.forecasts ?? []).map((item) => [item.productId, item]),
  )
  const catalogueForecastStatuses = activeCatalogueProducts.map((product) => {
    const result = catalogueForecastByProduct.get(product.product_id)
    const verified = result?.status === 'available' && result.forecast !== null

    return {
      productId: product.product_id,
      productName: product.name,
      category: product.category,
      verified,
      status:
        verified
          ? 'available'
          : result?.status === 'unavailable'
            ? 'unavailable'
            : 'error',
    } as const
  })
  const verifiedCatalogueForecastCount = catalogueForecastStatuses.filter(
    (item) => item.verified,
  ).length
  const hasUnverifiedForecastStatus = catalogueForecastStatuses.some(
    (item) => item.status === 'error',
  )
  const forecastReadinessMessage = analyticsErrors.forecasts
    ? 'Live forecast status could not be verified because the forecast service is unavailable.'
    : activeCatalogueProducts.length === 0
      ? 'There are no active catalogue products to forecast.'
      : hasUnverifiedForecastStatus
        ? 'Forecast status could not be verified for some products. Refresh to check the live forecast service.'
        : verifiedCatalogueForecastCount === 0
          ? 'No verified live forecasts are available yet. Reliable forecasts require sufficient sales history for these products.'
          : verifiedCatalogueForecastCount < activeCatalogueProducts.length
            ? `Verified live forecasts are available for ${verifiedCatalogueForecastCount.toLocaleString('en-IN')} active products. More sales history may be needed for products without a forecast.`
            : 'Verified live forecasts are available for all active catalogue products.'
  const forecastSeries = availableForecasts.map((item, index) => ({
    key: `product_${item.productId}`,
    name: item.productName,
    color: FORECAST_SERIES_COLORS[index % FORECAST_SERIES_COLORS.length],
  }))
  const forecastDataByDate = new Map<string, Record<string, string | number>>()

  for (const [index, item] of availableForecasts.entries()) {
    const seriesKey = forecastSeries[index].key

    for (const value of item.forecast.forecast) {
      const dateValues = forecastDataByDate.get(value.date) ?? {
        date: value.date,
      }
      dateValues[seriesKey] = value.predicted_units
      forecastDataByDate.set(value.date, dateValues)
    }
  }

  const forecastChartData = [...forecastDataByDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  )
  const forecastPoints = availableForecasts.flatMap((item) =>
    item.forecast.forecast.map((value) => ({
      productName: item.productName,
      date: value.date,
      units: value.predicted_units,
    })),
  )
  const averagePredictedDemand = forecastPoints.length
    ? forecastPoints.reduce((sum, point) => sum + point.units, 0) /
      forecastPoints.length
    : null
  const highestForecastPoint = forecastPoints.length
    ? forecastPoints.reduce((highest, point) =>
        point.units > highest.units ? point : highest,
      )
    : null
  const formatForecastUnits = (value: number) =>
    `${value.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    })} units`

  const cards = summary
    ? [
        {
          label: 'Active products',
          value: summary.active_products.toLocaleString('en-IN'),
          detail: 'Products in your catalogue',
          icon: Package,
          tone: 'green',
        },
        {
          label: 'Inventory records',
          value: summary.inventory_records.toLocaleString('en-IN'),
          detail: 'Saved stock entries',
          icon: Boxes,
          tone: 'blue',
        },
        {
          label: 'Sales revenue',
          value: formatCurrency(Number(summary.total_sales_revenue)),
          detail: `${summary.sales_count} recorded transactions`,
          icon: IndianRupee,
          tone: 'amber',
        },
        {
          label: 'Predicted waste',
          value: `${summary.total_predicted_waste_units.toFixed(2)} units`,
          detail: `${summary.total_predictions} saved predictions`,
          icon: Leaf,
          tone: 'purple',
        },
      ]
    : []

  const averageTransactionValue =
    summary && summary.sales_count > 0
      ? Number(summary.total_sales_revenue) / summary.sales_count
      : 0

  return (
    <main className="page-content ww-dashboard">
      <header className="ww-topbar">
        <div>
          <span className="ww-overline">OVERVIEW</span>
          <h1>Dashboard</h1>
          <p>Monitor your inventory, sales and sustainability performance.</p>
        </div>

        <button
          type="button"
          className="ww-refresh"
          onClick={() => void loadDashboard()}
          disabled={loading || analyticsLoading}
        >
          <RefreshCw
            size={16}
            className={loading || analyticsLoading ? 'icon-spin' : ''}
          />
          {loading || analyticsLoading ? 'Refreshing' : 'Refresh data'}
        </button>
      </header>

      <section className="ww-welcome">
        <div className="ww-welcome-main">
          <div className="ww-welcome-copy">
            <span className="ww-welcome-tag">
              <Sprout size={15} />
              WASTE WISE INTELLIGENCE
            </span>
            <h2>
              Smarter inventory.
              <br />
              <span>Less waste.</span>
              <br />A greener future.
            </h2>
            <p>
              Turn your everyday inventory data into intelligent decisions that
              reduce food waste and improve business efficiency.
            </p>
            <div className="ww-welcome-actions">
              <Link to="/inventory" className="ww-welcome-link">
                Explore Inventory <ArrowRight size={17} />
              </Link>
              <span className="ww-welcome-support">
                <ChartNoAxesCombined size={16} />
                AI-powered insights
              </span>
            </div>
          </div>
          <div className="ww-welcome-art">
            <img
              className="ww-produce-photo"
              src={companyProfile.hero_photo_url}
              alt={`${companyProfile.company_name} supermarket produce section`}
            />
            <img
              className="ww-sunrise-brand"
              src={companyProfile.logo_url}
              alt={`${companyProfile.company_name} logo`}
            />
            {(companyProfile.logo_url !== DEFAULT_COMPANY_PROFILE.logo_url ||
              companyProfile.company_name !==
                DEFAULT_COMPANY_PROFILE.company_name ||
              companyProfile.tagline !== DEFAULT_COMPANY_PROFILE.tagline) && (
              <div className="ww-company-identity">
                <strong>{companyProfile.company_name}</strong>
                <span>{companyProfile.tagline}</span>
              </div>
            )}
          </div>
        </div>
        {companyProfileError && (
          <p className="ww-branding-error" role="status">
            {companyProfileError}
          </p>
        )}
        <div className="ww-welcome-benefits" aria-label="Waste Wise benefits">
          <span>
            <Sprout size={17} />
            Sustainable Business
          </span>
          <span>
            <ChartNoAxesCombined size={17} />
            Smarter Decisions
          </span>
          <span>
            <Leaf size={17} />
            A Greener Planet
          </span>
        </div>
      </section>

      {error && (
        <div className="ww-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadDashboard()}>
            Try again
          </button>
        </div>
      )}

      {loading && !summary ? (
        <div className="ww-state" role="status">
          Loading your dashboard...
        </div>
      ) : summary ? (
        <>
          <section className="ww-metrics" aria-label="Business summary">
            {cards.map((card) => {
              const Icon = card.icon

              return (
                <article
                  className={`ww-metric-card ${card.tone}`}
                  key={card.label}
                >
                  <div className={`ww-metric-icon ${card.tone}`}>
                    <Icon size={20} />
                  </div>
                  <div className="ww-metric-copy">
                    <span className="ww-metric-label">{card.label}</span>
                    <strong className="ww-metric-value">{card.value}</strong>
                    <span className="ww-metric-detail">{card.detail}</span>
                  </div>
                </article>
              )
            })}
          </section>

          <section className="ww-section-heading">
            <div>
              <span className="ww-overline">BUSINESS INSIGHTS</span>
              <h2>Analytics at a glance</h2>
              <p>Live inventory, sales and demand signals from your workspace.</p>
            </div>
          </section>

          <section className="ww-chart-grid" aria-label="Business analytics">
            <article className="ww-panel ww-inventory-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Stock Levels</h3>
                  <p>Product-level remaining-stock estimates from inventory records</p>
                </div>
                <span className="ww-live-indicator">
                  <i />
                  Live data
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state">Loading inventory levels...</div>
              ) : analyticsErrors.inventory ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analyticsErrors.inventory}
                </div>
              ) : inventoryChartData.length ? (
                <>
                  <div className="ww-stock-estimate-note">
                    The API provides dated entries, not a current-stock
                    snapshot. Quantities are summed record-derived estimates.
                  </div>
                  <div className="ww-inventory-overview">
                    <span>Total stock on hand</span>
                    <strong>{formatUnits(totalStockRemaining)}</strong>
                    <small>Across all inventory records</small>
                  </div>
                  <div className="ww-stock-featured">
                    <span className="ww-stock-thumbnail" aria-hidden="true">
                      <Package size={21} />
                    </span>
                    <span className="ww-stock-featured-copy">
                      <strong>{inventoryChartData[0].name}</strong>
                      <small>{inventoryChartData[0].category}</small>
                    </span>
                    <span className="ww-stock-featured-value">
                      {formatUnits(inventoryChartData[0].units)}
                    </span>
                  </div>
                  <div className="ww-stock-chart-wrap">
                    <div className="ww-stock-chart-label">
                      <span>Stock by product</span>
                      <span>Remaining</span>
                    </div>
                    <div
                      className="ww-chart ww-bar-chart ww-inventory-chart"
                      style={{
                        height: Math.max(190, inventoryChartData.length * 34 + 42),
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={inventoryChartData}
                          layout="vertical"
                          margin={{ top: 8, right: 78, left: 2, bottom: 8 }}
                          barCategoryGap="28%"
                        >
                          <defs>
                            <linearGradient
                              id="wwInventoryBar"
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop offset="0%" stopColor="#155d3c" />
                              <stop offset="55%" stopColor="#218653" />
                              <stop offset="100%" stopColor="#5bb67a" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            stroke="#e9f0eb"
                            strokeDasharray="3 6"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            axisLine={false}
                            tickLine={false}
                            tick={CHART_AXIS_TICK}
                            tickMargin={7}
                            domain={[0, barChartAxisMax]}
                            allowDecimals={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={112}
                            axisLine={false}
                            tickLine={false}
                            tick={CHART_AXIS_TICK}
                            tickMargin={8}
                          />
                          <Tooltip
                            content={({ active, label }) => {
                              const item = inventoryChartData.find(
                                (entry) => entry.name === String(label),
                              )

                              return active && item ? (
                                <div className="ww-chart-tooltip">
                                  <span>PRODUCT #{item.productId}</span>
                                  <strong>{formatUnits(item.units)}</strong>
                                  <small>Remaining stock</small>
                                </div>
                              ) : null
                            }}
                            cursor={{ fill: '#edf6ef', radius: 10 }}
                          />
                          <Bar
                            dataKey="units"
                            fill="url(#wwInventoryBar)"
                            background={{ fill: '#edf5ef', radius: 12 }}
                            radius={[14, 14, 14, 14]}
                            barSize={inventoryChartData.length === 1 ? 42 : 29}
                            animationDuration={850}
                            animationEasing="ease-out"
                          >
                            <LabelList
                              dataKey="units"
                              position="right"
                              formatter={(value: number | string) =>
                                formatUnits(Number(value))
                              }
                              fill="#315641"
                              fontSize={inventoryChartData.length === 1 ? 12 : 10}
                              fontWeight={800}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : (
                <div className="ww-chart-state ww-compact-chart-state">
                  {normalizedSearch
                    ? 'No products match this search.'
                    : 'No inventory records to display.'}
                </div>
              )}
              <Link to="/inventory" className="ww-panel-link">
                View inventory <ArrowRight size={14} />
              </Link>
            </article>

            <article className="ww-panel ww-sales-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Daily sales</h3>
                  <p>Recorded units sold over time</p>
                </div>
                <span className="ww-panel-icon amber">
                  <TrendingUp size={18} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state">Loading sales history...</div>
              ) : analyticsErrors.sales ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analyticsErrors.sales}
                </div>
              ) : salesChartData.length ? (
                <>
                  <div className="ww-sales-layout">
                    <div className="ww-sales-metrics">
                      <div className="ww-sales-highlights">
                        <div className="ww-sales-highlight">
                          <span>UNITS SOLD</span>
                          <strong>{formatUnits(totalSalesQuantity)}</strong>
                        </div>
                        <div className="ww-sales-highlight">
                          <span>REVENUE</span>
                          <strong>{formatCurrency(totalSalesRevenue)}</strong>
                        </div>
                        <div className="ww-sales-highlight">
                          <span>TRANSACTIONS</span>
                          <strong>
                            {totalSalesTransactions.toLocaleString('en-IN')}
                          </strong>
                        </div>
                      </div>
                      <div className="ww-sales-date">
                        <span>RECORDED DATE</span>
                        <strong>
                          {formatSalesSummaryDate(
                            salesChartData[salesChartData.length - 1].date,
                          )}
                        </strong>
                      </div>
                    </div>
                    <div className="ww-sales-chart-column">
                      <div className="ww-sales-chart-label">
                        <span>Daily sales</span>
                        <span className="ww-sales-chart-legend">
                          <span><i className="ww-sales-units-key" />Units</span>
                          <span><i className="ww-sales-revenue-key" />Revenue</span>
                        </span>
                      </div>
                      <div
                        className={`ww-chart ww-sales-chart ${
                          salesChartData.length === 1 ? 'ww-single-point-chart' : ''
                        }`}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={salesChartData}
                            margin={{ top: 18, right: 48, left: -18, bottom: 4 }}
                          >
                            <defs>
                              <linearGradient id="wwSalesFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#e99943" stopOpacity={0.28} />
                                <stop offset="100%" stopColor="#e99943" stopOpacity={0.025} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              stroke="#f1e9dd"
                              strokeDasharray="3 6"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="date"
                              tickFormatter={formatSalesAxisDate}
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={10}
                              minTickGap={18}
                            />
                            <YAxis
                              yAxisId="units"
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={8}
                              allowDecimals={false}
                            />
                            <YAxis
                              yAxisId="revenue"
                              orientation="right"
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={8}
                              tickFormatter={formatSalesAxisRevenue}
                              width={50}
                            />
                            <Tooltip
                              content={({ active, label }) => {
                                const item = salesChartData.find(
                                  (entry) => entry.date === String(label),
                                )

                                return active && item ? (
                                  <div className="ww-chart-tooltip ww-sales-tooltip">
                                    <span>{formatSalesSummaryDate(item.date)}</span>
                                    <div>
                                      <small>Units sold</small>
                                      <strong>{formatUnits(item.quantity)}</strong>
                                    </div>
                                    <div>
                                      <small>Revenue</small>
                                      <strong>{formatCurrency(item.revenue)}</strong>
                                    </div>
                                    <div>
                                      <small>Transactions</small>
                                      <strong>
                                        {item.transactions.toLocaleString('en-IN')}
                                      </strong>
                                    </div>
                                  </div>
                                ) : null
                              }}
                              cursor={{ stroke: '#e5bd8d', strokeDasharray: '4 4' }}
                            />
                            <Area
                              yAxisId="units"
                              type="monotone"
                              dataKey="quantity"
                              stroke="#d77d2e"
                              strokeWidth={3.5}
                              fill="url(#wwSalesFill)"
                              activeDot={{
                                r: salesChartData.length === 1 ? 9 : 6,
                                fill: '#c76d25',
                                stroke: '#ffffff',
                                strokeWidth: 4,
                                style: {
                                  filter: 'drop-shadow(0 3px 5px rgba(199, 109, 37, 0.3))',
                                },
                              }}
                              dot={{
                                r: salesChartData.length === 1 ? 8 : 3.5,
                                fill: '#ffffff',
                                stroke: '#d77d2e',
                                strokeWidth: salesChartData.length === 1 ? 4 : 2,
                              }}
                              animationDuration={700}
                            >
                              {salesChartData.length === 1 && (
                                <LabelList
                                  dataKey="quantity"
                                  position="top"
                                  formatter={(value: number | string) =>
                                    `${formatUnits(Number(value))} · ${formatCurrency(
                                      salesChartData[0].revenue,
                                    )}`
                                  }
                                  fill="#80542d"
                                  fontSize={11}
                                  fontWeight={700}
                                />
                              )}
                            </Area>
                            <Area
                              yAxisId="revenue"
                              type="monotone"
                              dataKey="revenue"
                              stroke="#238653"
                              strokeWidth={2.5}
                              fill="none"
                              dot={false}
                              activeDot={{
                                r: 5,
                                fill: '#238653',
                                stroke: '#ffffff',
                                strokeWidth: 3,
                              }}
                              animationDuration={700}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  {salesChartData.length === 1 && (
                    <p className="ww-chart-note ww-sales-chart-note">
                      Sales are recorded for one date only. The chart shows
                      that date; there is not yet enough date history to show a
                      sales trend.
                    </p>
                  )}
                </>
              ) : (
                <div className="ww-chart-state">No sales history to display.</div>
              )}
              <Link to="/sales-history" className="ww-panel-link">
                View sales history <ArrowRight size={14} />
              </Link>
            </article>

            <article className="ww-panel ww-category-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Category Distribution</h3>
                  <p>Remaining-stock estimates grouped by inventory category</p>
                </div>
                <span className="ww-panel-icon green">
                  <Boxes size={18} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  Loading categories...
                </div>
              ) : analyticsErrors.inventory ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analyticsErrors.inventory}
                </div>
              ) : categoryChartData.length ? (
                <>
                  <div className="ww-stock-estimate-note">
                    Inventory records are dated entries, not current-stock
                    snapshots. This distribution sums per-record remaining
                    estimates.
                  </div>
                  <div className="ww-stock-mix-body">
                    <div className="ww-chart ww-donut-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="65%"
                            outerRadius="91%"
                            paddingAngle={3}
                            cornerRadius={5}
                            stroke="#ffffff"
                            strokeWidth={3}
                            animationDuration={700}
                            animationEasing="ease-out"
                          >
                            {categoryChartData.map((item, index) => (
                              <Cell
                                key={item.name}
                                fill={getCategoryColor(item.name, index)}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              const categoryName = payload?.[0]?.name
                              const item = categoryChartData.find(
                                (entry) => entry.name === String(categoryName),
                              )
                              const share =
                                item && totalCategorizedStock
                                  ? (item.value / totalCategorizedStock) * 100
                                  : 0

                              return active && item ? (
                                <div className="ww-chart-tooltip ww-stock-tooltip">
                                  <span>{item.name}</span>
                                  <strong>{formatUnits(item.value)}</strong>
                                  <small>
                                    {share.toFixed(1)}% of estimated units
                                  </small>
                                </div>
                              ) : null
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="ww-donut-center" aria-hidden="true">
                        <strong>RECORD</strong>
                        <span>ESTIMATE</span>
                      </div>
                    </div>
                    <div className="ww-legend">
                      <div className="ww-legend-heading" aria-hidden="true">
                        <span>Category</span>
                        <span>Est. units</span>
                        <span>Share</span>
                      </div>
                      {categoryChartData.map((item, index) => (
                        <div className="ww-legend-row" key={item.name}>
                          <i
                            style={{
                              backgroundColor:
                                getCategoryColor(item.name, index),
                            }}
                          />
                          <span className="ww-legend-name">{item.name}</span>
                          <strong>
                            {item.value.toLocaleString('en-IN', {
                              maximumFractionDigits: 1,
                            })}
                          </strong>
                          <small>
                            {totalCategorizedStock
                              ? `${((item.value / totalCategorizedStock) * 100).toFixed(1)}%`
                              : '0%'}
                          </small>
                        </div>
                      ))}
                    </div>
                  </div>

                  {inventoryChartData.length > 0 && (
                    <div className="ww-stock-product-distribution">
                      <div className="ww-stock-product-heading">
                        <strong>Product distribution</strong>
                        <span>Top products · estimated units</span>
                      </div>
                      <div className="ww-stock-product-columns">
                        <span>Product</span>
                        <span>Est. units</span>
                        <span>Share</span>
                      </div>
                      {inventoryChartData.map((item) => {
                        const share = totalStockRemaining
                          ? (item.units / totalStockRemaining) * 100
                          : 0
                        const maxProductStock = inventoryChartData[0].units

                        return (
                          <div
                            className="ww-stock-product-row"
                            key={item.productId}
                          >
                            <span className="ww-stock-product-name">
                              <strong>{item.name}</strong>
                              <small>
                                {item.category || 'Category unavailable'}
                              </small>
                            </span>
                            <span className="ww-stock-product-quantity">
                              {item.units.toLocaleString('en-IN', {
                                maximumFractionDigits: 1,
                              })}
                              <i>
                                <span
                                  style={{
                                    width: `${
                                      maxProductStock > 0
                                        ? (item.units / maxProductStock) * 100
                                        : 0
                                    }%`,
                                  }}
                                />
                              </i>
                            </span>
                            <strong className="ww-stock-product-share">
                              {share.toFixed(1)}%
                            </strong>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="ww-chart-state ww-compact-chart-state">
                  No positive per-record inventory estimates to distribute.
                </div>
              )}
            </article>

            <article className="ww-panel ww-inventory-trend-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Inventory Trends</h3>
                  <p>Dated record estimates · not current-stock snapshots</p>
                </div>
                <span className="ww-panel-icon green">
                  <TrendingUp size={18} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state">Loading inventory trends...</div>
              ) : analyticsErrors.inventory ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analyticsErrors.inventory}
                </div>
              ) : inventoryTrendData.length > 1 ? (
                <>
                  <div className="ww-inventory-trend-summary">
                    <span>Estimated units across dated entries</span>
                    <strong>{inventoryTrendData.length} dates</strong>
                  </div>
                  <div
                    className="ww-chart ww-inventory-trend-chart"
                    role="img"
                    aria-label="Line chart of estimated remaining units grouped by inventory record date"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={inventoryTrendData}
                        margin={{ top: 10, right: 12, left: -14, bottom: 2 }}
                      >
                        <CartesianGrid
                          stroke="#e9f0eb"
                          strokeDasharray="3 6"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          axisLine={false}
                          tickLine={false}
                          tick={CHART_AXIS_TICK}
                          tickMargin={9}
                          tickFormatter={formatSaleDate}
                          minTickGap={18}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={CHART_AXIS_TICK}
                          allowDecimals={false}
                          width={42}
                        />
                        <Tooltip
                          content={({ active, label }) => {
                            const item = inventoryTrendData.find(
                              (entry) => entry.date === String(label),
                            )

                            return active && item ? (
                              <div className="ww-chart-tooltip">
                                <span>{formatSaleDate(item.date)}</span>
                                <strong>{formatUnits(item.units)}</strong>
                                <small>
                                  {item.records} dated inventory{' '}
                                  {item.records === 1 ? 'record' : 'records'}
                                </small>
                              </div>
                            ) : null
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="units"
                          name="Estimated units"
                          stroke="#218653"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#E5A33D', stroke: '#fff', strokeWidth: 2 }}
                          activeDot={{ r: 6, fill: '#E5A33D', stroke: '#fff', strokeWidth: 2 }}
                          animationDuration={750}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="ww-chart-state ww-compact-chart-state">
                  Not enough dated inventory records to show a trend.
                </div>
              )}
            </article>

            <article className="ww-panel ww-expiry-risk-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Expiry Risk Distribution</h3>
                  <p>Inventory record classifications from the expiry-risk API</p>
                </div>
                <span className="ww-panel-icon amber">
                  <AlertCircle size={18} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state">Loading expiry risk...</div>
              ) : analyticsErrors.expiryRisk ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analyticsErrors.expiryRisk}
                </div>
              ) : expiryRiskTotal > 0 ? (
                <>
                  <div className="ww-expiry-risk-summary">
                    <span>Classified inventory records</span>
                    <strong>{expiryRiskTotal.toLocaleString('en-IN')}</strong>
                  </div>
                  <div
                    className="ww-chart ww-expiry-risk-chart"
                    role="img"
                    aria-label="Stacked bar chart showing inventory records by expiry risk classification"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={expiryRiskChartData}
                        layout="vertical"
                        margin={{ top: 22, right: 8, left: 8, bottom: 22 }}
                      >
                        <XAxis
                          type="number"
                          domain={[0, expiryRiskTotal]}
                          hide
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          hide
                        />
                        <Tooltip
                          cursor={{ fill: 'transparent' }}
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value, name) => [
                            `${Number(value).toLocaleString('en-IN')} records`,
                            name,
                          ]}
                        />
                        {EXPIRY_RISK_LEVELS.map((level) => (
                          <Bar
                            key={level}
                            dataKey={level}
                            name={level}
                            stackId="expiry-risk"
                            fill={EXPIRY_RISK_COLORS[level]}
                            radius={
                              level === firstActiveExpiryRisk &&
                              level === lastActiveExpiryRisk
                                ? 9
                                : level === firstActiveExpiryRisk
                                  ? [9, 0, 0, 9]
                                  : level === lastActiveExpiryRisk
                                    ? [0, 9, 9, 0]
                                    : undefined
                            }
                            animationDuration={700}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="ww-expiry-risk-legend" aria-label="Expiry risk counts">
                    {EXPIRY_RISK_LEVELS.map((level) => (
                      <div key={level}>
                        <i style={{ backgroundColor: EXPIRY_RISK_COLORS[level] }} />
                        <span>{level}</span>
                        <strong>
                          {(expiryRiskCounts.get(level) ?? 0).toLocaleString('en-IN')}
                        </strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="ww-chart-state ww-compact-chart-state">
                  No expiry-risk records to display.
                </div>
              )}
            </article>

            <article className="ww-panel ww-waste-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Waste Exposure</h3>
                  <p>Saved model waste estimates from recorded predictions</p>
                </div>
                <span className="ww-panel-icon green">
                  <Leaf size={18} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  Loading waste predictions...
                </div>
              ) : analyticsErrors.waste ? (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analyticsErrors.waste}
                </div>
              ) : analytics.waste?.is_estimate &&
                wasteSummary &&
                wasteSummary.prediction_count > 0 &&
                Number.isFinite(wasteSummary.predicted_waste_units) &&
                wasteSummary.predicted_waste_units >= 0 ? (
                <>
                  <div className="ww-waste-summary-panel">
                    <span className="ww-waste-summary-caption">
                      Saved model prediction summary
                    </span>
                    <div className="ww-waste-summary-stats">
                      <div className="ww-waste-summary-stat">
                        <span>Total predicted waste</span>
                        <strong>
                          {formatUnits(wasteSummary.predicted_waste_units)}
                        </strong>
                      </div>
                      <div className="ww-waste-summary-stat">
                        <span>Saved predictions</span>
                        <strong>
                          {wasteSummary.prediction_count.toLocaleString('en-IN')}
                        </strong>
                      </div>
                    </div>
                  </div>
                  {wasteChartData.length > 0 ? (
                    <div className="ww-stock-product-distribution ww-waste-product-distribution">
                      <div className="ww-stock-product-heading">
                        <strong>Predicted waste by product</strong>
                        <span>Saved model estimates</span>
                      </div>
                      <div className="ww-stock-product-columns">
                        <span>Product / category</span>
                        <span>Est. waste</span>
                        <span>Share</span>
                      </div>
                      {wasteChartData.map((item) => {
                        const share = wasteSummary.predicted_waste_units
                          ? (item.waste / wasteSummary.predicted_waste_units) *
                            100
                          : 0

                        return (
                          <div
                            className="ww-stock-product-row"
                            key={item.productId}
                          >
                            <span className="ww-stock-product-name">
                              <strong>{item.name}</strong>
                              <small>
                                ID: {item.productId} · {item.category}
                              </small>
                            </span>
                            <span className="ww-stock-product-quantity ww-waste-product-quantity">
                              {formatUnits(item.waste)}
                              <i>
                                <span
                                  style={{
                                    width: `${
                                      wasteChartData[0].waste > 0
                                        ? (item.waste / wasteChartData[0].waste) *
                                          100
                                        : 0
                                    }%`,
                                  }}
                                />
                              </i>
                            </span>
                            <strong className="ww-stock-product-share">
                              {share.toFixed(1)}%
                            </strong>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="ww-chart-state ww-compact-chart-state">
                      {normalizedSearch
                        ? 'No product predictions match this search.'
                        : 'Product-level prediction breakdown is unavailable.'}
                    </div>
                  )}

                  {wasteMonthlyData.length > 0 && (
                    <div className="ww-stock-product-distribution ww-waste-monthly-distribution">
                      <div className="ww-stock-product-heading">
                        <strong>Monthly predicted waste</strong>
                        <span>Saved prediction dates</span>
                      </div>
                      <div className="ww-chart ww-waste-monthly-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={wasteMonthlyData}
                            margin={{ top: 10, right: 8, left: -18, bottom: 2 }}
                          >
                            <defs>
                              <linearGradient
                                id="wwWasteMonthlyBar"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop offset="0%" stopColor="#72b58b" />
                                <stop offset="100%" stopColor="#278451" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              stroke="#f1e9dd"
                              strokeDasharray="3 6"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="month"
                              tickFormatter={formatWasteMonth}
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={8}
                              minTickGap={10}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={5}
                              width={42}
                            />
                            <Tooltip
                              content={({ active, label }) => {
                                const item = wasteMonthlyData.find(
                                  (entry) => entry.month === String(label),
                                )

                                return active && item ? (
                                  <div className="ww-chart-tooltip ww-waste-tooltip">
                                    <span>{formatWasteMonth(item.month)} · MODEL ESTIMATE</span>
                                    <strong>{formatUnits(item.waste)}</strong>
                                    <small>
                                      {item.predictionCount.toLocaleString('en-IN')} saved predictions
                                    </small>
                                  </div>
                                ) : null
                              }}
                              cursor={{ fill: '#fff3e7', radius: 8 }}
                            />
                            <Bar
                              dataKey="waste"
                              fill="url(#wwWasteMonthlyBar)"
                              radius={[6, 6, 0, 0]}
                              maxBarSize={34}
                              animationDuration={700}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="ww-chart-state ww-compact-chart-state">
                  {analytics.waste?.summary.prediction_count === 0
                    ? 'No saved model predictions are available to report.'
                    : normalizedSearch
                      ? 'No product predictions match this search.'
                      : 'No valid saved prediction estimates are available.'}
                </div>
              )}
              <p className="ww-chart-note ww-waste-note">
                Model estimates only — these are not measured actual waste.
              </p>
            </article>

            <article className="ww-panel ww-forecast-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Demand outlook</h3>
                  <p>
                    Live catalogue forecasts. Historical/demo models are listed
                    separately in Forecasting.
                  </p>
                </div>
                <span className="ww-panel-icon green">
                  <ChartNoAxesCombined size={18} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="ww-chart-state ww-forecast-state">
                  Loading demand forecast...
                </div>
              ) : analyticsErrors.products ? (
                <div className="ww-forecast-message" role="status">
                  <span className="ww-forecast-message-icon">
                    <ChartNoAxesCombined size={19} />
                  </span>
                  <div>
                    <strong>Product list unavailable</strong>
                    <p>
                      Forecasts cannot be matched to product names until the
                      product catalogue is available. Refresh to try again.
                    </p>
                  </div>
                </div>
              ) : analytics.forecasts !== null ? (
                <>
                  <div className="ww-forecast-overview">
                    <div className="ww-forecast-overview-stats">
                      <div className="ww-forecast-overview-stat">
                        <span>Verified live forecasts</span>
                        <strong>
                          {verifiedCatalogueForecastCount.toLocaleString('en-IN')}
                        </strong>
                      </div>
                      <div className="ww-forecast-overview-stat">
                        <span>Active catalogue products</span>
                        <strong>
                          {activeCatalogueProducts.length.toLocaleString('en-IN')}
                        </strong>
                      </div>
                    </div>
                    <div
                      className={`ww-forecast-readiness ${
                        analyticsErrors.forecasts || hasUnverifiedForecastStatus
                          ? 'is-unknown'
                          : verifiedCatalogueForecastCount ===
                              activeCatalogueProducts.length &&
                            activeCatalogueProducts.length > 0
                            ? 'is-ready'
                            : 'is-limited'
                      }`}
                      role="status"
                    >
                      <span className="ww-forecast-readiness-mark">
                        <Sprout size={17} />
                      </span>
                      <div>
                        <strong>Forecast readiness</strong>
                        <p>{forecastReadinessMessage}</p>
                      </div>
                    </div>
                  </div>

                  <div className="ww-forecast-status-list">
                    <div className="ww-forecast-status-list-heading">
                      <strong>Catalogue forecast status</strong>
                      <span>
                        {activeCatalogueProducts.length.toLocaleString('en-IN')}{' '}
                        products
                      </span>
                    </div>
                    {catalogueForecastStatuses.length > 0 ? (
                      <div className="ww-forecast-preview-list">
                        {catalogueForecastStatuses.slice(0, 5).map((item) => (
                          <div
                            className="ww-forecast-preview-row"
                            key={item.productId}
                          >
                            <ProductThumbnail
                              className="ww-forecast-preview-image"
                              productId={item.productId}
                              productName={item.productName}
                            />
                            <div className="ww-forecast-preview-product">
                              <strong>{item.productName}</strong>
                              <span>Product #{item.productId}</span>
                              <small>{formatDisplayTitle(item.category)}</small>
                            </div>
                            <span
                              className={`ww-forecast-status-badge ${
                                item.status === 'available'
                                  ? 'is-available'
                                  : item.status === 'unavailable'
                                    ? 'is-unavailable'
                                    : 'is-unknown'
                              }`}
                            >
                              {item.status === 'available'
                                ? 'Forecast available'
                                : item.status === 'unavailable'
                                  ? 'No forecast'
                                  : 'Status unavailable'}
                            </span>
                          </div>
                        ))}
                        <Link to="/products" className="ww-forecast-view-all">
                          View all {activeCatalogueProducts.length.toLocaleString('en-IN')}{' '}
                          products <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </div>
                    ) : (
                      <div className="ww-forecast-status-empty">
                        No active catalogue products are available.
                      </div>
                    )}
                  </div>

                  {availableForecasts.length > 0 && (
                    <>
                      <div className="ww-forecast-kpis">
                        <div>
                          <span>Average daily forecast</span>
                          <strong>
                            {formatForecastUnits(averagePredictedDemand!)}
                          </strong>
                          <small>Across available product forecasts</small>
                        </div>
                        <div>
                          <span>Highest daily forecast</span>
                          <strong>
                            {formatForecastUnits(highestForecastPoint!.units)}
                          </strong>
                          <small>
                            {highestForecastPoint!.productName} ·{' '}
                            {formatSalesSummaryDate(highestForecastPoint!.date)}
                          </small>
                        </div>
                      </div>

                      <div className="ww-forecast-chart-heading">
                        <strong>Daily predicted demand comparison</strong>
                        <span>Predicted units</span>
                      </div>
                      <div className="ww-chart ww-forecast-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={forecastChartData}
                            margin={{ top: 14, right: 16, left: -12, bottom: 2 }}
                          >
                            <CartesianGrid
                              stroke="#e9f0eb"
                              strokeDasharray="3 6"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="date"
                              tickFormatter={formatSaleDate}
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={10}
                              minTickGap={18}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={CHART_AXIS_TICK}
                              tickMargin={8}
                              tickFormatter={(value) =>
                                Number(value).toLocaleString('en-IN', {
                                  maximumFractionDigits: 1,
                                })
                              }
                              width={42}
                            />
                            <Tooltip
                              contentStyle={CHART_TOOLTIP_STYLE}
                              labelStyle={{ color: '#315641', fontWeight: 700 }}
                              itemStyle={{ color: '#238653', fontSize: 12 }}
                              labelFormatter={(label) =>
                                formatSalesSummaryDate(String(label))
                              }
                              formatter={(value, name) => [
                                formatForecastUnits(Number(value)),
                                String(name),
                              ]}
                              cursor={{
                                stroke: '#b7d5c0',
                                strokeDasharray: '4 4',
                              }}
                            />
                            {forecastSeries.map((series) => (
                              <Line
                                key={series.key}
                                type="monotone"
                                dataKey={series.key}
                                name={series.name}
                                stroke={series.color}
                                strokeWidth={2.75}
                                dot={{ r: 3, strokeWidth: 2, fill: '#ffffff' }}
                                activeDot={{
                                  r: 6,
                                  fill: series.color,
                                  stroke: '#ffffff',
                                  strokeWidth: 3,
                                }}
                                connectNulls={false}
                                animationDuration={700}
                              />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="ww-forecast-series-legend">
                        {forecastSeries.map((series) => (
                          <span key={series.key}>
                            <i style={{ backgroundColor: series.color }} />
                            {series.name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="ww-forecast-message">
                  <span className="ww-forecast-message-icon">
                    <Sprout size={19} />
                  </span>
                  <div>
                    <strong>No catalogue products available</strong>
                    <p>
                      No product IDs are available to request forecasts for.
                      No demand values are shown.
                    </p>
                  </div>
                </div>
              )}
            </article>
          </section>

          <section className="ww-bottom-grid">
            <article className="ww-panel ww-overview-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Inventory overview</h3>
                  <p>Your current catalogue at a glance</p>
                </div>
                <span className="ww-panel-icon green">
                  <ShoppingBasket size={18} />
                </span>
              </div>

              <div className="ww-overview-stats">
                <div>
                  <span className="ww-overview-symbol">
                    <Package size={17} />
                  </span>
                  <span>Active products</span>
                  <strong>{summary.active_products.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span className="ww-overview-symbol">
                    <Boxes size={17} />
                  </span>
                  <span>Inventory records</span>
                  <strong>{summary.inventory_records.toLocaleString('en-IN')}</strong>
                </div>
              </div>

              <Link to="/inventory" className="ww-panel-link">
                Manage inventory <ArrowRight size={14} />
              </Link>
            </article>

            <article className="ww-panel ww-overview-panel ww-sales-performance-panel">
              <div className="ww-panel-heading">
                <div>
                  <h3>Sales performance</h3>
                  <p>Revenue, volume and transaction value</p>
                </div>
                <span className="ww-panel-icon amber">
                  <ReceiptText size={18} />
                </span>
              </div>

              <div className="ww-sales-kpis">
                <div>
                  <span>Total revenue</span>
                  <strong>{formatCurrency(Number(summary.total_sales_revenue))}</strong>
                </div>
                <div>
                  <span>Units sold</span>
                  <strong>
                    {Number(summary.total_quantity_sold).toLocaleString('en-IN', {
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </div>
                <div>
                  <span>Transactions</span>
                  <strong>{summary.sales_count.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span>Avg. transaction value</span>
                  <strong>{formatCurrency(averageTransactionValue)}</strong>
                </div>
              </div>

              <div className="ww-recent-sales-heading">
                <strong>Recent transactions</strong>
                <span>Latest recorded</span>
              </div>

              {summary.recent_sales.length ? (
                <div className="ww-activity-list">
                  {summary.recent_sales.map((item) => (
                    <div className="ww-activity-item" key={item.sale_id}>
                      <span className="ww-activity-icon">
                        <IndianRupee size={16} />
                      </span>
                      <div className="ww-activity-info">
                        <strong>
                          {productNames.get(item.product_id) ??
                            `Product #${item.product_id}`}
                        </strong>
                        <span>
                          {item.quantity} units ·{' '}
                          {new Date(item.sale_date).toLocaleDateString()}
                        </span>
                      </div>
                      <strong className="ww-activity-amount">
                        {formatCurrency(Number(item.total_amount))}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ww-chart-state ww-empty-sales">
                  No sales recorded yet.
                </div>
              )}

              <Link to="/sales-history" className="ww-panel-link">
                View all sales <ArrowRight size={14} />
              </Link>
            </article>

            <section className="ww-sustainability-note">
              <span>
                <Leaf size={22} />
              </span>
              <div>
                <h3>Small insights. Smarter decisions. Less waste.</h3>
                <p>
                  Use your inventory, sales and model estimates to support
                  purchasing decisions. Validate predictions against real
                  measurements before relying on them operationally.
                </p>
              </div>
              <div className="ww-sustainability-art" aria-hidden="true">
                <Recycle size={29} />
                <Sprout size={38} />
              </div>
            </section>
          </section>
        </>
      ) : null}
    </main>
  )
}
