from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import json # NEW: Needed to serialize the changes dictionary
from database import get_db
from models.suppliers import Supplier, SupplierEditHistory
from schemas.suppliers import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierEditHistoryResponse
from APIs.auth import get_current_user

router = APIRouter(prefix="/suppliers", tags=["Supplier Management"])

@router.get("/", response_model=List[SupplierResponse])
def get_all_suppliers(db: Session = Depends(get_db)):
    """Fetch all registered suppliers."""
    return db.query(Supplier).all()

@router.post("/", response_model=SupplierResponse)
def create_new_supplier(
    supplier: SupplierCreate, 
    db: Session = Depends(get_db), 
    user_id: int = Depends(get_current_user) 
):
    """Register a new supplier in the system."""
    if supplier.contact_email:
        existing = db.query(Supplier).filter(Supplier.contact_email == supplier.contact_email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Supplier with this email already exists")

    new_supplier = Supplier(**supplier.model_dump())
    
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    
    return new_supplier

# NEW: Endpoint to handle updates and log history
@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    supplier_update: SupplierUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    db_supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not db_supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Calculate what changed
    changes = {}
    update_data = supplier_update.model_dump(exclude_unset=True)
    
    for key, new_value in update_data.items():
        old_value = getattr(db_supplier, key)
        if old_value != new_value:
            changes[key] = {"old": old_value, "new": new_value}
            setattr(db_supplier, key, new_value)
    
    # Only record history if something actually changed
    if changes:
        history_record = SupplierEditHistory(
            supplier_id=db_supplier.id,
            edited_by=user_id,
            changes=json.dumps(changes)
        )
        db.add(history_record)
        db.commit()
        db.refresh(db_supplier)

    return db_supplier

# NEW: Endpoint to view the audit log for a specific supplier
@router.get("/{supplier_id}/history", response_model=List[SupplierEditHistoryResponse])
def get_supplier_history(supplier_id: int, db: Session = Depends(get_db), user_id: int = Depends(get_current_user)):
    history = db.query(SupplierEditHistory).filter(SupplierEditHistory.supplier_id == supplier_id).order_by(SupplierEditHistory.timestamp.desc()).all()
    return history