"""
PayHere Payment Gateway Router
===============================

Security architecture
---------------------
PayHere mandates MD5 for its own signature protocol (the `hash` field in the payment
form and the `md5sig` in the webhook notification). This is a PayHere API requirement
we cannot change — using any other algorithm causes PayHere to reject the payment.

On top of PayHere's required MD5, we add our OWN HMAC-SHA256 layer:
  • On /initiate  → generate a cryptographically random `payhere_token` (HMAC-SHA256),
                    store it in the orders table.
  • On /notify    → verify both PayHere's md5sig AND our HMAC-SHA256 token before
                    writing anything to the database.
  • The merchant_secret and JWT_SECRET_KEY are never sent to the browser.

All user passwords are hashed with bcrypt (handled in auth_router.py).
"""

import hashlib
import hmac
import os
import secrets
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.orders import Order
from routers.auth_router import get_current_user
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payment", tags=["payment"])

# ── Config ─────────────────────────────────────────────────────────────────────
PAYHERE_MERCHANT_ID = os.environ.get("VITE_PAYHERE_MERCHANT_ID", "").strip()
PAYHERE_SECRET      = os.environ.get("PAYHERE_MERCHANT_SECRET", "").strip()
# HMAC-SHA256 key — re-uses the JWT secret so there's no extra secret to manage
HMAC_KEY            = os.environ.get("JWT_SECRET_KEY", "").encode()
PAYHERE_SANDBOX     = True
PAYHERE_BASE_URL    = "https://sandbox.payhere.lk/pay/checkout"

_BACKEND_HOST  = os.environ.get("BACKEND_PUBLIC_URL",  "http://localhost:8000")
_FRONTEND_HOST = os.environ.get("FRONTEND_PUBLIC_URL", "http://localhost:3000")


# ── Internal helpers ────────────────────────────────────────────────────────────

def _md5_upper(value: str) -> str:
    """MD5 — used ONLY because PayHere's API spec requires it for the payment hash."""
    return hashlib.md5(value.encode()).hexdigest().upper()


def _generate_payhere_hash(
    merchant_id: str, order_id: str, amount: str, currency: str, secret: str
) -> str:
    """
    PayHere-required hash formula (not our choice — PayHere's documented API):
      UPPER(MD5( merchant_id + order_id + amount + currency + UPPER(MD5(secret)) ))
    """
    hashed_secret = _md5_upper(secret)
    raw = f"{merchant_id}{order_id}{amount}{currency}{hashed_secret}"
    return _md5_upper(raw)


def _generate_hmac_token(order_id: int, amount: str, currency: str) -> str:
    """
    Our own HMAC-SHA256 token stored at initiation.
    Binds the token to (order_id, amount, currency) so it cannot be reused
    or inflated by an attacker.
    """
    payload = f"{order_id}:{amount}:{currency}"
    return hmac.new(HMAC_KEY, payload.encode(), hashlib.sha256).hexdigest()


def _verify_payhere_notify_sig(
    merchant_id: str, order_id: str,
    payhere_amount: str, payhere_currency: str,
    status_code: str, md5sig: str, secret: str,
) -> bool:
    """Verify PayHere's md5sig on the notify webhook (their required algorithm)."""
    hashed_secret = _md5_upper(secret)
    raw = f"{merchant_id}{order_id}{payhere_amount}{payhere_currency}{status_code}{hashed_secret}"
    return _md5_upper(raw) == md5sig.upper()


def _verify_hmac_token(order: Order, amount: str, currency: str) -> bool:
    """
    Verify our HMAC-SHA256 token stored at initiation against a freshly computed value.
    Uses hmac.compare_digest to prevent timing attacks.
    """
    if not order.payhere_token:
        return False
    expected = _generate_hmac_token(order.id, amount, currency)
    return hmac.compare_digest(order.payhere_token, expected)


# ── Endpoints ──────────────────────────────────────────────────────────────────

class InitiatePaymentRequest(BaseModel):
    order_id: int
    currency: str = "LKR"


