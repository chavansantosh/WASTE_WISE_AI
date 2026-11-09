
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = (
    ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

df = pd.read_csv(DATA_PATH, parse_dates=["date"])
df = df.sort_values(["date", "product_id"]).reset_index(drop=True)

# Chronological split: earliest 80% of dates for training
dates = np.sort(df["date"].unique())
split_index = int(len(dates) * 0.80)
train_dates = dates[:split_index]
test_dates = dates[split_index:]

train = df[df["date"].isin(train_dates)].copy()
test = df[df["date"].isin(test_dates)].copy()

# Learn each product's average waste using training data only
product_means = train.groupby("product_id")["waste_units"].mean()
overall_mean = train["waste_units"].mean()

test["product_mean_prediction"] = (
    test["product_id"].map(product_means).fillna(overall_mean)
)

# Baseline 1: predict zero waste
zero_predictions = np.zeros(len(test))

# Baseline 2: predict the product's historical average
mean_predictions = test["product_mean_prediction"].to_numpy()
actual = test["waste_units"].to_numpy()

print("TRAIN PERIOD:", train["date"].min().date(), "to", train["date"].max().date())
print("TEST PERIOD: ", test["date"].min().date(), "to", test["date"].max().date())
print("Training rows:", len(train))
print("Testing rows: ", len(test))
print("Actual positive-waste test rows:", int((actual > 0).sum()))

print("\nEVALUATION RESULTS")
for name, predictions in [
    ("Always predict zero", zero_predictions),
    ("Historical product average", mean_predictions),
]:
    mae = mean_absolute_error(actual, predictions)
    rmse = np.sqrt(mean_squared_error(actual, predictions))

    print(f"\n{name}")
    print(f"MAE:  {mae:.4f}")
    print(f"RMSE: {rmse:.4f}")

print("\nEvaluation complete. No models or datasets were modified.")
