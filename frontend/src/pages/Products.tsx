
import { useEffect, useState } from 'react'
import { Package, Plus, RefreshCw, Search } from 'lucide-react'
import {
  createProduct,
  getProducts,
  type Product,
} from '../services/products'
import ProductThumbnail from '../components/ProductThumbnail'
import api from '../services/api'
import {
  getInventoryRecords,
  getProductAvailability,
  type InventoryRecord,
} from '../services/inventory'

interface RecordedSale {
  id: number
  product_id: number
  quantity: number
  total_amount: number
}

interface ProductSalesSummary {
  transactions: number
  units: number
  revenue: number
}

const DEMO_RATINGS: Record<number, number> = {
  1: 4.6,
  2001: 4.8,
  2003: 4.4,
  2004: 4.7,
  2005: 4.8,
  2006: 4.5,
  2007: 4.3,
  2008: 4.6,
  2009: 4.2,
  2010: 4.4,
  2011: 4.3,
  2012: 4.8,
  2013: 4.7,
  2014: 4.5,
  2015: 4.6,
  2016: 4.9,
  2017: 4.6,
  2018: 4.8,
  2019: 4.5,
  2020: 4.7,
  2021: 4.4,
  2022: 4.6,
  2023: 4.5,
  2024: 4.3,
  2025: 4.2,
  2026: 4.4,
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

const formatQuantity = (quantity: number) =>
  quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })

