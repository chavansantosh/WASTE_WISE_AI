
import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    status,
)
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.password_reset import (
    PASSWORD_RESET_TOKEN_MINUTES,
    PasswordResetMailSettings,
    PasswordResetMailConfigurationError,
    get_password_reset_mail_settings,
    send_password_reset_email,
)
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.password_reset import PasswordResetRateLimit, PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)
PASSWORD_RESET_REQUESTS_PER_HOUR = 5
PASSWORD_RESET_ATTEMPTS_PER_HOUR = 10
PASSWORD_RESET_REQUEST_MESSAGE = (
    "If an active account exists for that email, a password reset link will be sent."
)
INVALID_RESET_TOKEN_MESSAGE = "This password reset link is invalid. Request a new link."
EXPIRED_RESET_TOKEN_MESSAGE = "This password reset link has expired. Request a new one."
USED_RESET_TOKEN_MESSAGE = "This password reset link has already been used. Request a new one."


def _deliver_password_reset_email(
    email: str,
    reset_link: str,
    settings: PasswordResetMailSettings,
) -> None:
    try:
        send_password_reset_email(email, reset_link, settings)
    except (OSError, smtplib.SMTPException, UnicodeError, ValueError) as exc:
        logger.warning(
            "Password reset email delivery failed (%s).",
            type(exc).__name__,
        )


def _rate_limit(
    db: Session,
    *,
    action: str,
    identifiers: list[str],
    limit: int,
) -> None:
    now = datetime.now(timezone.utc)
    window = int(now.timestamp()) // 3600
    window_end = datetime.fromtimestamp((window + 1) * 3600, timezone.utc)
    for identifier in identifiers:
        bucket_key = hashlib.sha256(
            f"{action}:{window}:{identifier}".encode("utf-8")
        ).hexdigest()
        statement = (
            sqlite_insert(PasswordResetRateLimit)
            .values(
                bucket_key=bucket_key,
                hits=1,
                window_expires_at=window_end,
            )
            .on_conflict_do_update(
                index_elements=[PasswordResetRateLimit.bucket_key],
                set_={"hits": PasswordResetRateLimit.hits + 1},
            )
            .returning(PasswordResetRateLimit.hits)
        )
        hits = db.execute(statement).scalar_one()
        if hits > limit:
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many password reset attempts. Try again later.",
                headers={
                    "Retry-After": str(
                        max(1, int((window_end - now).total_seconds()))
                    )
                },
            )

    db.execute(
        delete(PasswordResetRateLimit).where(
            PasswordResetRateLimit.window_expires_at
            < now - timedelta(days=1)
        )
    )
    db.commit()


