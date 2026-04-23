from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from routers.auth_router import get_current_user
from ml import recommender

router = APIRouter(prefix="/recommend", tags=["Recommendations"])


class RecommendRequest(BaseModel):
    cart_items: List[str]   # list of product_codes currently in the cart
    top_n: int = 8


@router.post("")
def get_recommendations(
    body: RecommendRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a ranked list of products the user might want to add to their cart,
    based on co-purchase patterns from historical transaction data.
    """
    if not body.cart_items:
        raise HTTPException(status_code=400, detail="cart_items must not be empty")

    results = recommender.get_recommendations(
        cart_product_codes=body.cart_items,
        top_n=body.top_n,
        db_session=db,
    )

    if not results:
        # Lazy-train if model not ready yet
        recommender.train_recommender()
        results = recommender.get_recommendations(
            cart_product_codes=body.cart_items,
            top_n=body.top_n,
            db_session=db,
        )

    return {"recommendations": results, "based_on": body.cart_items}


@router.post("/train")
def trigger_recommender_training(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin-only: re-trains the recommendation model."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    success = recommender.train_recommender()
    return {"status": "success" if success else "error"}
