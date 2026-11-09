
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
print("WASTE DATA QUALITY AUDIT")
print("=" * 65)

print("\n1. BASIC VALIDATION")
print("Negative waste values:", (df["waste_units"] < 0).sum())
print("Negative opening stock:", (df["opening_stock"] < 0).sum())
print("Negative received units:", (df["units_received"] < 0).sum())
print("Negative sold units:", (df["units_sold"] < 0).sum())
print("Negative days to expiry:", (df["days_to_expiry"] < 0).sum())

print("\n2. WASTE BY PRODUCT")
print(
    df.groupby("product_id").agg(
        records=("waste_units", "size"),
        positive_waste_rows=("waste_flag", "sum"),
        total_waste=("waste_units", "sum"),
        max_waste=("waste_units", "max"),
    ).to_string()
)

print("\n3. WASTE BY MONTH")
print(
    df.groupby(df["date"].dt.to_period("M")).agg(
        records=("waste_units", "size"),
        positive_waste_rows=("waste_flag", "sum"),
        total_waste=("waste_units", "sum"),
    ).to_string()
)

print("\n4. WASTE GREATER THAN AVAILABLE STOCK")
available_stock = df["opening_stock"] + df["units_received"]
invalid_waste = df["waste_units"] > available_stock

print("Rows where waste exceeds opening stock + received:",
      invalid_waste.sum())

print(
    df.loc[
        invalid_waste,
        [
            "date", "product_id", "opening_stock",
            "units_received", "units_sold", "waste_units"
        ],
    ].head(15).to_string(index=False)
)

print("\n5. WASTE VALUE DISTRIBUTION")
print(df["waste_units"].describe().to_string())

print("\n6. LARGEST WASTE VALUES")
print(
    df.loc[df["waste_units"] > 0]
    .nlargest(15, "waste_units")[
        ["date", "product_id", "category", "opening_stock",
         "units_received", "units_sold", "days_to_expiry",
         "temperature_c", "waste_units"]
    ].to_string(index=False)
)

print("\nAudit complete. No data or models were modified.")
