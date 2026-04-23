from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List
import uuid 
import json 
import os
import shutil
from google import genai # NEW: AI Integration
from database import get_db
import re

from models.inventory import Product, Category, StockBatch, StockBatchEditHistory
from models.suppliers import Supplier 
from schemas.inventory import (
    ProductCreate, ProductResponse, ProductUpdate,
    CategoryCreate, CategoryResponse,
    StockBatchCreate, StockBatchResponse,
    StockBatchUpdate, StockBatchEditHistoryResponse 
)
from APIs.auth import get_current_user

router = APIRouter(prefix="/inventory", tags=["Inventory Management"])

# --- AI Keyword Generator ---
class KeywordRequest(BaseModel):
    product_name: str
    description: str = ""
    categories: str = ""

client = genai.Client()

@router.post("/generate-keywords")
def generate_keywords(request: KeywordRequest, user_id: int = Depends(get_current_user)):
    """Uses LLM to generate relevant supermarket keywords."""
    try:
        # NEW SDK SYNTAX: Initialize the client (it automatically finds GEMINI_API_KEY in your .env)
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        
        prompt = f"""
        You are a strict JSON-only API. Generate 5 to 7 highly relevant, searchable tags for a supermarket product.
        Product Name: {request.product_name}
        Categories: {request.categories}
        Description: {request.description}
        
        RULES:
        1. Return ONLY a valid JSON array of strings. No conversational text.
        2. Each string MUST start with a hashtag.
        3. DO NOT use CamelCase. Use spaces between words (e.g., "#Instant Noodles" NOT "#InstantNoodles").
        
        EXAMPLE OUTPUT:
        ["#Snack", "#Chocolate", "#Sweet Treat"]
        """
        
        # NEW SDK SYNTAX: Calling the model
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        # Clean the response to strip out Markdown code blocks the AI might inject
        clean_text = response.text.strip()
        if clean_text.startswith('```json'): 
            clean_text = clean_text[7:]
        elif clean_text.startswith('```python'): 
            clean_text = clean_text[9:]
        if clean_text.endswith('```'): 
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        keywords = json.loads(clean_text)
        
        # Backend safety check: Force CamelCase split just in case the AI disobeys Rule #3
        formatted_keywords = []
        for kw in keywords:
            # Splits CamelCase: "InstantNoodles" -> "Instant Noodles"
            spaced_kw = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', kw)
            formatted_keywords.append(spaced_kw)
            
        return {"keywords": formatted_keywords}
        
    except Exception as e:
        print(f"AI Generation Error: {str(e)}") # This will print the actual error in your Docker terminal
        raise HTTPException(status_code=500, detail="Failed to parse AI response. Please try again.")
    
    
# --- Image Upload ---
@router.post("/upload-image")
def upload_image(file: UploadFile = File(...), user_id: int = Depends(get_current_user)):
    os.makedirs("static/uploads", exist_ok=True)
    file_extension = file.filename.split(".")[-1]
    new_filename = f"{uuid.uuid4().hex}.{file_extension}"
    file_location = f"static/uploads/{new_filename}"

    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)

    return {"image_url": f"http://localhost:8000/{file_location}"}


# --- Categories ---
@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).all()

