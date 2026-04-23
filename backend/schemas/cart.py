from pydantic import BaseModel

class CartAdd(BaseModel):
    batch_id: int
    quantity: int = 1

class CartUpdate(BaseModel):
    batch_id: int
    quantity: int