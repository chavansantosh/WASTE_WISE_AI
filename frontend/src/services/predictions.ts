
import api from './api'

// Sales transaction interface
export interface Sale {
  id: number
  product_id: number
  quantity: number
  unit_price: number
  total_amount: number
  sale_date: string
  created_at: string
}

export interface DailySalesRecord {
  product_id: number
  sale_date: string
  quantity_sold: number
  revenue: number
  transaction_count: number
}

export interface DailySalesSummary {
  total_product_days: number
  daily_sales: DailySalesRecord[]
}

// Fetch recorded sales
export async function getSales(): Promise<Sale[]> {
  const response = await api.get<Sale[]>('/sales?limit=500')
  return response.data
}

export async function getDailySalesSummary(): Promise<DailySalesSummary> {
  const response = await api.get<DailySalesSummary>('/forecasts/daily-summary')
  return response.data
}

// Individual forecast prediction
export interface DemandForecastItem {
  date: string
  predicted_units: number
}

// Complete demand forecast response
export interface DemandForecastResponse {
  product_id: number
  model_type: string
  forecast_horizon_days: number
  forecast_start_date: string
  forecast_end_date: string
  total_predicted_demand: number
  forecast: DemandForecastItem[]
  forecast_source: 'live_store_sales' | 'historical_demo'
}

export interface CatalogueForecastItem {
  product_id: number
  status: 'available' | 'unavailable'
  forecast: DemandForecastResponse | null
  unavailable_reason: string | null
}

export interface CatalogueForecastResponse {
  forecast_source: 'live_store_sales'
  forecast_horizon_days: number
  forecasts: CatalogueForecastItem[]
}

export interface HistoricalDemoForecastResponse {
  forecast_source: 'historical_demo'
  live_store_forecast: false
  dataset_rows: number
  dataset_start_date: string
  dataset_end_date: string
  product_ids: number[]
  forecasts: DemandForecastResponse[]
}

export async function getCatalogueDemandForecast(
  days: number,
): Promise<CatalogueForecastResponse> {
  const response = await api.get<CatalogueForecastResponse>(
    '/forecasts/catalogue',
    { params: { days } },
  )

  return response.data
}

export async function getHistoricalDemoForecasts(
  days: number,
): Promise<HistoricalDemoForecastResponse> {
  const response = await api.get<HistoricalDemoForecastResponse>(
    '/forecasts/historical-demo',
    { params: { days } },
  )

  return response.data
}

// Fetch one historical/demo forecast by model ID.
export async function getDemandForecast(
  productId: number,
  days: number,
): Promise<DemandForecastResponse> {
  const response = await api.get<DemandForecastResponse>(
    `/forecasts/model/${productId}`,
    {
      params: { days },
    },
  )

  return response.data
}
