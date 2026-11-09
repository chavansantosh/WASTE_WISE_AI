
from datetime import timedelta
from pathlib import Path

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = ROOT / "ml" / "artifacts" / "demand_forecast_models.joblib"
DATA_PATH = (
    ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

bundle = joblib.load(MODEL_PATH)
data = pd.read_csv(DATA_PATH, parse_dates=["date"])

# Forecast settings
product_id = 1001
forecast_days = 7

if forecast_days not in (7, 14, 30):
    raise ValueError("Forecast days must be 7, 14, or 30.")

if product_id not in bundle["models"]:
    raise ValueError(f"No trained model found for product {product_id}.")

last_date = pd.Timestamp.today().normalize()
future_dates = pd.date_range(
    start=last_date + timedelta(days=1),
    periods=forecast_days,
    freq="D",
)

future = pd.DataFrame({"date": future_dates})
future["product_id"] = product_id
future["day_of_week"] = future["date"].dt.dayofweek
future["day_of_month"] = future["date"].dt.day
future["month"] = future["date"].dt.month
future["day_of_year"] = future["date"].dt.dayofyear

features = bundle["features"]
model = bundle["models"][product_id]

future["predicted_units"] = model.predict(future[features]).clip(min=0).round(2)

print(f"\nDemand forecast for product {product_id}")
print(f"Forecast horizon: {forecast_days} days")
print(f"Last historical date: {last_date.date()}")
print(future[["date", "predicted_units"]].to_string(index=False))
print(f"\nTotal predicted demand: {future['predicted_units'].sum():.2f} units")
