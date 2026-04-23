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

    # unique=True: a user can only have one active cart
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), unique=True, nullable=False)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    """
    Represents an individual product placed inside the cart.
    Stores BOTH product_id (for display/group lookups) and batch_id (for
    price-at-add-to-cart accuracy).  batch_id is the source of truth for
    pricing; product_id is kept for convenience queries.
    """
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)

    # The product this item belongs to (for display and grouping)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)

    # The exact batch selected — determines price and available stock
    batch_id = Column(Integer, ForeignKey("stock_batches.id", ondelete="SET NULL"), nullable=True)

    quantity = Column(Integer, nullable=False, default=1)

    cart = relationship("Cart", back_populates="items")