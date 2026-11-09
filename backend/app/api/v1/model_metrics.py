"""API endpoint for saved machine-learning model evaluation metrics."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(
    prefix="/api/v1/models",
    tags=["Model Metrics"],
)

# Resolve the project root independently of the terminal's current directory.
PROJECT_ROOT = Path(__file__).resolve().parents[4]
ARTIFACTS_DIR = PROJECT_ROOT / "ml" / "artifacts"

METRIC_FILES = {
    "food_waste": "waste_model_metrics.json",
    "waste_threshold_evaluation": "waste_threshold_evaluation.json",
    "expiry_risk": "expiry_risk_model_metrics.json",
    "discount": "discount_model_metrics.json",
}


@router.get("/metrics")
def get_model_metrics():
    """Return metrics saved by the model evaluation scripts."""

    results = {}

    for model_name, filename in METRIC_FILES.items():
        file_path = ARTIFACTS_DIR / filename

        if not file_path.is_file():
            raise HTTPException(
                status_code=500,
                detail=f"Metrics file not found: {filename}",
            )

        try:
            with file_path.open("r", encoding="utf-8") as file:
                results[model_name] = json.load(file)
        except (json.JSONDecodeError, OSError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Could not read metrics file: {filename}",
            ) from exc

    return {
        "status": "success",
        "models": results,
    }
