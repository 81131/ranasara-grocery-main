from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from typing import List, Optional
# Import the model from the models folder
from models.user import User, Driver
from fastapi.security import OAuth2PasswordRequestForm
from APIs.auth import verify_password, create_access_token, timedelta, ACCESS_TOKEN_EXPIRE_MINUTES
from pydantic import BaseModel, EmailStr
from APIs.auth import get_password_hash 
from schemas.user import UserCreate, DriverCreate, DriverUserResponse 

router = APIRouter(prefix="/users", tags=["User Management"])

# -------------------------------------------------------------------
# 1. SPECIFIC ROUTES (Must come first!)
# -------------------------------------------------------------------

@router.post("/register")
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pw = get_password_hash(user_data.password)
    
    new_user = User(
        email=user_data.email, 
        password_hash=hashed_pw,
        first_name=user_data.first_name, 
        last_name=user_data.last_name, 
        role=user_data.role
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created", "user_id": new_user.user_id}

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.user_id)}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role,
        "is_active": user.is_active 
    }

@router.post("/register-driver")
def register_driver(driver_in: DriverCreate, db: Session = Depends(get_db)):
    # Create User
    new_user = User(
        email=driver_in.email,
        password_hash=get_password_hash(driver_in.password),
        first_name=driver_in.first_name,
        last_name=driver_in.last_name,
        phone_number=driver_in.phone_number,
        role="driver"
    )
    db.add(new_user)
    db.flush()

    # Create Profile
    new_driver = Driver(
        user_id=new_user.user_id,
        license_number=driver_in.license_number,
        vehicle_type=driver_in.vehicle_type,
        assigned_city=driver_in.assigned_city,
        rating=5.0,
        total_deliveries=0
    )
    db.add(new_driver)
    db.commit()
    return {"message": "Driver registered successfully"}

@router.get("/drivers", response_model=List[DriverUserResponse])
def get_all_drivers(db: Session = Depends(get_db)):
    return db.query(User).filter(User.role == "driver").all()

@router.get("/")
def get_all_users(db: Session = Depends(get_db)):
    """Fetch all users for the Admin Dashboard"""
    users = db.query(User).all()
    return users


# -------------------------------------------------------------------
# 2. DYNAMIC ROUTES (Must come last to prevent shadowing!)
# -------------------------------------------------------------------

@router.get("/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}")
def update_user(
    user_id: int, 
    first_name: Optional[str] = None, 
    last_name: Optional[str] = None, 
    phone_number: Optional[str] = None, 
    role: Optional[str] = None, 
    is_active: Optional[bool] = None, 
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if first_name is not None: user.first_name = first_name
    if last_name is not None: user.last_name = last_name
    if phone_number is not None: user.phone_number = phone_number
    if role is not None: user.role = role
    if is_active is not None: user.is_active = is_active 
    
    db.commit()
    return {"message": "User updated successfully"}

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    db.commit()
    return {"message": f"User {user_id} deleted successfully"}