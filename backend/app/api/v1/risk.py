
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.inventory import Inventory

router = APIRouter(prefix="/api/v1/risk", tags=["Expiry Risk"])


def classify_expiry_risk(days_to_expiry: int) -> str:
    if days_to_expiry <= 0:
        return "Critical"
    if days_to_expiry <= 2:
        return "High"
    if days_to_expiry <= 5:
        return "Medium"
    return "Low"


def recommend_action(days_to_expiry: int, remaining_stock: float) -> str:
    if remaining_stock <= 0:
        return "Verify stock balance"
    if days_to_expiry <= 0:
        return "Urgently inspect expired/today stock"
    if days_to_expiry <= 2:
        return "Prioritize sale or safe redistribution"
    if days_to_expiry <= 5:
        return "Monitor stock and plan markdowns"
    return "Continue routine stock monitoring"


@router.get("/expiry")
def get_expiry_risk(db: Session = Depends(get_db)):
    records = db.query(Inventory).order_by(Inventory.id.desc()).all()

    alerts = []

    for item in records:
        remaining_stock = max(
    0.0,
    float(item.opening_stock)
    + float(item.units_received)
    - float(item.units_sold or 0),
)

        risk = classify_expiry_risk(item.days_to_expiry)

        alerts.append(
            {
                "inventory_id": item.id,
                "product_id": item.product_id,
                "category": item.category,
                "remaining_stock": remaining_stock,
                "days_to_expiry": item.days_to_expiry,
                "expiry_risk": risk,
                "action_required": (
                    item.days_to_expiry <= 2 and remaining_stock > 0
                ),
                "recommended_action": recommend_action(
                    item.days_to_expiry, remaining_stock
                ),
            }
        )

    risk_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    alerts.sort(
        key=lambda row: (
            risk_order[row["expiry_risk"]],
            row["days_to_expiry"],
        )
    )

    return {
        "total_records": len(alerts),
        "critical_count": sum(
            row["expiry_risk"] == "Critical" for row in alerts
        ),
        "high_count": sum(
            row["expiry_risk"] == "High" for row in alerts
        ),
        "action_required_count": sum(
            row["action_required"] for row in alerts
        ),
        "alerts": alerts,
    }
