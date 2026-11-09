import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarClock,
  RefreshCw,
  ReceiptText,
  IndianRupee,
  Package,
} from 'lucide-react'
import api from '../services/api'

interface Sale {
  id: number
  product_id: number
  quantity: number
  unit_price: number
  total_amount: number
  sale_date: string
  created_at: string
}

export default function SalesHistory() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadSales = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.get<Sale[]>('/sales')
      setSales(response.data)
    } catch {
      setError('Unable to load sales history. Please check the backend connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSales()
  }, [loadSales])

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total_amount, 0)
  const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0)
  const salesUnavailable = loading || (Boolean(error) && sales.length === 0)
  const recentSales = useMemo(
    () =>
      [...sales].sort((a, b) => {
        const dateDifference =
          new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()
        return Number.isNaN(dateDifference) || dateDifference === 0
          ? b.id - a.id
          : dateDifference
      }),
    [sales],
  )

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)

  const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
  }

  return (
    <main className="sales-page">
      <section className="sales-page-header">
        <div>
          <span className="sales-eyebrow">TRANSACTION MANAGEMENT</span>
          <h1>Sales History</h1>
          <p>Track recorded sales, monitor revenue, and review transaction details.</p>
        </div>

        <button
          type="button"
          className="sales-refresh-button"
          onClick={() => void loadSales()}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? 'sales-spinning' : ''}
            aria-hidden="true"
          />
          {loading ? 'Refreshing...' : 'Refresh records'}
        </button>
      </section>

      {error && (
        <div className="sales-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSales()}>
            Retry
          </button>
        </div>
      )}

      <section className="sales-summary-grid">
        <article className="sales-summary-card">
          <div className="sales-summary-icon sales-icon-purple">
            <ReceiptText size={21} aria-hidden="true" />
          </div>
          <p>Recorded transactions</p>
          <h2>
            {salesUnavailable ? '—' : sales.length.toLocaleString('en-IN')}
          </h2>
          <span>Successfully saved sales records</span>
        </article>

        <article className="sales-summary-card">
          <div className="sales-summary-icon sales-icon-green">
            <IndianRupee size={21} aria-hidden="true" />
          </div>
          <p>Total sales revenue</p>
          <h2>{salesUnavailable ? '—' : formatCurrency(totalRevenue)}</h2>
          <span>Combined value of recorded sales</span>
        </article>

        <article className="sales-summary-card">
          <div className="sales-summary-icon sales-icon-orange">
            <Package size={21} aria-hidden="true" />
          </div>
          <p>Total quantity sold</p>
          <h2>
            {salesUnavailable
              ? '—'
              : totalQuantity.toLocaleString('en-IN')}
          </h2>
          <span>Units across all transactions</span>
        </article>
      </section>

      <section className="sales-analytics-panel" aria-labelledby="sales-revenue-title">
        <div className="sales-analytics-heading">
          <div>
            <span className="sales-analytics-kicker">TRANSACTION BREAKDOWN</span>
            <h2 id="sales-revenue-title">Revenue by transaction</h2>
            <p>Recorded revenue for each sale, shown by Sale ID.</p>
          </div>
          <span className="sales-analytics-icon" aria-hidden="true">
            <IndianRupee size={19} />
          </span>
        </div>

        {loading ? (
          <div className="sales-visual-state" role="status">
            Loading transaction revenue...
          </div>
        ) : error ? (
          <div className="sales-visual-state">Transaction revenue is unavailable.</div>
        ) : sales.length === 0 ? (
          <div className="sales-visual-state">No recorded transactions to chart.</div>
        ) : (
          <div
            className="sales-revenue-chart"
            style={{ height: Math.max(180, sales.length * 52) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sales.map((sale) => ({
                  label: `Sale #${sale.id}`,
                  total_amount: sale.total_amount,
                }))}
                layout="vertical"
                margin={{ top: 8, right: 84, bottom: 8, left: 8 }}
              >
                <defs>
                  <linearGradient id="salesRevenueBar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#16805d" />
                    <stop offset="100%" stopColor="#e9a23b" />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#e9f0e9"
                  strokeDasharray="3 6"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#829087', fontSize: 10 }}
                  tickFormatter={(value: number) => formatCurrency(value)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={78}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#52685a', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip
                  cursor={{ fill: '#f1f7f1', radius: 8 }}
                  formatter={(value) => [
                    formatCurrency(Number(value)),
                    'Transaction revenue',
                  ]}
                  contentStyle={{
                    border: '1px solid #e3ece4',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(28, 68, 45, 0.1)',
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="total_amount"
                  name="Revenue"
                  fill="url(#salesRevenueBar)"
                  radius={[0, 7, 7, 0]}
                  barSize={24}
                >
                  <LabelList
                    dataKey="total_amount"
                    position="right"
                    formatter={(value: number | string) =>
                      formatCurrency(Number(value))
                    }
                    fill="#315641"
                    fontSize={10}
                    fontWeight={750}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="sales-analytics-panel sales-timeline-panel" aria-labelledby="sales-timeline-title">
        <div className="sales-analytics-heading">
          <div>
            <span className="sales-analytics-kicker">LATEST ACTIVITY</span>
            <h2 id="sales-timeline-title">Recent sales timeline</h2>
            <p>Recorded transactions in chronological order, newest first.</p>
          </div>
          <span className="sales-analytics-icon sales-timeline-icon" aria-hidden="true">
            <CalendarClock size={19} />
          </span>
        </div>

        {loading ? (
          <div className="sales-visual-state" role="status">
            Loading recent sales...
          </div>
        ) : error ? (
          <div className="sales-visual-state">Recent sales are unavailable.</div>
        ) : recentSales.length === 0 ? (
          <div className="sales-visual-state">No recorded transactions yet.</div>
        ) : (
          <ol className="sales-timeline">
            {recentSales.map((sale) => (
              <li className="sales-timeline-item" key={sale.id}>
                <span className="sales-timeline-marker" aria-hidden="true">
                  <ReceiptText size={15} />
                </span>
                <article className="sales-timeline-card">
                  <div className="sales-timeline-main">
                    <div className="sales-timeline-title">
                      <strong>Sale #{sale.id}</strong>
                      <span>Product {sale.product_id}</span>
                    </div>
                    <strong className="sales-timeline-amount">
                      {formatCurrency(sale.total_amount)}
                    </strong>
                  </div>
                  <div className="sales-timeline-details">
                    <span>{sale.quantity.toLocaleString('en-IN')} units</span>
                    <time dateTime={sale.sale_date}>{formatDate(sale.sale_date)}</time>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="sales-table-panel">
        <div className="sales-table-header">
          <div>
            <h2>Transaction records</h2>
            <p>A detailed history of your recorded sales</p>
          </div>
          <span className="sales-record-count">
            {salesUnavailable ? '— records' : `${sales.length} records`}
          </span>
        </div>

        {loading ? (
          <div className="sales-state-message" role="status" aria-live="polite">
            Loading sales records...
          </div>
        ) : error ? (
          <div className="sales-state-message">Sales records could not be displayed.</div>
        ) : sales.length === 0 ? (
          <div className="sales-empty-state">
            <ReceiptText size={34} aria-hidden="true" />
            <h3>No sales recorded yet</h3>
            <p>Recorded transactions will appear here.</p>
          </div>
        ) : (
          <div className="sales-table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Product ID</th>
                  <th>Quantity</th>
                  <th>Unit price</th>
                  <th>Total amount</th>
                  <th>Sale date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td><span className="sales-id">#{sale.id}</span></td>
                    <td><span className="sales-product-id">Product {sale.product_id}</span></td>
                    <td>{sale.quantity.toLocaleString('en-IN')}</td>
                    <td>{formatCurrency(sale.unit_price)}</td>
                    <td><strong className="sales-total">{formatCurrency(sale.total_amount)}</strong></td>
                    <td className="sales-date">{formatDate(sale.sale_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}