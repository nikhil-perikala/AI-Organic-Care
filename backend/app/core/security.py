import secrets
from datetime import datetime, timedelta
from typing import Optional
import bcrypt as _bcrypt
from jose import JWTError, jwt
from app.config import settings

# Use bcrypt directly — passlib 1.7.4 is incompatible with bcrypt>=4.0 (strict 72-byte limit).
# We truncate to 72 bytes ourselves, matching historical bcrypt behaviour.
def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode()[:72], _bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode()[:72], hashed.encode())


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {"sub": subject, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def create_password_reset_token(user_id: str, hashed_password: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=1)
    # phash fingerprint invalidates the token once the password changes
    payload = {
        "sub": user_id,
        "exp": expire,
        "type": "reset",
        "phash": hashed_password[-8:],
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def generate_otp() -> str:
    """Return a cryptographically secure 6-digit OTP."""
    return str(secrets.randbelow(1_000_000)).zfill(6)


def hash_otp(otp: str) -> str:
    return _bcrypt.hashpw(otp.encode(), _bcrypt.gensalt(rounds=10)).decode()


def verify_otp_code(plain_otp: str, hashed_otp: str) -> bool:
    try:
        return _bcrypt.checkpw(plain_otp.encode(), hashed_otp.encode())
    except Exception:
        return False


def verify_password_reset_token(token: str, current_hashed_password: str) -> Optional[str]:
    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if data.get("type") != "reset":
            return None
        if data.get("phash") != current_hashed_password[-8:]:
            return None  # token already used — password was changed
        return data.get("sub")
    except JWTError:
        return None
