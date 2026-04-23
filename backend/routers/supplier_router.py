from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.suppliers import Supplier
from schemas.suppliers import SupplierCreate

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

@router.get("/")
def get_suppliers(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    suppliers = db.query(Supplier).offset(skip).limit(limit).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "contact_email": s.contact_email,
            "contact_phone": s.contact_phone,
            "contact_person": s.contact_person,
            "address": s.address,
            "payment_terms": s.payment_terms,
            "product_count": len(s.products),
        }
        for s in suppliers
    ]

@router.post("/")
def create_supplier(supplier: SupplierCreate, db: Session = Depends(get_db)):
    new_supplier = Supplier(**supplier.dict())
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return {
        "id": new_supplier.id,
        "name": new_supplier.name,
        "contact_email": new_supplier.contact_email,
        "contact_phone": new_supplier.contact_phone,
        "contact_person": new_supplier.contact_person,
        "address": new_supplier.address,
        "payment_terms": new_supplier.payment_terms,
    }

@router.put("/{supplier_id}")
def update_supplier(supplier_id: int, supplier: SupplierCreate, db: Session = Depends(get_db)):
    db_supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not db_supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for key, value in supplier.dict().items():
        setattr(db_supplier, key, value)
    db.commit()
    return {"message": "Supplier updated"}

@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(supplier)
    db.commit()
    return {"message": "Supplier deleted"}
