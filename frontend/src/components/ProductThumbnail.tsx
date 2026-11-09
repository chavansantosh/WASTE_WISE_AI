import { useState } from 'react'
import { getProductImagePath } from '../services/productImages'

interface ProductThumbnailProps {
  productId: number
  productName: string
  className: string
  decorative?: boolean
}

export default function ProductThumbnail({
  productId,
  productName,
  className,
  decorative = false,
}: ProductThumbnailProps) {
  const imagePath = getProductImagePath(productId)
  const [failedImagePath, setFailedImagePath] = useState<string | null>(null)
  const hasFailed = failedImagePath === imagePath

  return (
    <span
      className={`product-thumbnail ${className}`}
      aria-label={hasFailed ? `${productName} photo unavailable` : undefined}
    >
      {hasFailed ? (
        <span className="product-thumbnail-fallback">Photo unavailable</span>
      ) : (
        <img
          src={imagePath}
          alt={decorative ? '' : `${productName} photo`}
          onError={() => setFailedImagePath(imagePath)}
        />
      )}
    </span>
  )
}
