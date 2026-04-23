from sqlalchemy import Column, DateTime, Integer, String, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base
from sqlalchemy.sql import func
from datetime import datetime


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    message = Column(Text, nullable=False)
    rating = Column(Integer, nullable=False)
    reply = Column(Text, nullable=True)
    role = Column(String, default="user")        # "user" or "admin"
    offensive = Column(Boolean, default=False)   # flagged by ML model

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    replied_at = Column(DateTime(timezone=True), nullable=True)

    # Multi-product feedback support
    applies_to_all = Column(Boolean, default=False)
    selected_products_label = Column(Text, nullable=True)  # Human-readable list of selected products
    
    # Relationship to products
    products = relationship("FeedbackProduct", back_populates="feedback", cascade="all, delete-orphan")