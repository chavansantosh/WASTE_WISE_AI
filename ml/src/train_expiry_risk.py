
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
REPORT_PATH = REPORT_DIR / "expiry_risk_report.csv"


def classify_expiry_risk(days_to_expiry):
    """Assign an operational alert based on days until expiry."""

    if days_to_expiry <= 0:
        return "Critical"
    elif days_to_expiry <= 2:
        return "High"
    elif days_to_expiry <= 5:
        return "Medium"
    return "Low"


def main():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    required_columns = [
        "product_id",
        "date",
        "category",
        "opening_stock",
        "units_received",
        "units_sold",
        "days_to_expiry",
    ]

    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Validate the fields needed for expiry alerts.
    df["date"] = pd.to_datetime(df["date"], errors="raise")
    df["days_to_expiry"] = pd.to_numeric(
        df["days_to_expiry"], errors="raise"
    )

    if df["days_to_expiry"].isna().any():
        raise ValueError("days_to_expiry contains missing values.")

    # Estimated stock balance from the available daily data.
    df["estimated_remaining_stock"] = (
        df["opening_stock"] + df["units_received"] - df["units_sold"]
    ).clip(lower=0)

    # These are operational rules, not ML predictions.
    df["expiry_risk"] = df["days_to_expiry"].apply(
        classify_expiry_risk
    )

    # Prioritize stock that is both near expiry and available.
    df["action_required"] = (
        (df["days_to_expiry"] <= 2)
        & (df["estimated_remaining_stock"] > 0)
    )

    df["recommended_action"] = "Monitor stock"

    df.loc[
        (df["days_to_expiry"] <= 0)
        & (df["estimated_remaining_stock"] > 0),
        "recommended_action",
    ] = "Urgently inspect expired/today stock"

    df.loc[
        (df["days_to_expiry"].between(1, 2))
        & (df["estimated_remaining_stock"] > 0),
        "recommended_action",
    ] = "Prioritize sale or safe redistribution"

    df.loc[
        (df["days_to_expiry"] <= 2)
        & (df["estimated_remaining_stock"] <= 0),
        "recommended_action",
    ] = "Verify stock balance"

    # Most urgent items appear first.
    risk_order = {
        "Critical": 0,
        "High": 1,
        "Medium": 2,
        "Low": 3,
    }

    df["_risk_order"] = df["expiry_risk"].map(risk_order)

    report_columns = [
        "product_id",
        "date",
        "category",
        "opening_stock",
        "units_received",
        "units_sold",
        "estimated_remaining_stock",
        "days_to_expiry",
        "expiry_risk",
        "action_required",
        "recommended_action",
    ]

    report = df.sort_values(
        ["_risk_order", "days_to_expiry", "date"],
        ascending=[True, True, False],
    )[report_columns]

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report.to_csv(REPORT_PATH, index=False)

    print("Expiry risk report generated successfully.")
    print(f"Records analyzed: {len(report)}")
    print("\nRisk summary:")
    print(
        report["expiry_risk"]
        .value_counts()
        .reindex(["Critical", "High", "Medium", "Low"], fill_value=0)
        .to_string()
    )
    print(
        "\nRecords requiring immediate attention:",
        int(report["action_required"].sum()),
    )
    print(f"\nSaved report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
