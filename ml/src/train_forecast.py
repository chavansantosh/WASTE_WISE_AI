
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import (
    mean_absolute_error,
    root_mean_squared_error,
)

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

ARTIFACT_DIR = ROOT / "ml" / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

data = pd.read_csv(DATA_PATH, parse_dates=["date"])
data = data.sort_values(["product_id", "date"]).copy()

data["day_of_week"] = data["date"].dt.dayofweek
data["day_of_month"] = data["date"].dt.day
data["month"] = data["date"].dt.month
data["day_of_year"] = data["date"].dt.dayofyear

features = [
    "product_id",
    "day_of_week",
    "day_of_month",
    "month",
    "day_of_year",
]

results = []
models = {}

for product_id, group in data.groupby("product_id"):
    group = group.sort_values("date").copy()

    split_index = int(len(group) * 0.8)
    train = group.iloc[:split_index]
    test = group.iloc[split_index:]

    model = RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=3,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(train[features], train["units_sold"])
    predictions = model.predict(test[features])
    baseline_predictions = [train["units_sold"].mean()] * len(test)

    baseline_mae = mean_absolute_error(
        test["units_sold"], baseline_predictions
    )
    baseline_rmse = root_mean_squared_error(
        test["units_sold"], baseline_predictions
    )

    mae = mean_absolute_error(test["units_sold"], predictions)
    rmse = root_mean_squared_error(test["units_sold"], predictions)

    models[int(product_id)] = model

    results.append(
        {
            "product_id": int(product_id),
            "train_rows": len(train),
            "test_rows": len(test),
            "MAE": round(mae, 3),
            "RMSE": round(rmse, 3),
            "Baseline_MAE": round(baseline_mae, 3),
            "Baseline_RMSE": round(baseline_rmse, 3),
        }
    )



model_path = ARTIFACT_DIR / "demand_forecast_models.joblib"
metrics_path = ARTIFACT_DIR / "demand_forecast_metrics.csv"

joblib.dump(
    {
        "models": models,
        "features": features,
        "model_type": "RandomForestRegressor",
    },
    model_path,
)

metrics = pd.DataFrame(results)
metrics.to_csv(metrics_path, index=False)

print("\nDemand Forecast Model Evaluation")
print(metrics.to_string(index=False))
print(f"\nSaved models to: {model_path}")
print(f"Saved metrics to: {metrics_path}")
