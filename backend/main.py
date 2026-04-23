from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import engine, get_db, Base
import os
from passlib.context import CryptContext


# Import your routers and models
from routers.chat_router import router as chat_router
from routers.auth_router import router as auth_router
from routers.inventory_router import router as inventory_router
from routers.supplier_router import router as supplier_router
from routers.cart_router import router as cart_router
from routers.order_router import router as order_router
from routers.feedback_router import router as feedback_router
from routers.ml_router import router as ml_router
from routers.recommendation_router import router as recommendation_router
from routers.payment_router import router as payment_router
from models import orders, chat, cart, feedback, feedback_product, inventory, suppliers, user

# Create tables in the database
Base.metadata.create_all(bind=engine)

from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Ransara Supermarket API")

if os.path.exists("/app/pictures"):
    app.mount("/pictures", StaticFiles(directory="/app/pictures"), name="pictures")

if os.path.exists("/app/payment_slips"):
    app.mount("/payment-slips", StaticFiles(directory="/app/payment_slips"), name="payment_slips")

# --- CORS Middleware ---
_frontend_url = os.environ.get("FRONTEND_PUBLIC_URL", "").rstrip("/")
_allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if _frontend_url and _frontend_url not in _allowed_origins:
    _allowed_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(auth_router)
app.include_router(inventory_router)
app.include_router(supplier_router)
app.include_router(cart_router)
app.include_router(order_router)
app.include_router(feedback_router)
app.include_router(ml_router)
app.include_router(recommendation_router)
app.include_router(payment_router)

# ─── Seed Admin Account on Startup ───────────────────────────────────────────
def seed_admin():
    from database import SessionLocal
    from models.user import User
    db = SessionLocal()
    try:
        admin_email = os.getenv("ADMIN_EMAIL", "admin@ransara.com")
        existing = db.query(User).filter(User.email == admin_email).first()
        if not existing:
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            admin = User(
                email=admin_email,
                password_hash=pwd_context.hash(os.getenv("ADMIN_PASSWORD", "Admin@123")),
                first_name=os.getenv("ADMIN_FIRSTNAME", "Market"),
                last_name=os.getenv("ADMIN_LASTNAME", "Admin"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"[SEED] Admin account created: {admin_email}")
    except Exception as e:
        print(f"[SEED] Error seeding admin: {e}")
        db.rollback()
    finally:
        db.close()

def load_init_data():
    import os, csv, json
    from database import SessionLocal, Base, engine
    from models.user import User, Driver
    from models.inventory import Category, Product, StockBatch
    from models.suppliers import Supplier
    from models.orders import Order, OrderItem, OrderDelivery
    from models.feedback import Feedback
    
    csv_path = "/app/backend_init.csv"
    if not os.path.exists(csv_path):
        print("[INIT] No backend_init.csv found. Skipping mock data initialization.")
        return
        
    db = SessionLocal()
    try:
        # Check if actually empty to prevent wiping real data on every single restart unless strictly enforced
        # For demonstration purposes, wipe if init exists and we want a fresh demo
        print("[INIT] Wiping and regenerating database from init.csv...")
        
        current_etype = None
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None) # skip header
            
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            admin_pw = os.getenv("ADMIN_PASSWORD", "MySuperSecurePassword123!")
            hashed_pw = pwd_context.hash(admin_pw)
            user_count = 0
            
            for row in reader:
                if len(row) < 2: continue
                etype = row[0]
                if current_etype is not None and etype != current_etype:
                    db.flush()
                current_etype = etype
                
                data = json.loads(row[1])
                
                if etype == "User" and user_count < 30:
                    db.add(User(user_id=data["id"], email=data["email"], password_hash=hashed_pw,
                                first_name=etype, last_name=str(data["id"]), role=data["role"], is_active=True))
                    if data["role"] == "driver":
                        db.add(Driver(user_id=data["id"], license_number=f"LIC-{data['id']}", vehicle_type="Mock Bike"))
                    user_count += 1
                    
        db.commit()
        
        # Reset PostgreSQL sequences so auto-increment IDs don't collide with our manual insertions
        try:
            from sqlalchemy import text
            db.execute(text("SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users))"))
            db.execute(text("SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders))"))
            db.execute(text("SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))"))
            db.execute(text("SELECT setval('stock_batches_id_seq', (SELECT MAX(id) FROM stock_batches))"))
            db.execute(text("SELECT setval('feedbacks_id_seq', (SELECT MAX(id) FROM feedbacks))"))
            db.commit()
        except Exception as seq_e:
            db.rollback()
            print(f"[INIT] Notice: Could not reset sequences: {seq_e}")
            
        print("[INIT] Database successfully seeded from init.csv.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        import sys
        print(f"[INIT] CRITICAL ERROR loading CSV: {e}", flush=True, file=sys.stderr)
        db.rollback()
    finally:
        db.close()

@app.on_event("startup")
def startup_event():
    seed_admin()

@app.get("/")
def root():
    return {"message": "Welcome to the Ransara Supermarket API backend!"}

@app.get("/test-db")
def test_database_connection(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "success", "message": "Successfully connected to PostgreSQL!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")