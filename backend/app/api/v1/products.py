
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.product import Product

router = APIRouter(prefix="/api/v1/products", tags=["Products"])


class ProductCreate(BaseModel):
    product_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=100)
    unit_price: float = Field(ge=0, allow_inf_nan=False)


class ProductResponse(BaseModel):
    id: int
    product_id: int
    name: str
    category: str
    unit_price: float
    is_active: bool

    model_config = {"from_attributes": True}


@router.post("", response_model=ProductResponse, status_code=201)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Product)
        .filter(Product.product_id == data.product_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A product with this product_id already exists.",
        )

    product = Product(
        product_id=data.product_id,
        name=data.name.strip(),
        category=data.category.strip(),
        unit_price=data.unit_price,
        is_active=True,
    )

    if not product.name or not product.category:
        raise HTTPException(
            status_code=422,
            detail="Product name and category cannot be blank.",
        )

    try:
        db.add(product)
        db.commit()
        db.refresh(product)
        return product
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the product.",
        ) from exc


@router.get("", response_model=list[ProductResponse])
def list_products(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    query = db.query(Product)

    if not include_inactive:
        query = query.filter(Product.is_active.is_(True))

    return query.order_by(Product.name.asc()).all()


@router.patch("/{product_id}/deactivate", response_model=ProductResponse)
def deactivate_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(Product.product_id == product_id)
        .first()
    )

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")

    product.is_active = False
    db.commit()
    db.refresh(product)
    return product
