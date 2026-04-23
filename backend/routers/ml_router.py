from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from routers.auth_router import get_current_user
from ml import forecaster

router = APIRouter(prefix="/ml", tags=["Machine Learning"])

@router.get("/insights")
def get_forecasting_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    return forecaster.get_insights(db)

@router.post("/train")
def trigger_model_training(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    result = forecaster.train_forecaster(db)
    return result
