
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.product import Product
from app.models.sales import Sale

router = APIRouter(
    prefix="/api/v1/sales",
    tags=["Sales History"],
)


class SaleCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: float = Field(gt=0, allow_inf_nan=False)
    sale_date: datetime | None = None


class SaleResponse(BaseModel):
    id: int
    product_id: int
    quantity: float
    unit_price: float
    total_amount: float
    sale_date: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=SaleResponse, status_code=201)
def create_sale(
    data: SaleCreate,
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(
            Product.product_id == data.product_id,
            Product.is_active.is_(True),
        )
        .first()
    )

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Active product not found.",
        )

    unit_price = float(product.unit_price)
    total_amount = round(data.quantity * unit_price, 2)
    sale_date = (
        data.sale_date or datetime.now(timezone.utc)
    ).isoformat()

    sale = Sale(
        product_id=product.product_id,
        quantity=data.quantity,
        unit_price=unit_price,
        total_amount=total_amount,
        sale_date=sale_date,
    )

    try:
        db.add(sale)
        db.commit()
        db.refresh(sale)
        return sale
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the sale.",
        ) from exc


@router.get("", response_model=list[SaleResponse])
def list_sales(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return (
        db.query(Sale)
        .order_by(Sale.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{sale_id}", response_model=SaleResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()

    if sale is None:
        raise HTTPException(
            status_code=404,
            detail="Sale not found.",
        )

    return sale
