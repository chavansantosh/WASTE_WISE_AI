
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  Boxes,
  BarChart3,
  PieChart as PieChartIcon,
  RefreshCw,
  Search,
  Thermometer,
  CalendarClock,
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
import {
  createInventoryRecord,
  getInventoryRecords,
  type CreateInventoryInput,
  type InventoryRecord,
} from '../services/inventory'
import {
  getProducts,
  type Product,
} from '../services/products'

export default function Inventory() {
  const [records, setRecords] = useState<InventoryRecord[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [catalogueProducts, setCatalogueProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(true)
  const [productDataError, setProductDataError] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const [form, setForm] = useState<CreateInventoryInput>({
    product_id: 0,
    category: '',
    opening_stock: 0,
    units_received: 0,
    units_sold: 0,
    unit_price: 0,
    discount_pct: 0,
    days_to_expiry: 1,
    temperature_c: 4,
    date: new Date().toISOString().slice(0, 10),
  })

  async function loadInventory() {
    setLoading(true)
    setError('')

    try {
      const data = await getInventoryRecords()
      setRecords(data)
    } catch {
      setError('Unable to load inventory. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  async function loadProducts() {
    setProductsLoading(true)
    setProductDataError(false)

    try {
      const data = await getProducts(true)
      const activeProducts = data.filter((product) => product.is_active)
      setCatalogueProducts(data)
      setProducts(activeProducts)

      if (activeProducts.length > 0 && !selectedProductId) {
        const firstProduct = activeProducts[0]
        setSelectedProductId(String(firstProduct.product_id))
        setForm((previous) => ({
          ...previous,
          product_id: firstProduct.product_id,
          category: firstProduct.category,
          unit_price: firstProduct.unit_price,
        }))
      }
    } catch {
      setProductDataError(true)
      setFormError('Unable to load products. Please refresh and try again.')
    } finally {
      setProductsLoading(false)
    }
  }

  function handleProductChange(productId: string) {
    setSelectedProductId(productId)

    const selectedProduct = products.find(
      (product) => product.product_id === Number(productId),
    )

    if (!selectedProduct) return

    setForm((previous) => ({
      ...previous,
      product_id: selectedProduct.product_id,
      category: selectedProduct.category,
      unit_price: selectedProduct.unit_price,
    }))
  }

  async function handleCreateInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    setFormSuccess('')

    if (!selectedProductId || !products.some(
      (product) => product.product_id === Number(selectedProductId),
    )) {
      setFormError('Please select a valid active product.')
      setSaving(false)
      return
    }

    try {
      await createInventoryRecord(form)

      setFormSuccess('Inventory record saved successfully.')

      setForm((previous) => ({
        ...previous,
        opening_stock: 0,
        units_received: 0,
        units_sold: 0,
        discount_pct: 0,
        days_to_expiry: 1,
        temperature_c: 4,
        date: new Date().toISOString().slice(0, 10),
      }))

      setShowForm(false)
      await loadInventory()
    } catch {
      setFormError(
        'Could not save inventory. Please check your entries and backend.',
      )
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    void loadInventory()
    void loadProducts()
  }, [])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return records

    return records.filter((item) =>
      [
        item.inventory_id,
        item.product_id,
        item.product_name,
        item.category,
        item.inventory_date,
      ].some((value) =>
        String(value ?? '').toLowerCase().includes(query),
      ),
    )
  }, [records, search])

  const expiryCount = records.filter(
    (item) => item.days_to_expiry <= 3,
  ).length

  const totalStock = records.reduce(
    (sum, item) =>
      sum +
      Math.max(
        0,
        item.opening_stock + item.units_received - item.units_sold,
      ),
    0,
  )

  const stockByProduct = useMemo(() => {
    const productsById = new Map(
      catalogueProducts.map((product) => [product.product_id, product]),
    )
    const totalsByProductId = new Map<
      number,
      { name: string; stock: number; isMatched: boolean }
    >()

    for (const record of records) {
      const product = productsById.get(record.product_id)
      const current = totalsByProductId.get(record.product_id)
      const stock = Math.max(
        0,
        record.opening_stock + record.units_received - record.units_sold,
      )

      totalsByProductId.set(record.product_id, {
        name: product
          ? `${product.name} (ID: ${product.product_id})`
          : `Unmatched product (ID: ${record.product_id})`,
        stock: (current?.stock ?? 0) + stock,
        isMatched: Boolean(product),
      })
    }

    return [...totalsByProductId.entries()]
      .map(([productId, product]) => ({ productId, ...product }))
      .sort(
        (a, b) =>
          b.stock - a.stock || a.name.localeCompare(b.name, 'en'),
      )
  }, [records, catalogueProducts])

  const expiryStockDistribution = useMemo(() => {
    const statusRows = [
      { name: 'Available', stock: 0, fill: '#36a269' },
      { name: 'Expiring Soon', stock: 0, fill: '#f0a52b' },
      { name: 'Expired', stock: 0, fill: '#e36b59' },
    ]

    for (const record of records) {
      const stock = Math.max(
        0,
        record.opening_stock + record.units_received - record.units_sold,
      )
      const statusIndex =
        record.days_to_expiry <= 0
          ? 2
          : record.days_to_expiry <= 3
            ? 1
            : 0
      statusRows[statusIndex].stock += stock
    }

    return statusRows
  }, [records])

  const visibleExpiryDistribution = expiryStockDistribution.filter(
    (item) => item.stock > 0,
  )

  const formatStock = (value: number) =>
    `${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} units`

  return (
    <main className="page-content inventory-page">
      <section className="page-heading inventory-heading">
        <div>
          <span className="eyebrow">STOCK &amp; STORAGE CONTROL</span>
          <h1>Inventory Management</h1>
          <p>
            Review saved stock records, expiry timing, and AI waste estimates.
          </p>
        </div>

        <div className="inventory-heading-actions">
          <button
            className="refresh-button"
            onClick={() => {
              setShowForm(!showForm)
              setFormError('')
              setFormSuccess('')
            }}
          >
            {showForm ? 'Cancel' : '+ Add Inventory'}
          </button>

          <button
            className="refresh-button"
            onClick={() => void loadInventory()}
            disabled={loading}
          >
            <RefreshCw size={16} />
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </section>

      {showForm && (
        <section className="inventory-form-panel">
          <h2>Add Inventory Record</h2>
          <p>Select a product and enter its stock details.</p>

          {formError && <p className="form-error">{formError}</p>}
          {formSuccess && <p className="form-success">{formSuccess}</p>}

          <form onSubmit={handleCreateInventory} className="inventory-form">
            <label>
              Select Product
              <select
                required
                value={selectedProductId}
                onChange={(event) => handleProductChange(event.target.value)}
                disabled={productsLoading || products.length === 0}
              >
                <option value="">
                  {productsLoading
                    ? 'Loading products...'
                    : products.length === 0
                      ? 'No active products available'
                      : 'Choose a product'}
                </option>

                {products.map((product) => (
                  <option
                    key={product.product_id}
                    value={product.product_id}
                  >
                    {product.name} (ID: {product.product_id})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Product ID
              <input
                type="number"
                value={form.product_id || ''}
                readOnly
              />
            </label>

            <label>
              Category
              <input value={form.category} readOnly />
            </label>

            <label>
              Opening Stock
              <input
                type="number"
                min="0"
                step="any"
                required
                value={form.opening_stock}
                onChange={(event) =>
                  setForm({
                    ...form,
                    opening_stock: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              Units Received
              <input
                type="number"
                min="0"
                step="any"
                required
                value={form.units_received}
                onChange={(event) =>
                  setForm({
                    ...form,
                    units_received: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              Units Sold
              <input
                type="number"
                min="0"
                step="any"
                required
                value={form.units_sold}
                onChange={(event) =>
                  setForm({
                    ...form,
                    units_sold: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              Unit Price (₹)
              <input
                type="number"
                min="0"
                step="any"
                required
                value={form.unit_price}
                readOnly
              />
            </label>

            <label>
              Discount (%)
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                required
                value={form.discount_pct}
                onChange={(event) =>
                  setForm({
                    ...form,
                    discount_pct: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              Days to Expiry
              <input
                type="number"
                required
                value={form.days_to_expiry}
                onChange={(event) =>
                  setForm({
                    ...form,
                    days_to_expiry: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              Temperature (°C)
              <input
                type="number"
                step="any"
                required
                value={form.temperature_c}
                onChange={(event) =>
                  setForm({
                    ...form,
                    temperature_c: Number(event.target.value),
                  })
                }
              />
            </label>

            <label>
              Inventory Date
              <input
                type="date"
                required
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </label>

            <div className="inventory-form-actions">
              <button
                type="submit"
                className="refresh-button"
                disabled={
                  saving ||
                  productsLoading ||
                  products.length === 0 ||
                  !selectedProductId
                }
              >
                {saving ? 'Saving...' : 'Save Inventory'}
              </button>

              <button
                type="button"
                className="refresh-button"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="inventory-summary">
        <article className="inventory-summary-card">
          <span className="inventory-summary-icon">
            <Boxes size={20} />
          </span>
          <div>
            <p>Inventory entries</p>
            <h2>{records.length}</h2>
          </div>
        </article>

        <article className="inventory-summary-card">
          <span className="inventory-summary-icon stock">
            <Boxes size={20} />
          </span>
          <div>
            <p>Recorded stock units</p>
            <h2>
              {totalStock.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </h2>
          </div>
        </article>

        <article className="inventory-summary-card">
          <span className="inventory-summary-icon expiry">
            <CalendarClock size={20} />
          </span>
          <div>
            <p>Entries expiring soon</p>
            <h2>{expiryCount}</h2>
          </div>
        </article>
      </section>

      <section
        className="inventory-analytics-grid"
        aria-label="Inventory analytics"
      >
        <article className="inventory-analytics-panel">
          <div className="inventory-analytics-heading">
            <div>
              <span className="inventory-analytics-kicker">STOCK BREAKDOWN</span>
              <h2>Stock by Product</h2>
              <p>
                Available units summed from saved records and matched by
                catalogue product ID.
              </p>
            </div>
            <span className="inventory-analytics-icon">
              <BarChart3 size={19} aria-hidden="true" />
            </span>
          </div>

          {loading && records.length === 0 ? (
            <div className="inventory-chart-state" role="status">
              Loading inventory data...
            </div>
          ) : error ? (
            <div className="inventory-chart-state" role="alert">
              Stock by product is unavailable until inventory data loads.
            </div>
          ) : productsLoading ? (
            <div className="inventory-chart-state" role="status">
              Verifying product catalogue matches...
            </div>
          ) : productDataError ? (
            <div className="inventory-chart-state" role="alert">
              Product catalogue is unavailable. Product matches cannot be
              verified.
            </div>
          ) : stockByProduct.length === 0 ? (
            <div className="inventory-chart-state">
              No inventory records to chart.
            </div>
          ) : (
            <>
              <div
                className="inventory-stock-chart"
                style={{
                  height: `${Math.max(260, stockByProduct.length * 36)}px`,
                }}
                role="img"
                aria-label="Horizontal bar chart of available stock by catalogue product. Unmatched product IDs are labeled explicitly."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stockByProduct}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                    barCategoryGap="24%"
                  >
                    <CartesianGrid
                      stroke="#e9f0e9"
                      strokeDasharray="3 5"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#7b8a80', fontSize: 10 }}
                      tickFormatter={(value: number) =>
                        Number(value).toLocaleString('en-IN')
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#43564a', fontSize: 11 }}
                      width={172}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(54, 162, 105, 0.08)' }}
                      contentStyle={{
                        border: '1px solid #dce9dd',
                        borderRadius: 10,
                        backgroundColor: '#fff',
                        color: '#30473a',
                        boxShadow: '0 8px 24px rgba(28, 68, 45, 0.1)',
                      }}
                      formatter={(value) => [formatStock(Number(value)), 'Available stock']}
                    />
                    <Bar
                      dataKey="stock"
                      name="Available stock"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={28}
                    >
                      {stockByProduct.map((item) => (
                        <Cell
                          key={item.productId}
                          fill={item.isMatched ? '#36a269' : '#f0a52b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {stockByProduct.some((item) => !item.isMatched) && (
                <p className="inventory-chart-note">
                  Unmatched product IDs are shown separately and are not
                  assigned to catalogue products.
                </p>
              )}
            </>
          )}
        </article>

        <article className="inventory-analytics-panel">
          <div className="inventory-analytics-heading">
            <div>
              <span className="inventory-analytics-kicker">EXPIRY STATUS</span>
              <h2>Expiry Status Distribution</h2>
              <p>
                Remaining stock grouped by each record’s saved days-to-expiry
                value.
              </p>
            </div>
            <span className="inventory-analytics-icon inventory-analytics-icon-orange">
              <PieChartIcon size={19} aria-hidden="true" />
            </span>
          </div>

          {loading && records.length === 0 ? (
            <div className="inventory-chart-state" role="status">
              Loading inventory data...
            </div>
          ) : error ? (
            <div className="inventory-chart-state" role="alert">
              Expiry status distribution is unavailable until inventory data
              loads.
            </div>
          ) : visibleExpiryDistribution.length === 0 ? (
            <div className="inventory-chart-state">
              No remaining stock to chart.
            </div>
          ) : (
            <div className="inventory-expiry-chart-layout">
              <div
                className="inventory-expiry-chart"
                role="img"
                aria-label="Doughnut chart of remaining stock by expiry status: available, expiring soon, and expired."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={visibleExpiryDistribution}
                      dataKey="stock"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={3}
                    >
                      {visibleExpiryDistribution.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        border: '1px solid #dce9dd',
                        borderRadius: 10,
                        backgroundColor: '#fff',
                        color: '#30473a',
                        boxShadow: '0 8px 24px rgba(28, 68, 45, 0.1)',
                      }}
                      formatter={(value, name) => [
                        formatStock(Number(value)),
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="inventory-expiry-legend">
                {expiryStockDistribution.map((item) => (
                  <div key={item.name}>
                    <span>
                      <i style={{ backgroundColor: item.fill }} />
                      {item.name}
                    </span>
                    <strong>{formatStock(item.stock)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="inventory-chart-note">
            Expired: 0 or fewer days; Expiring Soon: 1–3 days; Available: more
            than 3 days.
          </p>
        </article>
      </section>

      <section className="inventory-table-panel">
        <div className="inventory-table-heading">
          <div>
            <h2>Saved inventory records</h2>
            <p>Data retrieved from your WASTE WISE AI database</p>
          </div>

          <label className="inventory-search">
            <Search size={17} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, category, date..."
              aria-label="Search inventory records"
            />
          </label>
        </div>

        {error && (
          <div className="dashboard-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" onClick={() => void loadInventory()}>
              Try again
            </button>
          </div>
        )}

        {loading ? (
          <div className="dashboard-loading" role="status" aria-live="polite">
            Loading inventory records...
          </div>
        ) : error ? (
          <div className="inventory-empty">
            <AlertCircle size={32} aria-hidden="true" />
            <h3>Inventory is unavailable</h3>
            <p>Reconnect to the backend and retry to view saved records.</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="inventory-empty">
            <Boxes size={32} aria-hidden="true" />
            <h3>No inventory records found</h3>
            <p>
              {records.length === 0
                ? 'Saved inventory records will appear here after you make a prediction.'
                : 'Try another search term.'}
            </p>
          </div>
        ) : (
          <div className="inventory-table-scroll">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Available stock</th>
                  <th>Expiry</th>
                  <th>Temperature</th>
                  <th>Predicted waste</th>
                  <th>Inventory date</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((item) => (
                  <tr key={item.inventory_id}>
                    <td>
                      INV-{String(item.inventory_id).padStart(3, '0')}
                    </td>

                    <td>
                      <strong>
                        {item.product_name ||
                          `Unmatched product (ID: ${item.product_id})`}
                      </strong>
                      <span className="inventory-subtext">
                        ₹{item.unit_price.toFixed(2)} per unit
                      </span>
                    </td>

                    <td>
                      <span className="category-chip">{item.category}</span>
                    </td>

                    <td>
                      <strong>
                        {Math.max(
                          0,
                          item.opening_stock +
                            item.units_received -
                            item.units_sold,
                        ).toLocaleString('en-IN', {
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                      <span className="inventory-subtext">
                        Opening {item.opening_stock} + received{' '}
                        {item.units_received} − sold {item.units_sold}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`expiry-chip ${
                          item.days_to_expiry <= 1
                            ? 'urgent'
                            : item.days_to_expiry <= 3
                              ? 'soon'
                              : 'safe'
                        }`}
                      >
                        {item.days_to_expiry < 0
                          ? `${Math.abs(item.days_to_expiry)} days past`
                          : item.days_to_expiry === 0
                            ? 'Expires today'
                            : `${item.days_to_expiry} days left`}
                      </span>
                    </td>

                    <td>
                      <span className="temperature-value">
                        <Thermometer size={14} />
                        {item.temperature_c.toFixed(1)}°C
                      </span>
                    </td>

                    <td>
                      {item.predicted_waste_units === null
                        ? 'Not predicted'
                        : `${item.predicted_waste_units.toFixed(2)} units`}
                    </td>

                    <td>{item.inventory_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="inventory-table-footer">
          Showing {filteredRecords.length} of {records.length} records
        </div>
      </section>

      <p className="inventory-disclaimer">
        Expiry indicators use the days-to-expiry value recorded with each entry.
        They do not automatically update as time passes. Predicted waste is an
        estimate, not a measured quantity of actual waste.
      </p>
    </main>
  )
}
