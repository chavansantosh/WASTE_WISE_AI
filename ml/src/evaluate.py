
from pathlib import Path
import json

import joblib
import pandas as pd
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)

# Project paths
ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

MODEL_PATH = ROOT / "ml" / "artifacts" / "waste_model.joblib"
METRICS_PATH = ROOT / "ml" / "artifacts" / "waste_model_metrics.json"

# Configuration
WASTE_THRESHOLD = 1.0


def main():
    print("=" * 60)
    print("WASTE WISE AI - MODEL EVALUATION")
    print("=" * 60)

    # Check required files
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Trained model not found: {MODEL_PATH}")

    # Load dataset
    df = pd.read_csv(DATA_PATH)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    # Reproduce the chronological 80/20 test split
    split_index = int(len(df) * 0.8)
    train_df = df.iloc[:split_index]
    test_df = df.iloc[split_index:].copy()

    # Generate date features used by the training script
    test_df["month"] = test_df["date"].dt.month
    test_df["day_of_week"] = test_df["date"].dt.dayofweek
    test_df["day_of_month"] = test_df["date"].dt.day

    # Load saved model artifact
    artifact = joblib.load(MODEL_PATH)
    model = artifact["model"]
    feature_columns = artifact["features"]

    # Prepare test data
    X_test = test_df[feature_columns]
    y_test = test_df["waste_units"]

    # Generate predictions
    predictions = pd.Series(
        model.predict(X_test),
        index=test_df.index,
    )

    # Regression metrics
    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(y_test, predictions) ** 0.5
    r2 = r2_score(y_test, predictions)

    # Compare with a simple zero-waste baseline
    baseline_predictions = [0.0] * len(y_test)
    baseline_mae = mean_absolute_error(y_test, baseline_predictions)
    baseline_rmse = mean_squared_error(
        y_test, baseline_predictions
    ) ** 0.5

    # Convert predicted quantities into waste/no-waste classes.
    # This threshold is a diagnostic setting, not a validated
    # business decision threshold.
    actual_waste = (y_test > 0).astype(int)
    predicted_waste = (predictions >= WASTE_THRESHOLD).astype(int)

    precision = precision_score(
        actual_waste, predicted_waste, zero_division=0
    )
    recall = recall_score(
        actual_waste, predicted_waste, zero_division=0
    )
    f1 = f1_score(
        actual_waste, predicted_waste, zero_division=0
    )

    matrix = confusion_matrix(
        actual_waste, predicted_waste, labels=[0, 1]
    )

    # Print results
    print(f"\nTotal dataset rows: {len(df)}")
    print(f"Training rows: {len(train_df)}")
    print(f"Testing rows: {len(test_df)}")
    print(f"Test period: {test_df['date'].min().date()} to "
          f"{test_df['date'].max().date()}")

    print("\n--- REGRESSION METRICS ---")
    print(f"Model MAE:       {mae:.4f}")
    print(f"Model RMSE:      {rmse:.4f}")
    print(f"Model R²:        {r2:.4f}")

    print("\n--- ZERO-WASTE BASELINE ---")
    print(f"Baseline MAE:    {baseline_mae:.4f}")
    print(f"Baseline RMSE:   {baseline_rmse:.4f}")

    print("\n--- WASTE DETECTION METRICS ---")
    print(f"Prediction threshold: {WASTE_THRESHOLD}")
    print(f"Actual waste cases:   {int(actual_waste.sum())}")
    print(f"Predicted waste cases: {int(predicted_waste.sum())}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1-score:  {f1:.4f}")

    print("\nConfusion matrix [[TN, FP], [FN, TP]]:")
    print(matrix)

    print("\nClassification report:")
    print(
        classification_report(
            actual_waste,
            predicted_waste,
            labels=[0, 1],
            target_names=["Zero waste", "Positive waste"],
            zero_division=0,
        )
    )

    # Save evaluation results separately from the trained model
    results = {
        "model": "Random Forest",
        "test_rows": int(len(test_df)),
        "test_start": str(test_df["date"].min().date()),
        "test_end": str(test_df["date"].max().date()),
        "mae": round(float(mae), 4),
        "rmse": round(float(rmse), 4),
        "r2": round(float(r2), 4),
        "zero_baseline_mae": round(float(baseline_mae), 4),
        "zero_baseline_rmse": round(float(baseline_rmse), 4),
        "waste_threshold": WASTE_THRESHOLD,
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1_score": round(float(f1), 4),
        "confusion_matrix": matrix.tolist(),
        "note": (
            "Threshold is diagnostic and has not been validated "
            "for production use."
        ),
    }

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(
        json.dumps(results, indent=4),
        encoding="utf-8",
    )

    print(f"\nEvaluation metrics saved to:\n{METRICS_PATH}")

    if mae > baseline_mae:
        print(
            "\nWARNING: Model MAE is worse than the zero-waste "
            "baseline. Further investigation is needed."
        )
    else:
        print("\nModel MAE is no worse than the baseline.")

    print("\nEvaluation complete. The trained model was not modified.")


if __name__ == "__main__":
    main()
