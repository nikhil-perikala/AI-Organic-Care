import uuid
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserProfile
from app.schemas.user import (
    UserCreate, UserLogin, UserOut, TokenOut, TokenRefresh,
    ForgotPasswordRequest, VerifyOtpRequest, VerifyOtpOut, ResetPasswordRequest,
)
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    create_password_reset_token, verify_password_reset_token,
    generate_otp, hash_otp, verify_otp_code,
)
from app.core.email import send_otp_email, send_password_reset_email
from app.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL_MINUTES = 15


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    await db.flush()

    profile = UserProfile(user_id=user.id)
    db.add(profile)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    return TokenOut(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenOut)
async def refresh_token(body: TokenRefresh, db: AsyncSession = Depends(get_db)):
    token_data = decode_token(body.refresh_token)
    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = uuid.UUID(token_data["sub"])
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenOut(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email, User.is_active == True))
    user = result.scalar_one_or_none()

    # Always return the same response to prevent email enumeration
    if user:
        otp = generate_otp()
        user.reset_otp_hash = hash_otp(otp)
        user.reset_otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)
        await db.commit()
        background_tasks.add_task(send_otp_email, user.email, otp)
        logger.info("Password reset OTP queued", email=user.email)

    return {"message": "If that email is registered, a verification code has been sent."}


@router.post("/verify-otp", response_model=VerifyOtpOut)
async def verify_otp(payload: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email, User.is_active == True))
    user = result.scalar_one_or_none()

    invalid_err = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired verification code.",
    )

    if not user or not user.reset_otp_hash or not user.reset_otp_expires_at:
        raise invalid_err

    if datetime.utcnow() > user.reset_otp_expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new one.",
        )

    if not verify_otp_code(payload.otp, user.reset_otp_hash):
        raise invalid_err

    # Clear OTP — single use only
    user.reset_otp_hash = None
    user.reset_otp_expires_at = None
    await db.commit()

    reset_token = create_password_reset_token(str(user.id), user.hashed_password)
    logger.info("OTP verified, reset token issued", email=user.email)
    return VerifyOtpOut(reset_token=reset_token)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    token_data = decode_token(payload.token)
    if not token_data or token_data.get("type") != "reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    try:
        user_id = uuid.UUID(token_data["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    # phash fingerprint check — fails if password was already changed (prevents token reuse)
    if verify_password_reset_token(payload.token, user.hashed_password) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used or has expired.",
        )

    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    logger.info("Password reset successful", user_id=str(user.id))
    return {"message": "Password updated successfully"}
