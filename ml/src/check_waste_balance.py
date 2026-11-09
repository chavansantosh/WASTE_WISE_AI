
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

df = pd.read_csv(DATA_PATH)

required_columns = [
    "opening_stock",
    "units_received",
    "units_sold",
    "waste_units",
]

missing = [col for col in required_columns if col not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

# Total stock available before sales, waste, and any other movements.
df["available_stock"] = df["opening_stock"] + df["units_received"]

# Sales plus waste should not exceed available stock,
# assuming these quantities refer to the same daily stock period.
df["sales_plus_waste"] = df["units_sold"] + df["waste_units"]

df["exceeds_available_stock"] = (
    df["sales_plus_waste"] > df["available_stock"]
)

df["estimated_remaining_stock"] = (
    df["available_stock"] - df["sales_plus_waste"]
)

print("=" * 65)
print("WASTE WISE AI - STOCK FEASIBILITY AUDIT")
print("=" * 65)

print(f"\nTotal records: {len(df)}")
print(
    "Records where sales + waste exceed available stock: "
    f"{df['exceeds_available_stock'].sum()}"
)
print(
    "Feasible records under this assumption: "
    f"{(~df['exceeds_available_stock']).sum()}"
)

print("\nLARGEST STOCK FEASIBILITY VIOLATIONS")

violations = df.loc[
    df["exceeds_available_stock"],
    [
        "date",
        "product_id",
        "opening_stock",
        "units_received",
        "units_sold",
        "waste_units",
        "available_stock",
        "sales_plus_waste",
    ],
].copy()

if violations.empty:
    print("No violations found under this assumption.")
else:
    violations["excess_units"] = (
        violations["sales_plus_waste"] - violations["available_stock"]
    )
    print(
        violations.sort_values("excess_units", ascending=False)
        .head(20)
        .to_string(index=False)
    )

print("\nLargest waste records:")
print(
    df.nlargest(10, "waste_units")[
        [
            "date",
            "product_id",
            "opening_stock",
            "units_received",
            "units_sold",
            "waste_units",
            "available_stock",
        ]
    ].to_string(index=False)
)

print("\nAudit complete. No data or models were modified.")
