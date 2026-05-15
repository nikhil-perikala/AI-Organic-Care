import asyncio
import smtplib
import structlog
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = structlog.get_logger()


def _send_email_sync(to: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = to
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        if settings.SMTP_TLS:
            server.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM, to, msg.as_string())


async def send_otp_email(to_email: str, otp: str) -> None:
    """Send a 6-digit OTP to the user.
    Falls back to console output when SMTP is not configured (development)."""

    if not settings.SMTP_USER:
        # Dev-mode: print OTP so developers can test without real SMTP
        border = "=" * 52
        logger.info("DEV MODE — password reset OTP", email=to_email, otp=otp)
        print(f"\n{border}")
        print(f"  🔑  Password Reset OTP for {to_email}")
        print(f"  Code: {otp}  (valid 15 minutes)")
        print(f"{border}\n", flush=True)
        return

    subject = "Your Organic Care AI verification code"
    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family:Inter,sans-serif;background:#f2f5f0;margin:0;padding:32px 16px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <div style="text-align:center;margin-bottom:24px">
          <span style="font-size:36px">🌿</span>
          <h2 style="color:#2e7d32;margin:8px 0 4px;font-size:22px">Organic Care AI</h2>
          <p style="color:#6b7c6b;margin:0;font-size:14px">Password Reset</p>
        </div>
        <p style="color:#1a2a1a;font-size:15px;line-height:1.6">
          Use the verification code below to reset your password.
          This code expires in <strong>15 minutes</strong>.
        </p>
        <div style="text-align:center;margin:32px 0">
          <div style="display:inline-block;background:#f1f8e9;border:2px solid #4caf50;border-radius:12px;padding:20px 40px">
            <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#2e7d32;font-family:monospace">{otp}</span>
          </div>
        </div>
        <p style="color:#6b7c6b;font-size:13px;line-height:1.5">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
        <hr style="border:none;border-top:1px solid #e8f0e8;margin:24px 0">
        <p style="color:#9e9e9e;font-size:12px;text-align:center;margin:0">
          Do not share this code with anyone.
        </p>
      </div>
    </body>
    </html>
    """
    try:
        await asyncio.to_thread(_send_email_sync, to_email, subject, html)
        logger.info("OTP email sent", email=to_email)
    except Exception as exc:
        logger.error("Failed to send OTP email", email=to_email, error=str(exc))


# Keep old function for any deep-link tokens still in circulation
async def send_password_reset_email(to_email: str, reset_link: str) -> None:
    if not settings.SMTP_USER:
        logger.info("DEV MODE — password reset link", email=to_email, link=reset_link)
        print(f"\n{'='*52}\n  Reset link for {to_email}:\n  {reset_link}\n{'='*52}\n", flush=True)
        return

    subject = "Reset your Organic Care AI password"
    html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family:Inter,sans-serif;background:#f2f5f0;margin:0;padding:32px 16px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <div style="text-align:center;margin-bottom:24px">
          <span style="font-size:36px">🌿</span>
          <h2 style="color:#2e7d32;margin:8px 0 4px;font-size:22px">Organic Care AI</h2>
        </div>
        <p style="color:#1a2a1a;font-size:15px;line-height:1.6">
          Click below to reset your password. This link expires in <strong>1 hour</strong>.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="{reset_link}"
             style="background:#2e7d32;color:#fff;text-decoration:none;padding:14px 32px;
                    border-radius:10px;font-weight:700;font-size:15px;display:inline-block">
            Reset My Password
          </a>
        </div>
        <p style="color:#9e9e9e;font-size:12px;text-align:center;margin:0;word-break:break-all">
          {reset_link}
        </p>
      </div>
    </body>
    </html>
    """
    try:
        await asyncio.to_thread(_send_email_sync, to_email, subject, html)
    except Exception as exc:
        logger.error("Failed to send reset email", email=to_email, error=str(exc))
