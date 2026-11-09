
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupShuffleSplit


PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "discount_scenarios_simulated - discount_scenarios_simulated.csv"
)

ARTIFACT_DIR = PROJECT_ROOT / "ml" / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "discount_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "discount_model_metrics.json"

TARGET = "estimated_gross_margin_simulated"

FEATURES = [
    "product_id",
    "days_to_expiry",
    "quantity_remaining",
    "discount_pct",
]


def main():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    required = ["batch_id", TARGET, *FEATURES]
    missing = [column for column in required if column not in df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df = df.dropna(subset=required).copy()

    # Keep every scenario for a batch in the same split.
    # This reduces leakage from nearly identical discount rows.
    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=0.20,
        random_state=42,
    )

    train_idx, test_idx = next(
        splitter.split(df[FEATURES], df[TARGET], groups=df["batch_id"])
    )

    X_train = df.iloc[train_idx][FEATURES]
    X_test = df.iloc[test_idx][FEATURES]
    y_train = df.iloc[train_idx][TARGET]
    y_test = df.iloc[test_idx][TARGET]

    categorical = ["product_id"]
    numeric = [
        "days_to_expiry",
        "quantity_remaining",
        "discount_pct",
    ]

    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore")),
    ])

    preprocessing = ColumnTransformer([
        ("numeric", numeric_pipeline, numeric),
        ("categorical", categorical_pipeline, categorical),
    ])

    model = Pipeline([
        ("preprocessing", preprocessing),
        (
            "regressor",
            RandomForestRegressor(
                n_estimators=300,
                min_samples_leaf=3,
                random_state=42,
                n_jobs=-1,
            ),
        ),
    ])

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    metrics = {
        "target": TARGET,
        "features": FEATURES,
        "dataset_type": "simulated",
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "test_batches": int(df.iloc[test_idx]["batch_id"].nunique()),
        "mae": float(mean_absolute_error(y_test, predictions)),
        "rmse": float(mean_squared_error(y_test, predictions) ** 0.5),
        "r2": float(r2_score(y_test, predictions)),
        "warning": (
            "Evaluation uses simulated scenarios. "
            "Performance does not establish real-world discount effectiveness."
        ),
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(
        {
            "model": model,
            "features": FEATURES,
            "target": TARGET,
            "dataset_type": "simulated",
        },
        MODEL_PATH,
    )

    pd.Series(metrics).to_json(METRICS_PATH, indent=2)

    print("\n========== DISCOUNT MODEL EVALUATION ==========")
    print(f"Training rows: {metrics['train_rows']}")
    print(f"Testing rows: {metrics['test_rows']}")
    print(f"Testing batches: {metrics['test_batches']}")
    print(f"MAE: {metrics['mae']:.4f}")
    print(f"RMSE: {metrics['rmse']:.4f}")
    print(f"R²: {metrics['r2']:.4f}")
    print(f"\nModel saved: {MODEL_PATH}")
    print(f"Metrics saved: {METRICS_PATH}")
    print("\nNote: This is a prototype trained on simulated data.")


if __name__ == "__main__":
    main()
