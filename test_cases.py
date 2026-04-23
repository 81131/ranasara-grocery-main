"""
Order Management API Test Suite
================================
Tests the full order management workflow against the running Docker stack.

Requirements:
    pip install requests pytest

Usage (after docker compose up):
    python test_cases.py            # run with built-in runner + coloured output
    pytest test_cases.py -v         # run with pytest

The tests hit http://localhost:8000 — make sure the backend container is up.
Admin credentials are read from .env (or hardcoded fallbacks below).
"""

import sys
import os
import json
import time
import requests

# ─── Configuration ────────────────────────────────────────────────────────────
BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL",    "admin@ranasara.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "MySuperSecurePassword123!")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_token(email: str, password: str) -> str:
    """Log in and return a JWT bearer token."""
    r = requests.post(f"{BASE_URL}/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, f"Login failed ({r.status_code}): {r.text}"
    return r.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_first_order_id(token: str | None = None) -> int:
    """Return any real order ID from the database."""
    headers = auth_header(token) if token else {}
    r = requests.get(f"{BASE_URL}/orders/", headers=headers)
    orders = r.json()
    assert len(orders) > 0, "No orders in DB — run generate_init_csv.py first"
    return orders[0]["id"]


# ─── Test functions ───────────────────────────────────────────────────────────
# Each function is named test_<n>_<description>.
# They are collected by pytest automatically, or run by the simple runner below.

PASSED = []
FAILED = []


def run(test_fn):
    """Execute a single test and record result."""
    name = test_fn.__name__
    try:
        test_fn()
        print(f"  \033[32m✓ PASS\033[0m  {name}")
        PASSED.append(name)
    except AssertionError as e:
        print(f"  \033[31m✗ FAIL\033[0m  {name}  →  {e}")
        FAILED.append((name, str(e)))
    except Exception as e:
        print(f"  \033[33m✗ ERROR\033[0m {name}  →  {type(e).__name__}: {e}")
        FAILED.append((name, f"{type(e).__name__}: {e}"))


# ── Test 1: Backend health check ──────────────────────────────────────────────
def test_01_backend_is_reachable():
    """The FastAPI backend must return HTTP 200 on the docs endpoint."""
    r = requests.get(f"{BASE_URL}/docs", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


# ── Test 2: Admin login ────────────────────────────────────────────────────────
def test_02_admin_login_succeeds():
    """Admin login must return an access_token."""
    r = requests.post(f"{BASE_URL}/auth/login",
                      data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.text}"
    body = r.json()
    assert "access_token" in body, "Response missing access_token"
    assert body["access_token"], "access_token is empty"


# ── Test 3: Invalid credentials are rejected ──────────────────────────────────
def test_03_login_with_wrong_password_fails():
    """Login with a bad password must return 401."""
    r = requests.post(f"{BASE_URL}/auth/login",
                      data={"username": ADMIN_EMAIL, "password": "WrongPassword!"})
    assert r.status_code in (401, 400), f"Expected 401/400, got {r.status_code}"


# ── Test 4: Delivery config is readable without auth ──────────────────────────
def test_04_delivery_config_is_public():
    """GET /orders/delivery-config must be accessible without a token."""
    r = requests.get(f"{BASE_URL}/orders/delivery-config")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    cfg = r.json()
    required_keys = {"active_method", "fixed_fee", "base_distance_fee",
                     "base_weight_fee", "extra_distance_fee_per_km", "extra_weight_fee_per_kg"}
    missing = required_keys - cfg.keys()
    assert not missing, f"Missing keys in delivery config: {missing}"


# ── Test 5: Delivery config can be updated by admin ───────────────────────────
def test_05_admin_can_update_delivery_config():
    """PUT /orders/delivery-config must persist changes."""
    token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    new_fee = 499.0
    payload = {
        "active_method": "fixed",
        "fixed_fee": new_fee,
        "base_weight_kg": 1.0,
        "base_weight_fee": 400.0,
        "extra_weight_fee_per_kg": 200.0,
        "base_distance_km": 1.0,
        "base_distance_fee": 200.0,
        "extra_distance_fee_per_km": 150.0,
    }
    r = requests.put(f"{BASE_URL}/orders/delivery-config",
                     json=payload, headers=auth_header(token))
    assert r.status_code == 200, f"PUT failed: {r.text}"

    # Verify persistence
    r2 = requests.get(f"{BASE_URL}/orders/delivery-config")
    assert r2.json()["fixed_fee"] == new_fee, "Updated fee not persisted"


# ── Test 6: Admin orders list is non-empty ────────────────────────────────────
def test_06_admin_can_list_all_orders():
    """GET /orders/ must return a list of order objects."""
    r = requests.get(f"{BASE_URL}/orders/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    orders = r.json()
    assert isinstance(orders, list), "Expected a list"
    assert len(orders) > 0, "Order list is empty — seed data may be missing"
    # Validate structure of first order
    first = orders[0]
    for key in ("id", "current_status", "total_amount", "payment_method", "delivery_info"):
        assert key in first, f"Order object missing key: {key}"


# ── Test 7: My-orders requires authentication ──────────────────────────────────
def test_07_my_orders_requires_auth():
    """GET /orders/my without token must return 401."""
    r = requests.get(f"{BASE_URL}/orders/my")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


# ── Test 8: Authenticated user can get their orders ───────────────────────────
def test_08_authenticated_user_can_get_my_orders():
    """GET /orders/my with valid token must return 200 and a list."""
    token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = requests.get(f"{BASE_URL}/orders/my", headers=auth_header(token))
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert isinstance(r.json(), list), "Expected a list"


# ── Test 9: My-stats returns expected keys ────────────────────────────────────
def test_09_my_stats_returns_correct_shape():
    """GET /orders/my-stats must return total_orders, total_spent, recent_orders."""
    token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = requests.get(f"{BASE_URL}/orders/my-stats", headers=auth_header(token))
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    for key in ("total_orders", "total_spent", "recent_orders"):
        assert key in data, f"my-stats missing key: {key}"
    assert isinstance(data["total_orders"], int), "total_orders must be int"
    assert isinstance(data["total_spent"], (int, float)), "total_spent must be numeric"


# ── Test 10: Dashboard stats returns expected structure ───────────────────────
def test_10_dashboard_stats_returns_correct_shape():
    """GET /orders/dashboard-stats must return stats, recentOrders, lowStockItems."""
    r = requests.get(f"{BASE_URL}/orders/dashboard-stats")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert "stats" in data, "Missing 'stats' key"
    assert "recentOrders" in data, "Missing 'recentOrders' key"
    assert "lowStockItems" in data, "Missing 'lowStockItems' key"
    stats = data["stats"]
    for k in ("totalRevenue", "totalOrders", "totalProducts", "activeUsers"):
        assert k in stats, f"stats missing key: {k}"
    assert stats["totalOrders"] > 0, "totalOrders is 0 — seed data missing"
    assert stats["totalRevenue"] > 0, "totalRevenue is 0 — unexpected"


# ── Test 11: Order status update with valid status ────────────────────────────
def test_11_admin_can_update_order_status():
    """PUT /orders/{id}/status must update status and return 200."""
    order_id = get_first_order_id()
    payload = {"status": "Processing"}
    r = requests.put(f"{BASE_URL}/orders/{order_id}/status", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    assert "message" in r.json(), "Response missing 'message'"

    # Verify the status actually changed
    orders = requests.get(f"{BASE_URL}/orders/").json()
    updated = next((o for o in orders if o["id"] == order_id), None)
    assert updated is not None, "Order not found after update"
    assert updated["current_status"] == "Processing", "Status did not change"


# ── Test 12: Order status update with unknown order returns 404 ───────────────
def test_12_update_nonexistent_order_returns_404():
    """PUT /orders/999999/status must return 404 for a non-existent order."""
    r = requests.put(f"{BASE_URL}/orders/999999/status", json={"status": "Shipped"})
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"


# ── Test 13: Slip review rejected for order without slip ──────────────────────
def test_13_review_slip_on_order_without_slip_returns_400():
    """PUT /orders/{id}/review-slip on an order with no slip must return 400."""
    # Find an order that has no payment_slip_url
    orders = requests.get(f"{BASE_URL}/orders/").json()
    no_slip = next((o for o in orders if not o.get("payment_slip_url")), None)
    if no_slip is None:
        print("     (skipped — all orders have a payment slip)")
        return
    r = requests.put(f"{BASE_URL}/orders/{no_slip['id']}/review-slip",
                     json={"action": "approve"})
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"


# ── Test 14: Slip review rejects bad action values ────────────────────────────
def test_14_review_slip_with_invalid_action_returns_400():
    """PUT /orders/{id}/review-slip with action='pay' must return 400."""
    order_id = get_first_order_id()
    r = requests.put(f"{BASE_URL}/orders/{order_id}/review-slip",
                     json={"action": "pay"})
    # Either 400 (bad action) or 400 (no slip) — both are correct
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"


# ── Test 15: Valid order status values are accepted ───────────────────────────
def test_15_all_valid_statuses_accepted():
    """The system must accept all canonical order statuses."""
    order_id = get_first_order_id()
    valid_statuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"]
    for status in valid_statuses:
        r = requests.put(f"{BASE_URL}/orders/{order_id}/status", json={"status": status})
        assert r.status_code == 200, f"Status '{status}' rejected: {r.status_code} {r.text}"
    # Restore to Pending
    requests.put(f"{BASE_URL}/orders/{order_id}/status", json={"status": "Pending"})


# ── Test 16: Notification unread count requires auth ─────────────────────────
def test_16_notification_count_requires_auth():
    """GET /orders/notifications/unread-count without token must return 401."""
    r = requests.get(f"{BASE_URL}/orders/notifications/unread-count")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


# ── Test 17: Admin notification count returns integer ─────────────────────────
def test_17_admin_notification_count_returns_integer():
    """GET /orders/notifications/unread-count with admin token must return a count."""
    token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = requests.get(f"{BASE_URL}/orders/notifications/unread-count",
                     headers=auth_header(token))
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    body = r.json()
    assert "count" in body, "Missing 'count' key"
    assert isinstance(body["count"], int), "count must be an integer"
    assert body["count"] >= 0, "count must be non-negative"


# ── Test 18: Checkout rejects request with empty cart ─────────────────────────
def test_18_checkout_with_no_cart_returns_400():
    """POST /orders/checkout for a user with no cart items must return 400."""
    # Register a fresh throw-away user
    ts = int(time.time())
    reg = requests.post(f"{BASE_URL}/auth/register", json={
        "first_name": "Test", "last_name": "User",
        "email": f"testuser_{ts}@test.com",
        "password": "TestPassword123!",
        "phone": "0710000000"
    })
    if reg.status_code not in (200, 201):
        print(f"     (skipped — could not register temp user: {reg.status_code})")
        return
    token = get_token(f"testuser_{ts}@test.com", "TestPassword123!")
    r = requests.post(f"{BASE_URL}/orders/checkout",
                      data={"customer_name": "Test User", "delivery_type": "Store Pickup"},
                      headers=auth_header(token))
    assert r.status_code == 400, f"Expected 400 (empty cart), got {r.status_code}: {r.text}"


# ── Test 19: Driver endpoints reject non-driver users ────────────────────────
def test_19_driver_deliveries_rejected_for_non_driver():
    """GET /orders/driver/deliveries must return 403 for admin/customer users."""
    token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = requests.get(f"{BASE_URL}/orders/driver/deliveries", headers=auth_header(token))
    # Admin has role='admin', not 'driver', so expect 403
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"


# ── Test 20: Order total amount is positive ────────────────────────────────────
def test_20_all_seeded_orders_have_positive_total():
    """Every order in the DB must have a positive total_amount."""
    orders = requests.get(f"{BASE_URL}/orders/").json()
    bad = [o["id"] for o in orders if o.get("total_amount", 0) <= 0]
    assert not bad, f"Orders with non-positive total_amount: {bad[:5]}"


# ── Test 21: Manual driver assignment works ─────────────────────────────────────
def test_21_manual_driver_assignment():
    """PUT /orders/{id}/assign-driver must accept a valid driver_id."""
    token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    # Get any driver ID (using the admin as a proxy if they have driver role, 
    # but better to fetch from the new available-drivers endpoint)
    r_drivers = requests.get(f"{BASE_URL}/orders/drivers/available", headers=auth_header(token))
    assert r_drivers.status_code == 200, "Could not fetch available drivers"
    drivers = r_drivers.json()
    
    if not drivers:
        print("     (skipped — no available drivers in system)")
        return
        
    order_id = get_first_order_id(token)
    driver_id = drivers[0]["id"]
    
    r = requests.put(f"{BASE_URL}/orders/{order_id}/assign-driver", 
                     json={"driver_id": driver_id}, headers=auth_header(token))
    assert r.status_code == 200, f"Assignment failed: {r.text}"
    assert r.json()["message"] == "Driver assigned"

# ─── Runner ───────────────────────────────────────────────────────────────────

ALL_TESTS = [
    test_01_backend_is_reachable,
    test_02_admin_login_succeeds,
    test_03_login_with_wrong_password_fails,
    test_04_delivery_config_is_public,
    test_05_admin_can_update_delivery_config,
    test_06_admin_can_list_all_orders,
    test_07_my_orders_requires_auth,
    test_08_authenticated_user_can_get_my_orders,
    test_09_my_stats_returns_correct_shape,
    test_10_dashboard_stats_returns_correct_shape,
    test_11_admin_can_update_order_status,
    test_12_update_nonexistent_order_returns_404,
    test_13_review_slip_on_order_without_slip_returns_400,
    test_14_review_slip_with_invalid_action_returns_400,
    test_15_all_valid_statuses_accepted,
    test_16_notification_count_requires_auth,
    test_17_admin_notification_count_returns_integer,
    test_18_checkout_with_no_cart_returns_400,
    test_19_driver_deliveries_rejected_for_non_driver,
    test_20_all_seeded_orders_have_positive_total,
    test_21_manual_driver_assignment,
]


if __name__ == "__main__":
    print("\n\033[1m══════════════════════════════════════════════\033[0m")
    print("\033[1m  Order Management API — Test Suite\033[0m")
    print(f"\033[1m  Target: {BASE_URL}\033[0m")
    print("\033[1m══════════════════════════════════════════════\033[0m\n")

    for fn in ALL_TESTS:
        run(fn)

    print("\n\033[1m──────────────────────────────────────────────\033[0m")
    print(f"  Result: \033[32m{len(PASSED)} passed\033[0m"
          + (f", \033[31m{len(FAILED)} failed\033[0m" if FAILED else ""))
    print("\033[1m──────────────────────────────────────────────\033[0m\n")

    if FAILED:
        print("\033[31mFailed tests:\033[0m")
        for name, reason in FAILED:
            print(f"  • {name}: {reason}")
        print()
        sys.exit(1)
    else:
        print("\033[32mAll tests passed! ✓\033[0m\n")
        sys.exit(0)
