
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import (
    confusion_matrix,
    classification_report,
    mean_absolute_error,
    mean_squared_error,
)

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT / "ml" / "data" / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)
MODEL_PATH = ROOT / "ml" / "artifacts" / "waste_model.joblib"

# Load data and reproduce the chronological split.
df = pd.read_csv(DATA_PATH)
df["date"] = pd.to_datetime(df["date"])
df = df.sort_values("date").reset_index(drop=True)

split_index = int(len(df) * 0.8)
train_df = df.iloc[:split_index].copy()
test_df = df.iloc[split_index:].copy()

# Create date features.
test_df["month"] = test_df["date"].dt.month
test_df["day_of_week"] = test_df["date"].dt.dayofweek
test_df["day_of_month"] = test_df["date"].dt.day

# The saved file is a dictionary containing the trained pipeline.
artifact = joblib.load(MODEL_PATH)
model = artifact["model"]
feature_columns = artifact["features"]

X_test = test_df[feature_columns]
y_test = test_df["waste_units"]

predictions = pd.Series(
    model.predict(X_test),
    index=test_df.index,
)

actual_flag = (y_test > 0).astype(int)
predicted_flag = (predictions > 0).astype(int)

print("=" * 65)
print("WASTE MODEL PREDICTION DIAGNOSTICS")
print("=" * 65)

print("\n1. TEST PERIOD")
print("Training rows:", len(train_df))
print("Testing rows:", len(test_df))
print("Test start:", test_df["date"].min().date())
print("Test end:", test_df["date"].max().date())

print("\n2. REGRESSION METRICS")
print("MAE:", round(mean_absolute_error(y_test, predictions), 4))
print(
    "RMSE:",
    round(mean_squared_error(y_test, predictions) ** 0.5, 4),
)

print("\n3. WASTE DETECTION")
print("Actual positive-waste rows:", int(actual_flag.sum()))
print("Predicted positive-waste rows:", int(predicted_flag.sum()))
print("\nConfusion matrix [[TN, FP], [FN, TP]]:")
print(confusion_matrix(actual_flag, predicted_flag, labels=[0, 1]))

print("\nClassification report:")
print(
    classification_report(
        actual_flag,
        predicted_flag,
        labels=[0, 1],
        target_names=["Zero waste", "Positive waste"],
        zero_division=0,
    )
)

print("\n4. PREDICTION DISTRIBUTION")
print(predictions.describe().round(3).to_string())

print("\n5. EXAMPLES: FALSE POSITIVES")
false_positive = test_df.loc[actual_flag.eq(0) & predicted_flag.eq(1)].copy()
false_positive["predicted_waste"] = predictions.loc[false_positive.index]

columns = [
    "date", "product_id", "category", "opening_stock",
    "units_received", "units_sold", "days_to_expiry",
    "temperature_c", "waste_units", "predicted_waste",
]

if false_positive.empty:
    print("No false positives.")
else:
    print(false_positive[columns].head(15).round(2).to_string(index=False))

print("\n6. EXAMPLES: MISSED WASTE")
false_negative = test_df.loc[actual_flag.eq(1) & predicted_flag.eq(0)].copy()
false_negative["predicted_waste"] = predictions.loc[false_negative.index]

if false_negative.empty:
    print("No missed positive-waste rows.")
else:
    print(false_negative[columns].head(15).round(2).to_string(index=False))

print("\nDiagnostic complete. No files or models were modified.")
