
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.dummy import DummyRegressor


# --------------------------------------------------
# 1. Paths and configuration
# --------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

ARTIFACT_DIR = PROJECT_ROOT / "ml" / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = ARTIFACT_DIR / "waste_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "waste_model_metrics.json"

TARGET = "waste_units"
RANDOM_STATE = 42


# --------------------------------------------------
# 2. Load and validate data
# --------------------------------------------------
if not DATA_PATH.exists():
    raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

df = pd.read_csv(DATA_PATH)

required_columns = [
    "product_id",
    "date",
    "category",
    "opening_stock",
    "units_received",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    TARGET,
]

missing_columns = [col for col in required_columns if col not in df.columns]

if missing_columns:
    raise ValueError(f"Missing required columns: {missing_columns}")

df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.dropna(subset=["date", TARGET]).copy()

if df.empty:
    raise ValueError("No valid rows remain after date and target validation.")

if (df[TARGET] < 0).any():
    raise ValueError("Negative waste_units values found. Check the source data.")

# Exclude same-period outcomes such as units_sold and stockout_flag.
# These may not be available when forecasting future waste.
df["month"] = df["date"].dt.month
df["day_of_week"] = df["date"].dt.dayofweek
df["day_of_month"] = df["date"].dt.day

categorical_features = ["product_id", "category"]

numeric_features = [
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

features = categorical_features + numeric_features

# --------------------------------------------------
# 3. Chronological train/test split
# --------------------------------------------------
unique_dates = np.sort(df["date"].unique())

if len(unique_dates) < 2:
    raise ValueError("At least two distinct dates are needed for a time split.")

split_index = int(len(unique_dates) * 0.80)
split_index = min(max(split_index, 1), len(unique_dates) - 1)
cutoff_date = pd.Timestamp(unique_dates[split_index])

train_df = df[df["date"] < cutoff_date].copy()
test_df = df[df["date"] >= cutoff_date].copy()

X_train = train_df[features]
y_train = train_df[TARGET]

X_test = test_df[features]
y_test = test_df[TARGET]

print("=" * 65)
print("WASTE WISE AI - FOOD WASTE MODEL")
print("=" * 65)
print(f"Total rows: {len(df)}")
print(f"Training rows: {len(train_df)}")
print(f"Testing rows: {len(test_df)}")
print(f"Training through: {train_df['date'].max().date()}")
print(f"Testing from: {test_df['date'].min().date()}")
print(f"Zero-waste test rows: {(y_test == 0).sum()} / {len(y_test)}")


# --------------------------------------------------
# 4. Preprocessing
# --------------------------------------------------
numeric_transformer = Pipeline(
    steps=[
        ("imputer", SimpleImputer(strategy="median")),
    ]
)

categorical_transformer = Pipeline(
    steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ]
)

preprocessor = ColumnTransformer(
    transformers=[
        ("numeric", numeric_transformer, numeric_features),
        ("categorical", categorical_transformer, categorical_features),
    ]
)


# --------------------------------------------------
# 5. Evaluation helper
# --------------------------------------------------
def evaluate_model(name, actual, predicted):
    predicted = np.maximum(predicted, 0)

    return {
        "model": name,
        "mae": round(float(mean_absolute_error(actual, predicted)), 4),
        "rmse": round(
            float(np.sqrt(mean_squared_error(actual, predicted))), 4
        ),
        "r2": round(float(r2_score(actual, predicted)), 4),
        "actual_zero_waste_rows": int((actual == 0).sum()),
        "actual_positive_waste_rows": int((actual > 0).sum()),
        "predicted_positive_rows": int((predicted >= 0.5).sum()),
    }


# --------------------------------------------------
# 6. Baseline: always predict zero waste
# --------------------------------------------------
baseline = DummyRegressor(strategy="constant", constant=0)
baseline.fit(X_train, y_train)

baseline_predictions = baseline.predict(X_test)
baseline_metrics = evaluate_model(
    "Zero-waste baseline", y_test, baseline_predictions
)


# --------------------------------------------------
# 7. Train Random Forest model
# --------------------------------------------------
model = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        (
            "regressor",
            RandomForestRegressor(
                n_estimators=300,
                min_samples_leaf=3,
                random_state=RANDOM_STATE,
                n_jobs=-1,
            ),
        ),
    ]
)

model.fit(X_train, y_train)

predictions = model.predict(X_test)
model_metrics = evaluate_model("Random Forest", y_test, predictions)

# --------------------------------------------------
# 8. Save model and evaluation results
# --------------------------------------------------
joblib.dump(
    {
        "model": model,
        "features": features,
        "target": TARGET,
        "model_type": "RandomForestRegressor",
        "prediction_note": (
            "Estimates waste_units from available inventory features. "
            "Validate on future real-world data before production use."
        ),
    },
    MODEL_PATH,
)

results = {
    "project": "WASTE WISE AI",
    "target": TARGET,
    "split_method": "chronological",
    "cutoff_date": str(cutoff_date.date()),
    "training_rows": int(len(train_df)),
    "testing_rows": int(len(test_df)),
    "training_period": [
        str(train_df["date"].min().date()),
        str(train_df["date"].max().date()),
    ],
    "testing_period": [
        str(test_df["date"].min().date()),
        str(test_df["date"].max().date()),
    ],
    "target_zero_percentage": round(
        float((df[TARGET] == 0).mean() * 100), 2
    ),
    "baseline_metrics": baseline_metrics,
    "model_metrics": model_metrics,
    "features": features,
    "excluded_columns": [
        "units_sold",
        "stockout_flag",
        TARGET,
    ],
    "note": (
        "Compare test MAE and RMSE against the zero baseline. "
        "This dataset is limited in size and has a high proportion of "
        "zero-waste observations. Results do not guarantee real-world performance."
    ),
}

with open(METRICS_PATH, "w", encoding="utf-8") as file:
    json.dump(results, file, indent=4)

print("\nZERO-WASTE BASELINE")
print(json.dumps(baseline_metrics, indent=4))

print("\nRANDOM FOREST TEST RESULTS")
print(json.dumps(model_metrics, indent=4))

print("\nSaved model:", MODEL_PATH)
print("Saved metrics:", METRICS_PATH)

if model_metrics["mae"] < baseline_metrics["mae"]:
    print("\nThe model improved test MAE over the zero baseline.")
else:
    print("\nThe model did not improve test MAE over the zero baseline.")
    print("Further feature and data-quality investigation is needed.")
