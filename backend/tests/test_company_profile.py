import asyncio
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from starlette.datastructures import Headers
from starlette.datastructures import UploadFile

from app.api.v1 import company_profile as company_profile_api
from app.db.base import Base
from app.db.session import get_db
from app.models.company_profile import CompanyProfile


def image_upload(image_format: str, filename: str) -> UploadFile:
    content = BytesIO()
    Image.new("RGB", (16, 12), color=(42, 128, 72)).save(
        content,
        format=image_format,
    )
    return UploadFile(
        file=BytesIO(content.getvalue()),
        filename=filename,
        headers=Headers({"content-type": f"image/{image_format.lower()}"}),
    )


class CompanyProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.upload_directory = Path(self.temporary_directory.name) / "uploads"
        self.original_upload_directory = company_profile_api.UPLOAD_DIR
        company_profile_api.UPLOAD_DIR = self.upload_directory
        self.addCleanup(
            setattr,
            company_profile_api,
            "UPLOAD_DIR",
            self.original_upload_directory,
        )

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        self.session = Session(self.engine)
        self.addCleanup(self.session.close)

    def test_defaults_are_returned_without_creating_database_row(self):
        profile = company_profile_api.get_company_profile(self.session)

        self.assertEqual(profile.company_name, "Sunrise Mart")
        self.assertEqual(profile.tagline, "Freshness Every Day")
        self.assertEqual(profile.logo_url, "/assets/sunrise-mart-logo.svg")
        self.assertEqual(
            profile.hero_photo_url,
            "/assets/dashboard-produce-photo.jpg",
        )
        self.assertIsNone(self.session.get(CompanyProfile, 1))

    def test_profile_text_is_persisted(self):
        saved = asyncio.run(
            company_profile_api.update_company_profile(
                company_name="  Sunrise Market  ",
                tagline="  Fresh from the farm  ",
                logo=None,
                hero_photo=None,
                db=self.session,
            )
        )

        self.assertEqual(saved.company_name, "Sunrise Market")
        self.assertEqual(saved.tagline, "Fresh from the farm")

        with Session(self.engine) as reopened_session:
            persisted = company_profile_api.get_company_profile(reopened_session)
            self.assertEqual(persisted.company_name, "Sunrise Market")
            self.assertEqual(persisted.tagline, "Fresh from the farm")

    def test_image_uploads_are_validated_stored_and_served_by_extension(self):
        saved = asyncio.run(
            company_profile_api.update_company_profile(
                company_name="Sunrise Mart",
                tagline="Freshness Every Day",
                logo=image_upload("PNG", "brand.png"),
                hero_photo=image_upload("JPEG", "store.jpg"),
                db=self.session,
            )
        )

        logo_name = Path(saved.logo_url).name
        hero_name = Path(saved.hero_photo_url).name
        self.assertRegex(logo_name, r"^logo-[0-9a-f]{32}\.png$")
        self.assertRegex(hero_name, r"^hero-[0-9a-f]{32}\.jpg$")

        for name, image_format in ((logo_name, "PNG"), (hero_name, "JPEG")):
            with Image.open(self.upload_directory / name) as image:
                self.assertEqual(image.format, image_format)

        logo_response = company_profile_api.get_company_profile_asset(logo_name)
        hero_response = company_profile_api.get_company_profile_asset(hero_name)
        self.assertEqual(logo_response.media_type, "image/png")
        self.assertEqual(hero_response.media_type, "image/jpeg")

    def test_invalid_image_does_not_replace_persisted_profile(self):
        original = asyncio.run(
            company_profile_api.update_company_profile(
                company_name="Sunrise Mart",
                tagline="Freshness Every Day",
                logo=None,
                hero_photo=None,
                db=self.session,
            )
        )
        invalid_upload = UploadFile(
            file=BytesIO(b"not an image"),
            filename="invalid.png",
            headers=Headers({"content-type": "image/png"}),
        )

        with self.assertRaises(company_profile_api.HTTPException) as raised:
            asyncio.run(
                company_profile_api.update_company_profile(
                    company_name="Changed",
                    tagline="Changed",
                    logo=invalid_upload,
                    hero_photo=None,
                    db=self.session,
                )
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(
            company_profile_api.get_company_profile(self.session).company_name,
            original.company_name,
        )

    def test_upload_size_limit_is_enforced(self):
        oversized_upload = UploadFile(
            file=BytesIO(b"x" * (company_profile_api.MAX_UPLOAD_BYTES + 1)),
            filename="oversized.png",
            headers=Headers({"content-type": "image/png"}),
        )
        with self.assertRaises(company_profile_api.HTTPException) as raised:
            asyncio.run(company_profile_api._store_image(oversized_upload, "logo"))
        self.assertEqual(raised.exception.status_code, 413)

    def test_http_endpoints_persist_profile_and_return_uploaded_images(self):
        application = FastAPI()
        application.include_router(company_profile_api.router)

        def override_get_db():
            with Session(self.engine) as session:
                yield session

        application.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(application) as client:
                defaults = client.get("/api/v1/company-profile")
                self.assertEqual(defaults.status_code, 200)
                self.assertEqual(defaults.json()["company_name"], "Sunrise Mart")

                logo = BytesIO()
                Image.new("RGB", (18, 12), color=(200, 120, 25)).save(
                    logo,
                    format="PNG",
                )
                hero_photo = BytesIO()
                Image.new("RGB", (24, 16), color=(35, 100, 50)).save(
                    hero_photo,
                    format="JPEG",
                )
                saved = client.put(
                    "/api/v1/company-profile",
                    data={
                        "company_name": "Sunrise Market",
                        "tagline": "Fresh food nearby",
                    },
                    files={
                        "logo": ("logo.png", logo.getvalue(), "image/png"),
                        "hero_photo": (
                            "store.jpg",
                            hero_photo.getvalue(),
                            "image/jpeg",
                        ),
                    },
                )
                self.assertEqual(saved.status_code, 200, saved.text)
                body = saved.json()
                self.assertEqual(body["company_name"], "Sunrise Market")
                self.assertTrue(body["logo_url"].endswith(".png"))
                self.assertTrue(body["hero_photo_url"].endswith(".jpg"))

                for key, expected_type in (
                    ("logo_url", "image/png"),
                    ("hero_photo_url", "image/jpeg"),
                ):
                    image_response = client.get(body[key])
                    self.assertEqual(image_response.status_code, 200)
                    self.assertEqual(
                        image_response.headers["content-type"],
                        expected_type,
                    )

                persisted = client.get("/api/v1/company-profile")
                self.assertEqual(persisted.json(), body)
        finally:
            application.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
