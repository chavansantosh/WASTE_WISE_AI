
from pathlib import Path

import joblib
import pandas as pd


# --------------------------------------------------
# Project paths
# --------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_PATH = (
    PROJECT_ROOT
    / "ml"
    / "data"
    / "raw"
    / "discount_scenarios_simulated - discount_scenarios_simulated.csv"
)

MODEL_PATH = PROJECT_ROOT / "ml" / "artifacts" / "discount_model.joblib"


# --------------------------------------------------
# Load model and dataset
# --------------------------------------------------

def load_resources():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Discount dataset not found: {DATA_PATH}"
        )

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Trained discount model not found: {MODEL_PATH}"
        )

    dataset = pd.read_csv(DATA_PATH)
    artifact = joblib.load(MODEL_PATH)

    model = artifact["model"]
    features = artifact["features"]

    return dataset, model, features


# --------------------------------------------------
# Recommend a discount for a batch
# --------------------------------------------------

def recommend_discount(batch_id, dataset, model, features):
    batch_data = dataset[dataset["batch_id"] == batch_id].copy()

    if batch_data.empty:
        raise ValueError(
            f"Batch ID {batch_id} was not found in the dataset."
        )

    # Evaluate each available discount scenario.
    X = batch_data[features]
    batch_data["predicted_gross_margin"] = model.predict(X)

    # Highest predicted gross margin comes first.
    ranked = batch_data.sort_values(
        "predicted_gross_margin",
        ascending=False,
    ).reset_index(drop=True)

    best = ranked.iloc[0]

    print("\n========== WASTE WISE AI ==========")
    print("DISCOUNT SCENARIO ANALYSIS")
    print("===================================")
    print(f"Batch ID: {batch_id}")
    print(f"Product ID: {best['product_id']}")
    print(f"Days to expiry: {best['days_to_expiry']}")
    print(f"Quantity remaining: {best['quantity_remaining']}")

    print("\nAvailable discount scenarios:")
    print(
        ranked[
            [
                "discount_pct",
                "estimated_units_sold_simulated",
                "predicted_gross_margin",
            ]
        ].round(2).to_string(index=False)
    )

    print("\n-----------------------------------")
    print("RECOMMENDATION")
    print("-----------------------------------")
    print(f"Discount: {best['discount_pct']}%")
    print(
        "Predicted gross margin: "
        f"{best['predicted_gross_margin']:.2f}"
    )
    print(
        "Simulated units sold: "
        f"{best['estimated_units_sold_simulated']}"
    )
    print("-----------------------------------")

    print(
        "\nNote: This recommendation maximizes predicted gross margin "
        "among the available simulated scenarios. It does not establish "
        "that a discount will increase real-world sales or reduce waste."
    )

    return ranked


# --------------------------------------------------
# Main
# --------------------------------------------------

def main():
    try:
        dataset, model, features = load_resources()

        # Change this value to analyze another batch.
        batch_id = 5001

        recommend_discount(
            batch_id=batch_id,
            dataset=dataset,
            model=model,
            features=features,
        )

    except (FileNotFoundError, ValueError, KeyError) as error:
        print(f"Recommendation failed: {error}")


if __name__ == "__main__":
    main()
