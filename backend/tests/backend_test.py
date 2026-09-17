"""ZappyFood backend regression tests."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
# Fall back to frontend/.env value used by app
if not BASE:
    BASE = "https://delivery-saas-build.preview.emergentagent.com"
API = f"{BASE}/api"

CLIENTE = {"email": "cliente@zappyfood.com", "password": "cliente123"}
LOJISTA = {"email": "lojista@zappyfood.com", "password": "lojista123"}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def cliente_tok(s):
    r = s.post(f"{API}/auth/login", json=CLIENTE, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def lojista_tok(s):
    r = s.post(f"{API}/auth/login", json=LOJISTA, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def auth(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


# ============== Health & Auth ==============
def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_login_cliente(cliente_tok):
    assert cliente_tok["user"]["email"] == "cliente@zappyfood.com"
    assert cliente_tok["user"]["active_role"] == "cliente"
    assert cliente_tok["access_token"]


def test_login_lojista(lojista_tok):
    assert lojista_tok["user"]["email"] == "lojista@zappyfood.com"
    assert lojista_tok["user"]["active_role"] == "lojista"


def test_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": "cliente@zappyfood.com", "password": "wrong"})
    assert r.status_code == 401


def test_me(s, cliente_tok):
    r = s.get(f"{API}/auth/me", headers=auth(cliente_tok))
    assert r.status_code == 200
    assert r.json()["email"] == "cliente@zappyfood.com"


def test_me_unauth(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_refresh(s, cliente_tok):
    r = s.post(f"{API}/auth/refresh", json={"refresh_token": cliente_tok["refresh_token"]})
    assert r.status_code == 200
    d = r.json()
    assert d["access_token"] and d["refresh_token"]


def test_register_new_cliente(s):
    email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "name": "TEST User", "email": email, "password": "abc123", "role": "cliente"
    })
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["user"]["email"] == email
    # dup
    r2 = s.post(f"{API}/auth/register", json={
        "name": "TEST User", "email": email, "password": "abc123", "role": "cliente"
    })
    assert r2.status_code == 409


# ============== Stores ==============
def test_stores_list(s):
    r = s.get(f"{API}/stores")
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list) and len(lst) >= 3
    names = [x["fantasy_name"] for x in lst]
    assert "Burger House" in names


def test_categories(s):
    r = s.get(f"{API}/stores/categories")
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) >= 1


def test_store_filter_by_category(s):
    r = s.get(f"{API}/stores", params={"category": "Pizzaria"})
    assert r.status_code == 200
    for st in r.json():
        assert st["category"] == "Pizzaria"


def test_store_detail(s):
    lst = s.get(f"{API}/stores").json()
    sid = lst[0]["id"]
    r = s.get(f"{API}/stores/{sid}")
    assert r.status_code == 200
    st = r.json()
    assert "products" in st and len(st["products"]) >= 1


def test_store_detail_404(s):
    r = s.get(f"{API}/stores/nonexistent-id")
    assert r.status_code == 404


# ============== Role Switch ==============
def test_switch_role(s, cliente_tok):
    # switch newly-registered cliente -> back and forth via new user
    email = f"TEST_switch_{uuid.uuid4().hex[:8]}@example.com"
    reg = s.post(f"{API}/auth/register", json={
        "name": "TEST Switch", "email": email, "password": "abc123", "role": "cliente"
    }).json()
    h = {"Authorization": f"Bearer {reg['access_token']}"}
    r = s.post(f"{API}/auth/switch-role", json={"active_role": "lojista"}, headers=h)
    assert r.status_code == 200
    assert r.json()["active_role"] == "lojista"
    r2 = s.post(f"{API}/auth/switch-role", json={"active_role": "cliente"}, headers=h)
    assert r2.status_code == 200
    assert r2.json()["active_role"] == "cliente"


# ============== Orders (full flow) ==============
@pytest.fixture(scope="session")
def demo_order(s, cliente_tok):
    stores = s.get(f"{API}/stores").json()
    store = stores[0]
    detail = s.get(f"{API}/stores/{store['id']}").json()
    p = detail["products"][0]
    p2 = detail["products"][1] if len(detail["products"]) > 1 else None
    items = [{"product_id": p["id"], "quantity": 2, "notes": "sem cebola"}]
    if p2:
        items.append({"product_id": p2["id"], "quantity": 1})
    r = s.post(f"{API}/orders",
               json={"store_id": store["id"], "items": items, "payment_method": "PIX"},
               headers=auth(cliente_tok))
    assert r.status_code == 200, r.text
    o = r.json()
    exp_sub = p["price"] * 2 + (p2["price"] if p2 else 0)
    assert abs(o["subtotal"] - round(exp_sub, 2)) < 0.01
    assert abs(o["total"] - round(exp_sub + store["delivery_fee"], 2)) < 0.01
    assert o["status"] == "AGUARDANDO_CONFIRMACAO"
    return o


def test_order_created(demo_order):
    assert demo_order["id"]


def test_order_persistence(s, cliente_tok, demo_order):
    r = s.get(f"{API}/orders/{demo_order['id']}", headers=auth(cliente_tok))
    assert r.status_code == 200
    assert r.json()["id"] == demo_order["id"]


def test_my_orders(s, cliente_tok, demo_order):
    r = s.get(f"{API}/orders", headers=auth(cliente_tok))
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert demo_order["id"] in ids


def test_lojista_sees_order(s, lojista_tok, demo_order):
    r = s.get(f"{API}/my/store/orders", headers=auth(lojista_tok))
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert demo_order["id"] in ids


def test_status_flow(s, lojista_tok, demo_order):
    oid = demo_order["id"]
    for st in ["ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA", "FINALIZADO"]:
        r = s.patch(f"{API}/orders/{oid}/status", json={"status": st}, headers=auth(lojista_tok))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == st
    # verify history
    o = s.get(f"{API}/orders/{oid}", headers=auth(lojista_tok)).json()
    hist = [h["status"] for h in o["status_history"]]
    for st in ["AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA", "FINALIZADO"]:
        assert st in hist


def test_status_forbidden_for_customer(s, cliente_tok, demo_order):
    r = s.patch(f"{API}/orders/{demo_order['id']}/status",
                json={"status": "ACEITO"}, headers=auth(cliente_tok))
    assert r.status_code == 403


# ============== Chat ==============
def test_chat_flow(s, cliente_tok, lojista_tok, demo_order):
    oid = demo_order["id"]
    r1 = s.post(f"{API}/orders/{oid}/chat", json={"text": "Oi, tudo bem?"},
                headers=auth(cliente_tok))
    assert r1.status_code == 200
    assert r1.json()["sender_role"] == "cliente"
    r2 = s.post(f"{API}/orders/{oid}/chat", json={"text": "Sim, saiu!"},
                headers=auth(lojista_tok))
    assert r2.status_code == 200
    assert r2.json()["sender_role"] == "lojista"
    r3 = s.get(f"{API}/orders/{oid}/chat", headers=auth(cliente_tok))
    assert r3.status_code == 200
    assert len(r3.json()) >= 2


def test_chat_forbidden(s, demo_order):
    # third user with no access
    email = f"TEST_out_{uuid.uuid4().hex[:8]}@example.com"
    reg = s.post(f"{API}/auth/register",
                 json={"name": "Out", "email": email, "password": "abc123"}).json()
    h = {"Authorization": f"Bearer {reg['access_token']}"}
    r = s.get(f"{API}/orders/{demo_order['id']}/chat", headers=h)
    assert r.status_code == 403


# ============== Lojista: dashboard, products, store settings ==============
def test_dashboard(s, lojista_tok):
    r = s.get(f"{API}/my/dashboard", headers=auth(lojista_tok))
    assert r.status_code == 200
    d = r.json()
    assert d["has_store"] is True
    for k in ("revenue_today", "orders_today", "active_orders", "total_finalized"):
        assert k in d


def test_my_products(s, lojista_tok):
    r = s.get(f"{API}/my/products", headers=auth(lojista_tok))
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_products_crud(s, lojista_tok):
    body = {"name": "TEST Item", "description": "d", "category": "Testes",
            "price": 12.5, "image_url": "", "stock": 5, "available": True}
    r = s.post(f"{API}/my/products", json=body, headers=auth(lojista_tok))
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    # update
    body["price"] = 15.0
    r2 = s.patch(f"{API}/my/products/{pid}", json=body, headers=auth(lojista_tok))
    assert r2.status_code == 200
    assert r2.json()["price"] == 15.0
    # verify via GET my/products
    lst = s.get(f"{API}/my/products", headers=auth(lojista_tok)).json()
    assert any(p["id"] == pid and p["price"] == 15.0 for p in lst)
    # delete
    r3 = s.delete(f"{API}/my/products/{pid}", headers=auth(lojista_tok))
    assert r3.status_code == 200
    lst2 = s.get(f"{API}/my/products", headers=auth(lojista_tok)).json()
    assert not any(p["id"] == pid for p in lst2)


def test_store_status_update(s, lojista_tok):
    orig = s.get(f"{API}/my/store", headers=auth(lojista_tok)).json()
    r = s.patch(f"{API}/my/store/status", json={"status": "PAUSA"}, headers=auth(lojista_tok))
    assert r.status_code == 200
    got = s.get(f"{API}/my/store", headers=auth(lojista_tok)).json()
    assert got["status"] == "PAUSA"
    # revert
    s.patch(f"{API}/my/store/status", json={"status": orig.get("status", "ABERTA")},
            headers=auth(lojista_tok))


def test_cliente_forbidden_dashboard(s, cliente_tok):
    r = s.get(f"{API}/my/dashboard", headers=auth(cliente_tok))
    assert r.status_code == 403