function normalizeCategory(category: string): string {
  const normalized = category.trim().toLowerCase()

  if (normalized === 'vegetable' || normalized === 'vegetables') {
    return 'Vegetables'
  }
  if (normalized === 'beverage' || normalized === 'beverages') {
    return 'Beverages'
  }

  return category.trim()
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<RecordedSale[]>([])
  const [inventory, setInventory] = useState<InventoryRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(true)
  const [error, setError] = useState('')
  const [salesError, setSalesError] = useState('')
  const [inventoryError, setInventoryError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [form, setForm] = useState({
    product_id: '',
    name: '',
    category: 'Dairy',
    unit_price: '',
  })

  async function loadProducts() {
    setLoading(true)
    setError('')

    try {
      const data = await getProducts()
      setProducts(data)
    } catch {
      setError('Could not load products. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  async function loadSales() {
    setSalesLoading(true)
    setSalesError('')

    try {
      const pageSize = 500
      const allSales: RecordedSale[] = []
      let offset = 0

      while (true) {
        const response = await api.get<RecordedSale[]>('/sales', {
          params: { limit: pageSize, offset },
        })
        allSales.push(...response.data)

        if (response.data.length < pageSize) break
        offset += response.data.length
      }

      setSales(allSales)
    } catch {
      setSalesError('Recorded sales could not be loaded. Please try again.')
    } finally {
      setSalesLoading(false)
    }
  }

  async function loadInventory() {
    setInventoryError('')

    try {
      setInventory(await getInventoryRecords())
    } catch {
      setInventory(null)
      setInventoryError('Inventory could not be loaded; availability is unknown.')
    }
  }

  useEffect(() => {
    void loadProducts()
    void loadSales()
    void loadInventory()
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError('')

    try {
      await createProduct({
        product_id: Number(form.product_id),
        name: form.name.trim(),
        category: form.category.trim(),
        unit_price: Number(form.unit_price),
      })

      setForm({
        product_id: '',
        name: '',
        category: 'Dairy',
        unit_price: '',
      })
      setShowForm(false)
      await loadProducts()
    } catch (err: unknown) {
      const message =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof err.response === 'object' &&
        err.response !== null &&
        'data' in err.response &&
        typeof err.response.data === 'object' &&
        err.response.data !== null &&
        'detail' in err.response.data &&
        typeof err.response.data.detail === 'string'
          ? err.response.data.detail
          : 'Could not save the product. Please try again.'

      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  const categories = Array.from(
    new Set(products.map((product) => normalizeCategory(product.category))),
  ).sort((left, right) => left.localeCompare(right))
  const filteredProducts = products.filter((product) => {
    const normalizedCategory = normalizeCategory(product.category)
    const matchesSearch = `${product.name} ${product.category} ${normalizedCategory} ${product.product_id}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())

    return (
      matchesSearch &&
      (!categoryFilter || normalizedCategory === categoryFilter)
    )
  })
  const salesByProduct = sales.reduce<Map<number, ProductSalesSummary>>(
    (summaries, sale) => {
      const summary = summaries.get(sale.product_id) ?? {
        transactions: 0,
        units: 0,
        revenue: 0,
      }
      summary.transactions += 1
      summary.units += sale.quantity
      summary.revenue += sale.total_amount
      summaries.set(sale.product_id, summary)
      return summaries
    },
    new Map(),
  )
  const availabilityByProduct = getProductAvailability(inventory)

  return (
    <main className="products-page">
      <section className="products-heading">
        <div>
          <p className="eyebrow">INVENTORY MANAGEMENT</p>
          <h1>Products</h1>
          <p className="page-description">
            Manage your product catalogue and pricing.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setFormError('')
            setShowForm(!showForm)
          }}
        >
          <Plus size={18} />
          Add product
        </button>
      </section>

      <section className="product-summary">
        <div className="summary-icon">
          <Package size={24} aria-hidden="true" />
        </div>
        <div>
          <p>Total active products</p>
          <h2>
            {loading || (error && products.length === 0)
              ? '—'
              : products.length.toLocaleString('en-IN')}
          </h2>
        </div>
      </section>

      {showForm && (
        <section className="product-form-card">
          <h2>Add a new product</h2>

          <form onSubmit={handleSubmit} className="product-form">
            <label>
              Product ID
              <input
                type="number"
                min="1"
                required
                value={form.product_id}
                onChange={(event) =>
                  setForm({ ...form, product_id: event.target.value })
                }
                placeholder="e.g. 2002"
              />
            </label>

            <label>
              Product name
              <input
                required
                maxLength={150}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="e.g. Fresh Bread"
              />
            </label>

            <label>
              Category
              <input
                required
                maxLength={100}
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
                placeholder="e.g. Bakery"
              />
            </label>

            <label>
              Unit price (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.unit_price}
                onChange={(event) =>
                  setForm({ ...form, unit_price: event.target.value })
                }
                placeholder="e.g. 40"
              />
            </label>

            {formError && <p className="error-message">{formError}</p>}

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save product'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="product-table-card">
        <div className="table-heading">
          <div>
            <h2>Product catalogue</h2>
            <p>Products saved in your database</p>
            <p className="product-data-note">
              Ratings are sample values, not customer reviews. Availability is
              unknown until current-stock data is defined.
            </p>
          </div>

          <button
            className="icon-button"
            onClick={() => {
              void loadProducts()
              void loadSales()
            }}
            title="Refresh products and sales"
            aria-label="Refresh products and sales"
            disabled={loading || salesLoading}
          >
          <RefreshCw
            size={18}
            aria-hidden="true"
            className={loading || salesLoading ? 'icon-spin' : undefined}
          />
          </button>
        </div>

        {salesError && (
          <p className="product-sales-error" role="alert">
            {salesError}
          </p>
        )}

        <div className="product-filter-controls">
          <div className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
            />
          </div>
          <label className="category-filter">
            <span>Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filter products by category"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="empty-state" role="status" aria-live="polite">
            Loading products...
          </p>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadProducts()}
            >
              Try again
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package size={32} aria-hidden="true" />
            <p>
              {search || categoryFilter
                ? 'No matching products found.'
                : 'No products yet.'}
            </p>
            {!search && !categoryFilter && (
              <span>Add your first product to get started.</span>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Product ID</th>
                  <th>Category</th>
                  <th>Selling price</th>
                  <th>Demo rating</th>
                  <th>Recorded sales</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const salesSummary = salesByProduct.get(product.product_id)
                  const availability =
                    availabilityByProduct.get(product.product_id)?.status ??
                    'Unknown'

                  return (
                    <tr key={product.id}>
                      <td className="product-name-cell">
                        <ProductThumbnail
                          className="product-avatar"
                          productId={product.product_id}
                          productName={product.name}
                        />
                        <span>{product.name}</span>
                      </td>
                      <td>{product.product_id}</td>
                      <td>{normalizeCategory(product.category)}</td>
                      <td>{formatCurrency(product.unit_price)}</td>
                      <td>
                        <span className="product-rating">
                          <span aria-hidden="true">★</span>{' '}
                          {DEMO_RATINGS[product.product_id]?.toFixed(1) ?? '—'}
                          <small>Sample</small>
                        </span>
                      </td>
                      <td>
                        {salesLoading ? (
                          <span className="product-sales-muted">Loading…</span>
                        ) : salesError ? (
                          <span className="product-sales-muted">
                            Unavailable
                          </span>
                        ) : salesSummary ? (
                          <span className="product-sales-summary">
                            <strong>
                              {formatQuantity(salesSummary.units)} units
                            </strong>
                            <small>
                              {formatCurrency(salesSummary.revenue)} ·{' '}
                              {salesSummary.transactions} transactions
                            </small>
                          </span>
                        ) : (
                          <span className="product-sales-muted">
                            No recorded sales
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`availability-${availability
                            .toLowerCase()
                            .replaceAll(' ', '-')}`}
                          title={
                            inventoryError ||
                            (availability === 'Unknown'
                              ? 'No matching inventory record is available.'
                              : undefined)
                          }
                        >
                          {availability}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
