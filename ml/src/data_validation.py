
from pathlib import Path
import json

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

REPORT_PATH = (
    PROJECT_ROOT
    / "ml"
    / "artifacts"
    / "data_validation_report.json"
)

REQUIRED_COLUMNS = [
    "product_id",
    "date",
    "category",
    "opening_stock",
    "units_received",
    "units_sold",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    "waste_units",
    "stockout_flag",
]

NUMERIC_COLUMNS = [
    "opening_stock",
    "units_received",
    "units_sold",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    "waste_units",
    "stockout_flag",
]

NON_NEGATIVE_COLUMNS = [
    "opening_stock",
    "units_received",
    "units_sold",
    "unit_price",
    "waste_units",
]

INTEGER_QUANTITY_COLUMNS = [
    "opening_stock",
    "units_received",
    "units_sold",
    "waste_units",
]


def validate_data(data_path=DATA_PATH):
    errors = []
    warnings = []
    checks = {}

    data_path = Path(data_path)

    if not data_path.exists():
        return {
            "status": "FAILED",
            "file": str(data_path),
            "rows": 0,
            "errors": [f"Dataset not found: {data_path}"],
            "warnings": [],
            "checks": {"file_exists": False},
        }

    try:
        df = pd.read_csv(data_path)
    except Exception as exc:
        return {
            "status": "FAILED",
            "file": str(data_path),
            "rows": 0,
            "errors": [f"Could not read CSV: {exc}"],
            "warnings": [],
            "checks": {"file_readable": False},
        }

    checks["file_exists"] = True
    checks["file_readable"] = True
    checks["dataset_not_empty"] = not df.empty

    if df.empty:
        errors.append("Dataset contains no rows.")

    missing_columns = [
        column for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]
    checks["required_columns_present"] = not missing_columns

    if missing_columns:
        errors.append(f"Missing required columns: {missing_columns}")
        return {
            "status": "FAILED",
            "file": str(data_path),
            "rows": int(len(df)),
            "errors": errors,
            "warnings": warnings,
            "checks": checks,
        }

    # Required values: missing data is an error.
    missing_counts = df[REQUIRED_COLUMNS].isna().sum()
    missing_values = {
        col: int(count)
        for col, count in missing_counts.items()
        if count > 0
    }
    checks["no_missing_required_values"] = not missing_values

    if missing_values:
        errors.append(f"Missing required values: {missing_values}")

    # Empty text identifiers/categories are invalid too.
    blank_product_ids = int(
        df["product_id"].astype("string").str.strip().eq("").sum()
    )
    blank_categories = int(
        df["category"].astype("string").str.strip().eq("").sum()
    )

    checks["product_ids_present"] = (
        df["product_id"].notna().all() and blank_product_ids == 0
    )
    checks["categories_present"] = (
        df["category"].notna().all() and blank_categories == 0
    )

    if blank_product_ids:
        errors.append(f"{blank_product_ids} blank product IDs found.")
    if blank_categories:
        errors.append(f"{blank_categories} blank categories found.")

    # Parse and validate dates.
    parsed_dates = pd.to_datetime(df["date"], errors="coerce")
    invalid_dates = int(parsed_dates.isna().sum())
    checks["dates_valid"] = invalid_dates == 0

    if invalid_dates:
        errors.append(f"{invalid_dates} missing or invalid dates found.")

    # Convert numeric columns and check finite values.
    numeric_data = {}
    invalid_numeric = {}

    for col in NUMERIC_COLUMNS:
        values = pd.to_numeric(df[col], errors="coerce")
        numeric_data[col] = values

        invalid_mask = values.isna() & df[col].notna()
        if invalid_mask.any():
            invalid_numeric[col] = int(invalid_mask.sum())

        finite = values.dropna().to_numpy(dtype=float)
        if finite.size and not np.isfinite(finite).all():
            errors.append(f"{col} contains infinite values.")

    if invalid_numeric:
        errors.append(f"Non-numeric values found: {invalid_numeric}")

    checks["numeric_values_valid"] = not invalid_numeric and not any(
        "infinite values" in err for err in errors
    )

    # Required numeric values must not be missing.
    numeric_missing = {
        col: int(numeric_data[col].isna().sum())
        for col in NUMERIC_COLUMNS
        if numeric_data[col].isna().any()
    }
    if numeric_missing and not missing_values:
        errors.append(f"Missing numeric values: {numeric_missing}")

    # Non-negative quantities/prices.
    negative_values = {}
    for col in NON_NEGATIVE_COLUMNS:
        values = numeric_data[col]
        count = int((values.dropna() < 0).sum())
        if count:
            negative_values[col] = count

    checks["non_negative_quantities"] = not negative_values
    if negative_values:
        errors.append(f"Negative values found: {negative_values}")

    # Stock quantities should be whole units.
    fractional_quantities = {}
    for col in INTEGER_QUANTITY_COLUMNS:
        values = numeric_data[col].dropna()
        count = int((values % 1 != 0).sum())
        if count:
            fractional_quantities[col] = count

    checks["quantities_are_integers"] = not fractional_quantities
    if fractional_quantities:
        errors.append(
            f"Fractional inventory quantities found: {fractional_quantities}"
        )

    # Discounts are percentages from 0 to 100.
    discounts = numeric_data["discount_pct"].dropna()
    invalid_discounts = int(
        ((discounts < 0) | (discounts > 100)).sum()
    )
    checks["discount_range_valid"] = invalid_discounts == 0

    if invalid_discounts:
        errors.append(
            f"{invalid_discounts} discount_pct values are outside 0–100."
        )

    # stockout_flag must be binary.
    stockout = numeric_data["stockout_flag"].dropna()
    invalid_stockout = int((~stockout.isin([0, 1])).sum())
    checks["stockout_flag_binary"] = invalid_stockout == 0

    if invalid_stockout:
        errors.append(
            f"{invalid_stockout} stockout_flag values are not 0 or 1."
        )

    # Validate inventory balance.
    available = (
        numeric_data["opening_stock"]
        + numeric_data["units_received"]
    )
    sold = numeric_data["units_sold"]
    waste = numeric_data["waste_units"]

    sales_exceed_stock = int((sold > available).sum())
    sales_and_waste_exceed_stock = int(
        ((sold + waste) > available).sum()
    )

    checks["sales_within_available_stock"] = sales_exceed_stock == 0
    checks["sales_and_waste_within_available_stock"] = (
        sales_and_waste_exceed_stock == 0
    )

    if sales_exceed_stock:
        errors.append(
            f"{sales_exceed_stock} rows have sales above available stock."
        )

    if sales_and_waste_exceed_stock:
        errors.append(
            f"{sales_and_waste_exceed_stock} rows have sales plus waste "
            "above available stock."
        )

    # Product/date combinations must be unique.
    exact_duplicates = int(df.duplicated().sum())
    product_date_duplicates = int(
        df.assign(_parsed_date=parsed_dates).duplicated(
            subset=["product_id", "_parsed_date"]
        ).sum()
    )

    checks["no_exact_duplicates"] = exact_duplicates == 0
    checks["unique_product_date"] = product_date_duplicates == 0

    if exact_duplicates:
        warnings.append(f"Found {exact_duplicates} exact duplicate rows.")
    if product_date_duplicates:
        errors.append(
            f"Found {product_date_duplicates} repeated product/date rows."
        )

    # A product should map consistently to one category.
    category_counts = df.groupby(
        "product_id", dropna=False
    )["category"].nunique(dropna=False)

    inconsistent_products = int((category_counts > 1).sum())
    checks["product_category_consistent"] = inconsistent_products == 0

    if inconsistent_products:
        warnings.append(
            f"{inconsistent_products} product IDs map to multiple categories."
        )

    # Waste target summary and imbalance warning.
    waste_values = numeric_data["waste_units"].dropna()
    positive_waste_count = int((waste_values > 0).sum())
    zero_waste_count = int((waste_values == 0).sum())
    checks["waste_target_has_variation"] = waste_values.nunique() > 1

    if waste_values.empty:
        errors.append("No valid waste_units target values are available.")
    elif waste_values.nunique() <= 1:
        warnings.append("waste_units has only one distinct value.")

    if len(waste_values) and positive_waste_count / len(waste_values) < 0.10:
        warnings.append(
            "Fewer than 10% of non-missing waste targets are positive. "
            "Evaluate against simple baselines and inspect class imbalance."
        )

    # Negative expiry days can be legitimate.
    days_to_expiry = numeric_data["days_to_expiry"].dropna()
    expired_count = int((days_to_expiry < 0).sum())
    if expired_count:
        warnings.append(
            f"{expired_count} rows have negative days_to_expiry."
        )

    # Source authenticity cannot be established by these checks.
    warnings.append(
        "Structural validation does not verify dataset provenance or "
        "whether waste measurements are from real stores."
    )

    row_count = int(len(df))
    summary = {
        "row_count": row_count,
        "column_count": int(len(df.columns)),
        "columns": list(df.columns),
        "date_start": (
            str(parsed_dates.min().date())
            if parsed_dates.notna().any() else None
        ),
        "date_end": (
            str(parsed_dates.max().date())
            if parsed_dates.notna().any() else None
        ),
        "positive_waste_rows": positive_waste_count,
        "zero_waste_rows": zero_waste_count,
        "positive_waste_percentage": (
            round(positive_waste_count / len(waste_values) * 100, 2)
            if len(waste_values) else 0
        ),
        "exact_duplicate_rows": exact_duplicates,
        "repeated_product_date_rows": product_date_duplicates,
        "missing_values": missing_values,
        "negative_days_to_expiry_rows": expired_count,
        "sales_exceed_available_stock_rows": sales_exceed_stock,
        "sales_plus_waste_exceed_available_stock_rows": (
            sales_and_waste_exceed_stock
        ),
        "invalid_stockout_flag_rows": invalid_stockout,
        "inconsistent_product_category_ids": inconsistent_products,
    }

    return {
        "status": "PASSED" if not errors else "FAILED",
        "file": str(data_path),
        "rows": row_count,
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
        "summary": summary,
    }


def main():
    report = validate_data()

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, indent=4),
        encoding="utf-8",
    )

    print("=" * 60)
    print("WASTE WISE AI - DATA VALIDATION")
    print("=" * 60)
    print(f"Status: {report['status']}")
    print(f"Rows checked: {report['rows']}")

    print("\n--- CHECKS ---")
    for name, passed in report.get("checks", {}).items():
        print(f"{name}: {'PASS' if passed else 'FAIL'}")

    if report["warnings"]:
        print("\n--- WARNINGS ---")
        for warning in report["warnings"]:
            print(f"WARNING: {warning}")

    if report["errors"]:
        print("\n--- ERRORS ---")
        for error in report["errors"]:
            print(f"ERROR: {error}")

    print(f"\nReport saved to: {REPORT_PATH}")

    if report["status"] != "PASSED":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
