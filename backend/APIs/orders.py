from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from sqlalchemy.orm import Session
import shutil
import uuid
import os
import math
from database import get_db
from models.orders import Order, OrderItem, OrderDelivery, OrderStatusHistory, DeliveryConfig
from models.cart import Cart
from models.inventory import StockBatch, Product, Category
from schemas.orders import DeliveryConfigUpdate, DeliveryFeeCalculationRequest, OrderStatusUpdate
from APIs.auth import get_current_user
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from APIs.auth import get_active_user
from sqlalchemy.orm import Session, joinedload
from models.user_management import User  
import random


router = APIRouter(prefix="/orders", tags=["Orders"])

# --- NEW: Delivery Configuration (Admin) ---
@router.get("/delivery-config")
def get_delivery_config(db: Session = Depends(get_db)):
    config = db.query(DeliveryConfig).first()
    if not config:
        config = DeliveryConfig() # Create default if it doesn't exist
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/delivery-config")
def update_delivery_config(config_data: DeliveryConfigUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    config = db.query(DeliveryConfig).first()
    if not config:
        config = DeliveryConfig()
        db.add(config)
        
    for key, value in config_data.model_dump().items():
        setattr(config, key, value)
        
    db.commit()
    return {"message": "Delivery configuration updated successfully"}

# --- NEW: Dynamic Fee Calculator (Frontend Cart) ---
@router.post("/calculate-fee")
def calculate_delivery_fee(
    request: DeliveryFeeCalculationRequest, 
    db: Session = Depends(get_db), 
    user_id: int = Depends(get_current_user)
):
    if request.delivery_type == "Store Pickup":
        return {"fee": 0.0, "total_weight": 0.0}

    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart or not cart.items:
        return {"fee": 0.0, "total_weight": 0.0}

    # 1. Calculate Total Cart Weight
    total_weight = 0.0
    for item in cart.items:
        batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
        product = db.query(Product).filter(Product.id == batch.product_id).first()
        
        if product.unit_of_measure == "KG" or product.unit_of_measure == "Liters":
            total_weight += float(item.quantity) # The quantity IS the weight/volume
        elif product.unit_of_measure == "Units" and batch.unit_weight_kg:
            total_weight += (float(batch.unit_weight_kg) * float(item.quantity))

    # 2. Apply the Active Delivery Math
    config = db.query(DeliveryConfig).first()
    if not config: config = DeliveryConfig()
    
    fee = 0.0
    
    if config.active_method == "fixed":
        fee = config.fixed_fee
        
    elif config.active_method == "weight":
        if total_weight <= config.base_weight_kg:
            fee = config.base_weight_fee
        else:
            extra_kg = math.ceil(total_weight - config.base_weight_kg)
            fee = config.base_weight_fee + (extra_kg * config.extra_weight_fee_per_kg)
            
    elif config.active_method == "distance":
        if request.distance_km <= config.base_distance_km:
            fee = config.base_distance_fee
        else:
            extra_km = math.ceil(request.distance_km - config.base_distance_km)
            fee = config.base_distance_fee + (extra_km * config.extra_distance_fee_per_km)
            
    elif config.active_method == "combined":
        # Weight Logic
        w_fee = config.base_weight_fee
        if total_weight > config.base_weight_kg:
            w_fee += math.ceil(total_weight - config.base_weight_kg) * config.extra_weight_fee_per_kg
        # Distance Logic
        d_fee = config.base_distance_fee
        if request.distance_km > config.base_distance_km:
            d_fee += math.ceil(request.distance_km - config.base_distance_km) * config.extra_distance_fee_per_km
            
        fee = w_fee + d_fee

    return {"fee": fee, "total_weight": total_weight}

# --- UPDATED: Checkout Endpoint ---
@router.post("/checkout")
def checkout(
    customer_name: str = Form(...),
    delivery_address: str = Form(None), # Optional for pickup
    delivery_type: str = Form("Home Delivery"),
    distance_km: float = Form(0.0),
    payment_method: str = Form(...),
    payment_slip: UploadFile = File(None),
    db: Session = Depends(get_db), 
    user_id: int = Depends(get_active_user)
):
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart or not cart.items:
        raise HTTPException(status_code=400, detail="Your cart is empty")
        
    # Slip Upload Logic (remains the same as previous step)
    slip_url = None
    if payment_method == "Bank Transfer":
        if not payment_slip: raise HTTPException(status_code=400, detail="Payment slip required")
        os.makedirs("static/uploads/slips", exist_ok=True)
        file_ext = payment_slip.filename.split(".")[-1]
        new_filename = f"slip_{uuid.uuid4().hex}.{file_ext}"
        file_location = f"static/uploads/slips/{new_filename}"
        with open(file_location, "wb+") as f: shutil.copyfileobj(payment_slip.file, f)
        slip_url = f"http://localhost:8000/{file_location}"

    # Re-calculate fee securely on the backend
    fee_data = calculate_delivery_fee(DeliveryFeeCalculationRequest(delivery_type=delivery_type, distance_km=distance_km), db, user_id)
    delivery_fee = fee_data["fee"]
    total_weight = fee_data["total_weight"]
    
    subtotal_amount = 0.0
    item_prices = {} 
    
    for item in cart.items:
        batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
        if not batch or batch.current_quantity < item.quantity:
            raise HTTPException(status_code=400, detail="Inventory mismatch. Please review cart.")
            
        price = float(batch.retail_price)
        item_prices[item.batch_id] = price
        subtotal_amount += price * float(item.quantity)
        
    total_amount = subtotal_amount + delivery_fee
        
    generated_otp = None
    if delivery_type == "Home Delivery":
            generated_otp = str(random.randint(100000, 999999))
            
    new_order = Order(
            user_id=user_id,
            subtotal_amount=subtotal_amount,
            delivery_fee=delivery_fee,
            total_amount=total_amount,
            delivery_type=delivery_type,
            total_weight_kg=total_weight,
            delivery_distance_km=distance_km,
            current_status="Pending",
            payment_method=payment_method,
            payment_slip_url=slip_url,
            otp_code=generated_otp  # NEW: Save the OTP to the database
        )
    db.add(new_order)
    db.flush()

    for item in cart.items:
        batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
        batch.current_quantity -= float(item.quantity)
        
        order_item = OrderItem(order_id=new_order.id, batch_id=item.batch_id, quantity=float(item.quantity), price_at_purchase=item_prices[item.batch_id])
        db.add(order_item)
        db.delete(item) 
        
    delivery_info = OrderDelivery(order_id=new_order.id, customer_name=customer_name, delivery_address=delivery_address if delivery_type == "Home Delivery" else "Store Pickup")
    db.add(delivery_info)
    db.add(OrderStatusHistory(order_id=new_order.id, status="Pending"))
    
    db.commit()
    return {"message": "Checkout successful", "order_id": new_order.id}

# ... (Keep get_user_orders, get_all_orders, and status update endpoints below)

@router.get("/")
def get_user_orders(db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    # ADD .options() to eager load the delivery_info and items tables
    return db.query(Order).options(
        joinedload(Order.delivery_info),
        joinedload(Order.items)
    ).filter(Order.user_id == user_id).order_by(Order.created_at.desc()).all()

@router.get("/all")
def get_all_orders(db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    # ADD .options() here as well for the Admin view
    return db.query(Order).options(
        joinedload(Order.delivery_info),
        joinedload(Order.items)
    ).order_by(Order.created_at.desc()).all()

@router.put("/{order_id}/status")
def update_order_status(order_id: int, status_data: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order: 
        raise HTTPException(status_code=404, detail="Order not found")
        
    order.current_status = status_data.status
    
    # LOGIC: Auto-assign driver when moving to 'Processing'
    if status_data.status == "Processing" and order.delivery_type == "Home Delivery":
        config = db.query(DeliveryConfig).first()
        if config and config.auto_assign_drivers:
            # Find the first available driver
            available_driver = db.query(Driver).filter(Driver.is_available == True).first()
            if available_driver:
                order.driver_id = available_driver.user_id
                available_driver.is_available = False # Mark as busy
                # In a real app, you'd send a notification to the driver here

    db.add(OrderStatusHistory(order_id=order.id, status=status_data.status))
    db.commit()
    return {"message": f"Order #{order_id} status updated"}

@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    # 1. Identify who is asking
    user = db.query(User).filter(User.user_id == user_id).first()
    
    # 2. If it's the Admin, return the global feed
    if user and user.role == "admin":
        return db.query(OrderStatusHistory).order_by(OrderStatusHistory.changed_at.desc()).limit(15).all()
        
    # 3. If it's a Customer, return only their personal order updates
    user_orders = db.query(Order.id).filter(Order.user_id == user_id).all()
    order_ids = [o.id for o in user_orders]
    
    return db.query(OrderStatusHistory).filter(
        OrderStatusHistory.order_id.in_(order_ids)
    ).order_by(OrderStatusHistory.changed_at.desc()).limit(10).all()


@router.get("/dashboard-stats")
def get_dashboard_stats(db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    """Aggregates data for the Admin Dashboard"""
    
    # 1. Basic Stats
    total_orders = db.query(Order).count()
    total_revenue = db.query(func.sum(Order.total_amount)).scalar() or 0.0
    total_products = db.query(Product).count()
    
    # We will approximate users by counting unique user_ids in orders if you don't have a direct User model import here
    active_users = db.query(Order.user_id).distinct().count()

    # 2. Recent Orders (Top 4)
    recent_orders_db = db.query(Order).order_by(Order.created_at.desc()).limit(4).all()
    recent_orders = []
    
    # Status color mapping
    status_colors = {
        "Pending": {"color": "#eab308", "bg": "#fef9c3"},
        "Processing": {"color": "#3b82f6", "bg": "#dbeafe"},
        "Shipped": {"color": "#a855f7", "bg": "#f3e8ff"},
        "Delivered": {"color": "#22c55e", "bg": "#dcfce7"},
        "Cancelled": {"color": "#ef4444", "bg": "#fee2e2"}
    }

    for o in recent_orders_db:
            colors = status_colors.get(o.current_status, status_colors["Pending"])
            
            # --- UPDATE THESE LINES ---
            # Strip timezone info from both to guarantee they can be safely subtracted
            safe_now = datetime.now().replace(tzinfo=None)
            safe_created_at = o.created_at.replace(tzinfo=None) if o.created_at else safe_now
            
            time_diff = safe_now - safe_created_at
            hours_ago = int(time_diff.total_seconds() / 3600)
            time_str = f"{hours_ago} hours ago" if hours_ago > 0 else "Just now"
            # --------------------------
            
            recent_orders.append({
                "id": f"ORD-{o.id:04d}",
                "name": o.delivery_info.customer_name if o.delivery_info else "Unknown",
                "time": time_str,
                "total": f"Rs. {o.total_amount:.2f}",
                "status": o.current_status,
                "color": colors["color"],
                "bg": colors["bg"]
            })

    # 3. Low Stock Alerts (Items with < 20 quantity)
    low_stock_db = db.query(StockBatch).filter(StockBatch.current_quantity > 0, StockBatch.current_quantity < 20).limit(5).all()
    low_stock_items = []
    for batch in low_stock_db:
        cat_names = ", ".join([c.name for c in batch.product.categories])
        low_stock_items.append({
            "name": batch.product.product_name,
            "cat": cat_names if cat_names else "Uncategorized",
            "qty": batch.current_quantity
        })

    # 4. Chart Data: Mocking the last 6 months of sales for the Line Chart based on DB data
    # (In a massive production app, you'd use SQL GROUP BY MONTH, but this is safe for SQLite/Postgres compatibility)
    sales_data = []
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    current_month_idx = datetime.now().month - 1
    
    for i in range(5, -1, -1):
        m_idx = (current_month_idx - i) % 12
        # For this example, we generate a random realistic curve based on total revenue
        # Replace with actual DB grouped queries when you have historical data
        sales_data.append({
            "name": months[m_idx],
            "sales": float(total_revenue) / 6 * (0.8 + (i * 0.1)) # Simulated trend
        })

    # 5. Chart Data: Category Distribution
    # Count how many products belong to each category
    categories_db = db.query(Category).all()
    colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']
    category_data = []
    
    for idx, cat in enumerate(categories_db):
        prod_count = len(cat.products)
        if prod_count > 0:
            category_data.append({
                "name": cat.name,
                "value": prod_count,
                "color": colors[idx % len(colors)]
            })

    return {
        "stats": {
            "totalRevenue": total_revenue,
            "totalOrders": total_orders,
            "totalProducts": total_products,
            "activeUsers": active_users
        },
        "recentOrders": recent_orders,
        "lowStockItems": low_stock_items,
        "salesData": sales_data,
        "categoryData": category_data
    }