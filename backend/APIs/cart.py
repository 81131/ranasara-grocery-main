from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.cart import Cart, CartItem
from models.inventory import Product, StockBatch 
from APIs.auth import get_current_user

router = APIRouter(prefix="/cart", tags=["Cart Management"])

class CartItemRequest(BaseModel):
    batch_id: int # CHANGED: Frontend will now send the batch ID
    quantity: float 

@router.post("/add")
def add_to_cart(item: CartItemRequest, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    # 1. Verify Stock Exists
    batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.current_quantity < item.quantity:
        raise HTTPException(status_code=400, detail="Not enough stock available")

    # 2. Manage Cart
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
        
    existing_item = db.query(CartItem).filter(
        CartItem.cart_id == cart.id, 
        CartItem.batch_id == item.batch_id
    ).first()
    
    if existing_item:
        if batch.current_quantity < (existing_item.quantity + item.quantity):
            raise HTTPException(status_code=400, detail="Not enough stock to add more of this item")
        existing_item.quantity += item.quantity 
    else:
        new_item = CartItem(cart_id=cart.id, batch_id=item.batch_id, quantity=item.quantity)
        db.add(new_item)
        
    db.commit()
    return {"status": "success", "message": "Item added to cart"}

@router.get("/")
def view_cart(db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart or not cart.items:
        return {"cart_id": None, "items": [], "total": 0}
        
    enriched_items = []
    total = 0.0
    
    for i in cart.items:
        batch = db.query(StockBatch).filter(StockBatch.id == i.batch_id).first()
        if not batch: continue
        product = db.query(Product).filter(Product.id == batch.product_id).first()
        
        name = product.product_name if product else "Unknown Product"
        price = float(batch.retail_price)
        
        subtotal = price * float(i.quantity)
        total += subtotal
        
        enriched_items.append({
            "item_id": i.id,
            "batch_id": i.batch_id, 
            "quantity": float(i.quantity),
            "name": name,
            "image": batch.image_url or product.image_url or "https://via.placeholder.com/100",
            "price": price,
            "subtotal": subtotal,
            "batch_number": batch.batch_number
        })
        
    return {
        "cart_id": cart.id,
        "items": enriched_items,
        "total": total
    }

@router.put("/update")
def update_cart_item(item: CartItemRequest, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart: raise HTTPException(status_code=404, detail="Cart not found")
        
    existing_item = db.query(CartItem).filter(CartItem.cart_id == cart.id, CartItem.batch_id == item.batch_id).first()
    if not existing_item: raise HTTPException(status_code=404, detail="Item not found in cart")
        
    # Prevent updating past available stock
    batch = db.query(StockBatch).filter(StockBatch.id == item.batch_id).first()
    if item.quantity > 0 and batch.current_quantity < item.quantity:
        raise HTTPException(status_code=400, detail="Not enough stock available")

    if item.quantity <= 0:
        db.delete(existing_item)
        message = "Item removed from cart"
    else:
        existing_item.quantity = item.quantity
        message = "Item quantity updated"
        
    db.commit()
    return {"status": "success", "message": message}

@router.delete("/remove/{batch_id}")
def remove_from_cart(batch_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    cart = db.query(Cart).filter(Cart.user_id == user_id).first()
    if not cart: raise HTTPException(status_code=404, detail="Cart not found")
        
    existing_item = db.query(CartItem).filter(CartItem.cart_id == cart.id, CartItem.batch_id == batch_id).first()
    if not existing_item: raise HTTPException(status_code=404, detail="Item not found in cart")
        
    db.delete(existing_item)
    db.commit()
    return {"status": "success", "message": "Item completely removed from cart"}