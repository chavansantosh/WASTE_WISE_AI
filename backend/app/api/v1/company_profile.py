import logging
import re
import warnings
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company_profile import CompanyProfile

router = APIRouter(prefix="/api/v1/company-profile", tags=["Company Profile"])
logger = logging.getLogger(__name__)

DEFAULT_COMPANY_NAME = "Sunrise Mart"
DEFAULT_TAGLINE = "Freshness Every Day"
DEFAULT_LOGO_URL = "/assets/sunrise-mart-logo.svg"
DEFAULT_HERO_PHOTO_URL = "/assets/dashboard-produce-photo.jpg"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_DIMENSION = 6000
MAX_IMAGE_PIXELS = 20_000_000
UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "company-profile"
SUPPORTED_FORMATS = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}
ASSET_FILENAME_PATTERN = re.compile(
    r"(?:logo|hero)-[0-9a-f]{32}\.(?:jpg|png|webp)\Z"
)


class CompanyProfileResponse(BaseModel):
    id: int = 1
    company_name: str
    tagline: str
    logo_url: str
    hero_photo_url: str

    model_config = ConfigDict(from_attributes=True)


def _default_profile() -> CompanyProfileResponse:
    return CompanyProfileResponse(
        company_name=DEFAULT_COMPANY_NAME,
        tagline=DEFAULT_TAGLINE,
        logo_url=DEFAULT_LOGO_URL,
        hero_photo_url=DEFAULT_HERO_PHOTO_URL,
    )


def _read_profile(db: Session) -> CompanyProfile | CompanyProfileResponse:
    return db.get(CompanyProfile, 1) or _default_profile()


async def _store_image(upload: UploadFile | None, kind: str) -> Path | None:
    if upload is None:
        return None

    try:
        content = await upload.read(MAX_UPLOAD_BYTES + 1)
    except OSError as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not read the uploaded image.",
        ) from exc
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image files must be 5 MB or smaller.",
        )
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded image is empty.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                image_format = image.format
                width, height = image.size
                image.verify()

            if image_format not in SUPPORTED_FORMATS:
                raise HTTPException(
                    status_code=415,
                    detail="Upload a JPEG, PNG, or WebP image.",
                )
            if (
                width < 1
                or height < 1
                or width > MAX_IMAGE_DIMENSION
                or height > MAX_IMAGE_DIMENSION
                or width * height > MAX_IMAGE_PIXELS
            ):
                raise HTTPException(
                    status_code=422,
                    detail="Image dimensions must be at most 6000 pixels per side and 20 megapixels total.",
                )

            with Image.open(BytesIO(content)) as image:
                image = ImageOps.exif_transpose(image)
                output = BytesIO()
                if image_format == "JPEG":
                    if image.mode not in ("RGB", "L"):
                        background = Image.new("RGB", image.size, "white")
                        if "A" in image.getbands():
                            background.paste(image, mask=image.getchannel("A"))
                        else:
                            background.paste(image.convert("RGB"))
                        image = background
                    image.save(output, format="JPEG", quality=90, optimize=True)
                else:
                    image.save(output, format=image_format, optimize=True)
                normalized_content = output.getvalue()
    except HTTPException:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=422,
            detail="The uploaded file is not a valid supported image.",
        ) from exc

    extension, _ = SUPPORTED_FORMATS[image_format]
    destination = UPLOAD_DIR / f"{kind}-{uuid4().hex}.{extension}"
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(normalized_content)
    except OSError as exc:
        logger.exception("Could not save uploaded company profile image.")
        raise HTTPException(
            status_code=500,
            detail="Could not save the uploaded image.",
        ) from exc
    return destination


@router.get("", response_model=CompanyProfileResponse)
def get_company_profile(db: Session = Depends(get_db)):
    return _read_profile(db)


@router.put("", response_model=CompanyProfileResponse)
async def update_company_profile(
    company_name: str = Form(min_length=1, max_length=120),
    tagline: str = Form(min_length=1, max_length=180),
    logo: UploadFile | None = File(default=None),
    hero_photo: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    company_name = company_name.strip()
    tagline = tagline.strip()
    if not company_name or not tagline:
        raise HTTPException(
            status_code=422,
            detail="Company name and tagline cannot be blank.",
        )

    saved_files: list[Path] = []
    try:
        logo_file = await _store_image(logo, "logo")
        if logo_file is not None:
            saved_files.append(logo_file)
        hero_file = await _store_image(hero_photo, "hero")
        if hero_file is not None:
            saved_files.append(hero_file)
    except HTTPException:
        for path in saved_files:
            path.unlink(missing_ok=True)
        raise

    profile = db.get(CompanyProfile, 1)
    if profile is None:
        profile = CompanyProfile(
            id=1,
            company_name=DEFAULT_COMPANY_NAME,
            tagline=DEFAULT_TAGLINE,
            logo_url=DEFAULT_LOGO_URL,
            hero_photo_url=DEFAULT_HERO_PHOTO_URL,
        )
        db.add(profile)

    profile.company_name = company_name
    profile.tagline = tagline
    if logo_file is not None:
        profile.logo_url = f"/api/v1/company-profile/assets/{logo_file.name}"
    if hero_file is not None:
        profile.hero_photo_url = f"/api/v1/company-profile/assets/{hero_file.name}"

    try:
        db.commit()
        db.refresh(profile)
        return profile
    except SQLAlchemyError as exc:
        db.rollback()
        for path in saved_files:
            path.unlink(missing_ok=True)
        logger.exception("Could not save company profile.")
        raise HTTPException(
            status_code=500,
            detail="Could not save company profile.",
        ) from exc


@router.get("/assets/{filename}", include_in_schema=False)
def get_company_profile_asset(filename: str):
    if not ASSET_FILENAME_PATTERN.fullmatch(filename):
        raise HTTPException(status_code=404, detail="Company profile image not found.")

    path = UPLOAD_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Company profile image not found.")

    return FileResponse(path)
