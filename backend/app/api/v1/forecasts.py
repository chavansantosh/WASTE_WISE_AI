from functools import lru_cache
import math
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.product import Product
from app.models.sales import Sale

router = APIRouter(
    prefix="/api/v1/forecasts",
    tags=["Demand Forecasting"],
)

PROJECT_ROOT = Path(__file__).resolve().parents[4]

MODEL_PATH = (
    PROJECT_ROOT
    / "ml"
    / "artifacts"
    / "demand_forecast_models.joblib"
)

DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

LIVE_MODEL_PATH = (
    PROJECT_ROOT
    / "ml"
    / "artifacts"
    / "live_demand_forecast_models.joblib"
)


class ForecastDayResponse(BaseModel):
    date: str
    predicted_units: float


class DemandForecastResponse(BaseModel):
    product_id: int
    model_type: str
    forecast_horizon_days: int
    forecast_start_date: str
    forecast_end_date: str
    total_predicted_demand: float
    forecast: list[ForecastDayResponse]
    forecast_source: Literal["live_store_sales", "historical_demo"]


class CatalogueForecastItem(BaseModel):
    product_id: int
    status: Literal["available", "unavailable"]
    forecast: DemandForecastResponse | None
    unavailable_reason: str | None


class CatalogueForecastResponse(BaseModel):
    forecast_source: Literal["live_store_sales"]
    forecast_horizon_days: int
    forecasts: list[CatalogueForecastItem]


class HistoricalDemoForecastResponse(BaseModel):
    forecast_source: Literal["historical_demo"]
    live_store_forecast: Literal[False]
    dataset_rows: int
    dataset_start_date: str
    dataset_end_date: str
    product_ids: list[int]
    forecasts: list[DemandForecastResponse]


@lru_cache(maxsize=1)
def _load_historical_bundle() -> dict:
    if not MODEL_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="Historical demand forecast model file not found.",
        )

    bundle = joblib.load(MODEL_PATH)
    if (
        not isinstance(bundle, dict)
        or not isinstance(bundle.get("models"), dict)
        or not isinstance(bundle.get("features"), list)
        or not isinstance(bundle.get("model_type"), str)
    ):
        raise HTTPException(
            status_code=500,
            detail="Historical demand forecast model file is invalid.",
        )

    return bundle


@lru_cache(maxsize=1)
def _load_historical_dataset() -> pd.DataFrame:
    if not DATA_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="Historical demand forecast dataset not found.",
        )

    data = pd.read_csv(DATA_PATH, parse_dates=["date"])
    if not {"date", "product_id"}.issubset(data.columns):
        raise HTTPException(
            status_code=500,
            detail="Historical demand forecast dataset is invalid.",
        )

    return data


@lru_cache(maxsize=1)
def _load_live_bundle() -> dict | None:
    if not LIVE_MODEL_PATH.exists():
        return None

    bundle = joblib.load(LIVE_MODEL_PATH)
    if (
        not isinstance(bundle, dict)
        or bundle.get("forecast_source") != "live_store_sales"
        or not isinstance(bundle.get("models"), dict)
        or not isinstance(bundle.get("features"), list)
        or not isinstance(bundle.get("model_type"), str)
    ):
        raise HTTPException(
            status_code=500,
            detail=(
                "Live demand model bundle must include verified "
                "live_store_sales provenance."
            ),
        )

    return bundle


def _build_forecast(
    product_id: int,
    days: int,
    bundle: dict,
    forecast_source: Literal["live_store_sales", "historical_demo"],
) -> DemandForecastResponse:
    future_dates = pd.date_range(
        start=pd.Timestamp.today().normalize() + pd.Timedelta(days=1),
        periods=days,
        freq="D",
    )
    future = pd.DataFrame({"date": future_dates})
    future["product_id"] = product_id
    future["day_of_week"] = future["date"].dt.dayofweek
    future["day_of_month"] = future["date"].dt.day
    future["month"] = future["date"].dt.month
    future["day_of_year"] = future["date"].dt.dayofyear

    features = bundle["features"]
    if not all(feature in future.columns for feature in features):
        raise HTTPException(
            status_code=500,
            detail="Demand forecast model has unsupported features.",
        )

    model = bundle["models"][product_id]
    predictions = model.predict(future[features]).clip(min=0)
    forecast = [
        ForecastDayResponse(
            date=row.date.strftime("%Y-%m-%d"),
            predicted_units=round(float(row.predicted_units), 2),
        )
        for row in future.assign(predicted_units=predictions).itertuples()
    ]

    if any(not math.isfinite(item.predicted_units) for item in forecast):
        raise HTTPException(
            status_code=500,
            detail="Demand forecast model returned invalid values.",
        )

    return DemandForecastResponse(
        product_id=product_id,
        model_type=bundle["model_type"],
        forecast_horizon_days=days,
        forecast_start_date=forecast[0].date,
        forecast_end_date=forecast[-1].date,
        total_predicted_demand=round(
            sum(item.predicted_units for item in forecast), 2
        ),
        forecast=forecast,
        forecast_source=forecast_source,
    )


def _validate_forecast_days(days: int) -> None:
    if days not in (7, 14, 30):
        raise HTTPException(
            status_code=400,
            detail="Forecast days must be 7, 14, or 30.",
        )


