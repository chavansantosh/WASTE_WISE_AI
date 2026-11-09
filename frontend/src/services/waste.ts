import api from './api'

export interface WasteReportSummary {
  prediction_count: number
  predicted_waste_units: number
  average_predicted_waste_units: number
}

export interface MonthlyWasteTrend {
  month: string
  prediction_count: number
  predicted_waste_units: number
}

export interface WasteProductBreakdown {
  product_id: number
  product_name: string | null
  prediction_count: number
  predicted_waste_units: number
}

export interface WasteModelBreakdown {
  model_type: string
  prediction_count: number
  predicted_waste_units: number
}

export interface WastePredictionRecord {
  prediction_id: number
  inventory_id: number
  product_id: number
  product_name: string | null
  predicted_waste_units: number
  model_type: string
  prediction_note: string
  created_at: string | null
}

export interface WasteReport {
  summary: WasteReportSummary
  monthly_trend: MonthlyWasteTrend[]
  product_breakdown: WasteProductBreakdown[]
  model_breakdown: WasteModelBreakdown[]
  recent_predictions: WastePredictionRecord[]
  is_estimate: true
}

export async function getWasteReport(
  limit = 100,
): Promise<WasteReport> {
  const response = await api.get<WasteReport>('/waste/report', {
    params: { limit },
  })
  return response.data
}
