import csv
import json
import random
from datetime import datetime, timedelta

def random_date(start: datetime, end: datetime):
    delta = end - start
    random_days = random.randrange(delta.days)
    random_seconds = random.randrange(86400)
    return start + timedelta(days=random_days, seconds=random_seconds)

def generate_csv():
    records = []
    
    # Categories
    categories = [{"id": 1, "name": "Meats", "description": "Fresh and frozen meats"}]
    for c in categories:
        records.append(["Category", json.dumps(c)])
        
    # Suppliers
    suppliers = [
        {"id": 1, "name": "Keells Foods", "contact_email": "keells@example.com", "contact_phone": "+94 11 234 5678"},
        {"id": 2, "name": "Bairaha Farms", "contact_email": "bairaha@example.com", "contact_phone": "+94 11 876 5432"},
        {"id": 3, "name": "Cargills Quality Foods", "contact_email": "cargills@example.com", "contact_phone": "+94 11 555 1234"},
        {"id": 4, "name": "Prima Bakery", "contact_email": "prima@example.com", "contact_phone": "+94 11 444 9876"},
        {"id": 5, "name": "Kist Agri", "contact_email": "kist@example.com", "contact_phone": "+94 11 333 4567"}
    ]
    for s in suppliers:
        records.append(["Supplier", json.dumps(s)])
        
    # Products
    # Images expected in root/pictures/
    products = [
        {"id": 1, "name": "Keells Chicken Sausage 100g", "desc": "Premium chicken sausages", "cat_id": 1, "reorder": 50, "img": "keels_chicken_sausage_100g.png"},
        {"id": 2, "name": "Bairaha Chicken Breast 500g", "desc": "Fresh chicken breast", "cat_id": 1, "reorder": 30, "img": "bairaha_chicken_breast.png"},
        {"id": 3, "name": "Cargills Magic Ice Cream 1L", "desc": "Vanilla ice cream", "cat_id": 1, "reorder": 20, "img": "cargills_magic_1l.png"},
        {"id": 4, "name": "Prima Kottu Mee", "desc": "Instant noodles", "cat_id": 1, "reorder": 100, "img": "prima_kottu_mee.png"},
        {"id": 5, "name": "Kist Tomato Ketchup 500g", "desc": "Tomato ketchup", "cat_id": 1, "reorder": 40, "img": "kist_tomato_ketchup.png"},
        {"id": 6, "name": "Keells Chicken Meatballs 200g", "desc": "Chicken meatballs", "cat_id": 1, "reorder": 40, "img": "keells_meatballs.png"},
        {"id": 7, "name": "Bairaha Whole Chicken 1kg", "desc": "Whole fresh chicken", "cat_id": 1, "reorder": 20, "img": "bairaha_whole.png"},
        {"id": 8, "name": "Cargills Fresh Milk 1L", "desc": "Pasteurized milk", "cat_id": 1, "reorder": 60, "img": "cargills_milk.png"},
        {"id": 9, "name": "Prima Crust Bread", "desc": "Sliced bread", "cat_id": 1, "reorder": 50, "img": "prima_bread.png"},
        {"id": 10, "name": "Kist Mango Jam 300g", "desc": "Fruit jam", "cat_id": 1, "reorder": 30, "img": "kist_jam.png"}
    ]
    for p in products:
        records.append(["Product", json.dumps(p)])
        
    # Base costs and retail multipliers in realistic LKR (Rupees)
    base_cost = {1: 450.0, 2: 1200.0, 3: 850.0, 4: 150.0, 5: 300.0, 6: 400.0, 7: 1500.0, 8: 380.0, 9: 250.0, 10: 420.0}
    
    # Batches per product
    # From 2022 to present
    start_date = datetime(2022, 1, 1)
    end_date = datetime.now()
    
    batches = []
    batch_id_counter = 1
    for p in products:
        pid = p["id"]
        # Generate ~15 batches per product over the timeline
        for _ in range(15):
            b_date = random_date(start_date, end_date)
            # Inflation + Seasonality (prices go up in winter, etc) + Random noise
            days_since_start = (b_date - start_date).days
            inflation = 1.0 + (days_since_start / 365) * 0.05 # 5% per year
            season = 1.0 + 0.1 * (1 if b_date.month in [11,12] else 0)
            
            cost = base_cost[pid] * inflation * season
            
            # 5% chance of extreme outlier spike
            if random.random() < 0.05:
                cost *= random.uniform(2.5, 4.0)
            else:
                cost *= random.uniform(0.95, 1.05)
                
            retail = cost * 1.3 # 30% markup
            
            batches.append({
                "id": batch_id_counter,
                "product_id": pid,
                "supplier_id": random.randint(1, 5),
                "cost": round(cost, 2),
                "retail": round(retail, 2),
                "qty": random.randint(50, 200),
                "date": b_date.isoformat(),
                "exp": (b_date + timedelta(days=90)).isoformat()
            })
            batch_id_counter += 1
            
    # Sort batches by date simply to maintain a flow
    batches.sort(key=lambda x: x["date"])
    for b in batches:
        records.append(["StockBatch", json.dumps(b)])
        
    # Users
    users = []
    
    # 10 Drivers
    driver_ids = []
    for i in range(2, 12):
        u = {"id": i, "email": f"driver{i}@example.com", "role": "driver"}
        users.append(u)
        driver_ids.append(i)
        
    # 100 Customers
    customer_ids = []
    for i in range(12, 112):
        u = {"id": i, "email": f"customer{i}@example.com", "role": "customer"}
        users.append(u)
        customer_ids.append(i)
        
    for u in users:
        records.append(["User", json.dumps(u)])
        
    # Feedbacks
    messages = ["Great product!", "Not bad, could be cheaper.", "Very fresh, highly recommend.", "Average quality.", "My kids love this.", "Will buy again for sure.", "Packaging was slightly damaged but product is fine.", "Best value for money in Colombo.", "Tastes authentic.", "A bit too salty for my liking."]
    feedback_id_counter = 1
    for p in products:
        for _ in range(random.randint(2, 6)):
            f_date = random_date(start_date, end_date)
            uid = random.choice(customer_ids)
            has_reply = random.random() < 0.3
            records.append(["Feedback", json.dumps({
                "id": feedback_id_counter,
                "user_name": f"Customer {uid}",
                "user_id": uid,
                "message": random.choice(messages),
                "product_name": p["name"],
                "product_id": p["id"],
                "rating": random.randint(3, 5),
                "reply": "Thank you for your feedback!" if has_reply else None,
                "role": "user",
                "offensive": False,
                "created_at": f_date.isoformat(),
                "replied_at": (f_date + timedelta(days=1)).isoformat() if has_reply else None
            })])
            feedback_id_counter += 1
            
    # Orders
    # Generate 2000 orders
    for i in range(1, 2001):
        o_date = random_date(start_date, end_date)
        # Find active batches prior to this order date
        available_batches = [b for b in batches if datetime.fromisoformat(b["date"]) <= o_date]
        
        items = []
        total = 0.0
        # 1 to 4 items per order
        for _ in range(random.randint(1, 4)):
            if not available_batches: break
            # Bias towards recent batches
            lb = available_batches[-min(20, len(available_batches)):]
            b = random.choice(lb)
            qty = random.randint(1, 5)
            items.append({
                "batch_id": b["id"],
                "qty": qty,
                "price": b["retail"]
            })
            total += qty * b["retail"]
            
        driver_id = random.choice(driver_ids)
        order = {
            "id": i,
            "user_id": random.choice(customer_ids),
            "total": round(total, 2),
            "date": o_date.isoformat(),
            "items": items,
            "driver_id": driver_id
        }
        records.append(["Order", json.dumps(order)])
        
    with open("/home/dinindu/ai-grocery-project-main/backend/backend_init.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["entity_type", "json_payload"])
        for r in records:
            writer.writerow(r)
            
    print(f"Generated {len(records)} records into backend_init.csv")

if __name__ == "__main__":
    generate_csv()
