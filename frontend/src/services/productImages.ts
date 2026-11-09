const PRODUCT_IMAGE_PATHS: Record<number, string> = {
  1: '/images/products/1.jpg',
  2001: '/images/products/2001.jpg',
  2003: '/images/products/2003.jpg',
  2004: '/images/products/2004.jpg',
  2005: '/images/products/2005.jpg',
  2006: '/images/products/2006.jpg',
  2007: '/images/products/2007.jpg',
  2008: '/images/products/2008.jpg',
  2009: '/images/products/2009.jpg',
  2010: '/images/products/2010.jpg',
  2011: '/images/products/2011.jpg',
  2012: '/images/products/2012.jpg',
  2013: '/images/products/2013.jpg',
  2014: '/images/products/2014.jpg',
  2015: '/images/products/2015.jpg',
  2016: '/images/products/2016.jpg',
  2017: '/images/products/2017.jpg',
  2018: '/images/products/2018.jpg',
  2019: '/images/products/2019.jpg',
  2020: '/images/products/2020.jpg',
  2021: '/images/products/2021.jpg',
  2022: '/images/products/2022.jpg',
  2023: '/images/products/2023.jpg',
  2024: '/images/products/2024.jpg',
  2025: '/images/products/2025.jpg',
  2026: '/images/products/2026.jpg',
}

export function getProductImagePath(productId: number): string {
  return PRODUCT_IMAGE_PATHS[productId] ?? '/images/products/1.jpg'
}
