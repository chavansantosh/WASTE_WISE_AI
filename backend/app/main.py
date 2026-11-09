"""WASTE WISE AI - food waste prediction and inventory management API."""

import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env before importing application modules.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.api.v1.auth import router as auth_router
from app.models.user import User
from app.models.sales import Sale

from app.api.v1.company_profile import router as company_profile_router
from app.api.v1.model_metrics import router as model_metrics_router
from app.api.v1.products import router as products_router
from app.api.v1.risk import router as risk_router
from app.api.v1.sales import router as sales_router
from app.api.v1.forecasts import router as forecasts_router
from app.api.v1.waste import router as waste_router
from app.db.base import Base
from app.db.session import engine, get_db
from app.models.inventory import Inventory
from app.models.company_profile import CompanyProfile
from app.models.prediction import Prediction
from app.models.product import Product
from app.models.sales import Sale

# --------------------------------------------------------------------------
# Make the existing ML code importable
# --------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ML_SRC_PATH = PROJECT_ROOT / "ml" / "src"

if str(ML_SRC_PATH) not in sys.path:
    sys.path.insert(0, str(ML_SRC_PATH))

from predict import predict_waste  # noqa: E402  (needs the sys.path change above)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# App setup
# --------------------------------------------------------------------------
app = FastAPI(
    title="WASTE WISE AI",
    description="AI-powered food waste prediction and inventory management API",
    version="1.0.0",
)
app.include_router(products_router)
app.include_router(company_profile_router)
app.include_router(risk_router)
app.include_router(model_metrics_router)
app.include_router(auth_router)
app.include_router(sales_router)
app.include_router(forecasts_router)
app.include_router(waste_router)

# Create database tables when the application starts.
Base.metadata.create_all(bind=engine)


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class InventoryRecord(BaseModel):
    product_id: int
    category: str
    opening_stock: float = Field(ge=0)
    units_received: float = Field(ge=0)
    unit_price: float = Field(ge=0)
    units_sold: float = Field(default=0, ge=0)
    discount_pct: float = Field(ge=0, le=100)
    days_to_expiry: int
    temperature_c: float
    date: str


# The create endpoint accepts the same fields as the predict endpoint.
# This name was used but never defined in the original file.
class CreateInventoryRecord(InventoryRecord):
    pass


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def build_inventory(record: InventoryRecord) -> Inventory:
    """Convert a request body into an Inventory database row."""
    return Inventory(
        product_id=record.product_id,
        category=record.category,
        opening_stock=record.opening_stock,
        units_received=record.units_received,
        units_sold=record.units_sold,
        unit_price=record.unit_price,
        discount_pct=record.discount_pct,
        days_to_expiry=record.days_to_expiry,
        temperature_c=record.temperature_c,
        inventory_date=record.date,
    )


