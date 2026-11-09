import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.auth import router as auth_router
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.models.user import User
from setup_admin import provision_admin_account, verify_local_login_endpoint


class AdminSetupTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.addCleanup(self.session.close)

    def test_creates_account_with_hash_and_normalized_email(self):
        result = provision_admin_account(
            self.session,
            " Admin.Example@Gmail.com ",
            "Administrator",
            "Secure-Password-123",
        )

        user = self.session.query(User).one()
        self.assertEqual(result, "created")
        self.assertEqual(user.email, "admin.example@gmail.com")
        self.assertNotEqual(user.hashed_password, "Secure-Password-123")
        self.assertTrue(
            verify_password("Secure-Password-123", user.hashed_password)
        )

    def test_existing_password_is_not_overwritten_without_confirmation(self):
        original_hash = hash_password("Original-Password-123")
        user = User(
            email="admin.example@gmail.com",
            full_name="Existing Admin",
            hashed_password=original_hash,
            is_active=True,
        )
        self.session.add(user)
        self.session.commit()

        result = provision_admin_account(
            self.session,
            "admin.example@gmail.com",
            "Administrator",
            "Replacement-Password-123",
        )

        self.session.refresh(user)
        self.assertEqual(result, "confirmation-required")
        self.assertEqual(user.hashed_password, original_hash)
        self.assertTrue(
            verify_password("Original-Password-123", user.hashed_password)
        )

    def test_existing_matching_password_is_preserved(self):
        original_hash = hash_password("Existing-Password-123")
        self.session.add(
            User(
                email="admin.example@gmail.com",
                full_name="Existing Admin",
                hashed_password=original_hash,
                is_active=True,
            )
        )
        self.session.commit()

        result = provision_admin_account(
            self.session,
            "admin.example@gmail.com",
            "Administrator",
            "Existing-Password-123",
            replace_existing_password=True,
        )

        user = self.session.query(User).one()
        self.assertEqual(result, "already-exists")
        self.assertEqual(user.hashed_password, original_hash)

    def test_existing_password_changes_only_after_explicit_confirmation(self):
        user = User(
            email="admin.example@gmail.com",
            full_name="Existing Admin",
            hashed_password=hash_password("Original-Password-123"),
            is_active=True,
        )
        self.session.add(user)
        self.session.commit()

        result = provision_admin_account(
            self.session,
            "admin.example@gmail.com",
            "Administrator",
            "Replacement-Password-123",
            replace_existing_password=True,
        )

        self.session.refresh(user)
        self.assertEqual(result, "password-updated")
        self.assertTrue(
            verify_password("Replacement-Password-123", user.hashed_password)
        )
        self.assertFalse(
            verify_password("Original-Password-123", user.hashed_password)
        )

    def test_provisioned_account_can_login_through_auth_endpoint(self):
        provision_admin_account(
            self.session,
            "admin.example@gmail.com",
            "Administrator",
            "Secure-Password-123",
        )
        application = FastAPI()
        application.include_router(auth_router)

        def override_get_db():
            with Session(self.engine) as db:
                yield db

        application.dependency_overrides[get_db] = override_get_db
        with TestClient(application) as client:
            response = client.post(
                "/api/v1/auth/login",
                json={
                    "email": "admin.example@gmail.com",
                    "password": "Secure-Password-123",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("access_token", response.json())

    def test_inactive_existing_account_is_not_modified(self):
        original_hash = hash_password("Original-Password-123")
        user = User(
            email="admin.example@gmail.com",
            full_name="Inactive Admin",
            hashed_password=original_hash,
            is_active=False,
        )
        self.session.add(user)
        self.session.commit()

        with self.assertRaisesRegex(ValueError, "inactive account"):
            provision_admin_account(
                self.session,
                "admin.example@gmail.com",
                "Administrator",
                "Replacement-Password-123",
                replace_existing_password=True,
            )

        self.session.refresh(user)
        self.assertEqual(user.hashed_password, original_hash)
        self.assertFalse(user.is_active)

    def test_login_verifier_rejects_non_loopback_endpoint(self):
        verified, reason = verify_local_login_endpoint(
            "https://example.com",
            "admin@example.com",
            "password",
        )

        self.assertFalse(verified)
        self.assertEqual(reason, "url-must-be-local")
