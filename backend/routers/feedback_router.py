from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.feedback import Feedback
from models.user import User
from models.orders import Order
from models.inventory import StockBatch
from pydantic import BaseModel
from typing import Optional, List
import pickle
import os
from models.feedback_product import FeedbackProduct
from sqlalchemy import func
from routers.auth_router import get_current_user
from pydantic import BaseModel
from datetime import datetime, timezone
from html import escape

router = APIRouter(prefix="/feedback", tags=["feedback"])

feedback_model_path = os.path.join(os.path.dirname(__file__), "..", "feedback_model.pkl")
vectorizer_path = os.path.join(os.path.dirname(__file__), "..", "vectorizer.pkl")

feedback_model = None
vectorizer = None
ml_enabled = False

try:
    with open(feedback_model_path, "rb") as f:
        feedback_model = pickle.load(f)
    with open(vectorizer_path, "rb") as f:
        vectorizer = pickle.load(f)
    ml_enabled = True
except Exception:
    ml_enabled = False

OFFENSIVE_KEYWORDS = {
    "idiot", "stupid", "dumb", "hate", "fool", "trash", "garbage", "hell",
    "shit", "fuck", "bitch", "bastard", "asshole", "moron", "ugly"
}

def contains_offensive_text(text: str) -> bool:
    if not text:
        return False

    lowered = text.lower()

    if ml_enabled and feedback_model and vectorizer:
        try:
            vec = vectorizer.transform([text])
            prediction = feedback_model.predict(vec)[0]
            if bool(prediction == 1):
                return True
        except Exception:
            pass

    return any(word in lowered for word in OFFENSIVE_KEYWORDS)


def sanitize_input(text: str) -> str:
    """Sanitize user input to prevent XSS attacks."""
    if not text:
        return ""
    # HTML escape the text to prevent XSS
    return escape(text.strip())

class FeedbackRequest(BaseModel):
    text: str

class ReplyPayload(BaseModel):
    reply: Optional[str] = ""

class FeedbackSubmit(BaseModel):
    message: str
    rating: int
    product_ids: Optional[List[int]] = []

class FeedbackReply(BaseModel):
    reply: str
    message: str
    rating: int

class FeedbackUpdate(BaseModel):
    message: str
    rating: int    

def get_purchased_products_for_user(db: Session, user_id: int):
    """Return products from all delivered/completed orders the user ever placed."""
    orders = (
        db.query(Order)
        .filter(
            Order.user_id == user_id,
            Order.current_status.in_(["Delivered", "Completed"])
        )
        .all()
    )

    purchased_products = []
    for order in orders:
        for item in order.items:
            batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
            product = batch.product if batch else None
            if product:
                purchased_products.append({
                    "order_id": order.id,
                    "product_id": product.id,
                    "product_name": product.product_name
                })

    return purchased_products
@router.post("/analyze")
def analyze_feedback(request: FeedbackRequest):
    offensive = contains_offensive_text(request.text)
    return {
        "text": request.text,
        "is_toxic": offensive,
        "toxicity_score": 1.0 if offensive else 0.0,
    }

@router.get("/eligible-products")
def eligible_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_purchased_products_for_user(db, current_user.user_id)

