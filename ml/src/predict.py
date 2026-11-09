
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = PROJECT_ROOT / "ml" / "artifacts" / "waste_model.joblib"

DEFAULT_DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

NUMERIC_FEATURES = [
    "product_id",
    "opening_stock",
    "units_received",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    "month",
    "day_of_week",
    "day_of_month",
]

NON_NEGATIVE_FEATURES = [
    "product_id",
    "opening_stock",
    "units_received",
    "unit_price",
    "days_to_expiry",
]


def load_model():
    """Load the existing saved model without retraining."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Saved model not found: {MODEL_PATH}"
        )

    artifact = joblib.load(MODEL_PATH)

    if not isinstance(artifact, dict):
        raise ValueError("Invalid model artifact format.")

    if "model" not in artifact or "features" not in artifact:
        raise ValueError(
            "Model artifact must contain 'model' and 'features'."
        )

    features = artifact["features"]

    if not isinstance(features, list) or not features:
        raise ValueError("The saved feature list is invalid.")

    if len(features) != len(set(features)):
        raise ValueError("The saved feature list contains duplicates.")

    return artifact


def prepare_record(record, feature_columns):
    """Validate and prepare one inventory record for prediction."""
    if not isinstance(record, dict):
        raise TypeError("record must be a dictionary.")

    data = record.copy()

    # Derive calendar features using the same logic as training.
    if "date" in data:
        parsed_date = pd.to_datetime(data["date"], errors="coerce")

        if pd.isna(parsed_date):
            raise ValueError("The date is missing or invalid.")

        data["month"] = parsed_date.month
        data["day_of_week"] = parsed_date.dayofweek
        data["day_of_month"] = parsed_date.day

    missing = [
        feature
        for feature in feature_columns
        if feature not in data or data[feature] is None
    ]

    if missing:
        raise ValueError(f"Missing prediction features: {missing}")

    row = pd.DataFrame(
        [{feature: data[feature] for feature in feature_columns}]
    )

    # Validate numeric features and reject NaN/infinity.
    for column in NUMERIC_FEATURES:
        if column in row.columns:
            row[column] = pd.to_numeric(
                row[column],
                errors="coerce",
            )

            values = row[column].to_numpy(dtype=float)

            if not np.isfinite(values).all():
                raise ValueError(
                    f"Feature '{column}' must contain a finite number."
                )

    # Validate the product identifier as a positive integer.
    if "product_id" in row.columns:
        product_id = float(row.loc[0, "product_id"])

        if product_id <= 0 or not product_id.is_integer():
            raise ValueError(
                "product_id must be a positive integer."
            )

    # Validate non-negative inventory and price inputs.
    for column in NON_NEGATIVE_FEATURES:
        if column in row.columns and float(row.loc[0, column]) < 0:
            raise ValueError(f"{column} cannot be negative.")

    if "discount_pct" in row.columns:
        discount = float(row.loc[0, "discount_pct"])

        if not 0 <= discount <= 100:
            raise ValueError("discount_pct must be between 0 and 100.")

    if "month" in row.columns:
        month = float(row.loc[0, "month"])
        if not month.is_integer() or not 1 <= month <= 12:
            raise ValueError("month must be an integer from 1 to 12.")

    if "day_of_week" in row.columns:
        day = float(row.loc[0, "day_of_week"])
        if not day.is_integer() or not 0 <= day <= 6:
            raise ValueError("day_of_week must be an integer from 0 to 6.")

    if "day_of_month" in row.columns:
        day = float(row.loc[0, "day_of_month"])
        if not day.is_integer() or not 1 <= day <= 31:
            raise ValueError("day_of_month must be an integer from 1 to 31.")

    # Category is categorical; require a non-empty value.
    if "category" in row.columns:
        category = row.loc[0, "category"]

        if not isinstance(category, str) or not category.strip():
            raise ValueError("category must be a non-empty string.")

    return row


def predict_waste(record):
    """Return the model's estimated waste units for one record."""
    artifact = load_model()

    model = artifact["model"]
    features = artifact["features"]

    row = prepare_record(record, features)

    predicted_waste = float(model.predict(row)[0])

    if not np.isfinite(predicted_waste):
        raise ValueError("The model returned a non-finite prediction.")

    # Waste quantities cannot be negative.
    predicted_waste = max(0.0, predicted_waste)

    return {
        "predicted_waste_units": round(predicted_waste, 2),
        "model_type": artifact.get(
            "model_type",
            type(model).__name__,
        ),
        "prediction_note": artifact.get(
            "prediction_note",
            "Estimate only; accuracy must be validated on future data.",
        ),
    }


def main():
    print("=" * 60)
    print("WASTE WISE AI - WASTE PREDICTION")
    print("=" * 60)

    if not DEFAULT_DATA_PATH.exists():
        raise FileNotFoundError(
            f"Sample dataset not found: {DEFAULT_DATA_PATH}"
        )

    df = pd.read_csv(DEFAULT_DATA_PATH)

    if df.empty:
        raise ValueError("The sample dataset is empty.")

    sample = df.iloc[0].to_dict()
    result = predict_waste(sample)

    print("\nSample inventory record:")
    print(json.dumps(sample, indent=4, default=str))

    print("\nPrediction result:")
    print(json.dumps(result, indent=4))

    print(
        "\nInference test passed. This confirms the pipeline runs; "
        "it does not prove prediction accuracy."
    )


if __name__ == "__main__":
    main()
