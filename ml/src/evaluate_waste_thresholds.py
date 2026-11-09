
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd

from sklearn.base import clone
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
)

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT / "ml" / "data" / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)
MODEL_PATH = ROOT / "ml" / "artifacts" / "waste_model.joblib"
OUTPUT_PATH = (
    ROOT / "ml" / "artifacts"
    / "waste_threshold_evaluation.json"
)


def add_date_features(data):
    """Create the date features expected by the saved pipeline."""
    data = data.copy()
    data["month"] = data["date"].dt.month
    data["day_of_week"] = data["date"].dt.dayofweek
    data["day_of_month"] = data["date"].dt.day
    return data


def get_detection_metrics(actual, predicted):
    """Calculate binary waste-detection metrics."""
    return {
        "precision": round(
            float(precision_score(actual, predicted, zero_division=0)), 4
        ),
        "recall": round(
            float(recall_score(actual, predicted, zero_division=0)), 4
        ),
        "f1_score": round(
            float(f1_score(actual, predicted, zero_division=0)), 4
        ),
        "confusion_matrix": confusion_matrix(
            actual, predicted, labels=[0, 1]
        ).tolist(),
        "predicted_waste_cases": int(predicted.sum()),
        "actual_waste_cases": int(actual.sum()),
    }


def main():
    print("=" * 65)
    print("WASTE WISE AI - CHRONOLOGICAL THRESHOLD EVALUATION")
    print("=" * 65)

    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

    # Load and sort the data chronologically.
    df = pd.read_csv(DATA_PATH)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    df = add_date_features(df)

    # 64% training, next 16% validation, final 20% test.
    n = len(df)
    train_end = int(n * 0.64)
    validation_end = int(n * 0.80)

    train_df = df.iloc[:train_end].copy()
    validation_df = df.iloc[train_end:validation_end].copy()
    test_df = df.iloc[validation_end:].copy()

    # Load the existing pipeline and feature list.
    artifact = joblib.load(MODEL_PATH)
    saved_model = artifact["model"]
    features = artifact["features"]

    X_train = train_df[features]
    y_train = train_df["waste_units"]

    X_validation = validation_df[features]
    y_validation = validation_df["waste_units"]

    X_test = test_df[features]
    y_test = test_df["waste_units"]

    # Train a temporary clone. Do not overwrite the saved model.
    evaluation_model = clone(saved_model)
    evaluation_model.fit(X_train, y_train)

    # Select a threshold using validation data only.
    validation_predictions = evaluation_model.predict(X_validation)
    actual_validation = (y_validation > 0).astype(int)

    # Candidate thresholds come from validation predictions.
    candidates = np.unique(validation_predictions)
    best_threshold = None
    best_f1 = -1.0
    best_precision = 0.0
    best_recall = 0.0

    for threshold in candidates:
        predicted_validation = (
            validation_predictions >= threshold
        ).astype(int)

        precision = precision_score(
            actual_validation,
            predicted_validation,
            zero_division=0,
        )
        recall = recall_score(
            actual_validation,
            predicted_validation,
            zero_division=0,
        )
        f1 = f1_score(
            actual_validation,
            predicted_validation,
            zero_division=0,
        )

        # Maximise F1. On ties, prefer higher precision.
        if (f1 > best_f1) or (
            np.isclose(f1, best_f1) and precision > best_precision
        ):
            best_threshold = float(threshold)
            best_f1 = float(f1)
            best_precision = float(precision)
            best_recall = float(recall)

    # Record validation results at the selected threshold.
    validation_classes = (
        validation_predictions >= best_threshold
    ).astype(int)

    validation_metrics = get_detection_metrics(
        actual_validation, validation_classes
    )

    # Evaluate the final test set once using the selected threshold.
    test_predictions = evaluation_model.predict(X_test)
    actual_test = (y_test > 0).astype(int)
    predicted_test = (test_predictions >= best_threshold).astype(int)

    test_detection_metrics = get_detection_metrics(
        actual_test, predicted_test
    )

    test_mae = mean_absolute_error(y_test, test_predictions)
    test_rmse = mean_squared_error(y_test, test_predictions) ** 0.5
    test_r2 = r2_score(y_test, test_predictions)

    # Zero-waste baseline for regression comparison.
    baseline = np.zeros(len(y_test))
    baseline_mae = mean_absolute_error(y_test, baseline)
    baseline_rmse = mean_squared_error(y_test, baseline) ** 0.5

    print("\n--- CHRONOLOGICAL SPLITS ---")
    print(f"Training rows:   {len(train_df)}")
    print(f"Validation rows: {len(validation_df)}")
    print(f"Test rows:       {len(test_df)}")
    print(
        "Training period:   "
        f"{train_df['date'].min().date()} to "
        f"{train_df['date'].max().date()}"
    )
    print(
        "Validation period: "
        f"{validation_df['date'].min().date()} to "
        f"{validation_df['date'].max().date()}"
    )
    print(
        "Test period:       "
        f"{test_df['date'].min().date()} to "
        f"{test_df['date'].max().date()}"
    )

    print("\n--- THRESHOLD SELECTED ON VALIDATION ---")
    print(f"Selected threshold: {best_threshold:.6f}")
    print(f"Validation precision: {best_precision:.4f}")
    print(f"Validation recall:    {best_recall:.4f}")
    print(f"Validation F1-score:  {best_f1:.4f}")

    print("\n--- FINAL TEST: REGRESSION METRICS ---")
    print(f"MAE:  {test_mae:.4f}")
    print(f"RMSE: {test_rmse:.4f}")
    print(f"R²:   {test_r2:.4f}")
    print(f"Zero-baseline MAE:  {baseline_mae:.4f}")
    print(f"Zero-baseline RMSE: {baseline_rmse:.4f}")

    print("\n--- FINAL TEST: WASTE DETECTION ---")
    for name, value in test_detection_metrics.items():
        print(f"{name}: {value}")

    results = {
        "method": "chronological 64/16/20 split",
        "temporary_model_fit_rows": len(train_df),
        "validation_rows": len(validation_df),
        "test_rows": len(test_df),
        "training_end": str(train_df["date"].max().date()),
        "validation_start": str(validation_df["date"].min().date()),
        "validation_end": str(validation_df["date"].max().date()),
        "test_start": str(test_df["date"].min().date()),
        "test_end": str(test_df["date"].max().date()),
        "threshold_selection_metric": "validation F1-score",
        "selected_threshold": best_threshold,
        "validation_metrics": validation_metrics,
        "test_regression_metrics": {
            "mae": round(float(test_mae), 4),
            "rmse": round(float(test_rmse), 4),
            "r2": round(float(test_r2), 4),
            "zero_baseline_mae": round(float(baseline_mae), 4),
            "zero_baseline_rmse": round(float(baseline_rmse), 4),
        },
        "test_detection_metrics": test_detection_metrics,
        "note": (
            "The existing pipeline was cloned and refitted on the "
            "earliest 64% only. The saved model artifact was not "
            "modified. The final 20% was not used for threshold selection."
        ),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(results, indent=4),
        encoding="utf-8",
    )

    print(f"\nResults saved to:\n{OUTPUT_PATH}")
    print("\nOriginal saved model was not modified.")
    print("Evaluation complete.")


if __name__ == "__main__":
    main()
