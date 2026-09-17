"""Iteration 3: Distance bands pricing, product discounts, notifications."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

CLIENTE = {"email": "cliente@zappyfood.com", "password": "cliente123"}
LOJISTA = {"email": "lojista@zappyfood.com", "password": "lojista123"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def cliente_tok(s):
    r = s.post(f"{API}/auth/login", json=CLIENTE, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def lojista_tok(s):
    r = s.post(f"{API}/auth/login", json=LOJISTA, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def h(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _burger(s):
    stores = s.get(f"{API}/stores").json()
    return next(x for x in stores if x["fantasy_name"] == "Burger House")


def _my_store(s, ltok):
    r = s.get(f"{API}/my/store", headers=h(ltok))
    assert r.status_code == 200, r.text
    return r.json()


def _default_addr(s, ctok):
    lst = s.get(f"{API}/addresses", headers=h(ctok)).json()
    if not lst:
        return None
    return next((a for a in lst if a.get("is_default")), lst[0])


# ============ Distance bands pricing ============
def test_bands_quote_and_persistence(s, cliente_tok, lojista_tok):
    """lojista sets bands mode; delivery quote returns band fee for ~3.4km."""
    my_store = _my_store(s, lojista_tok)
    assert my_store["fantasy_name"] == "Burger House"
    burger = my_store
    original = {k: burger.get(k) for k in ["pricing_mode", "delivery_bands", "base_delivery_fee",
                                            "price_per_km", "min_delivery_fee", "max_radius_km",
                                            "free_above", "delivery_fee", "min_order",
                                            "est_delivery_min", "fantasy_name", "category",
                                            "description", "logo_url", "banner_url", "phone", "cnpj",
                                            "lat", "lng", "address"]}
    try:
        payload = {**original,
                   "pricing_mode": "bands",
                   "delivery_bands": [
                       {"max_km": 2.0, "fee": 5.0},
                       {"max_km": 5.0, "fee": 8.0},
                       {"max_km": 8.0, "fee": 12.0},
                   ]}
        r = s.post(f"{API}/my/store", json=payload, headers=h(lojista_tok))
        assert r.status_code == 200, r.text

        addr = _default_addr(s, cliente_tok)
        assert addr, "cliente must have a default address"
        q = s.post(f"{API}/delivery/quote",
                   json={"store_id": burger["id"], "address_id": addr["id"], "subtotal": 20.0},
                   headers=h(cliente_tok))
        assert q.status_code == 200, q.text
        data = q.json()
        assert data["deliverable"] is True
        assert data["distance_km"] is not None
        # Verify fee matches the correct band
        d = data["distance_km"]
        if d <= 2.0:
            expected = 5.0
        elif d <= 5.0:
            expected = 8.0
        else:
            expected = 12.0
        assert abs(data["fee"] - expected) < 0.01, f"dist {d} fee {data['fee']} expected {expected}"
    finally:
        # revert to per_km
        s.post(f"{API}/my/store",
               json={**original, "pricing_mode": "per_km"},
               headers=h(lojista_tok))


def test_per_km_quote_still_works(s, cliente_tok, lojista_tok):
    """Regression: per_km mode still returns fee = max(min_fee, base + per_km*dist)."""
    burger = _my_store(s, lojista_tok)
    # ensure per_km
    if burger.get("pricing_mode") != "per_km":
        keep = {k: burger.get(k) for k in ["fantasy_name", "category", "description", "logo_url",
                "banner_url", "phone", "cnpj", "delivery_fee", "min_order", "est_delivery_min",
                "address", "lat", "lng", "base_delivery_fee", "price_per_km", "min_delivery_fee",
                "max_radius_km", "free_above", "delivery_bands"] if burger.get(k) is not None}
        keep["pricing_mode"] = "per_km"
        s.post(f"{API}/my/store", json=keep, headers=h(lojista_tok))
        burger = _my_store(s, lojista_tok)

    addr = _default_addr(s, cliente_tok)
    q = s.post(f"{API}/delivery/quote",
               json={"store_id": burger["id"], "address_id": addr["id"], "subtotal": 20.0},
               headers=h(cliente_tok)).json()
    assert q["deliverable"] is True
    base = burger.get("base_delivery_fee", 5.0)
    per_km = burger.get("price_per_km", 1.5)
    min_fee = burger.get("min_delivery_fee", base)
    expected = round(max(min_fee, base + per_km * q["distance_km"]), 2)
    assert abs(q["fee"] - expected) < 0.01, f"got {q['fee']} expected {expected}"


# ============ Product discounts ============
def test_product_discount_appears_and_applies_to_order(s, cliente_tok, lojista_tok):
    """lojista sets discount on X-Burger; customer store detail shows discount; order uses discounted unit_price."""
    my = s.get(f"{API}/my/products", headers=h(lojista_tok)).json()
    xburger = next(p for p in my if p["name"] == "X-Burger Clássico")
    original_discount = xburger.get("discount", 0.0)
    try:
        # apply R$5 discount
        upd = {**xburger, "discount": 5.0}
        # strip unknown fields keeping ProductIn shape
        keep = {k: upd[k] for k in ["name", "description", "category", "price", "image_url",
                                     "stock", "available", "discount", "variation_groups", "addons"] if k in upd}
        r = s.patch(f"{API}/my/products/{xburger['id']}", json=keep, headers=h(lojista_tok))
        assert r.status_code == 200, r.text

        # customer sees discount
        burger = _burger(s)
        det = s.get(f"{API}/stores/{burger['id']}").json()
        p = next(x for x in det["products"] if x["id"] == xburger["id"])
        assert abs(p["discount"] - 5.0) < 0.01

        # order with discount -> unit_price = 24.90 - 5.00 = 19.90 (X-Burger base 24.90, size Simples 0 delta)
        payload = {
            "store_id": burger["id"],
            "items": [{"product_id": xburger["id"], "quantity": 1,
                       "variations": {"Tamanho": "Simples", "Ponto da carne": "Ao ponto"},
                       "addons": []}],
            "payment_method": "PIX",
        }
        o = s.post(f"{API}/orders", json=payload, headers=h(cliente_tok))
        assert o.status_code == 200, o.text
        od = o.json()
        it = od["items"][0]
        assert abs(it["unit_price"] - 19.90) < 0.01, f"got {it['unit_price']}"
        assert any("Desconto" in x for x in it.get("options", []))
    finally:
        # revert discount
        keep = {k: xburger[k] for k in ["name", "description", "category", "price", "image_url",
                                         "stock", "available", "variation_groups", "addons"] if k in xburger}
        keep["discount"] = original_discount
        s.patch(f"{API}/my/products/{xburger['id']}", json=keep, headers=h(lojista_tok))


# ============ Notifications ============
def test_notifications_flow(s, cliente_tok, lojista_tok):
    """On new order: store owner gets 'Novo pedido'. On status change: customer gets one per status."""
    # clear cliente notifs by read_all (doesn't delete but easy count-based reasoning)
    c_unread0 = s.get(f"{API}/notifications/unread_count", headers=h(cliente_tok)).json()["count"]
    l_unread0 = s.get(f"{API}/notifications/unread_count", headers=h(lojista_tok)).json()["count"]

    burger = _burger(s)
    det = s.get(f"{API}/stores/{burger['id']}").json()
    xburger = next(p for p in det["products"] if p["name"] == "X-Burger Clássico")
    r = s.post(f"{API}/orders", json={
        "store_id": burger["id"],
        "items": [{"product_id": xburger["id"], "quantity": 1,
                   "variations": {"Tamanho": "Simples", "Ponto da carne": "Ao ponto"}, "addons": []}],
        "payment_method": "PIX",
    }, headers=h(cliente_tok))
    assert r.status_code == 200, r.text
    oid = r.json()["id"]

    # lojista should have +1 unread ('Novo pedido')
    l_unread1 = s.get(f"{API}/notifications/unread_count", headers=h(lojista_tok)).json()["count"]
    assert l_unread1 == l_unread0 + 1, f"lojista unread {l_unread0}->{l_unread1}"

    l_notifs = s.get(f"{API}/notifications", headers=h(lojista_tok)).json()
    latest_l = l_notifs[0]
    assert "Novo pedido" in latest_l["title"]
    assert latest_l["order_id"] == oid
    assert latest_l["read"] is False

    # advance through statuses -> customer receives 4 notifications
    statuses = ["ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA", "FINALIZADO"]
    for st in statuses:
        rr = s.patch(f"{API}/orders/{oid}/status", json={"status": st}, headers=h(lojista_tok))
        assert rr.status_code == 200

    c_unread1 = s.get(f"{API}/notifications/unread_count", headers=h(cliente_tok)).json()["count"]
    assert c_unread1 == c_unread0 + len(statuses), f"cliente unread {c_unread0}->{c_unread1}"

    c_notifs = s.get(f"{API}/notifications", headers=h(cliente_tok)).json()
    # newest first, top 4 should reference this order
    top4 = c_notifs[:4]
    assert all(n["order_id"] == oid for n in top4), [n["title"] for n in top4]
    assert all(n.get("type") == "status" for n in top4)

    # read_all marks unread=0
    ok = s.post(f"{API}/notifications/read_all", headers=h(cliente_tok))
    assert ok.status_code == 200
    c_unread2 = s.get(f"{API}/notifications/unread_count", headers=h(cliente_tok)).json()["count"]
    assert c_unread2 == 0

    # read_all for lojista too (cleanup)
    s.post(f"{API}/notifications/read_all", headers=h(lojista_tok))


def test_notifications_require_auth(s):
    assert s.get(f"{API}/notifications").status_code == 401
    assert s.get(f"{API}/notifications/unread_count").status_code == 401
    assert s.post(f"{API}/notifications/read_all").status_code == 401