# --------------------------------------------------------------------------
# General routes
# --------------------------------------------------------------------------
@app.get("/")
def root():
    return {
        "message": "Welcome to WASTE WISE AI",
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy"}


# --------------------------------------------------------------------------
# Predictions
# --------------------------------------------------------------------------
@app.post("/api/v1/predict")
def predict_inventory_waste(
    record: InventoryRecord,
    db: Session = Depends(get_db),
):
    try:
        result = predict_waste(record.model_dump())

        inventory = build_inventory(record)
        db.add(inventory)
        db.flush()  # assigns inventory.id without committing yet

        prediction = Prediction(
            inventory_id=inventory.id,
            product_id=record.product_id,
            predicted_waste_units=result["predicted_waste_units"],
            model_type=result["model_type"],
            prediction_note=result["prediction_note"],
        )
        db.add(prediction)
        db.commit()
        db.refresh(prediction)

        return {
            "product_id": record.product_id,
            **result,
            "prediction_id": prediction.id,
            "inventory_id": inventory.id,
            "saved_to_database": True,
        }

    except (ValueError, TypeError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to save prediction")
        raise HTTPException(
            status_code=500,
            detail="Could not save the prediction to the database.",
        ) from exc


# --------------------------------------------------------------------------
# Dashboard

# --------------------------------------------------------------------------
@app.get("/api/v1/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    active_products = (
        db.query(Product).filter(Product.is_active.is_(True)).count()
    )
    inventory_records = db.query(Inventory).count()
    total_predictions = db.query(Prediction).count()

    total_predicted_waste = db.query(
        func.coalesce(func.sum(Prediction.predicted_waste_units), 0.0)
    ).scalar()

    # Sales summary
    sales_count = db.query(Sale).count()

    total_sales_revenue = db.query(
        func.coalesce(func.sum(Sale.total_amount), 0.0)
    ).scalar()

    total_quantity_sold = db.query(
        func.coalesce(func.sum(Sale.quantity), 0.0)
    ).scalar()

    recent_sales = (
        db.query(Sale)
        .order_by(Sale.id.desc())
        .limit(5)
        .all()
    )

    recent_sales_records = [
        {
            "sale_id": sale.id,
            "product_id": sale.product_id,
            "quantity": sale.quantity,
            "unit_price": sale.unit_price,
            "total_amount": sale.total_amount,
            "sale_date": sale.sale_date,
            "created_at": sale.created_at,
        }
        for sale in recent_sales
    ]

    recent_records = (
        db.query(Prediction).order_by(Prediction.id.desc()).limit(5).all()
    )

    recent_predictions = [
        {
            "prediction_id": prediction.id,
            "inventory_id": prediction.inventory_id,
            "product_id": prediction.product_id,
            "predicted_waste_units": prediction.predicted_waste_units,
            "model_type": prediction.model_type,
            "prediction_note": prediction.prediction_note,
            "created_at": prediction.created_at,
        }
        for prediction in recent_records
    ]

    return {
        "active_products": active_products,
        "inventory_records": inventory_records,
        "total_predictions": total_predictions,
        "total_predicted_waste_units": round(
            float(total_predicted_waste or 0), 2
        ),
        "recent_predictions": recent_predictions,
        "sales_count": sales_count,
        "total_sales_revenue": round(float(total_sales_revenue or 0), 2),
        "total_quantity_sold": round(float(total_quantity_sold or 0), 2),
        "recent_sales": recent_sales_records,
    }

# --------------------------------------------------------------------------
# Inventory
# --------------------------------------------------------------------------
@app.get("/api/v1/inventory")
def get_inventory_records(db: Session = Depends(get_db)):
    # Find the latest prediction for each inventory record.
    latest = (
        db.query(
            Prediction.inventory_id.label("inventory_id"),
            func.max(Prediction.id).label("prediction_id"),
        )
        .group_by(Prediction.inventory_id)
        .subquery()
    )

    # Match inventory records with products using product_id.
    rows = (
        db.query(Inventory, Prediction, Product.name)
        .outerjoin(latest, latest.c.inventory_id == Inventory.id)
        .outerjoin(Prediction, Prediction.id == latest.c.prediction_id)
        .outerjoin(
            Product,
            Inventory.product_id == Product.product_id,
        )
        .order_by(Inventory.id.desc())
        .all()
    )

    return [
        {
            "inventory_id": item.id,
            "product_id": item.product_id,
            "product_name": product_name,
            "category": item.category,
            "opening_stock": item.opening_stock,
            "units_received": item.units_received,
            "units_sold": item.units_sold,
            "unit_price": item.unit_price,
            "discount_pct": item.discount_pct,
            "days_to_expiry": item.days_to_expiry,
            "temperature_c": item.temperature_c,
            "inventory_date": item.inventory_date,
            "created_at": item.created_at,
            "predicted_waste_units": (
                prediction.predicted_waste_units if prediction else None
            ),
            "prediction_note": (
                prediction.prediction_note if prediction else None
            ),
        }
        for item, prediction, product_name in rows
    ]


@app.post("/api/v1/inventory")
def create_inventory_record(
    record: CreateInventoryRecord,
    db: Session = Depends(get_db),
):
    try:
        inventory = build_inventory(record)
        db.add(inventory)
        db.commit()
        db.refresh(inventory)

        return {
            "message": "Inventory record saved successfully",
            "inventory_id": inventory.id,
            "product_id": inventory.product_id,
        }

    except Exception as exc:
        db.rollback()
        logger.exception("Failed to save inventory record")
        raise HTTPException(
            status_code=500,
            detail="Could not save the inventory record.",
        ) from exc