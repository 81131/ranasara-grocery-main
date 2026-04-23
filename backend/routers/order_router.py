from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File, Query
import random
import os
import shutil
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_, and_
from database import get_db
from models.orders import Order, OrderItem, OrderDelivery, DeliveryConfig
from models.user import User
from models.inventory import StockBatch, Product
from pydantic import BaseModel
from schemas.orders import OrderCreate
from routers.auth_router import get_current_user, require_admin

class DeliveryConfigUpdate(BaseModel):
    active_method: str
    fixed_fee: float
    base_weight_kg: float
    base_weight_fee: float
    extra_weight_fee_per_kg: float
    base_distance_km: float
    base_distance_fee: float
    extra_distance_fee_per_km: float
    auto_assign_drivers: bool = False

router = APIRouter(prefix="/orders", tags=["orders"])

# ── Notifications ───────────────────────────────────────────────────────────────
@router.get("/notifications/unread-count")
def get_unread_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Filter out abandoned card checkouts
    valid_filter = or_(Order.current_status != "Pending", Order.payment_method != "Card")
    
    if current_user.role == "admin":
        count = db.query(Order).filter(Order.current_status == "Pending", valid_filter).count()
    else:
        count = db.query(Order).filter(Order.user_id == current_user.user_id, Order.current_status != "Delivered").count()
    return {"count": count}

@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    valid_filter = or_(Order.current_status != "Pending", Order.payment_method != "Card")
    
    if current_user.role == "admin":
        orders = db.query(Order).filter(Order.current_status == "Pending", valid_filter).order_by(Order.created_at.desc()).limit(20).all()
        notifications = []
        for o in orders:
            notifications.append({
                "id": f"admin-{o.id}",
                "order_id": o.id,
                "status": o.current_status,
                "changed_at": o.created_at.isoformat() if o.created_at else None,
                "destination_url": "/admin?tab=orders"
            })
        return notifications
    else:
        orders = db.query(Order).filter(Order.user_id == current_user.user_id).order_by(Order.created_at.desc()).limit(15).all()
        notifications = []
        for o in orders:
            notifications.append({
                "id": f"cust-{o.id}",
                "order_id": o.id,
                "status": o.current_status,
                "changed_at": o.created_at.isoformat() if o.created_at else None,
                "destination_url": "/orders"
            })
        return notifications

# ── Delivery Config (admin) ───────────────────────────────────────────────────
@router.get("/delivery-config")
def get_delivery_config(db: Session = Depends(get_db)):
    config = db.query(DeliveryConfig).first()
    if not config:
        config = DeliveryConfig(active_method="fixed", fixed_fee=400.0, base_weight_kg=1.0, base_weight_fee=400.0, extra_weight_fee_per_kg=200.0, base_distance_km=1.0, base_distance_fee=200.0, extra_distance_fee_per_km=150.0)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/delivery-config")
