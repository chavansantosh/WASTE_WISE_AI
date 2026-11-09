
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, index=True, nullable=False
    )
    quantity: Mapped[float] = mapped_column(
        Float, nullable=False
    )
    unit_price: Mapped[float] = mapped_column(
        Float, nullable=False
    )
    total_amount: Mapped[float] = mapped_column(
        Float, nullable=False
    )
    sale_date: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
