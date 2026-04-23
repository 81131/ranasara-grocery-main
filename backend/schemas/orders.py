from pydantic import BaseModel
from typing import List

class OrderItemSchema(BaseModel):
    batch_id: int
    quantity: float
    price_at_purchase: float

class OrderCreate(BaseModel):
    user_id: int
    total_amount: float
    delivery_type: str = "Home Delivery"
    total_weight_kg: float = 0.0
    delivery_distance_km: float = 0.0
    payment_method: str = "Bank Transfer"
    items: List[OrderItemSchema]