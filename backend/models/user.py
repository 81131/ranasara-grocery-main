
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, Date, Float
from sqlalchemy.orm import relationship, Session
from sqlalchemy.sql import func
from database import Base, get_db
from typing import List, Optional


# --- DATABASE MODELS ---

class User(Base):
    __tablename__ = "users"
    
    user_id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(20), default="customer") # customer, staff, admin, driver
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)
    last_login = Column(DateTime(timezone=True))
    
    # Merged Profile fields
    title = Column(String(10)) 
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone_number = Column(String(15), unique=True)
    gender = Column(String(10))
    dob = Column(Date)
    
    addresses = relationship("Address", back_populates="user", cascade="all, delete-orphan")
    password_history = relationship("PasswordHistory", back_populates="user")
    driver_profile = relationship("Driver", back_populates="user", uselist=False)

class Driver(Base):
    __tablename__ = "drivers"
    driver_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"))
    license_number = Column(String(50), unique=True)
    vehicle_type = Column(String(50)) 
    assigned_city = Column(String(100)) 
    is_available = Column(Boolean, default=True)
    
    # NEW: Performance metrics (Required for the frontend)
    rating = Column(Float, default=5.0) 
    total_deliveries = Column(Integer, default=0)
    
    user = relationship("User", back_populates="driver_profile")

class PasswordHistory(Base):
    __tablename__ = "password_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"))
    old_hash = Column(Text, nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    user = relationship("User", back_populates="password_history")

class Address(Base):
    __tablename__ = "addresses"
    address_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"))
    house_no_lane = Column(Text)
    street_name = Column(Text)
    city = Column(String(100))
    postal_code = Column(String(10))
    is_default = Column(Boolean, default=False)
    user = relationship("User", back_populates="addresses")

