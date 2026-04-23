import sys
import os
import random
from datetime import datetime, timedelta
sys.path.insert(0, '/app')
from database import SessionLocal
from models.inventory import StockBatch
from models.user import User
from models.orders import Order, OrderItem
from models.suppliers import Supplier

db = SessionLocal()
batches = db.query(StockBatch).filter(StockBatch.expiry_date == None).all()
count = 0
for b in batches:
    shelf_life = random.randint(30, 365)
    mfg = datetime.now() - timedelta(days=random.randint(10, 400))
    exp = mfg + timedelta(days=shelf_life)
    b.manufacture_date = mfg
    b.expiry_date = exp
    count += 1

db.commit()
print(f"Backfilled {count} batches with random shelf lives.")
