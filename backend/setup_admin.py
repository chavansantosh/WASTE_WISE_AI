import getpass
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from app.core.security import hash_password, verify_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402

DEFAULT_API_URL = "http://127.0.0.1:8001"
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _normalize_email(value: str) -> str:
    try:
        email = str(TypeAdapter(EmailStr).validate_python(value.strip())).lower()
    except ValidationError as exc:
        raise ValueError("Enter a valid email address.") from exc
    if email.rsplit("@", 1)[-1] not in {"gmail.com", "googlemail.com"}:
        raise ValueError("Enter a Gmail address.")
    return email


def provision_admin_account(
    db: Session,
    email: str,
    full_name: str,
    password: str,
    *,
    replace_existing_password: bool = False,
) -> str:
    normalized_email = _normalize_email(email)
    if not 8 <= len(password) <= 128:
        raise ValueError("Password must be between 8 and 128 characters.")

    normalized_name = full_name.strip()
    if not 2 <= len(normalized_name) <= 150:
        raise ValueError("Name must be between 2 and 150 characters.")

    user = (
        db.query(User)
        .filter(func.lower(func.trim(User.email)) == normalized_email)
        .one_or_none()
    )
    if user is not None:
        if not user.is_active:
            raise ValueError(
                "An inactive account already exists; no changes were made."
            )
        if verify_password(password, user.hashed_password):
            return "already-exists"
        if not replace_existing_password:
            return "confirmation-required"

        user.hashed_password = hash_password(password)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        return "password-updated"

    user = User(
        email=normalized_email,
        full_name=normalized_name,
        hashed_password=hash_password(password),
        is_active=True,
    )
    try:
        db.add(user)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return "created"


def verify_local_login_endpoint(
    api_url: str,
    email: str,
    password: str,
) -> tuple[bool, str]:
    try:
        parsed = urlsplit(api_url)
    except ValueError:
        return False, "invalid-url"
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname not in LOOPBACK_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return False, "url-must-be-local"

    base_url = api_url.rstrip("/")
    try:
        with urlopen(f"{base_url}/api/v1/health", timeout=5) as response:
            health = json.loads(response.read())
            if response.status != 200 or health.get("status") != "healthy":
                return False, "health-check-failed"

        body = json.dumps({"email": email, "password": password}).encode("utf-8")
        request = Request(
            f"{base_url}/api/v1/auth/login",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            return (response.status == 200, "verified" if response.status == 200 else "login-failed")
    except HTTPError as exc:
        return False, f"http-{exc.code}"
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return False, "backend-unreachable"


def main() -> int:
    try:
        email = _normalize_email(input("Administrator Gmail address: "))
    except ValueError as exc:
        print(str(exc))
        return 2

    full_name = input("Display name [Administrator]: ").strip() or "Administrator"
    password = getpass.getpass("New password (8-128 characters): ")
    confirmation = getpass.getpass("Confirm new password: ")
    if password != confirmation:
        print("Passwords did not match; no changes were made.")
        return 2
    if not 8 <= len(password) <= 128:
        print("Password must be between 8 and 128 characters; no changes were made.")
        return 2

    with SessionLocal() as db:
        try:
            result = provision_admin_account(db, email, full_name, password)
        except ValueError as exc:
            print(f"{exc} No account changes were made.")
            return 2
        except Exception:
            print("Account setup failed; no credentials were displayed.")
            return 1

        if result == "confirmation-required":
            confirmation_word = input(
                "An account already exists with a different password. "
                "Type REPLACE to change it, or anything else to cancel: "
            )
            if confirmation_word != "REPLACE":
                print("Cancelled; the existing account was not changed.")
                return 0
            try:
                result = provision_admin_account(
                    db,
                    email,
                    full_name,
                    password,
                    replace_existing_password=True,
                )
            except ValueError as exc:
                print(f"{exc} No account changes were made.")
                return 2
            except Exception:
                print("Account setup failed; no credentials were displayed.")
                return 1

        user = (
            db.query(User)
            .filter(func.lower(func.trim(User.email)) == email)
            .one_or_none()
        )
        if (
            user is None
            or not user.is_active
            or not verify_password(password, user.hashed_password)
        ):
            print("Local account verification failed.")
            return 1

    print(f"Account status: {result}. Secure password verification: passed.")
    print(
        "Note: this project currently has no role field; this is an active "
        "application account, not a separately permissioned admin role."
    )
    api_url = input(f"Local backend URL [{DEFAULT_API_URL}]: ").strip()
    verified, reason = verify_local_login_endpoint(
        api_url or DEFAULT_API_URL,
        email,
        password,
    )
    if verified:
        print("Backend health and login endpoint verification: passed.")
        return 0

    print(f"Backend login endpoint verification: not verified ({reason}).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
