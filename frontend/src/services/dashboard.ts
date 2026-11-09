
import api from './api'

export interface RecentPrediction {
  prediction_id: number
  inventory_id: number
  product_id: number
  predicted_waste_units: number
  model_type: string
  prediction_note: string
  created_at: string | null
}

export interface RecentSale {
  sale_id: number
  product_id: number
  quantity: number
  unit_price: number
  total_amount: number
  sale_date: string
  created_at: string | null
}

export interface DashboardSummary {
  active_products: number
  inventory_records: number
  total_predictions: number
  total_predicted_waste_units: number
  recent_predictions: RecentPrediction[]

  sales_count: number
  total_sales_revenue: number
  total_quantity_sold: number
  recent_sales: RecentSale[]
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get<DashboardSummary>('/dashboard/summary')
  return response.data
}
