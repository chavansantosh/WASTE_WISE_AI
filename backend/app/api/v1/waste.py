from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.prediction import Prediction
from app.models.product import Product

router = APIRouter(prefix="/api/v1/waste", tags=["Waste Reports"])


@router.get("/report")
def get_waste_report(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    prediction_count, predicted_waste_units = (
        db.query(
            func.count(Prediction.id),
            func.coalesce(func.sum(Prediction.predicted_waste_units), 0.0),
        ).one()
    )
    reported_total = Decimal(str(predicted_waste_units)).quantize(
        Decimal("0.01")
    )
    average_predicted_waste = (
        reported_total / prediction_count
        if prediction_count
        else Decimal("0")
    )

    monthly_rows = (
        db.query(
            func.strftime("%Y-%m", Prediction.created_at).label("month"),
            func.count(Prediction.id).label("prediction_count"),
            func.sum(Prediction.predicted_waste_units).label(
                "predicted_waste_units"
            ),
        )
        .group_by("month")
        .order_by("month")
        .all()
    )

    product_rows = (
        db.query(
            Prediction.product_id,
            Product.name,
            func.count(Prediction.id).label("prediction_count"),
            func.sum(Prediction.predicted_waste_units).label(
                "predicted_waste_units"
            ),
        )
        .outerjoin(Product, Product.product_id == Prediction.product_id)
        .group_by(Prediction.product_id, Product.name)
        .order_by(func.sum(Prediction.predicted_waste_units).desc())
        .all()
    )

    model_rows = (
        db.query(
            Prediction.model_type,
            func.count(Prediction.id).label("prediction_count"),
            func.sum(Prediction.predicted_waste_units).label(
                "predicted_waste_units"
            ),
        )
        .group_by(Prediction.model_type)
        .order_by(func.sum(Prediction.predicted_waste_units).desc())
        .all()
    )

    recent_rows = (
        db.query(Prediction, Product.name)
        .outerjoin(Product, Product.product_id == Prediction.product_id)
        .order_by(Prediction.created_at.desc(), Prediction.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "summary": {
            "prediction_count": prediction_count,
            "predicted_waste_units": float(reported_total),
            "average_predicted_waste_units": float(average_predicted_waste),
        },
        "monthly_trend": [
            {
                "month": row.month,
                "prediction_count": row.prediction_count,
                "predicted_waste_units": round(
                    float(row.predicted_waste_units or 0), 2
                ),
            }
            for row in monthly_rows
            if row.month is not None
        ],
        "product_breakdown": [
            {
                "product_id": row.product_id,
                "product_name": row.name,
                "prediction_count": row.prediction_count,
                "predicted_waste_units": round(
                    float(row.predicted_waste_units or 0), 2
                ),
            }
            for row in product_rows
        ],
        "model_breakdown": [
            {
                "model_type": row.model_type,
                "prediction_count": row.prediction_count,
                "predicted_waste_units": round(
                    float(row.predicted_waste_units or 0), 2
                ),
            }
            for row in model_rows
        ],
        "recent_predictions": [
            {
                "prediction_id": prediction.id,
                "inventory_id": prediction.inventory_id,
                "product_id": prediction.product_id,
                "product_name": product_name,
                "predicted_waste_units": prediction.predicted_waste_units,
                "model_type": prediction.model_type,
                "prediction_note": prediction.prediction_note,
                "created_at": prediction.created_at,
            }
            for prediction, product_name in recent_rows
        ],
        "is_estimate": True,
    }