@router.get("/catalogue", response_model=CatalogueForecastResponse)
def get_catalogue_forecasts(
    days: int = Query(default=7),
    db: Session = Depends(get_db),
):
    _validate_forecast_days(days)
    live_bundle = _load_live_bundle()
    products = db.query(Product).order_by(Product.product_id.asc()).all()
    forecasts = []

    for product in products:
        if live_bundle and product.product_id in live_bundle["models"]:
            forecast = _build_forecast(
                product.product_id,
                days,
                live_bundle,
                "live_store_sales",
            )
            forecasts.append(
                CatalogueForecastItem(
                    product_id=product.product_id,
                    status="available",
                    forecast=forecast,
                    unavailable_reason=None,
                )
            )
        else:
            forecasts.append(
                CatalogueForecastItem(
                    product_id=product.product_id,
                    status="unavailable",
                    forecast=None,
                    unavailable_reason=(
                        "No verified live demand model is available for this product."
                    ),
                )
            )

    return CatalogueForecastResponse(
        forecast_source="live_store_sales",
        forecast_horizon_days=days,
        forecasts=forecasts,
    )


@router.get(
    "/historical-demo",
    response_model=HistoricalDemoForecastResponse,
)
def get_historical_demo_forecasts(days: int = Query(default=7)):
    _validate_forecast_days(days)
    bundle = _load_historical_bundle()
    data = _load_historical_dataset()
    product_ids = sorted(bundle["models"])

    return HistoricalDemoForecastResponse(
        forecast_source="historical_demo",
        live_store_forecast=False,
        dataset_rows=len(data),
        dataset_start_date=data["date"].min().strftime("%Y-%m-%d"),
        dataset_end_date=data["date"].max().strftime("%Y-%m-%d"),
        product_ids=product_ids,
        forecasts=[
            _build_forecast(
                product_id,
                days,
                bundle,
                "historical_demo",
            )
            for product_id in product_ids
        ],
    )


@router.get("/history")
def get_forecast_history(db: Session = Depends(get_db)):
    sales = (
        db.query(Sale)
        .order_by(Sale.sale_date.asc())
        .all()
    )

    return {
        "total_transactions": len(sales),
        "product_count": len({sale.product_id for sale in sales}),
        "total_quantity_sold": sum(sale.quantity for sale in sales),
        "total_revenue": round(
            sum(sale.total_amount for sale in sales), 2

        ),
        "forecast_ready": len(sales) >= 30,
        "history": [
            {
                "product_id": sale.product_id,
                "quantity": sale.quantity,
                "sale_date": sale.sale_date,
            }
            for sale in sales
        ],
    }


@router.get("/daily-summary")
def get_daily_sales_summary(db: Session = Depends(get_db)):
    sale_day = func.substr(Sale.sale_date, 1, 10).label("sale_date")

    daily_sales = (
        db.query(
            Sale.product_id.label("product_id"),
            sale_day,
            func.sum(Sale.quantity).label("quantity_sold"),
            func.sum(Sale.total_amount).label("revenue"),
            func.count(Sale.id).label("transaction_count"),
        )
        .group_by(Sale.product_id, sale_day)
        .order_by(sale_day.asc(), Sale.product_id.asc())
        .all()
    )

    return {
        "total_product_days": len(daily_sales),
        "daily_sales": [
            {
                "product_id": row.product_id,
                "sale_date": row.sale_date,
                "quantity_sold": float(row.quantity_sold or 0),
                "revenue": round(float(row.revenue or 0), 2),
                "transaction_count": row.transaction_count,
            }
            for row in daily_sales
        ],
    }

@router.get("/product/{product_id}")
def get_product_forecast(
    product_id: int,
    days: int = 7,
    db: Session = Depends(get_db),
):
    if days not in (7, 14, 30):
        raise HTTPException(
            status_code=400,
            detail="Forecast days must be 7, 14, or 30.",
        )

    sales = (
        db.query(Sale)
        .filter(Sale.product_id == product_id)
        .order_by(Sale.sale_date.asc())
        .all()
    )

    if not sales:
        raise HTTPException(
            status_code=404,
            detail=f"No sales history found for product {product_id}.",
        )

    total_quantity = sum(sale.quantity for sale in sales)
    total_revenue = sum(sale.total_amount for sale in sales)
    unique_days = len({sale.sale_date[:10] for sale in sales})

    return {
        "product_id": product_id,
        "forecast_horizon_days": days,
        "historical_transactions": len(sales),
        "historical_days_with_sales": unique_days,
        "historical_quantity_sold": total_quantity,
        "historical_revenue": round(total_revenue, 2),
        "forecast_ready": unique_days >= 30,
        "forecast": None,
        "message": (
            "Historical data retrieved. More sales history is needed "
            "before generating a reliable demand forecast."
            if unique_days < 30
            else "Historical data is available for model evaluation."
        ),
    }

@router.get(
    "/model/{product_id}",
    response_model=DemandForecastResponse,
)
def get_model_demand_forecast(
    product_id: int,
    days: int = 7,
):
    _validate_forecast_days(days)
    bundle = _load_historical_bundle()

    if product_id not in bundle["models"]:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No historical demo demand model found for product {product_id}."
            ),
        )

    return _build_forecast(
        product_id,
        days,
        bundle,
        "historical_demo",
    )
