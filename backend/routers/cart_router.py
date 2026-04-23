from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.cart import Cart, CartItem
from models.inventory import Product, StockBatch
from models.user import User
from pydantic import BaseModel
from routers.auth_router import get_current_user
from schemas.cart import CartAdd, CartUpdate

router = APIRouter(prefix="/cart", tags=["cart"])

@router.get("/")
def get_cart(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cart = db.query(Cart).filter(Cart.user_id == current_user.user_id).first()
    if not cart:
        return {"items": [], "total": 0}
    
    items = []
    total = 0
    for item in cart.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            batch = next((b for b in product.batches if b.current_quantity > 0), None)
            if not batch and product.batches:
                batch = product.batches[0]
            if batch:
                price = float(batch.retail_price)
                subtotal = price * item.quantity
                total += subtotal
                items.append({
                    "item_id": item.id,
                    "batch_id": batch.id,
                    "product_id": item.product_id,
                    "name": product.product_name,
                    "price": price,
                    "quantity": item.quantity,
                    "subtotal": subtotal,
                    "image": product.image_url or batch.image_url or "https://via.placeholder.com/50",
                    "available_qty": float(batch.current_quantity),
                })
    return {"id": cart.id, "user_id": cart.user_id, "items": items, "total": total}

@router.post("/add")
def add_to_cart(item: CartAdd, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Product batch not found")
        
    user_cart = db.query(Cart).filter(Cart.user_id == current_user.user_id).first()
    if not user_cart:
        user_cart = Cart(user_id=current_user.user_id)
        db.add(user_cart)
        db.commit()
        db.refresh(user_cart)

    existing_item = db.query(CartItem).filter(CartItem.cart_id == user_cart.id, CartItem.product_id == batch.product_id).first()
    if existing_item:
        new_total = existing_item.quantity + item.quantity
        if new_total > batch.current_quantity:
            raise HTTPException(status_code=400, detail="Requested quantity exceeds available stock")
        existing_item.quantity += item.quantity
    else:
        if item.quantity > batch.current_quantity:
            raise HTTPException(status_code=400, detail="Requested quantity exceeds available stock")
        new_item = CartItem(cart_id=user_cart.id, product_id=batch.product_id, quantity=item.quantity)
        db.add(new_item)
    
    db.commit()
    return {"message": "Item added to cart"}

@router.put("/update")
def update_cart_item(item: CartUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Product batch not found")
        
    user_cart = db.query(Cart).filter(Cart.user_id == current_user.user_id).first()
    if not user_cart:
        raise HTTPException(status_code=404, detail="Cart not found")
        
    existing_item = db.query(CartItem).filter(CartItem.cart_id == user_cart.id, CartItem.product_id == batch.product_id).first()
    if existing_item:
        if item.quantity <= 0:
            db.delete(existing_item)
        else:
            if item.quantity > batch.current_quantity:
                raise HTTPException(status_code=400, detail="Requested quantity exceeds available stock")
            existing_item.quantity = item.quantity
        db.commit()
        return {"message": "Cart updated"}
    else:
        raise HTTPException(status_code=404, detail="Item not found in cart")
