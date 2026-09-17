"""Iter6: Validate that /my/store/orders and /my/dashboard aggregate orders
across ALL stores owned by the lojista (not only the first one).

Bug fixed: previously used find_one({owner_id}) → orders in secondary stores
(Pizzaria Bella / Açaí Tropical) were invisible in the queue.
"""
import os
import time
import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE}/api"

CLIENTE = {"email": "cliente@zappyfood.com", "password": "cliente123"}
LOJISTA = {"email": "lojista@zappyfood.com", "password": "lojista123"}
ACTIVE = {"AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"}


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


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


# --- 1) Confirm the lojista owns 3 seeded stores --------------------------------
def test_lojista_owns_multiple_stores(s, lojista_tok):
    """Public /stores exposes all stores; we look up the lojista's stores by name."""
    r = s.get(f"{API}/stores", timeout=20)
    assert r.status_code == 200, r.text
    stores = r.json()
    names = {st.get("fantasy_name") or st.get("name") for st in stores}
    # The seeded stores for demo lojista
    for expected in ("Burger House", "Pizzaria Bella", "Açaí Tropical"):
        assert expected in names, f"expected seeded store missing: {expected}. got={names}"


# --- 2) /my/store/orders returns orders from multiple stores -------------------
def test_store_orders_returns_orders_from_multiple_stores(s, lojista_tok):
    r = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20)
    assert r.status_code == 200, r.text
    orders = r.json()
    assert isinstance(orders, list)
    # cross-reference with public /stores to translate store_id -> store name
    all_stores = s.get(f"{API}/stores", timeout=20).json()
    id_to_name = {st["id"]: (st.get("fantasy_name") or st.get("name")) for st in all_stores}
    seen_names = {id_to_name.get(o["store_id"], o["store_id"]) for o in orders}
    print(f"stores present in queue: {seen_names}")
    # We expect at least 2 distinct stores of the lojista to eventually appear.
    # It might be 1 pre-existing if seed only creates on Burger House; the next
    # test creates one on a secondary store to guarantee >=2.


# --- 3) Cliente creates an order on a SECONDARY store (Pizzaria Bella /
#        Açaí Tropical) → lojista sees it in /my/store/orders ------------------
@pytest.fixture(scope="module")
def secondary_store(s):
    """Pick a store that is NOT Burger House (owned by demo lojista)."""
    all_stores = s.get(f"{API}/stores", timeout=20).json()
    candidates = [
        st for st in all_stores
        if (st.get("fantasy_name") or st.get("name")) in ("Pizzaria Bella", "Açaí Tropical")
    ]
    assert candidates, "no secondary seeded store found for demo lojista"
    return candidates[0]


@pytest.fixture(scope="module")
def cliente_default_addr(s, cliente_tok, secondary_store):
    addrs = s.get(f"{API}/addresses", headers=H(cliente_tok), timeout=20).json()
    if addrs:
        return (next((a for a in addrs if a.get("is_default")), addrs[0]))["id"]
    body = {
        "label": "Casa",
        "street": "Rua Teste",
        "number": "123",
        "neighborhood": "Centro",
        "city": "São Paulo",
        "state": "SP",
        "zip": "01310100",
        "lat": secondary_store.get("lat") or -23.55,
        "lng": secondary_store.get("lng") or -46.63,
    }
    cr = s.post(f"{API}/addresses", headers=H(cliente_tok), json=body, timeout=20)
    assert cr.status_code in (200, 201), cr.text
    return cr.json()["id"]


@pytest.fixture(scope="module")
def new_secondary_order(s, cliente_tok, lojista_tok, secondary_store, cliente_default_addr):
    # Products for that store
    det = s.get(f"{API}/stores/{secondary_store['id']}", timeout=20)
    assert det.status_code == 200, det.text
    payload = det.json()
    products = payload.get("products") or payload.get("items") or []
    assert products, f"no products in secondary store {secondary_store['id']}"
    product = products[0]

    body = {
        "store_id": secondary_store["id"],
        "address_id": cliente_default_addr,
        "payment_method": "PIX",
        "items": [{"product_id": product["id"], "quantity": 1}],
        "notes": "TEST_iter6_secondary_store",
    }
    cr = s.post(f"{API}/orders", headers=H(cliente_tok), json=body, timeout=25)
    assert cr.status_code == 200, cr.text
    created = cr.json()
    assert created["status"] == "AGUARDANDO_CONFIRMACAO"
    assert created["store_id"] == secondary_store["id"]
    return created


def test_secondary_store_order_visible_in_lojista_queue(s, lojista_tok, new_secondary_order):
    time.sleep(0.5)
    q = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20)
    assert q.status_code == 200, q.text
    orders = q.json()
    ids = [o["id"] for o in orders]
    assert new_secondary_order["id"] in ids, (
        f"secondary-store order {new_secondary_order['id']} NOT in lojista queue. "
        f"store_id={new_secondary_order['store_id']}. Queue size={len(orders)}. "
        f"First ids={ids[:5]}"
    )
    found = next(o for o in orders if o["id"] == new_secondary_order["id"])
    assert found["status"] == "AGUARDANDO_CONFIRMACAO"


def test_queue_contains_multiple_distinct_store_ids(s, lojista_tok, new_secondary_order):
    q = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20).json()
    store_ids = {o["store_id"] for o in q}
    print(f"distinct store_ids in queue: {store_ids}")
    # After creating an order in a secondary store, the queue MUST show >=2 stores
    assert len(store_ids) >= 2, (
        f"expected orders from multiple stores in aggregated queue, got only {store_ids}"
    )


# --- 4) PATCH /orders/{id}/status works for a secondary-store order ------------
def test_patch_status_secondary_store_order(s, lojista_tok, new_secondary_order):
    oid = new_secondary_order["id"]
    r = s.patch(
        f"{API}/orders/{oid}/status",
        headers=H(lojista_tok),
        json={"status": "ACEITO"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    got = s.get(f"{API}/orders/{oid}", headers=H(lojista_tok), timeout=20).json()
    assert got["status"] == "ACEITO"


# --- 5) /my/dashboard counts aggregate across all stores ------------------------
def test_dashboard_aggregates_all_stores(s, lojista_tok, new_secondary_order):
    r = s.get(f"{API}/my/dashboard", headers=H(lojista_tok), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("has_store") is True
    # counts should be >=1 since we just created an order and advanced it to ACEITO
    assert d["orders_today"] >= 1, d
    assert d["active_orders"] >= 1, d
    # cross-check: dashboard active_orders must match count from /my/store/orders
    q = s.get(f"{API}/my/store/orders", headers=H(lojista_tok), timeout=20).json()
    active_in_queue = sum(1 for o in q if o["status"] in ACTIVE)
    assert d["active_orders"] == active_in_queue, (
        f"dashboard active_orders={d['active_orders']} but /my/store/orders active={active_in_queue}"
    )
    total_finalized_in_queue = sum(1 for o in q if o["status"] == "FINALIZADO")
    assert d["total_finalized"] == total_finalized_in_queue, (
        f"dashboard total_finalized={d['total_finalized']} but queue finalized={total_finalized_in_queue}"
    )
