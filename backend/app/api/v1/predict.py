{
  "product_id": 1001,
  "category": "Dairy",
  "opening_stock": 27,
  "units_received": 0,
  "unit_price": 32,
  "discount_pct": 0,
  "days_to_expiry": 1,
  "temperature_c": 4.1,
  "date": "2026-04-01"
}


@app.post("/api/v1/predict")
def predict_inventory_waste(
    record: InventoryRecord,
    db: Session = Depends(get_db),
):
    try:
        result = predict_waste(record.model_dump())

        inventory = Inventory(
            product_id=record.product_id,
            category=record.category,
            opening_stock=record.opening_stock,
            units_received=record.units_received,
            unit_price=record.unit_price,
            discount_pct=record.discount_pct,
            days_to_expiry=record.days_to_expiry,
            temperature_c=record.temperature_c,
            inventory_date=record.date,
        )

        db.add(inventory)
        db.flush()

        prediction = Prediction(
            inventory_id=inventory.id,
            product_id=record.product_id,
            predicted_waste_units=result["predicted_waste_units"],
            model_type=result["model_type"],
            prediction_note=result["prediction_note"],
        )

        db.add(prediction)
        db.commit()
        db.refresh(prediction)

        return {
            "product_id": record.product_id,
            **result,
            "prediction_id": prediction.id,
            "inventory_id": inventory.id,
            "saved_to_database": True,
        }

    except (ValueError, TypeError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the prediction to the database.",
        ) from exc



    @app.get("/api/v1/predictions")
    def get_prediction_history(db: Session = Depends(get_db)):
        predictions = (
        db.query(Prediction)
            .order_by(Prediction.id.desc())
        .all()
    )

    return [
        {
        
            "prediction_id": prediction.id,
            "inventory_id": prediction.inventory_id,
            "product_id": prediction.product_id,
            "predicted_waste_units": prediction.predicted_waste_units,
            "model_type": prediction.model_type,
            "prediction_note": prediction.prediction_note,
            "created_at": prediction.created_at,
        }
        for prediction in predictions
    ]