def update_delivery_config(config_update: DeliveryConfigUpdate, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    config = db.query(DeliveryConfig).first()
    if not config:
        config = DeliveryConfig()
        db.add(config)
    config.active_method = config_update.active_method
    config.fixed_fee = config_update.fixed_fee
    config.base_weight_kg = config_update.base_weight_kg
    config.base_weight_fee = config_update.base_weight_fee
    config.extra_weight_fee_per_kg = config_update.extra_weight_fee_per_kg
    config.base_distance_km = config_update.base_distance_km
    config.base_distance_fee = config_update.base_distance_fee
    config.extra_distance_fee_per_km = config_update.extra_distance_fee_per_km
    config.auto_assign_drivers = config_update.auto_assign_drivers
    db.commit()
    db.refresh(config)
    return config

# ── All Orders (admin) ────────────────────────────────────────────────────────
@router.get("/")
def get_orders(
    db: Session = Depends(get_db),
    _admin = Depends(require_admin),
    status: Optional[str] = Query(None, description="Filter by status"),
    sort_by: Optional[str] = Query("date", description="Sort by field: date, id, amount"),
    sort_dir: Optional[str] = Query("desc", description="Sort direction: asc, desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Search by order ID or customer name"),
):
    valid_filter = or_(Order.current_status != "Pending", Order.payment_method != "Card")
    q = db.query(Order).filter(valid_filter)
    
    if status and status != "All":
        q = q.filter(Order.current_status == status)

    if search and search.strip():
        # Build a subquery of order IDs matching the customer name
        name_subq = db.query(OrderDelivery.order_id).filter(
            OrderDelivery.customer_name.ilike(f"%{search.strip()}%")
        ).subquery()
        try:
            oid = int(search.strip())
            id_match = Order.id == oid
        except ValueError:
            id_match = False
        q = q.filter(or_(id_match, Order.id.in_(name_subq)))

    total = q.count()

    # Apply Sorting
    if sort_by == "id":
        order_col = Order.id.desc() if sort_dir == "desc" else Order.id.asc()
    elif sort_by == "amount":
        order_col = Order.total_amount.desc() if sort_dir == "desc" else Order.total_amount.asc()
    else: # default to date
        order_col = Order.created_at.desc() if sort_dir == "desc" else Order.created_at.asc()
        
    orders = q.order_by(order_col).offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for order in orders:
        delivery = db.query(OrderDelivery).filter(OrderDelivery.order_id == order.id).first()
        items = []
        for oi in order.items:
            items.append({
                "id": oi.id,
                "batch_id": oi.batch_id,
                "quantity": oi.quantity,
                "price_at_purchase": oi.price_at_purchase
            })
        # Resolve customer name: delivery record first, fallback to user name
        customer_name = None
        if delivery and delivery.customer_name and delivery.customer_name not in ("In-Store Customer", ""):
            customer_name = delivery.customer_name
        if not customer_name:
            user = db.query(User).filter(User.user_id == order.user_id).first()
            if user:
                full = f"{user.first_name or ''} {user.last_name or ''}".strip()
                customer_name = full if full not in ("", "In-Store Customer") else "In-Store Customer"
            else:
                customer_name = "In-Store Customer"
        result.append({
            "id": order.id,
            "user_id": order.user_id,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "current_status": order.current_status,
            "total_amount": order.total_amount,
            "payment_method": order.payment_method,
            "payment_slip_url": order.payment_slip_url,
            "payment_slip_status": order.payment_slip_status,
            "delivery_info": {
                "customer_name": customer_name,
                "delivery_address": delivery.delivery_address if delivery else "Store Pickup",
                "driver_name": delivery.driver_name if delivery else None
            },
            "items": items
        })
    return {"orders": result, "total": total, "page": page, "page_size": page_size}

# ── My Orders (customer) ──────────────────────────────────────────────────────
@router.get("/my")
def get_my_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    orders = db.query(Order).filter(Order.user_id == current_user.user_id).order_by(Order.created_at.desc()).all()
    result = []
    for order in orders:
        items = []
        for oi in order.items:
            batch = db.query(StockBatch).filter(StockBatch.id == oi.batch_id).first()
            product = batch.product if batch else None
            items.append({
                "id": oi.id,
                "product_id": product.id if product else None,
                "product_name": product.product_name if product else "Item",
                "name": product.product_name if product else "Item",
                "quantity": oi.quantity,
                "price": oi.price_at_purchase,
                })
        result.append({
            "id": order.id,
            "status": order.current_status,
            "total": order.total_amount,
            "items": items,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "payment_method": order.payment_method,
            "otp_code": order.otp_code,
            "driver_id": order.driver_id,
        })
    return result

# ── Customer Dashboard Stats ──────────────────────────────────────────────────
@router.get("/my-stats")
def my_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    orders = db.query(Order).filter(Order.user_id == current_user.user_id).all()
    total_orders = len(orders)
    total_spent = sum(o.total_amount for o in orders)
    # Recent 5 orders
    recent = db.query(Order).filter(Order.user_id == current_user.user_id)\
        .order_by(Order.created_at.desc()).limit(5).all()
    recent_list = [{"id": o.id, "status": o.current_status, "total": o.total_amount,
                    "created_at": o.created_at.isoformat() if o.created_at else None} for o in recent]
    return {"total_orders": total_orders, "total_spent": total_spent, "recent_orders": recent_list}

@router.get("/my-products")
def get_my_purchased_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    orders = db.query(Order).filter(Order.user_id == current_user.user_id).all()

    product_ids = set()

    for order in orders:
        for item in order.items:
            batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
            if batch:
                product_ids.add(batch.product_id)

    products = db.query(Product).filter(Product.id.in_(product_ids)).all()

    return products

# ── Dashboard Stats (admin) ───────────────────────────────────────────────────
# ── Dashboard Stats ────────────────────────────────────────────────────
@router.get("/dashboard-stats")
def get_dashboard_stats(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    valid_filter = or_(Order.current_status != "Pending", Order.payment_method != "Card")
    
    total_orders = db.query(Order).filter(valid_filter).count()
    total_revenue = db.query(func.sum(Order.total_amount)).filter(valid_filter).scalar() or 0.0
    from models.inventory import Product
    from models.user import User as UserModel
    total_products = db.query(Product).count()
    active_users = db.query(UserModel).filter(UserModel.is_active == True).count()

    # Status breakdown counts
    all_statuses = ["Pending", "Processing", "Out for Delivery", "Completed", "Delivered", "Cancelled"]
    status_counts = {}
    for s in all_statuses:
        status_counts[s] = db.query(Order).filter(Order.current_status == s, valid_filter).count()

    # Real recent orders (last 10)
    recent_raw = db.query(Order).filter(valid_filter).order_by(Order.created_at.desc()).limit(10).all()
    STATUS_MAP = {
        "Delivered":        {"color": "#00a247", "bg": "#eefcf2"},
        "Completed":        {"color": "#00a247", "bg": "#eefcf2"},
        "Processing":       {"color": "#3b82f6", "bg": "#eff6ff"},
        "Out for Delivery": {"color": "#a855f7", "bg": "#faf5ff"},
        "Pending":          {"color": "#f59e0b", "bg": "#fffbeb"},
        "Cancelled":        {"color": "#ef4444", "bg": "#fef2f2"},
    }
    recent_orders = []
    for o in recent_raw:
        u = db.query(UserModel).filter(UserModel.user_id == o.user_id).first()
        st = STATUS_MAP.get(o.current_status, {"color": "#6b7280", "bg": "#f3f4f6"})
        elapsed = ""
        if o.created_at:
            delta = datetime.now(timezone.utc) - o.created_at.replace(tzinfo=timezone.utc)
            hours = int(delta.total_seconds() // 3600)
            elapsed = f"{hours}h ago" if hours > 0 else "Just now"
        # Resolve customer name
        name = "In-Store Customer"
        if u:
            full = f"{u.first_name or ''} {u.last_name or ''}".strip()
            if full and full != "In-Store Customer":
                name = full
        recent_orders.append({
            "id": f"ORD-{o.id:03d}",
            "status": o.current_status,
            "name": name,
            "time": elapsed,
            "total": f"Rs. {o.total_amount:.2f}",
            "color": st["color"],
            "bg": st["bg"],
        })

    # Real low stock items
    low_stock_batches = db.query(StockBatch).filter(StockBatch.current_quantity < 50)\
        .order_by(StockBatch.current_quantity.asc()).limit(5).all()
    low_stock_items = []
    for b in low_stock_batches:
        product = b.product
        cat = product.categories[0].name if product and product.categories else "General"
        low_stock_items.append({
            "name": product.product_name if product else "Unknown",
            "cat": cat,
            "qty": int(b.current_quantity),
        })

    return {
        "stats": {
            "totalRevenue": round(float(total_revenue), 2),
            "totalOrders": total_orders,
            "totalProducts": total_products,
            "activeUsers": active_users,
        },
        "statusCounts": status_counts,
        "recentOrders": recent_orders,
        "lowStockItems": low_stock_items,
    }

# ── Reports & Analytics ────────────────────────────────────────────────────────
@router.get("/reports")
def get_reports(
    db: Session = Depends(get_db),
    _admin = Depends(require_admin),
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    to_date:   Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    months: int = Query(6, ge=1, le=60, description="Number of months when no date range given"),
):
    now = datetime.now(timezone.utc)

    # --- determine date range ---
    if from_date and to_date:
        try:
            start_dt = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
            end_dt   = datetime.fromisoformat(to_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")
    else:
        # default: last N months
        start_dt = (now.replace(day=1) - timedelta(days=(months - 1) * 30)).replace(hour=0, minute=0, second=0)
        end_dt   = now

    # --- build monthly buckets between start_dt and end_dt ---
    revenue_by_month = []
    cur = start_dt.replace(day=1)
    while cur <= end_dt:
        month_num = cur.month
        year_num  = cur.year
        rev = db.query(func.sum(Order.total_amount)).filter(
            extract('month', Order.created_at) == month_num,
            extract('year',  Order.created_at) == year_num,
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
        ).scalar() or 0.0
        cnt = db.query(Order).filter(
            extract('month', Order.created_at) == month_num,
            extract('year',  Order.created_at) == year_num,
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
        ).count()
        revenue_by_month.append({
            "month": cur.strftime("%b '%y") if (end_dt - start_dt).days > 200 else cur.strftime("%b"),
            "revenue": round(float(rev), 2),
            "orders": cnt,
        })
        # advance one month
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)

    # Orders by status (within date range)
    statuses = ["Pending", "Processing", "Out for Delivery", "Completed", "Delivered", "Cancelled"]
    orders_by_status = []
    for s in statuses:
        cnt = db.query(Order).filter(
            Order.current_status == s,
            Order.created_at >= start_dt,
            Order.created_at <= end_dt,
        ).count()
        orders_by_status.append({"status": s, "count": cnt})

    # Top 5 products by sales volume (within date range)
    top_products_raw = db.query(
        OrderItem.batch_id,
        func.sum(OrderItem.quantity).label("total_qty"),
        func.sum(OrderItem.quantity * OrderItem.price_at_purchase).label("total_revenue"),
    ).join(Order, Order.id == OrderItem.order_id).filter(
        Order.created_at >= start_dt,
        Order.created_at <= end_dt,
    ).group_by(OrderItem.batch_id).order_by(func.sum(OrderItem.quantity).desc()).limit(10).all()

    top_products = []
    for row in top_products_raw:
        batch = db.query(StockBatch).filter(StockBatch.id == row.batch_id).first()
        name = batch.product.product_name if batch and batch.product else "Unknown"
        top_products.append({
            "name": name,
            "qty_sold": int(row.total_qty or 0),
            "revenue": round(float(row.total_revenue or 0), 2),
        })

    # Summary
    total_revenue = db.query(func.sum(Order.total_amount)).scalar() or 0.0
    total_orders = db.query(Order).count()

    return {
        "revenue_by_month": revenue_by_month,
        "orders_by_status": orders_by_status,
        "top_products": top_products,
        "summary": {
            "total_revenue": round(float(total_revenue), 2),
            "total_orders": total_orders,
        },
    }

# ── Notifications (status history, used by /notifications page) ───────────────
# NOTE: The simpler GET /notifications/unread-count + GET /notifications above handle
# the navbar badge. This endpoint serves the dedicated Notifications page with full history.
@router.get("/notifications/history")
def get_notifications_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models.orders import OrderStatusHistory, Order
    query = db.query(OrderStatusHistory)
    if current_user.role != "admin":
        query = query.join(Order).filter(Order.user_id == current_user.user_id)
    notifications = query.order_by(
        OrderStatusHistory.changed_at.desc()
    ).limit(10).all()
    return [{"order_id": n.order_id, "status": n.status, "changed_at": n.changed_at.isoformat(), "destination_url": n.destination_url} for n in notifications]

# ── User Orders (by user_id, admin) ──────────────────────────────────────────
@router.get("/user/{user_id}")
def get_user_orders(user_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return db.query(Order).filter(Order.user_id == user_id).all()

# ── Calculate Fee ─────────────────────────────────────────────────────────────
class FeeRequest(BaseModel):
    delivery_type: str
    distance_km: Optional[float] = 0

def _compute_shipping_fee(db: Session, delivery_type: str, distance_km: float, total_weight_kg: float) -> float:
    if delivery_type == "Store Pickup":
        return 0.0
    config = db.query(DeliveryConfig).first()
    if not config:
        return 400.0

    if config.active_method == "fixed":
        return config.fixed_fee
    elif config.active_method == "weight":
        return config.base_weight_fee
    elif config.active_method == "distance":
        base = config.base_distance_fee
        extra = max(0.0, distance_km - config.base_distance_km) * config.extra_distance_fee_per_km
        return base + extra
    elif config.active_method == "combined":
        base_fee = config.base_weight_fee
        dist_base = config.base_distance_fee
        extra = max(0.0, distance_km - config.base_distance_km) * config.extra_distance_fee_per_km
        return base_fee + dist_base + extra
    return config.fixed_fee


@router.post("/calculate-fee")
def calculate_fee(request: FeeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models.cart import Cart, CartItem
    from models.inventory import StockBatch
    cart = db.query(Cart).filter(Cart.user_id == current_user.user_id).first()
    total_weight = 0.0
    if cart:
        items = db.query(CartItem).filter(CartItem.cart_id == cart.id).all()
        for item in items:
            if item.batch_id:
                batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
            else:
                batch = db.query(StockBatch).filter(StockBatch.product_id == item.product_id, StockBatch.current_quantity > 0).first()
            if batch:
                total_weight += (batch.unit_weight_kg or 0.5) * item.quantity
            else:
                total_weight += 0.5 * item.quantity
    fee = _compute_shipping_fee(db, request.delivery_type, request.distance_km, total_weight)
    return {"fee": round(fee, 2), "total_weight": round(total_weight, 2)}

# ── Checkout ──────────────────────────────────────────────────────────────────
@router.post("/checkout")
async def checkout(
    customer_name: str = Form(...),
    delivery_type: str = Form("Home Delivery"),
    delivery_address: str = Form(""),
    delivery_lat: float = Form(None),
    delivery_lng: float = Form(None),
    distance_km: float = Form(0),
    payment_method: str = Form("Card"),
    payment_slip: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models.cart import Cart, CartItem
    cart = db.query(Cart).filter(Cart.user_id == current_user.user_id).first()
    if not cart:
        raise HTTPException(status_code=400, detail="Cart is empty")
    cart_items = db.query(CartItem).filter(CartItem.cart_id == cart.id).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    
    if delivery_type == "Home Delivery":
        if not customer_name or not customer_name.strip():
            raise HTTPException(status_code=400, detail="Customer name is required")
        if not delivery_address or not delivery_address.strip():
            raise HTTPException(status_code=400, detail="Delivery address is required")
        # Map location is highly recommended but shouldn't block checkout if the map script is blocked by an ad-blocker
        if delivery_lat is None: delivery_lat = 0.0
        if delivery_lng is None: delivery_lng = 0.0

    if payment_method == "Payment Slip" and not payment_slip:
        raise HTTPException(status_code=400, detail="Payment slip is required")

    subtotal = 0.0
    total_weight = 0.0
    for ci in cart_items:
        # Use stored batch_id for price accuracy; fall back to product_id lookup
        if ci.batch_id:
            batch = db.query(StockBatch).filter(StockBatch.id == ci.batch_id).first()
        else:
            batch = (
                db.query(StockBatch)
                .filter(StockBatch.product_id == ci.product_id, StockBatch.current_quantity > 0)
                .first()
            ) or db.query(StockBatch).filter(StockBatch.product_id == ci.product_id).first()
        if batch:
            subtotal += float(batch.retail_price) * ci.quantity
            total_weight += (batch.unit_weight_kg or 0.5) * ci.quantity

    shipping = _compute_shipping_fee(db, delivery_type, distance_km, total_weight)
    total = float(subtotal) + shipping

    # Handle payment slip upload — validate type and sanitize filename
    slip_path = None
    if payment_slip and payment_slip.filename:
        ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}
        MAX_SLIP_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
        if payment_slip.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail="Payment slip must be a JPEG, PNG, or PDF")
        slips_dir = "/app/payment_slips"
        os.makedirs(slips_dir, exist_ok=True)
        safe_filename = os.path.basename(payment_slip.filename).replace(" ", "_")
        safe_name = f"{current_user.user_id}_{int(datetime.now().timestamp())}_{safe_filename}"
        slip_path = os.path.join(slips_dir, safe_name)
        
        file_size = 0
        with open(slip_path, "wb") as f:
            while chunk := await payment_slip.read(1024 * 1024):  # 1MB chunks
                file_size += len(chunk)
                if file_size > MAX_SLIP_SIZE_BYTES:
                    f.close()
                    os.remove(slip_path)
                    raise HTTPException(status_code=400, detail="Payment slip must not exceed 10 MB")
                f.write(chunk)

    order = Order(
        user_id=current_user.user_id,
        subtotal_amount=float(subtotal),
        delivery_fee=shipping,
        total_amount=total,
        delivery_type=delivery_type,
        current_status="Pending",
        payment_method=payment_method,
        payment_slip_url=slip_path,
        payment_slip_status="pending_review" if slip_path else None,
        otp_code=str(random.randint(100000, 999999))
    )
    db.add(order)
    db.flush()

    delivery = OrderDelivery(
        order_id=order.id,
        customer_name=customer_name,
        delivery_address=delivery_address or "Store Pickup",
        delivery_lat=delivery_lat,
        delivery_lng=delivery_lng
    )
    db.add(delivery)

    for ci in cart_items:
        # Use stored batch_id for accuracy; fall back to product_id lookup
        if ci.batch_id:
            batch = db.query(StockBatch).filter(StockBatch.id == ci.batch_id).first()
        else:
            batch = db.query(StockBatch).filter(
                StockBatch.product_id == ci.product_id, StockBatch.current_quantity > 0
            ).first()
        if batch:
            oi = OrderItem(
                order_id=order.id,
                batch_id=batch.id,
                quantity=ci.quantity,
                price_at_purchase=float(batch.retail_price),
            )
            db.add(oi)
            # Deduct stock immediately ONLY for Cash on Delivery (payment is guaranteed at door).
            # Card (PayHere) and Payment Slip orders defer deduction to payment confirmation
            # to prevent phantom stock loss from abandoned checkouts.
            if payment_method == "Cash on Delivery":
                batch.current_quantity = max(0, batch.current_quantity - ci.quantity)

    # Clear cart
    db.query(CartItem).filter(CartItem.cart_id == cart.id).delete()
    db.commit()
    return {"message": "Order placed successfully", "order_id": order.id}

# ── Update Order Status (admin) ───────────────────────────────────────────────
class StatusUpdate(BaseModel):
    status: str

class DriverAssign(BaseModel):
    driver_id: int

@router.get("/drivers/available")
def get_available_drivers(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    from models.user import User, Driver
    drivers = db.query(User).join(Driver).filter(Driver.is_available == True).all()
    return [{"id": d.user_id, "name": f"{d.first_name} {d.last_name}".strip()} for d in drivers]

@router.put("/{order_id}/assign-driver")
def assign_driver(order_id: int, body: DriverAssign, db: Session = Depends(get_db)):
    if assign_driver_to_order(order_id, body.driver_id, db):
        return {"message": "Driver assigned"}
    raise HTTPException(status_code=400, detail="Assignment failed (Driver or Order not found)")

def assign_driver_to_order(order_id: int, driver_user_id: int, db: Session):
    from models.orders import Order, OrderDelivery
    from models.user import User, Driver
    order = db.query(Order).filter(Order.id == order_id).first()
    driver_user = db.query(User).filter(User.user_id == driver_user_id).first()
    driver_profile = db.query(Driver).filter(Driver.user_id == driver_user_id).first()
    if not order or not driver_user or not driver_profile:
        return False
    order.driver_id = driver_user_id
    delivery = db.query(OrderDelivery).filter(OrderDelivery.order_id == order_id).first()
    if delivery:
        delivery.driver_name = f"{driver_user.first_name} {driver_user.last_name}".strip()
    driver_profile.is_available = False
    db.commit()
    return True

def auto_assign_if_enabled(order_id: int, db: Session):
    from models.orders import DeliveryConfig
    from models.user import Driver
    config = db.query(DeliveryConfig).first()
    if config and config.auto_assign_drivers:
        available = db.query(Driver).filter(Driver.is_available == True).first()
        if available:
            assign_driver_to_order(order_id, available.user_id, db)

@router.put("/{order_id}/status")
def update_order_status(order_id: int, body: StatusUpdate, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    status = body.status
    from models.orders import OrderStatusHistory
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.current_status = status
    url = "/orders" if order.user_id else "/admin/orders"
    history = OrderStatusHistory(order_id=order_id, status=status, destination_url=url)
    db.add(history)
    if status == "Processing":
        auto_assign_if_enabled(order_id, db)
    db.commit()
    return {"message": "Status updated"}

# ── Payment Slip Review (admin) ───────────────────────────────────────────────
class SlipReview(BaseModel):
    action: str  # "approve" or "reject"

@router.put("/{order_id}/review-slip")
def review_payment_slip(order_id: int, body: SlipReview, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.payment_slip_url:
        raise HTTPException(status_code=400, detail="No payment slip on this order")
    if body.action == "approve":
        order.payment_slip_status = "approved"
        if order.current_status == "Pending":
            order.current_status = "Processing"
            # Deduct stock now that payment slip is confirmed
            for oi in order.items:
                batch = db.query(StockBatch).filter(StockBatch.id == oi.batch_id).first()
                if batch:
                    batch.current_quantity = max(0.0, float(batch.current_quantity) - float(oi.quantity))
            auto_assign_if_enabled(order_id, db)
    elif body.action == "reject":
        order.payment_slip_status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    db.commit()
    return {"message": f"Slip {body.action}d", "new_status": order.current_status}

# ── Driver Delivery Endpoints ───────────────────────────────────────────────────
@router.get("/driver/deliveries")
def get_driver_deliveries(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Not a driver")
        
    orders = db.query(Order).filter(Order.driver_id == current_user.user_id).order_by(Order.created_at.desc()).all()
    res = []
    for o in orders:
        res.append({
            "id": o.id,
            "status": o.current_status,
            "total_amount": o.total_amount,
            "customer_name": o.delivery_info.customer_name if o.delivery_info else "Unknown",
            "delivery_address": o.delivery_info.delivery_address if o.delivery_info else "",
            "delivery_lat": o.delivery_info.delivery_lat if o.delivery_info else None,
            "delivery_lng": o.delivery_info.delivery_lng if o.delivery_info else None,
            "distance_km": 0.0,
            "created_at": o.created_at
        })
    return res

@router.post("/driver/{order_id}/verify-otp")
def verify_delivery_otp(
    order_id: int,
    otp_code: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Not a driver")
        
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.driver_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not assigned to you")
    if order.otp_code != otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP code")
        
    order.current_status = "Delivered"
    from models.orders import OrderStatusHistory
    db.add(OrderStatusHistory(order_id=order.id, status="Delivered", destination_url="/orders"))
    
    from models.user import Driver
    driver_profile = db.query(Driver).filter(Driver.user_id == current_user.user_id).first()
    if driver_profile:
        driver_profile.total_deliveries += 1
        driver_profile.is_available = True
        
    db.commit()
    return {"message": "Delivery verified successfully"}

@router.put("/driver/{order_id}/start-delivery")
def start_delivery(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "driver":
        raise HTTPException(status_code=403, detail="Not a driver")
        
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.driver_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not assigned to you")
    order.current_status = "Out for Delivery"
    from models.orders import OrderStatusHistory
    db.add(OrderStatusHistory(order_id=order.id, status="Out for Delivery", destination_url="/orders"))
    db.commit()
    return {"message": "Delivery started"}
