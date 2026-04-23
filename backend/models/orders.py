from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone

# NEW: Master configuration table for delivery calculations
class DeliveryConfig(Base):
    __tablename__ = "delivery_config"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Methods: "weight", "distance", "combined", "fixed"
    active_method = Column(String, default="fixed")
    auto_assign_drivers = Column(Boolean, default=False)
    
    # Configuration parameters
    fixed_fee = Column(Float, default=400.0)
    
    base_weight_kg = Column(Float, default=1.0)
    base_weight_fee = Column(Float, default=400.0)
    extra_weight_fee_per_kg = Column(Float, default=200.0)
    
    base_distance_km = Column(Float, default=1.0)
    base_distance_fee = Column(Float, default=200.0)
    extra_distance_fee_per_km = Column(Float, default=150.0)

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)    
    
    # Financials
    subtotal_amount = Column(Float, default=0.0) # Cost of items
    delivery_fee = Column(Float, default=0.0)    # Cost of delivery
    total_amount = Column(Float, default=0.0)    # Subtotal + Delivery
    
    # Data Tracking for Analytics/AI
    delivery_type = Column(String, default="Home Delivery") # "Home Delivery" or "Store Pickup"
    total_weight_kg = Column(Float, default=0.0)
    delivery_distance_km = Column(Float, default=0.0)
    
    current_status = Column(String, default="Pending") 
    otp_code = Column(String(6), nullable=True)  
    driver_id = Column(Integer, ForeignKey("users.user_id"), nullable=True) 
    payment_method = Column(String, default="Bank Transfer")
    payment_slip_url = Column(String, nullable=True)         # stores saved file path
    payment_slip_status = Column(String, nullable=True)      # pending_review | approved | rejected
    payhere_token = Column(String, nullable=True)            # HMAC-SHA256 token for our own webhook verification
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    driver = relationship("User", foreign_keys=[driver_id])
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    status_history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")
    delivery_info = relationship("OrderDelivery", back_populates="order", uselist=False, cascade="all, delete-orphan")

class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    
    status = Column(String, nullable=False)
    destination_url = Column(String, nullable=True)
    changed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    order = relationship("Order", back_populates="status_history")

class OrderDelivery(Base):
    __tablename__ = "order_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    
    driver_name = Column(String) 
    customer_name = Column(String, nullable=False)
    delivery_address = Column(String, nullable=False)
    delivery_lat = Column(Float, nullable=True)
    delivery_lng = Column(Float, nullable=True)
    
    order = relationship("Order", back_populates="delivery_info")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    
    # CHANGED: Order items now record the specific batch sold
    batch_id = Column(Integer, ForeignKey("stock_batches.id"), nullable=False) 
    
    quantity = Column(Float, nullable=False)
    price_at_purchase = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")