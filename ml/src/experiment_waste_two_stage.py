
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer


ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = (
    ROOT / "ml" / "data" / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)
OUTPUT_PATH = (
    ROOT / "ml" / "artifacts"
    / "waste_two_stage_experiment_metrics.json"
)

TARGET = "waste_units"
RANDOM_STATE = 42


def make_pipeline(numeric_features, categorical_features, estimator):
    numeric_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
    ])

    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])

    preprocessing = ColumnTransformer([
        ("numeric", numeric_pipe, numeric_features),
        ("categorical", categorical_pipe, categorical_features),
    ])

    return Pipeline([
        ("preprocessing", preprocessing),
        ("model", estimator),
    ])


def main():
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    df = df.dropna(subset=["date", TARGET]).copy()
    df = df.sort_values(["date", "product_id"]).reset_index(drop=True)

    if (df[TARGET] < 0).any():
        raise ValueError("Negative waste values detected.")

    # Date features are derived from the date, not from the target.
    df["month"] = df["date"].dt.month
    df["day_of_week"] = df["date"].dt.dayofweek
    df["day_of_month"] = df["date"].dt.day

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
    categorical_features = ["product_id", "category"]
    features = numeric_features + categorical_features

    # Split by unique dates so records from one date stay together.
    dates = np.sort(df["date"].unique())
    train_end = int(len(dates) * 0.64)
    validation_end = int(len(dates) * 0.80)

    train_dates = dates[:train_end]
    validation_dates = dates[train_end:validation_end]
    test_dates = dates[validation_end:]

    train = df[df["date"].isin(train_dates)].copy()
    validation = df[df["date"].isin(validation_dates)].copy()
    test = df[df["date"].isin(test_dates)].copy()

    X_train = train[features]
    X_validation = validation[features]
    X_test = test[features]

    y_train = train[TARGET].astype(float)
    y_validation = validation[TARGET].astype(float)
    y_test = test[TARGET].astype(float)

    y_train_class = (y_train > 0).astype(int)
    y_validation_class = (y_validation > 0).astype(int)
    y_test_class = (y_test > 0).astype(int)

    if y_train_class.nunique() < 2:
        raise ValueError("Training period must contain both waste classes.")

    # Stage 1: classify whether any waste will occur.
    classifier = make_pipeline(
        numeric_features,
        categorical_features,
        RandomForestClassifier(
            n_estimators=300,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),
    )
    classifier.fit(X_train, y_train_class)

    validation_probabilities = classifier.predict_proba(
        X_validation
    )[:, 1]

    # Select threshold using validation F1 only.
    thresholds = np.arange(0.05, 0.96, 0.01)
    best_threshold = 0.5
    best_f1 = -1.0

    for threshold in thresholds:
        predicted = (
            validation_probabilities >= threshold
        ).astype(int)
        score = f1_score(
            y_validation_class, predicted, zero_division=0
        )

        if score > best_f1:
            best_f1 = float(score)
            best_threshold = float(threshold)

    # Stage 2: estimate waste quantity using positive-waste training rows.
    positive_train = y_train > 0

    if positive_train.sum() < 10:
        raise ValueError(
            "Too few positive-waste training records for quantity model."
        )

    quantity_model = make_pipeline(
        numeric_features,
        categorical_features,
        RandomForestRegressor(
            n_estimators=300,
            min_samples_leaf=2,
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),
    )

    quantity_model.fit(
        X_train.loc[positive_train],
        y_train.loc[positive_train],
    )

    # Evaluate once on the final unseen test dates.
    test_probabilities = classifier.predict_proba(X_test)[:, 1]
    predicted_classes = (
        test_probabilities >= best_threshold
    ).astype(int)

    predicted_quantities_if_positive = np.maximum(
        quantity_model.predict(X_test), 0
    )

    # Only estimate a positive quantity when the classifier flags waste.
    combined_predictions = np.where(
        predicted_classes == 1,
        predicted_quantities_if_positive,
        0.0,
    )

    # Detection metrics.
    detection = {
        "accuracy": float(
            accuracy_score(y_test_class, predicted_classes)
        ),
        "precision": float(
            precision_score(
                y_test_class, predicted_classes, zero_division=0
            )
        ),
        "recall": float(
            recall_score(
                y_test_class, predicted_classes, zero_division=0
            )
        ),
        "f1_score": float(
            f1_score(
                y_test_class, predicted_classes, zero_division=0
            )
        ),
        "average_precision": float(
            average_precision_score(y_test_class, test_probabilities)
        ),
        "selected_threshold": best_threshold,
        "predicted_positive_rows": int(predicted_classes.sum()),
        "actual_positive_rows": int(y_test_class.sum()),
    }

    if y_test_class.nunique() == 2:
        detection["roc_auc"] = float(
            roc_auc_score(y_test_class, test_probabilities)
        )

    # Quantity metrics, including zero-waste baseline.
    baseline = np.zeros(len(y_test))

    regression = {
        "two_stage_mae": float(
            mean_absolute_error(y_test, combined_predictions)
        ),
        "two_stage_rmse": float(
            np.sqrt(mean_squared_error(y_test, combined_predictions))
        ),
        "zero_baseline_mae": float(
            mean_absolute_error(y_test, baseline)
        ),
        "zero_baseline_rmse": float(
            np.sqrt(mean_squared_error(y_test, baseline))
        ),
        "positive_training_rows": int(positive_train.sum()),
    }

    results = {
        "experiment": "two_stage_waste_prediction",
        "split_method": "chronological by unique date, 64/16/20",
        "training_rows": len(train),
        "validation_rows": len(validation),
        "test_rows": len(test),
        "training_period": [
            str(train["date"].min().date()),
            str(train["date"].max().date()),
        ],
        "validation_period": [
            str(validation["date"].min().date()),
            str(validation["date"].max().date()),
        ],
        "test_period": [
            str(test["date"].min().date()),
            str(test["date"].max().date()),
        ],
        "features": features,
        "excluded_inputs": [
            "waste_units",
            "units_sold",
            "stockout_flag",
        ],
        "validation_best_f1": best_f1,
        "test_detection_metrics": detection,
        "test_quantity_metrics": regression,
        "note": (
            "Experimental results only. Validate feature availability "
            "and performance on future real-world records before deployment."
        ),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(results, indent=2),
        encoding="utf-8",
    )

    print("\nTWO-STAGE WASTE EXPERIMENT")
    print("=" * 55)
    print("Training rows:", len(train))
    print("Validation rows:", len(validation))
    print("Test rows:", len(test))
    print("Test period:", results["test_period"])
    print("\nTest detection metrics:")
    print(json.dumps(detection, indent=2))
    print("\nTest quantity metrics:")
    print(json.dumps(regression, indent=2))
    print("\nSaved metrics:", OUTPUT_PATH)


if __name__ == "__main__":
    main()
