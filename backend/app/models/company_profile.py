from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CompanyProfile(Base):
    __tablename__ = "company_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(
        String(120), nullable=False, default="Sunrise Mart"
    )
    tagline: Mapped[str] = mapped_column(
        String(180), nullable=False, default="Freshness Every Day"
    )
    logo_url: Mapped[str] = mapped_column(
        String(500), nullable=False, default="/assets/sunrise-mart-logo.svg"
    )
    hero_photo_url: Mapped[str] = mapped_column(
        String(500), nullable=False, default="/assets/dashboard-produce-photo.jpg"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
