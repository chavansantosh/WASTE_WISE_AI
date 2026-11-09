import api from './api'

export interface CompanyProfile {
  id: number
  company_name: string
  tagline: string
  logo_url: string
  hero_photo_url: string
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  id: 1,
  company_name: 'Sunrise Mart',
  tagline: 'Freshness Every Day',
  logo_url: '/assets/sunrise-mart-logo.svg',
  hero_photo_url: '/assets/dashboard-produce-photo.jpg',
}

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const response = await api.get<CompanyProfile>('/company-profile')
  return response.data
}

export async function saveCompanyProfile(
  profile: Pick<CompanyProfile, 'company_name' | 'tagline'> & {
    logo?: File
    hero_photo?: File
  },
): Promise<CompanyProfile> {
  const formData = new FormData()
  formData.append('company_name', profile.company_name)
  formData.append('tagline', profile.tagline)
  if (profile.logo) formData.append('logo', profile.logo)
  if (profile.hero_photo) formData.append('hero_photo', profile.hero_photo)

  const response = await api.put<CompanyProfile>(
    '/company-profile',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return response.data
}
