from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True) 
    contact_person = Column(String(255), nullable=True)
    address = Column(String(500), nullable=True)
    payment_terms = Column(String(255), nullable=True)

    products = relationship("Product", back_populates="supplier")
    edit_history = relationship("SupplierEditHistory", back_populates="supplier", cascade="all, delete-orphan")


class SupplierEditHistory(Base):
    __tablename__ = "supplier_edit_history"
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    edited_by = Column(Integer, nullable=False) # Stores the user_id of the admin making the edit
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    changes = Column(Text, nullable=False) # Will store a JSON string of what exactly changed

    supplier = relationship("Supplier", back_populates="edit_history")