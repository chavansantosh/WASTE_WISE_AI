
import api from './api'

export interface ExpiryRiskAlert {
  inventory_id: number
  product_id: number
  category: string
  remaining_stock: number
  days_to_expiry: number
  expiry_risk: 'Critical' | 'High' | 'Medium' | 'Low'
  action_required: boolean
  recommended_action: string
}

export interface ExpiryRiskResponse {
  total_records: number
  critical_count: number
  high_count: number
  action_required_count: number
  alerts: ExpiryRiskAlert[]
}

export async function getExpiryRisk(): Promise<ExpiryRiskResponse> {
  const response = await api.get<ExpiryRiskResponse>('/risk/expiry')
  return response.data
}
