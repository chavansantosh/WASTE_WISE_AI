
from pathlib import Path

import pandas as pd


# Project paths
PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

REPORT_DIR = PROJECT_ROOT / "ml" / "reports"


def load_inventory_data():
    """Load and validate the inventory dataset."""

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Inventory dataset not found: {DATA_PATH}"
        )

    df = pd.read_csv(DATA_PATH)

    required_columns = [
        "product_id",
        "date",
        "category",
        "opening_stock",
        "units_received",
        "units_sold",
        "days_to_expiry",
        "waste_units",
    ]

    missing = [col for col in required_columns if col not in df.columns]

    if missing:
        raise ValueError(
            f"Missing required columns: {missing}"
        )

    df["date"] = pd.to_datetime(df["date"], errors="coerce")

    numeric_columns = [
        "opening_stock",
        "units_received",
        "units_sold",
        "days_to_expiry",
        "waste_units",
    ]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column], errors="coerce"
        )

    df = df.dropna(subset=required_columns).copy()

    # Estimated stock remaining after sales and recorded waste.
    df["estimated_remaining_stock"] = (
        df["opening_stock"]
        + df["units_received"]
        - df["units_sold"]
        - df["waste_units"]
    )

    # These are configurable demo thresholds, not business rules.
    df["low_stock_flag"] = (
        df["estimated_remaining_stock"] <= 5
    )

    df["expiry_warning_flag"] = (
        (df["days_to_expiry"] >= 0)
        & (df["days_to_expiry"] <= 2)
    )

    df["stock_discrepancy_flag"] = (
        df["estimated_remaining_stock"] < 0
    )

    return df


def analyze_inventory(df):
    """Generate inventory summaries and risk indicators."""

    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    latest_date = df["date"].max()

    # Latest available record per product.
    latest_inventory = (
        df.sort_values("date")
        .drop_duplicates(subset=["product_id"], keep="last")
        .copy()
    )

    latest_inventory["low_stock_flag"] = (
        latest_inventory["estimated_remaining_stock"] <= 5
    )

    latest_inventory["expiry_warning_flag"] = (
        (latest_inventory["days_to_expiry"] >= 0)
        & (latest_inventory["days_to_expiry"] <= 2)
    )

    latest_inventory["stock_discrepancy_flag"] = (
        latest_inventory["estimated_remaining_stock"] < 0
    )

    # Category-level waste summary across all valid historical records.
    category_summary = (
        df.groupby("category", as_index=False)
        .agg(
            records=("product_id", "size"),
            total_units_sold=("units_sold", "sum"),
            total_waste_units=("waste_units", "sum"),
            average_waste_units=("waste_units", "mean"),
        )
        .sort_values("total_waste_units", ascending=False)
    )

    # Latest inventory records with low stock or expiry warnings.
    inventory_alerts = latest_inventory[
        latest_inventory["low_stock_flag"]
        | latest_inventory["expiry_warning_flag"]
        | latest_inventory["stock_discrepancy_flag"]
    ].copy()

    inventory_columns = [
        "product_id",
        "category",
        "date",
        "opening_stock",
        "units_received",
        "units_sold",
        "waste_units",
        "estimated_remaining_stock",
        "days_to_expiry",
        "low_stock_flag",
        "expiry_warning_flag",
        "stock_discrepancy_flag",
    ]

    inventory_columns = [
        col for col in inventory_columns
        if col in latest_inventory.columns
    ]

    latest_inventory[inventory_columns].to_csv(
        REPORT_DIR / "inventory_summary.csv",
        index=False,
    )

    category_summary.to_csv(
        REPORT_DIR / "category_waste_summary.csv",
        index=False,
    )

    inventory_alerts[inventory_columns].to_csv(
        REPORT_DIR / "inventory_alerts.csv",
        index=False,
    )

    print("\n========== WASTE WISE AI INVENTORY REPORT ==========")
    print(f"Latest dataset date: {latest_date.date()}")
    print(f"Historical records analyzed: {len(df)}")
    print(f"Unique products: {df['product_id'].nunique()}")
    print(f"Categories: {df['category'].nunique()}")

    print("\nLatest-record inventory alerts")
    print(f"Low-stock products: {int(latest_inventory['low_stock_flag'].sum())}")
    print(
        "Products nearing expiry: "
        f"{int(latest_inventory['expiry_warning_flag'].sum())}"
    )
    print(
        "Negative estimated stock records: "
        f"{int(latest_inventory['stock_discrepancy_flag'].sum())}"
    )

    print("\nWaste by category")
    print(category_summary.to_string(index=False))

    print(f"\nReports saved in: {REPORT_DIR}")


def main():
    try:
        inventory_df = load_inventory_data()
        analyze_inventory(inventory_df)

    except (FileNotFoundError, ValueError) as error:
        print(f"Inventory analysis failed: {error}")


if __name__ == "__main__":
    main()
