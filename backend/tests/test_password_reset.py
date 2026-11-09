import hashlib
import os
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1 import auth as auth_api
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.models.password_reset import PasswordResetToken
from app.models.user import User


class PasswordResetTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "SMTP_HOST": "smtp.example.test",
                "SMTP_PORT": "587",
                "SMTP_USERNAME": "",
                "SMTP_PASSWORD": "",
                "SMTP_FROM_EMAIL": "notifications@example.test",
                "SMTP_USE_SSL": "false",
                "PASSWORD_RESET_URL": (
                    "http://127.0.0.1:5173/reset-password"
                ),
            },
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        self.session = Session(self.engine)
        self.addCleanup(self.session.close)
        self.user = User(
            email="reset-user@example.com",
            full_name="Reset Test User",
            hashed_password=hash_password("Original-Pass-123"),
            is_active=True,
        )
        self.session.add(self.user)
        self.session.commit()
        self.session.refresh(self.user)

        application = FastAPI()
        application.include_router(auth_api.router)

        def override_get_db():
            with Session(self.engine) as session:
                yield session

        application.dependency_overrides[get_db] = override_get_db
        self.addCleanup(application.dependency_overrides.clear)
        self.client = TestClient(application)
        self.addCleanup(self.client.close)

    def _request_reset(self, email: str | None = None) -> str:
        with patch.object(auth_api, "send_password_reset_email") as send_email:
            response = self.client.post(
                "/api/v1/auth/password-reset/request",
                json={"email": email or self.user.email},
            )
        self.assertEqual(response.status_code, 202, response.text)
        self.assertNotIn("token", response.text.lower())
        send_email.assert_called_once()
        link = send_email.call_args.args[1]
        parsed_link = urlsplit(link)
        self.assertEqual(parsed_link.netloc, "127.0.0.1:5173")
        self.assertEqual(parsed_link.path, "/reset-password")
        self.assertEqual(parsed_link.query, "")
        token = parse_qs(parsed_link.fragment)["token"][0]
        self.assertEqual(
            hashlib.sha256(token.encode()).hexdigest(),
            self.session.query(PasswordResetToken).one().token_hash,
        )
        return token

    def test_unknown_email_gets_same_generic_response_without_sending_email(self):
        with patch.object(auth_api, "send_password_reset_email") as send_email:
            known = self.client.post(
                "/api/v1/auth/password-reset/request",
                json={"email": self.user.email},
            )
            unknown = self.client.post(
                "/api/v1/auth/password-reset/request",
                json={"email": "unknown@example.org"},
            )

        self.assertEqual(known.status_code, 202)
        self.assertEqual(unknown.status_code, 202)
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(
            known.json()["message"],
            auth_api.PASSWORD_RESET_REQUEST_MESSAGE,
        )
        send_email.assert_called_once()

    def test_delivery_failure_keeps_generic_response_and_does_not_log_token(self):
        with patch.object(
            auth_api,
            "send_password_reset_email",
            side_effect=OSError("mail delivery failed"),
        ):
            with self.assertLogs(auth_api.logger, level="WARNING") as captured:
                response = self.client.post(
                    "/api/v1/auth/password-reset/request",
                    json={"email": self.user.email},
                )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            response.json()["message"],
            auth_api.PASSWORD_RESET_REQUEST_MESSAGE,
        )
        self.assertNotIn("reset-user@example.com", "\n".join(captured.output))
        self.assertNotIn("#token=", "\n".join(captured.output))

    def test_expired_token_is_rejected(self):
        token = "expired-reset-token-" + ("x" * 24)
        self.session.add(
            PasswordResetToken(
                user_id=self.user.id,
                token_hash=hashlib.sha256(token.encode()).hexdigest(),
                expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
                consumed_at=None,
                created_at=datetime.now(timezone.utc) - timedelta(hours=1),
            )
        )
        self.session.commit()

        response = self.client.post(
            "/api/v1/auth/password-reset",
            json={"token": token, "password": "Replacement-Pass-123"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            auth_api.EXPIRED_RESET_TOKEN_MESSAGE,
        )
        self.assertTrue(
            verify_password(
                "Original-Pass-123",
                self.user.hashed_password,
            )
        )

    def test_unknown_token_is_rejected_with_invalid_link_detail(self):
        response = self.client.post(
            "/api/v1/auth/password-reset",
            json={
                "token": "unknown-reset-token-" + ("x" * 24),
                "password": "Replacement-Pass-123",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            auth_api.INVALID_RESET_TOKEN_MESSAGE,
        )
        self.assertTrue(
            verify_password(
                "Original-Pass-123",
                self.user.hashed_password,
            )
        )

    def test_reset_token_cannot_be_reused(self):
        token = self._request_reset()
        payload = {"token": token, "password": "Replacement-Pass-123"}

        first = self.client.post("/api/v1/auth/password-reset", json=payload)
        second = self.client.post("/api/v1/auth/password-reset", json=payload)

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(
            second.json()["detail"],
            auth_api.USED_RESET_TOKEN_MESSAGE,
        )

    def test_hashing_failure_does_not_consume_token_or_change_password(self):
        token = self._request_reset()

        with patch.object(
            auth_api,
            "hash_password",
            side_effect=RuntimeError("hashing failed"),
        ):
            with self.assertRaises(RuntimeError):
                self.client.post(
                    "/api/v1/auth/password-reset",
                    json={"token": token, "password": "Replacement-Pass-123"},
                )

        self.session.expire_all()
        reset_record = self.session.query(PasswordResetToken).one()
        self.session.refresh(self.user)
        self.assertIsNone(reset_record.consumed_at)
        self.assertTrue(
            verify_password("Original-Pass-123", self.user.hashed_password)
        )

    def test_successful_reset_updates_password_and_allows_login(self):
        token = self._request_reset()
        response = self.client.post(
            "/api/v1/auth/password-reset",
            json={"token": token, "password": "Replacement-Pass-123"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn(token, response.text)
        self.session.expire(self.user)
        reset_record = self.session.query(PasswordResetToken).one()
        self.assertIsNotNone(reset_record.consumed_at)
        self.assertTrue(
            verify_password("Replacement-Pass-123", self.user.hashed_password)
        )
        self.assertFalse(
            verify_password("Original-Pass-123", self.user.hashed_password)
        )
        login = self.client.post(
            "/api/v1/auth/login",
            json={
                "email": self.user.email,
                "password": "Replacement-Pass-123",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)

    def test_reset_page_does_not_cache_or_referrer_leak(self):
        response = self.client.get("/api/v1/auth/reset-password")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["referrer-policy"], "no-referrer")
        self.assertIn("location.hash", response.text)
        self.assertIn("replaceState", response.text)

    def test_password_reset_requests_are_rate_limited(self):
        with patch.object(auth_api, "send_password_reset_email"):
            responses = [
                self.client.post(
                    "/api/v1/auth/password-reset/request",
                    json={"email": self.user.email},
                )
                for _ in range(auth_api.PASSWORD_RESET_REQUESTS_PER_HOUR + 1)
            ]

        self.assertTrue(all(response.status_code == 202 for response in responses[:-1]))
        self.assertEqual(responses[-1].status_code, 429)


if __name__ == "__main__":
    unittest.main()