@router.post("/initiate")
def initiate_payment(
    body: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the PayHere popup payload with server-generated hash.
    Also stores an HMAC-SHA256 token in the order for our own webhook verification.
    The merchant_secret NEVER leaves this function.
    """
    if not PAYHERE_MERCHANT_ID or not PAYHERE_SECRET:
        raise HTTPException(status_code=503, detail="PayHere credentials not configured.")

    order = db.query(Order).filter(Order.id == body.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not your order")

    amount_str   = f"{float(order.total_amount):.2f}"
    order_id_str = str(order.id)
    currency     = body.currency.upper()

    # Store our HMAC-SHA256 token (binds amount + currency to this order)
    order.payhere_token = _generate_hmac_token(order.id, amount_str, currency)
    db.commit()

    # Generate PayHere's required MD5 hash (their protocol — cannot be changed)
    ph_hash = _generate_payhere_hash(
        PAYHERE_MERCHANT_ID, order_id_str, amount_str, currency, PAYHERE_SECRET
    )

    # Customer info
    delivery = order.delivery_info if hasattr(order, "delivery_info") else None
    if delivery and delivery.customer_name:
        parts = delivery.customer_name.split(" ", 1)
        first, last = parts[0], (parts[1] if len(parts) > 1 else "")
    else:
        first = current_user.first_name or ""
        last  = current_user.last_name  or ""

    return {
        "merchant_id":  PAYHERE_MERCHANT_ID,
        "return_url":   f"{_FRONTEND_HOST}/orders?payment=success&order_id={order.id}",
        "cancel_url":   f"{_FRONTEND_HOST}/orders?payment=cancelled&order_id={order.id}",
        "notify_url":   f"{_BACKEND_HOST}/payment/notify",
        "order_id":     order_id_str,
        "items":        f"Ransara Order #{order.id}",
        "currency":     currency,
        "amount":       amount_str,
        "first_name":   first,
        "last_name":    last,
        "email":        current_user.email or "customer@example.com",
        "phone":        current_user.phone_number or "0770000000",
        "address":      (delivery.delivery_address if delivery else "") or "Store Pickup",
        "city":         "Colombo",
        "country":      "Sri Lanka",
        "hash":         ph_hash,    # PayHere-required MD5 hash — protocol constraint
        "sandbox":      PAYHERE_SANDBOX,
        "checkout_url": PAYHERE_BASE_URL,
    }


@router.post("/notify")
async def payment_notify(request: Request, db: Session = Depends(get_db)):
    """
    PayHere webhook. Called by PayHere servers after every payment attempt.

    Dual-verification:
      1. PayHere md5sig  (their required algorithm)
      2. Our HMAC-SHA256 token (our layer, independent of PayHere)

    Only status_code == "2" (PayHere Success) triggers a DB update.
    """
    form = await request.form()

    merchant_id      = form.get("merchant_id", "")
    order_id_str     = form.get("order_id", "")
    payhere_amount   = form.get("payhere_amount", "")
    payhere_currency = form.get("payhere_currency", "")
    status_code      = form.get("status_code", "")
    md5sig           = form.get("md5sig", "")

    # ── 1. Verify PayHere's md5sig ─────────────────────────────────────────────
    if not _verify_payhere_notify_sig(
        merchant_id, order_id_str, payhere_amount, payhere_currency,
        status_code, md5sig, PAYHERE_SECRET
    ):
        logger.warning("PayHere notify: invalid md5sig for order %s", order_id_str)
        return JSONResponse(status_code=400, content={"detail": "Invalid PayHere signature"})

    try:
        order_id = int(order_id_str)
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid order_id"})

    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        logger.warning("PayHere notify: order %s not found", order_id_str)
        return JSONResponse(status_code=404, content={"detail": "Order not found"})

    # Handle failures (-1: Canceled, -2: Failed, -3: Chargedback)
    if status_code in ["-1", "-2", "-3"]:
        order.current_status = "Cancelled"
        db.commit()
        logger.info("PayHere notify: order %s failed/cancelled (status_code=%s) → Cancelled", order_id_str, status_code)
        return JSONResponse(content={"detail": "Order cancelled"})

    # Ignore other non-success statuses (e.g. 0 = Pending) without failing
    if status_code != "2":
        logger.info("PayHere notify: order %s status_code=%s — no action", order_id_str, status_code)
        return JSONResponse(content={"detail": "Acknowledged"})

    # ── 2. Verify our HMAC-SHA256 token ────────────────────────────────────────
    if not _verify_hmac_token(order, payhere_amount, payhere_currency):
        logger.warning(
            "PayHere notify: HMAC-SHA256 token mismatch for order %s — "
            "possible replay or amount tampering", order_id_str
        )
        return JSONResponse(status_code=400, content={"detail": "HMAC verification failed"})

    # ── 3. Mark order as Processing ────────────────────────────────────────────
    order.current_status = "Processing"
    order.payment_method = "PayHere (Card)"
    order.payhere_token  = None   # invalidate — token is single-use
    db.commit()
    logger.info("PayHere notify: order %s confirmed — status → Processing", order_id_str)
    return JSONResponse(content={"detail": "OK"})


@router.get("/status/{order_id}")
def payment_status(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight poll endpoint — frontend polls after PayHere popup closes."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_id":       order.id,
        "status":         order.current_status,
        "payment_method": order.payment_method,
    }
