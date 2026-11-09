
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    ROOT / "ml" / "data" / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

df = pd.read_csv(DATA_PATH)
df["date"] = pd.to_datetime(df["date"])

df["waste_flag"] = (df["waste_units"] > 0).astype(int)

print("=" * 65)
print("WASTE PATTERN ANALYSIS")
print("=" * 65)

print("\n1. WASTE OCCURRENCE")
print(df["waste_flag"].value_counts().rename(
    index={0: "Zero waste", 1: "Positive waste"}
))

print("\n2. WASTE RATE BY CATEGORY (%)")
print(
    (df.groupby("category")["waste_flag"].mean() * 100)
    .round(2)
    .sort_values(ascending=False)
)

print("\n3. FEATURE AVERAGES: ZERO VS POSITIVE WASTE")
features = [
    "opening_stock",
    "units_received",
    "units_sold",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    "stockout_flag",
]

print(
    df.groupby("waste_flag")[features]
    .mean()
    .round(2)
    .rename(index={0: "Zero waste", 1: "Positive waste"})
    .T
)

print("\n4. WASTE BY DAYS TO EXPIRY")
print(
    df.groupby("days_to_expiry")
    .agg(
        rows=("waste_units", "size"),
        waste_rate=("waste_flag", "mean"),
        average_waste=("waste_units", "mean"),
    )
    .assign(waste_rate=lambda x: (x["waste_rate"] * 100).round(2))
    .round(2)
    .to_string()
)

print("\n5. MONTHLY WASTE SUMMARY")
print(
    df.groupby(df["date"].dt.to_period("M"))
    .agg(
        rows=("waste_units", "size"),
        positive_waste_rows=("waste_flag", "sum"),
        total_waste=("waste_units", "sum"),
        average_waste=("waste_units", "mean"),
    )
    .round(2)
    .to_string()
)

print("\n6. LARGEST WASTE RECORDS")
print(
    df.nlargest(10, "waste_units")[
        ["date", "product_id", "category", "opening_stock",
         "units_received", "units_sold", "days_to_expiry",
         "temperature_c", "waste_units"]
    ].to_string(index=False)
)

print("\nAnalysis complete. No data or models were modified.")
