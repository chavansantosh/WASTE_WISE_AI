
from pathlib import Path
import pandas as pd

# Project root: WASTE_WISE_AI
PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "ml" / "data" / "raw"

print("=" * 70)
print("WASTE WISE AI - DATA QUALITY INSPECTION")
print("=" * 70)

# 1. Find all CSV files inside the project
print("\n1. CSV FILES FOUND IN THE PROJECT")

csv_files = sorted(PROJECT_ROOT.rglob("*.csv"))

for file in csv_files:
    print(f" - {file.relative_to(PROJECT_ROOT)}")

# 2. Inspect the food-waste dataset
waste_path = RAW_DIR / "perishable_inventory - perishable_inventory.csv"

print("\n2. FOOD-WASTE DATASET")

if waste_path.exists():
    df = pd.read_csv(waste_path)

    print("Shape:", df.shape)
    print("\nMissing values:")
    print(df.isnull().sum().to_string())

    print("\nDuplicate rows:", df.duplicated().sum())

    print("\nTarget distribution (waste_units):")
    print(df["waste_units"].describe())

    print("\nTarget values:")
    print(df["waste_units"].value_counts().sort_index().to_string())

    print("\nNumeric feature summary:")
    print(df.select_dtypes(include="number").describe().round(2).to_string())
else:
    print("Food-waste CSV not found at:", waste_path)

# 3. Inspect the simulated discount dataset
discount_path = (
    RAW_DIR / "discount_scenarios_simulated - discount_scenarios_simulated.csv"
)

print("\n3. SIMULATED DISCOUNT DATASET")

if discount_path.exists():
    df = pd.read_csv(discount_path)

    print("Shape:", df.shape)
    print("\nMissing values:")
    print(df.isnull().sum().to_string())

    print("\nDuplicate rows:", df.duplicated().sum())

    print("\nDiscount distribution:")
    print(df["discount_pct"].value_counts().sort_index().to_string())

    print("\nNumeric summary:")
    print(df.select_dtypes(include="number").describe().round(2).to_string())
else:
    print("Discount CSV not found at:", discount_path)

# 4. Check for likely historical sales and expiry-label datasets
print("\n4. CHECK FOR SALES AND EXPIRY-RISK DATA")

for file in csv_files:
    name = file.name.lower()

    if any(word in name for word in ["sales_train", "sales_history", "historical_sales"]):
        print("Possible historical sales dataset:", file.relative_to(PROJECT_ROOT))

    if any(word in name for word in ["inventory_batches", "expiry_risk"]):
        print("Possible expiry-risk dataset:", file.relative_to(PROJECT_ROOT))

print("\nInspection complete. No model has been trained by this script.")
