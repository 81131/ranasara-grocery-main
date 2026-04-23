from sqlalchemy.sql import func
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from database import get_db
from models.feedback import Feedback

import joblib
import re
from pathlib import Path


class FeedbackBase(BaseModel):
    user_name: str = Field(..., min_length=1)
    product_name: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    rating: int = Field(..., ge=1, le=5)


class FeedbackCreate(FeedbackBase):
    pass


class FeedbackUpdate(FeedbackBase):
    pass


class FeedbackReply(BaseModel):
    reply: str = ""


router = APIRouter(prefix="", tags=["Feedback Management"])


BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "feedback_model.pkl"
VEC_PATH = BASE_DIR / "vectorizer.pkl"

model = None
vectorizer = None

try:
    model = joblib.load(MODEL_PATH)
    vectorizer = joblib.load(VEC_PATH)
    print(f"✅ AI model loaded: {MODEL_PATH}")
    print(f"✅ Vectorizer loaded: {VEC_PATH}")
except Exception as e:
    print("❌ AI model/vectorizer load failed. Using backup detector.")
    print("Reason:", e)

BAD_WORDS = [
    "fuck", "shit", "bitch", "asshole", "stupid", "idiot", "bastard", "dumb"
]


def detect_offensive(message: str) -> str:
    cleaned = message.lower()
    cleaned = re.sub(r"[^a-z0-9 ]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if model is not None and vectorizer is not None:
        try:
            vec = vectorizer.transform([cleaned])
            pred = model.predict(vec)[0]

            if pred == 1:
                return "offensive"
            if pred == 0:
                return "normal"
            if isinstance(pred, str):
                return pred.lower()

            return "normal"
        except Exception as e:
            print("❌ Prediction failed, using backup detector:", e)

    for w in BAD_WORDS:
        if w in cleaned.split():
            return "offensive"

    return "normal"


@router.post("/feedback")
def create_feedback(
    payload: FeedbackCreate,
    role: str = Query("user"),
    db: Session = Depends(get_db)
):
    if role != "user":
        raise HTTPException(status_code=403, detail="Only customers can create feedback")

    result = detect_offensive(payload.message)
    offensive_flag = (result == "offensive")

    new_feedback = Feedback(
        user_name=payload.user_name,
        product_name=payload.product_name,
        message=payload.message,
        rating=payload.rating,
        offensive=offensive_flag
    )

    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)
    return new_feedback


@router.get("/feedback")
def get_feedback(product: str = "", db: Session = Depends(get_db)):
    q = db.query(Feedback)

    if product and product.strip() != "":
        q = q.filter(Feedback.product_name.ilike(f"%{product.strip()}%"))

    return q.order_by(Feedback.id.desc()).all()


@router.put("/feedback/{feedback_id}")
def update_feedback(
    feedback_id: int,
    payload: FeedbackUpdate,
    role: str = Query("user"),
    db: Session = Depends(get_db)
):
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if role != "user" or feedback.user_name.strip().lower() != payload.user_name.strip().lower():
        raise HTTPException(status_code=403, detail="Not allowed to update this feedback")

    result = detect_offensive(payload.message)

    feedback.product_name = payload.product_name
    feedback.message = payload.message
    feedback.rating = payload.rating
    feedback.offensive = (result == "offensive")

    db.commit()
    db.refresh(feedback)
    return feedback


@router.delete("/feedback/{feedback_id}")
def delete_feedback(
    feedback_id: int,
    user_name: str = Query(""),
    role: str = Query("user"),
    db: Session = Depends(get_db)
):
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if role == "user":
        if feedback.user_name.strip().lower() != user_name.strip().lower():
            raise HTTPException(status_code=403, detail="You can delete only your own feedback")
    else:
        raise HTTPException(status_code=403, detail="Admin cannot delete feedback")

    db.delete(feedback)
    db.commit()
    return {"message": "Deleted successfully"}

@router.put("/feedback/{feedback_id}/reply")
def reply_feedback(
    feedback_id: int,
    payload: FeedbackReply,
    role: str = Query("admin"),
    db: Session = Depends(get_db)
):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reply")

    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    clean_reply = payload.reply.strip() if payload.reply else ""

    if clean_reply == "":
        feedback.reply = None
        feedback.replied_at = None
    else:
        feedback.reply = clean_reply
        feedback.replied_at = func.now()

    db.commit()
    db.refresh(feedback)
    return feedback