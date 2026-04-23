from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    discount_percentage: float = 0.0

class CategoryCreate(CategoryBase):
    pass

class ProductBase(BaseModel):
    product_name: str
    sku: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    unit_of_measure: str = "Units"
    keywords: Optional[str] = None
    supplier_id: int
    category_ids: List[int] = []

class ProductCreate(ProductBase):
    pass

class KeywordRequest(BaseModel):
    name: str
    description: Optional[str] = None

class StockBatchCreate(BaseModel):
    product_id: int
    batch_number: Optional[str] = None
    buying_price: float
    retail_price: float
    current_quantity: float
    unit_weight_kg: Optional[float] = None
    manufacture_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    image_url: Optional[str] = None

class StockBatchUpdate(BaseModel):
    buying_price: Optional[float] = None
    retail_price: Optional[float] = None
    current_quantity: Optional[float] = None
