
import api from './api'

export interface Product {
  id: number
  product_id: number
  name: string
  category: string
  unit_price: number
  is_active: boolean
}

export interface ProductCreate {
  product_id: number
  name: string
  category: string
  unit_price: number
}

export async function getProducts(
  includeInactive = false,
): Promise<Product[]> {
  const response = await api.get<Product[]>('/products', {
    params: { include_inactive: includeInactive },
  })
  return response.data
}

export async function createProduct(
  product: ProductCreate,
): Promise<Product> {
  const response = await api.post<Product>('/products', product)
  return response.data
}

export async function deactivateProduct(
  productId: number,
): Promise<Product> {
  const response = await api.patch<Product>(
    `/products/${productId}/deactivate`,
  )
  return response.data
}
