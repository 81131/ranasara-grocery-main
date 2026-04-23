import re
from pydantic import BaseModel, field_validator
from typing import Optional

class SupplierBase(BaseModel):
    name: str
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_person: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None

    @field_validator('contact_phone')
    @classmethod
    def validate_phone(cls, v):
        if not v:
            return v
        if not re.match(r'^(\d{10}|\+\d{10,15})$', v):
            raise ValueError('Invalid phone number format. Must be 10 digits or international format.')
        return v

class SupplierCreate(SupplierBase):
    pass

class SupplierResponse(SupplierBase):
    id: int

    class Config:
        from_attributes = True