@router.post("/categories", response_model=CategoryResponse)
def create_category(category: CategoryCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    db_category = Category(**category.model_dump())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category


# --- Products ---
@router.get("/products/all")
def get_all_products_with_stock(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    result = []
    
    for p in products:
        total_qty = db.query(func.sum(StockBatch.current_quantity))\
                      .filter(StockBatch.product_id == p.id).scalar() or 0.0
                      
        latest_batch = db.query(StockBatch)\
                         .filter(StockBatch.product_id == p.id)\
                         .order_by(StockBatch.id.desc()).first()
                         
        retail = float(latest_batch.retail_price) if latest_batch else 0.0
        cost = float(latest_batch.buying_price) if latest_batch else 0.0
        
        # Join categories into a string for easy display
        cat_names = ", ".join([c.name for c in p.categories])
        
        result.append({
            "id": p.id,
            "sku": p.sku,
            "product_name": p.product_name,
            "category_name": cat_names if cat_names else "Uncategorized",
            "image_url": p.image_url,
            "unit_of_measure": p.unit_of_measure,
            "current_quantity": total_qty,
            "retail_price": retail,
            "buying_price": cost,
            "keywords": p.keywords
        })
    return result

@router.post("/products", response_model=ProductResponse)
def create_product(product: ProductCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    if not db.query(Supplier).filter(Supplier.id == product.supplier_id).first():
        raise HTTPException(status_code=404, detail="Supplier not found")
        
    # Handle Many-to-Many Categories
    categories = db.query(Category).filter(Category.id.in_(product.category_ids)).all()
    if not categories:
        raise HTTPException(status_code=400, detail="At least one valid category must be selected")

    product_data = product.model_dump(exclude={"category_ids"})
    if not product_data.get("sku"):
        product_data["sku"] = f"SYS-{uuid.uuid4().hex[:6].upper()}"
        
    db_product = Product(**product_data)
    db_product.categories = categories # Link the categories
    
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, product_update: ProductUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = product_update.model_dump(exclude_unset=True)
    
    # Handle category updates separately
    if "category_ids" in update_data:
        cat_ids = update_data.pop("category_ids")
        categories = db.query(Category).filter(Category.id.in_(cat_ids)).all()
        db_product.categories = categories

    for key, value in update_data.items():
        setattr(db_product, key, value)

    db.commit()
    db.refresh(db_product)
    return db_product


# --- Stock Batches ---
@router.get("/products/{product_id}/batches", response_model=List[StockBatchResponse])
def get_product_batches(product_id: int, db: Session = Depends(get_db)):
    return db.query(StockBatch).filter(StockBatch.product_id == product_id).order_by(StockBatch.id.desc()).all()

@router.post("/batches", response_model=StockBatchResponse)
def add_stock_batch(batch: StockBatchCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    if not db.query(Product).filter(Product.id == batch.product_id).first():
        raise HTTPException(status_code=404, detail="Product not found")
        
    db_batch = StockBatch(**batch.model_dump())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch

@router.put("/batches/{batch_id}", response_model=StockBatchResponse)
def update_stock_batch(batch_id: int, batch_update: StockBatchUpdate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    db_batch = db.query(StockBatch).filter(StockBatch.id == batch_id).first()
    if not db_batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    changes = {}
    update_data = batch_update.model_dump(exclude_unset=True)
    
    for key, new_value in update_data.items():
        old_value = getattr(db_batch, key)
        # Convert Decimals/Dates for comparison
        if str(old_value) != str(new_value): 
            changes[key] = {"old": str(old_value), "new": str(new_value)}
            setattr(db_batch, key, new_value)
    
    if changes:
        history_record = StockBatchEditHistory(
            batch_id=db_batch.id,
            edited_by=user_id,
            changes=json.dumps(changes)
        )
        db.add(history_record)
        db.commit()
        db.refresh(db_batch)

    return db_batch

@router.get("/batches/{batch_id}/history", response_model=List[StockBatchEditHistoryResponse])
def get_batch_history(batch_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    return db.query(StockBatchEditHistory).filter(StockBatchEditHistory.batch_id == batch_id).order_by(StockBatchEditHistory.timestamp.desc()).all()


# --- Storefront (Customer Facing) ---
@router.get("/storefront")
def get_storefront_items(db: Session = Depends(get_db)):
    """Fetches active batches and groups them if they have identical prices and images."""
    batches = db.query(StockBatch).filter(StockBatch.current_quantity > 0).order_by(StockBatch.expiry_date.asc().nulls_last()).all()
    
    grouped_storefront = {}
    
    for b in batches:
        # Grouping Key: Product ID + Retail Price + Image URL
        image_to_use = b.image_url or b.product.image_url or "[https://via.placeholder.com/250?text=No+Image](https://via.placeholder.com/250?text=No+Image)"
        group_key = f"{b.product_id}_{float(b.retail_price)}_{image_to_use}"
        
        if group_key not in grouped_storefront:
            cat_names = ", ".join([c.name for c in b.product.categories])
            grouped_storefront[group_key] = {
                "group_key": group_key,
                "primary_batch_id": b.id, # The frontend will use this ID to add to cart
                "product_id": b.product.id,
                "product_name": b.product.product_name,
                "category": cat_names if cat_names else "General",
                "price": float(b.retail_price),
                "image": image_to_use,
                "available_qty": float(b.current_quantity),
                "unit": b.product.unit_of_measure,
                "keywords": b.product.keywords,
                "batches_included": [b.batch_number]
            }
        else:
            # If price and image match, group the stock together for the customer!
            grouped_storefront[group_key]["available_qty"] += float(b.current_quantity)
            grouped_storefront[group_key]["batches_included"].append(b.batch_number)
            
    return list(grouped_storefront.values())