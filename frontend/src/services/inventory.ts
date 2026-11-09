
import api from './api'

export interface InventoryRecord {
  inventory_id: number
  product_id: number
  product_name?: string | null
  category: string
  opening_stock: number
  units_received: number
  units_sold: number
  unit_price: number
  discount_pct: number
  days_to_expiry: number
  temperature_c: number
  inventory_date: string
  created_at: string | null
  predicted_waste_units: number | null
  prediction_note: string | null
}

export type ProductAvailabilityStatus =
  | 'In Stock'
  | 'Low Stock'
  | 'Out of Stock'
  | 'Unknown'

export interface ProductAvailability {
  status: ProductAvailabilityStatus
  availableStock?: number
}

export const LOW_STOCK_THRESHOLD = 5

export function getProductAvailability(
  records: InventoryRecord[] | null,
): Map<number, ProductAvailability> {
  const latestRecords = new Map<number, InventoryRecord>()

  for (const record of records ?? []) {
    const latest = latestRecords.get(record.product_id)
    if (
      !latest ||
      record.inventory_date > latest.inventory_date ||
      (record.inventory_date === latest.inventory_date &&
        (record.created_at ?? '') > (latest.created_at ?? '')) ||
      (record.inventory_date === latest.inventory_date &&
        record.created_at === latest.created_at &&
        record.inventory_id > latest.inventory_id)
    ) {
      latestRecords.set(record.product_id, record)
    }
  }

  const availabilityByProduct = new Map<number, ProductAvailability>()

  for (const [productId, record] of latestRecords) {
    const stockValues = [
      record.opening_stock,
      record.units_received,
      record.units_sold,
    ]
    if (!stockValues.every(Number.isFinite)) {
      availabilityByProduct.set(productId, { status: 'Unknown' })
      continue
    }

    const availableStock =
      record.opening_stock + record.units_received - record.units_sold
    const status: ProductAvailabilityStatus =
      availableStock <= 0
        ? 'Out of Stock'
        : availableStock <= LOW_STOCK_THRESHOLD
          ? 'Low Stock'
          : 'In Stock'

    availabilityByProduct.set(productId, { status, availableStock })
  }

  return availabilityByProduct
}

export async function getInventoryRecords(): Promise<InventoryRecord[]> {
  const response = await api.get<InventoryRecord[]>('/inventory')
  return response.data
}

export interface CreateInventoryInput {
  product_id: number
  category: string
  opening_stock: number
  units_received: number
  units_sold: number
  unit_price: number
  discount_pct: number
  days_to_expiry: number
  temperature_c: number
  date: string
}

export async function createInventoryRecord(
  record: CreateInventoryInput,
): Promise<{ message: string; inventory_id: number; product_id: number }> {
  const response = await api.post('/inventory', record)
  return response.data
}