def _password_reset_page() -> HTMLResponse:
    page = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset password | WASTE WISE AI</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #23392d; background: #f4f8f4; }
    body { box-sizing: border-box; display: grid; min-height: 100vh; place-items: center; margin: 0; padding: 20px; }
    main { width: min(100%, 410px); padding: 32px; border: 1px solid #e1ebe2; border-radius: 18px; background: #fff; box-shadow: 0 18px 48px #1d492f18; }
    h1 { margin: 0 0 8px; font-size: 23px; }
    p { color: #718076; font-size: 13px; line-height: 1.6; }
    label { display: block; margin: 18px 0 7px; font-size: 12px; font-weight: 700; }
    input { box-sizing: border-box; width: 100%; height: 45px; padding: 0 12px; border: 1px solid #dfe8e0; border-radius: 9px; font: inherit; }
    button { width: 100%; height: 46px; margin-top: 20px; border: 0; border-radius: 9px; background: #df8c32; color: white; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .65; cursor: wait; }
    #status { min-height: 20px; margin-bottom: 0; }
  </style>
</head>
<body>
  <main>
    <h1>Choose a new password</h1>
    <p>Use at least 8 characters. This reset link can only be used once.</p>
    <form id="reset-form">
      <label for="password">New password</label>
      <input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
      <label for="confirm-password">Confirm new password</label>
      <input id="confirm-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
      <button id="submit" type="submit">Update password</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    const form = document.getElementById('reset-form');
    const status = document.getElementById('status');
    const button = document.getElementById('submit');
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    history.replaceState(null, '', location.pathname);
    if (!token) {
      form.hidden = true;
      status.textContent = 'This reset link is invalid or has expired. Request a new one.';
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = document.getElementById('password').value;
      const confirmation = document.getElementById('confirm-password').value;
      if (password !== confirmation) {
        status.textContent = 'The passwords do not match.';
        return;
      }
      button.disabled = true;
      status.textContent = 'Updating your password...';
      try {
        const endpoint = location.pathname.replace(/reset-password\\/?$/, 'password-reset');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });
        if (!response.ok) throw new Error('reset-failed');
        form.hidden = true;
        status.textContent = 'Your password has been updated. You can now sign in.';
      } catch {
        status.textContent = 'This reset link is invalid or has expired. Request a new one.';
        button.disabled = false;
      }
    });
  </script>
</body>
</html>"""
    response = HTMLResponse(page)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
        "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    )
    return response


def _client_identifier(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    data: PasswordResetRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
):
    try:
        settings = get_password_reset_mail_settings()
    except PasswordResetMailConfigurationError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email is not configured.",
        ) from None

    email = str(data.email).strip().lower()
    client_id = _client_identifier(request)
    _rate_limit(
        db,
        action="request",
        identifiers=[f"ip:{client_id}", f"email:{email}"],
        limit=PASSWORD_RESET_REQUESTS_PER_HOUR,
    )

    user = db.query(User).filter(User.email == email, User.is_active.is_(True)).first()
    if user is not None:
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        db.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.expires_at < now - timedelta(days=1)
            )
        )
        db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
                expires_at=now + timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES),
                consumed_at=None,
                created_at=now,
            )
        )
        db.commit()
        reset_link = f"{settings.reset_url}#token={quote(token, safe='')}"
        reset_link = f"{settings.reset_url}#token={quote(token, safe='')}"
        background_tasks.add_task(
            _deliver_password_reset_email,
            email,
            reset_link,
            settings,
        )

    return {"message": PASSWORD_RESET_REQUEST_MESSAGE}


@router.get("/reset-password", response_class=HTMLResponse)
def reset_password_page():
    return _password_reset_page()


@router.post("/password-reset")
def reset_password(
    data: PasswordResetConfirmRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    _rate_limit(
        db,
        action="confirm",
        identifiers=[f"ip:{_client_identifier(request)}"],
        limit=PASSWORD_RESET_ATTEMPTS_PER_HOUR,
    )
    now = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(data.token.encode("utf-8")).hexdigest()
    reset_record = db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
        )
    ).scalar_one_or_none()

    if reset_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=INVALID_RESET_TOKEN_MESSAGE,
        )
    if reset_record.consumed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=USED_RESET_TOKEN_MESSAGE,
        )
    expires_at = reset_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=EXPIRED_RESET_TOKEN_MESSAGE,
        )

    user = db.get(User, reset_record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=INVALID_RESET_TOKEN_MESSAGE,
        )

    user.hashed_password = hash_password(data.password)
    consumed = db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.id == reset_record.id,
            PasswordResetToken.consumed_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(consumed_at=now)
        .returning(PasswordResetToken.id)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()

    if consumed is None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=INVALID_RESET_TOKEN_MESSAGE,
        )

    db.commit()
    return {"message": "Password updated successfully."}


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    data: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
):
    email = str(data.email).strip().lower()

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=email,
        full_name=data.full_name.strip(),
        hashed_password=hash_password(data.password),
        is_active=True,
    )

    if not user.full_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Full name cannot be blank.",
        )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the account.",
        ) from exc


def authenticate_user(email: str, password: str, db: Session) -> User:
    normalized_email = email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive.",
        )

    return user


def build_token_response(user: User) -> dict:
    return {
        "access_token": create_access_token(str(user.id)),
        "token_type": "bearer",
        "user": user,
    }


@router.post("/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
):
    user = authenticate_user(data.email, data.password, db)
    return build_token_response(user)


@router.post("/token", response_model=TokenResponse)
def oauth2_login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
):
    # Swagger's OAuth2 form calls the email field "username".
    user = authenticate_user(
        form_data.username,
        form_data.password,
        db,
    )
    return build_token_response(user)


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
):
    return current_user
