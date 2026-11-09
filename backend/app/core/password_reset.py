import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from urllib.parse import urlsplit

PASSWORD_RESET_TOKEN_MINUTES = 30


@dataclass(frozen=True)
class PasswordResetMailSettings:
    host: str
    port: int
    username: str | None
    password: str | None
    from_email: str
    reset_url: str
    use_ssl: bool


class PasswordResetMailConfigurationError(Exception):
    pass


def _read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise PasswordResetMailConfigurationError


def get_password_reset_mail_settings() -> PasswordResetMailSettings:
    host = os.getenv("SMTP_HOST", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    reset_url = os.getenv("PASSWORD_RESET_URL", "").strip().rstrip("/")
    username = os.getenv("SMTP_USERNAME", "").strip() or None
    password = os.getenv("SMTP_PASSWORD") or None

    try:
        parsed_url = urlsplit(reset_url)
    except ValueError as exc:
        raise PasswordResetMailConfigurationError from exc

    if (
        not host
        or not from_email
        or parsed_url.scheme not in {"http", "https"}
        or not parsed_url.netloc
        or (
            parsed_url.scheme != "https"
            and parsed_url.hostname not in {"localhost", "127.0.0.1", "::1"}
        )
        or parsed_url.username is not None
        or parsed_url.password is not None
        or parsed_url.query
        or parsed_url.fragment
        or bool(username) != bool(password)
    ):
        raise PasswordResetMailConfigurationError

    try:
        port = int(os.getenv("SMTP_PORT", "587"))
        use_ssl = _read_bool("SMTP_USE_SSL", False)
    except ValueError as exc:
        raise PasswordResetMailConfigurationError from exc

    if not 1 <= port <= 65535:
        raise PasswordResetMailConfigurationError

    return PasswordResetMailSettings(
        host=host,
        port=port,
        username=username,
        password=password,
        from_email=from_email,
        reset_url=reset_url,
        use_ssl=use_ssl,
    )


def send_password_reset_email(
    recipient: str,
    reset_link: str,
    settings: PasswordResetMailSettings,
) -> None:
    message = EmailMessage()
    message["Subject"] = "Reset your WASTE WISE AI password"
    message["From"] = settings.from_email
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your WASTE WISE AI account.\n\n"
        f"Use this link within {PASSWORD_RESET_TOKEN_MINUTES} minutes: "
        f"{reset_link}\n\n"
        "If you did not request this, you can ignore this email."
    )

    context = ssl.create_default_context()
    if settings.use_ssl:
        with smtplib.SMTP_SSL(
            settings.host,
            settings.port,
            timeout=10,
            context=context,
        ) as server:
            if settings.username and settings.password:
                server.login(settings.username, settings.password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.host, settings.port, timeout=10) as server:
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
        if settings.username and settings.password:
            server.login(settings.username, settings.password)
        server.send_message(message)
