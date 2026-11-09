
from pathlib import Path

import pandas as pd


# --------------------------------------------------
# 1. Project configuration
# --------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "perishable_inventory - perishable_inventory.csv"
)

TARGET_COLUMN = "waste_units"

BASE_FEATURES = [
    "product_id",
    "category",
    "opening_stock",
    "units_received",
    "unit_price",
    "discount_pct",
    "days_to_expiry",
    "temperature_c",
]

CALENDAR_FEATURES = [
    "month",
    "day_of_week",
    "day_of_month",
]

MODEL_FEATURES = BASE_FEATURES + CALENDAR_FEATURES

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
]


# --------------------------------------------------
# 2. Load inventory data
# --------------------------------------------------
def load_inventory_data(data_path=DEFAULT_DATA_PATH):
    """Load inventory CSV data and validate its basic structure."""
    data_path = Path(data_path)

    if not data_path.exists():
        raise FileNotFoundError(
            f"Inventory dataset not found: {data_path}"
        )

    df = pd.read_csv(data_path)

    if df.empty:
        raise ValueError("The inventory dataset is empty.")

    missing_columns = [
        column
        for column in REQUIRED_COLUMNS
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    return df


# --------------------------------------------------
# 3. Create calendar features
# --------------------------------------------------
def add_calendar_features(df):
    """Add calendar features derived from the inventory date."""
    result = df.copy()

    if "date" not in result.columns:
        raise ValueError("The dataset must contain a 'date' column.")

    result["date"] = pd.to_datetime(
        result["date"],
        errors="coerce",
    )

    invalid_dates = int(result["date"].isna().sum())

    if invalid_dates:
        raise ValueError(
            f"Found {invalid_dates} rows with missing or invalid dates."
        )

    result["month"] = result["date"].dt.month
    result["day_of_week"] = result["date"].dt.dayofweek
    result["day_of_month"] = result["date"].dt.day

    return result


# --------------------------------------------------
# 4. Prepare model features
# --------------------------------------------------
def prepare_features(df, require_target=False):
    """
    Return a copy with engineered features.

    When require_target=True, the waste_units target must exist.
    This function does not fit encoders or imputers.
    """
    result = add_calendar_features(df)

    missing_features = [
        column
        for column in BASE_FEATURES
        if column not in result.columns
    ]

    if missing_features:
        raise ValueError(
            f"Missing model input features: {missing_features}"
        )

    if require_target and TARGET_COLUMN not in result.columns:
        raise ValueError(
            f"Missing target column: {TARGET_COLUMN}"
        )

    if require_target:
        result[TARGET_COLUMN] = pd.to_numeric(
            result[TARGET_COLUMN],
            errors="coerce",
        )

        invalid_target = (
            result[TARGET_COLUMN].isna()
            | (result[TARGET_COLUMN] < 0)
        )

        if invalid_target.any():
            raise ValueError(
                f"Found {int(invalid_target.sum())} invalid "
                f"{TARGET_COLUMN} values."
            )

    return result


# --------------------------------------------------
# 5. Return X and y for model training
# --------------------------------------------------
def split_features_target(df):
    """Create model input X and target y from a prepared dataset."""
    if TARGET_COLUMN not in df.columns:
        raise ValueError(
            f"Cannot split data: '{TARGET_COLUMN}' is missing."
        )

    missing_features = [
        column
        for column in MODEL_FEATURES
        if column not in df.columns
    ]

    if missing_features:
        raise ValueError(
            f"Missing engineered features: {missing_features}"
        )

    clean_df = df.dropna(
        subset=MODEL_FEATURES + [TARGET_COLUMN]
    ).copy()

    if clean_df.empty:
        raise ValueError(
            "No complete rows remain after removing missing values."
        )

    X = clean_df[MODEL_FEATURES].copy()
    y = clean_df[TARGET_COLUMN].copy()

    return X, y


# --------------------------------------------------
# 6. Run a feature engineering demonstration
# --------------------------------------------------
def main():
    print("=" * 60)
    print("WASTE WISE AI - FEATURE ENGINEERING")
    print("=" * 60)

    df = load_inventory_data()
    prepared_df = prepare_features(df, require_target=True)

    X, y = split_features_target(prepared_df)

    print(f"Original rows: {len(df)}")
    print(f"Prepared rows: {len(prepared_df)}")
    print(f"Rows available for modeling: {len(X)}")
    print(f"Model feature count: {len(X.columns)}")
    print(f"Target column: {TARGET_COLUMN}")

    print("\nModel features:")
    for feature in X.columns:
        print(f"- {feature}")

    print("\nFeature sample:")
    print(X.head(5).to_string(index=False))

    print("\nTarget summary:")
    print(y.describe().to_string())

    print("\nFeature engineering completed successfully.")


if __name__ == "__main__":
    main()
