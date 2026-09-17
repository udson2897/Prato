"""Iter5: Validate that /my/store/orders returns the lojista's orders and
that a freshly created customer order flows into the lojista store queue
as AGUARDANDO_CONFIRMACAO (i.e., an ACTIVE order)."""
import os
import time
import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE}/api"

CLIENTE = {"email": "cliente@zappyfood.com", "password": "cliente123"}
LOJISTA = {"email": "lojista@zappyfood.com", "password": "lojista123"}

ACTIVE_STATUSES = {"AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def cliente_tok(s):
    r = s.post(f"{API}/auth/login", json=CLIENTE, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def lojista_tok(s):
    r = s.post(f"{API}/auth/login", json=LOJISTA, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# Backend contract: /my/store/orders returns array of orders belonging to the lojista's store
def test_store_orders_returns_list(s, lojista_tok):
    r = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # every order must have essential fields the UI relies on
    for o in data:
        for k in ("id", "status", "items", "total", "customer_name", "payment_method"):
            assert k in o, f"missing {k} in order {o}"
        assert o["status"] in {
            "AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO",
            "SAIU_PARA_ENTREGA", "FINALIZADO", "CANCELADO",
        }


# Which store does the lojista queue read from?
def test_my_store_matches_owner(s, lojista_tok):
    r = s.get(f"{API}/my/store", headers=H(lojista_tok), timeout=20)
    assert r.status_code == 200, r.text
    st = r.json()
    assert st and st.get("id")
    return st


# End-to-end: cliente creates a new order → lojista sees it as AGUARDANDO_CONFIRMACAO
def test_new_customer_order_appears_in_store_queue_as_active(s, cliente_tok, lojista_tok):
    # Find the store owned by demo lojista
    st = s.get(f"{API}/my/store", headers=H(lojista_tok), timeout=20).json()
    assert st and st.get("id"), "lojista has no store"
    store_id = st["id"]

    # Look up a product in that store (public endpoint)
    det = s.get(f"{API}/stores/{store_id}", timeout=20)
    assert det.status_code == 200, det.text
    products = det.json().get("products") or det.json().get("items") or []
    if not products:
        # fallback: lojista products endpoint
        pr = s.get(f"{API}/my/products", headers=H(lojista_tok), timeout=20)
        assert pr.status_code == 200
        products = pr.json()
    assert products, "no products available in lojista's store"
    product = products[0]

    # Ensure cliente has a default address on file
    addrs = s.get(f"{API}/addresses", headers=H(cliente_tok), timeout=20).json()
    if not addrs:
        # create a simple address near store coords if possible
        body = {
            "label": "Casa",
            "street": "Rua Teste",
            "number": "123",
            "neighborhood": "Centro",
            "city": "São Paulo",
            "state": "SP",
            "zip": "01310100",
            "lat": st.get("lat") or -23.55,
            "lng": st.get("lng") or -46.63,
        }
        cr = s.post(f"{API}/addresses", headers=H(cliente_tok), json=body, timeout=20)
        assert cr.status_code in (200, 201), cr.text
        addr_id = cr.json()["id"]
    else:
        addr_id = (next((a for a in addrs if a.get("is_default")), addrs[0]))["id"]

    # Create order
    order_body = {
        "store_id": store_id,
        "address_id": addr_id,
        "payment_method": "PIX",
        "items": [{"product_id": product["id"], "quantity": 1}],
        "notes": "TEST_iter5_queue_flow",
    }
    cr = s.post(f"{API}/orders", headers=H(cliente_tok), json=order_body, timeout=25)
    assert cr.status_code == 200, cr.text
    created = cr.json()
    assert created["status"] == "AGUARDANDO_CONFIRMACAO"
    new_oid = created["id"]

    # Now the lojista must see it in the queue as an ACTIVE order
    time.sleep(0.5)
    q = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20)
    assert q.status_code == 200, q.text
    orders = q.json()
    ids = [o["id"] for o in orders]
    assert new_oid in ids, (
        f"new order {new_oid} not in lojista queue. Store checked={store_id}. "
        f"Queue ids sample={ids[:5]}, total={len(orders)}"
    )
    found = next(o for o in orders if o["id"] == new_oid)
    assert found["status"] == "AGUARDANDO_CONFIRMACAO"
    assert found["status"] in ACTIVE_STATUSES

    # And there is at least one 'ativo' now, which is what the default 'Ativos' tab shows
    active_count = sum(1 for o in orders if o["status"] in ACTIVE_STATUSES)
    assert active_count >= 1


# Advance status to ACEITO as the lojista → still active tab
def test_advance_to_aceito(s, cliente_tok, lojista_tok):
    # Reuse the newest order we just created (find last TEST_iter5 order)
    q = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20).json()
    target = next(
        (o for o in q if o.get("notes") == "TEST_iter5_queue_flow"
         and o["status"] == "AGUARDANDO_CONFIRMACAO"),
        None,
    )
    if not target:
        pytest.skip("no fresh TEST order to advance (already advanced or missing)")
    r = s.patch(
        f"{API}/orders/{target['id']}/status",
        headers=H(lojista_tok),
        json={"status": "ACEITO"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    # verify persistence
    got = s.get(f"{API}/orders/{target['id']}", headers=H(lojista_tok), timeout=20).json()
    assert got["status"] == "ACEITO"
    assert got["status"] in ACTIVE_STATUSES
