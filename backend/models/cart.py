# backend/models/cart.py
from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone

class Cart(Base):
    """
    Represents a user's active shopping session.
    Typically, a user only has one active cart at a time.
    """
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True, index=True)
    
    # We enforce unique=True so a user can't accidentally create multiple active carts
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True, nullable=False)  
    
    # Tracking when the cart was last updated is useful for "abandoned cart" features
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationship to the items in the cart
    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    """
    Represents an individual product placed inside the cart.
    """
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False) # Linked to inventory products table
    
    quantity = Column(Integer, nullable=False, default=1)

    cart = relationship("Cart", back_populates="items")