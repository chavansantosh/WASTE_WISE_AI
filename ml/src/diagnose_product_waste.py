
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

df = pd.read_csv(DATA_PATH, parse_dates=["date"])

# Summary of waste by product
product_summary = (
    df.groupby("product_id")
    .agg(
        rows=("waste_units", "size"),
        positive_days=("waste_units", lambda s: (s > 0).sum()),
        waste_rate=("waste_units", lambda s: (s > 0).mean() * 100),
        mean_waste=("waste_units", "mean"),
        median_waste=("waste_units", "median"),
        max_waste=("waste_units", "max"),
    )
    .round(2)
)

print("=" * 65)
print("PRODUCT-LEVEL WASTE SUMMARY")
print("=" * 65)
print(product_summary.to_string())

# Compare positive-waste rates by product and month
df["month"] = df["date"].dt.to_period("M")
df["waste_flag"] = (df["waste_units"] > 0).astype(int)

monthly_rates = (
    df.pivot_table(
        index="product_id",
        columns="month",
        values="waste_flag",
        aggfunc="mean",
    )
    .mul(100)
    .round(1)
)

print("\n" + "=" * 65)
print("MONTHLY WASTE RATE BY PRODUCT (%)")
print("=" * 65)
print(monthly_rates.to_string())

print("\nDiagnostic complete. No data or models were modified.")