@router.post("/submit")
def submit_feedback(
    data: FeedbackSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Feedback message is required")

    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    purchased_products = get_purchased_products_for_user(db, current_user.user_id)

    if not purchased_products:
        raise HTTPException(
            status_code=403,
            detail="You can only leave feedback after purchasing products"
        )

    purchased_map = {}
    for p in purchased_products:
        purchased_map[p["product_id"]] = p["product_name"]
    selected_product_ids = data.product_ids or []

    if len(selected_product_ids) == 0:
        applies_to_all = True
        selected_products_label = "All Products"
    else:
        invalid_ids = [pid for pid in selected_product_ids if pid not in purchased_map]
        if invalid_ids:
            raise HTTPException(
                status_code=403,
                detail="You can only leave feedback for products you purchased"
            )

        applies_to_all = False
        selected_products_label = ", ".join([purchased_map[pid] for pid in selected_product_ids])

    # Sanitize message to prevent XSS attacks
    sanitized_message = sanitize_input(data.message)
    
    is_offensive = contains_offensive_text(sanitized_message)

    fb = Feedback(
        user_id=current_user.user_id,
        user_name=f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or current_user.email,
        message=sanitized_message,
        rating=data.rating,
        offensive=is_offensive,
        role="user",
        applies_to_all=applies_to_all,
        selected_products_label=selected_products_label,
    )

    db.add(fb)
    db.commit()
    db.refresh(fb)

    if len(selected_product_ids) == 0:
        target_product_ids = list(purchased_map.keys())
    else:
        target_product_ids = selected_product_ids

    for pid in target_product_ids:
        db.add(FeedbackProduct(
            feedback_id=fb.id,
            product_id=pid
        ))

    db.commit()

    return {
        "message": "Feedback submitted successfully",
        "flagged": is_offensive,
        "applies_to_all": applies_to_all,
        "selected_products_label": selected_products_label,
    }

@router.get("/my")
def my_feedbacks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feedbacks = (
        db.query(Feedback)
        .filter(Feedback.user_id == current_user.user_id)
        .order_by(Feedback.created_at.desc())
        .all()
    )
    return [_fb_to_dict(fb, is_admin=(current_user.role == "admin")) for fb in feedbacks]

@router.get("/")
def all_feedbacks(
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    feedbacks = (
        db.query(Feedback)
        .order_by(Feedback.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    is_admin = current_user.role == "admin"
    return [_fb_to_dict(fb, is_admin=is_admin) for fb in feedbacks]

@router.put("/{feedback_id}")
def update_feedback(
    feedback_id: int,
    data: FeedbackUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()

    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if fb.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only edit your own feedback")

    if not data.message or not data.message.strip():
        raise HTTPException(status_code=400, detail="Feedback message is required")

    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    is_offensive = contains_offensive_text(data.message)

    fb.message = data.message.strip()
    fb.rating = data.rating
    fb.offensive = is_offensive

    db.commit()
    db.refresh(fb)

    return {
        "message": "Feedback updated successfully",
        "flagged": is_offensive,
        "feedback": _fb_to_dict(fb)
    }

@router.delete("/{feedback_id}")
def delete_feedback(feedback_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    if fb.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own feedback")

    db.delete(fb)
    db.commit()
    return {"message": "Feedback deleted"}

@router.put("/{feedback_id}/reply")
def update_reply(
    feedback_id: int,
    payload: ReplyPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage replies")

    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    reply_text = (payload.reply or "").strip()

    # delete reply
    if reply_text == "":
        feedback.reply = None
        feedback.replied_at = None
    else:
        feedback.reply = reply_text
        feedback.replied_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(feedback)

    return {
        "message": "Reply updated successfully",
        "reply": feedback.reply,
        "replied_at": feedback.replied_at
    }
@router.get("/stats")
def feedback_stats(db: Session = Depends(get_db)):
    total = db.query(Feedback).count()
    all_feedbacks = db.query(Feedback).all()
    avg_rating = round(sum(f.rating for f in all_feedbacks) / total, 2) if total else 0
    flagged = db.query(Feedback).filter(Feedback.offensive == True).count()
    return {"total": total, "avg_rating": avg_rating, "flagged": flagged}

def _fb_to_dict(fb: Feedback, is_admin: bool = False) -> dict:
    visible_message = fb.message if (is_admin or not fb.offensive) else "This review is hidden due to inappropriate language."

    return {
        "id": fb.id,
        "user_name": fb.user_name,
        "user_id": fb.user_id,
        "product_name": fb.selected_products_label or "All Products",
        "message": visible_message,
        "original_message": fb.message,
        "rating": fb.rating,
        "reply": fb.reply,
        "offensive": fb.offensive,
        "created_at": fb.created_at.isoformat() if fb.created_at else None,
        "replied_at": fb.replied_at.isoformat() if fb.replied_at else None,
        "applies_to_all": fb.applies_to_all,
        "selected_products_label": fb.selected_products_label,
    }