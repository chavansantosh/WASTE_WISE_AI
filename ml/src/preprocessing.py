
from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

TARGET_COLUMN = "waste_units"

REQUIRED_COLUMNS = [
    "product_id",
    "date",
    "category",
    "opening_stock",
    "units_received",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    TARGET_COLUMN,
]

NUMERIC_COLUMNS = [
    "opening_stock",
    "units_received",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
    TARGET_COLUMN,
]


def load_data(data_path=DEFAULT_DATA_PATH):
    """Load the inventory dataset and verify its required columns."""
    data_path = Path(data_path)

    if not data_path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {data_path}"
        )

    df = pd.read_csv(data_path)

    if df.empty:
        raise ValueError("The dataset is empty.")

    missing = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing:
        raise ValueError(
            f"Required columns are missing: {missing}"
        )

    return df


def clean_data(df, require_target=True):
    """
    Clean a copy of inventory data.

    Invalid dates and invalid numeric values become missing values.
    Rows missing essential identifiers, dates, or the target are removed
    when require_target=True. Other missing feature values are retained
    for the training pipeline's imputers.
    """
    if not isinstance(df, pd.DataFrame):
        raise TypeError("df must be a pandas DataFrame.")

    result = df.copy()

    required = [
        column
        for column in REQUIRED_COLUMNS
        if column != TARGET_COLUMN or require_target
    ]

    missing = [
        column for column in required
        if column not in result.columns
    ]

    if missing:
        raise ValueError(
            f"Required columns are missing: {missing}"
        )

    result["date"] = pd.to_datetime(
        result["date"],
        errors="coerce",
    )

    for column in NUMERIC_COLUMNS:
        if column in result.columns:
            result[column] = pd.to_numeric(
                result[column],
                errors="coerce",
            )

            result[column] = result[column].replace(
                [np.inf, -np.inf],
                np.nan,
            )

    essential_columns = [
        "product_id",
        "date",
        "category",
    ]

    if require_target:
        essential_columns.append(TARGET_COLUMN)

    result = result.dropna(
        subset=essential_columns
    ).copy()

    if require_target:
        # Waste quantity cannot be negative.
        result = result[
            result[TARGET_COLUMN] >= 0
        ].copy()

    # Keep identifiers and categories consistently represented.
    result["product_id"] = (
        result["product_id"].astype("string").str.strip()
    )
    result["category"] = (
        result["category"].astype("string").str.strip()
    )

    result = result[
        result["product_id"].notna()
        & result["product_id"].ne("")
        & result["category"].notna()
        & result["category"].ne("")
    ].copy()

    return result.reset_index(drop=True)


def prepare_data(data_path=DEFAULT_DATA_PATH, require_target=True):
    """Load and clean inventory data in one call."""
    df = load_data(data_path)

    return clean_data(
        df,
        require_target=require_target,
    )


def main():
    print("=" * 60)
    print("WASTE WISE AI - DATA PREPROCESSING")
    print("=" * 60)

    raw_df = load_data()
    clean_df = clean_data(raw_df, require_target=True)

    print(f"Original rows: {len(raw_df)}")
    print(f"Clean rows: {len(clean_df)}")
    print(f"Rows removed: {len(raw_df) - len(clean_df)}")
    print(f"Columns available: {len(clean_df.columns)}")

    print("\nMissing values in model columns:")
    for column in NUMERIC_COLUMNS:
        if column in clean_df.columns:
            print(
                f"{column}: {int(clean_df[column].isna().sum())}"
            )

    print("\nCleaned data sample:")
    print(clean_df.head(5).to_string(index=False))

    print("\nPreprocessing completed successfully.")


if __name__ == "__main__":
    main()
