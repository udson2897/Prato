"""Iteration 2: addresses, variations/addons, loyalty earn+redeem."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://delivery-saas-build.preview.emergentagent.com").rstrip("/")
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


# ============ Addresses CRUD ============
def test_address_full_lifecycle(s, cliente_tok):
    hdr = h(cliente_tok)
    # cleanup pre-existing test addresses
    existing = s.get(f"{API}/addresses", headers=hdr).json()
    for a in existing:
        if a.get("label", "").startswith("TEST_"):
            s.delete(f"{API}/addresses/{a['id']}", headers=hdr)

    body = {
        "label": "TEST_Casa", "street": "Rua A", "number": "100",
        "complement": "apt 1", "neighborhood": "Centro",
        "city": "SP", "state": "SP", "zip": "01001-000",
    }
    r1 = s.post(f"{API}/addresses", json=body, headers=hdr)
    assert r1.status_code == 200, r1.text
    a1 = r1.json()
    assert a1["id"] and a1["label"] == "TEST_Casa"

    # if this was the only address for cliente it will be default; otherwise may not.
    # Add a second address explicitly non-default
    body2 = {**body, "label": "TEST_Trabalho", "street": "Rua B", "is_default": False}
    r2 = s.post(f"{API}/addresses", json=body2, headers=hdr)
    assert r2.status_code == 200
    a2 = r2.json()

    # GET verifies persistence
    lst = s.get(f"{API}/addresses", headers=hdr).json()
    ids = [x["id"] for x in lst]
    assert a1["id"] in ids and a2["id"] in ids

    # Set second as default
    r3 = s.patch(f"{API}/addresses/{a2['id']}/default", headers=hdr)
    assert r3.status_code == 200
    lst2 = s.get(f"{API}/addresses", headers=hdr).json()
    defaults = [x for x in lst2 if x["is_default"]]
    assert len(defaults) == 1 and defaults[0]["id"] == a2["id"]

    # Delete both
    assert s.delete(f"{API}/addresses/{a1['id']}", headers=hdr).status_code == 200
    assert s.delete(f"{API}/addresses/{a2['id']}", headers=hdr).status_code == 200
    lst3 = s.get(f"{API}/addresses", headers=hdr).json()
    remaining = [x["id"] for x in lst3]
    assert a1["id"] not in remaining and a2["id"] not in remaining


def test_addresses_require_auth(s):
    r = s.get(f"{API}/addresses")
    assert r.status_code == 401


# ============ Product variations/addons ============
def test_seeded_xburger_has_variations(s):
    stores = s.get(f"{API}/stores").json()
    burger = next((x for x in stores if x["fantasy_name"] == "Burger House"), None)
    assert burger is not None
    det = s.get(f"{API}/stores/{burger['id']}").json()
    xburger = next((p for p in det["products"] if p["name"] == "X-Burger Clássico"), None)
    assert xburger is not None
    groups = xburger.get("variation_groups", [])
    names = [g["name"] for g in groups]
    assert "Tamanho" in names
    assert any(a["name"] == "Bacon extra" for a in xburger.get("addons", []))


def test_lojista_create_product_with_variations(s, lojista_tok):
    body = {
        "name": f"TEST_Combo_{uuid.uuid4().hex[:6]}",
        "description": "combo test", "category": "Testes",
        "price": 20.0, "stock": 5, "available": True,
        "variation_groups": [
            {"name": "Tamanho", "required": True, "options": [
                {"name": "P", "price_delta": 0.0},
                {"name": "G", "price_delta": 5.0},
            ]}
        ],
        "addons": [{"name": "Queijo", "price": 3.0}],
    }
    r = s.post(f"{API}/my/products", json=body, headers=h(lojista_tok))
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    lst = s.get(f"{API}/my/products", headers=h(lojista_tok)).json()
    got = next((p for p in lst if p["id"] == pid), None)
    assert got and got["variation_groups"][0]["options"][1]["price_delta"] == 5.0
    assert got["addons"][0]["price"] == 3.0
    s.delete(f"{API}/my/products/{pid}", headers=h(lojista_tok))


# ============ Order pricing with variations+addons ============
def test_order_price_with_variations_and_addons(s, cliente_tok):
    stores = s.get(f"{API}/stores").json()
    burger = next(x for x in stores if x["fantasy_name"] == "Burger House")
    det = s.get(f"{API}/stores/{burger['id']}").json()
    xburger = next(p for p in det["products"] if p["name"] == "X-Burger Clássico")
    # X-Burger 24.90 + Duplo 8.00 + Bacon extra 4.00 = 36.90
    payload = {
        "store_id": burger["id"],
        "items": [{
            "product_id": xburger["id"], "quantity": 1,
            "variations": {"Tamanho": "Duplo", "Ponto da carne": "Ao ponto"},
            "addons": ["Bacon extra"],
        }],
        "payment_method": "PIX",
    }
    r = s.post(f"{API}/orders", json=payload, headers=h(cliente_tok))
    assert r.status_code == 200, r.text
    o = r.json()
    it = o["items"][0]
    assert abs(it["unit_price"] - 36.90) < 0.01
    assert "Tamanho: Duplo" in it["options"]
    assert any("Bacon extra" in x for x in it["options"])
    assert abs(o["subtotal"] - 36.90) < 0.01


# ============ Loyalty earn + redeem + double-credit guard ============
def test_loyalty_endpoint(s, cliente_tok):
    r = s.get(f"{API}/loyalty", headers=h(cliente_tok))
    assert r.status_code == 200
    d = r.json()
    assert "points" in d and "value_brl" in d


def test_loyalty_redeem_and_earn_and_no_double_credit(s, cliente_tok, lojista_tok):
    # snapshot points
    p0 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    # ensure at least 20 points to redeem; cliente is seeded 150 but tests may have depleted
    if p0 < 20:
        pytest.skip(f"Not enough points ({p0}) to test redemption")

    stores = s.get(f"{API}/stores").json()
    burger = next(x for x in stores if x["fantasy_name"] == "Burger House")
    det = s.get(f"{API}/stores/{burger['id']}").json()
    xburger = next(p for p in det["products"] if p["name"] == "X-Burger Clássico")

    redeem = 20
    payload = {
        "store_id": burger["id"],
        "items": [{"product_id": xburger["id"], "quantity": 1,
                   "variations": {"Tamanho": "Simples", "Ponto da carne": "Ao ponto"}, "addons": []}],
        "payment_method": "PIX",
        "redeem_points": redeem,
    }
    r = s.post(f"{API}/orders", json=payload, headers=h(cliente_tok))
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["points_redeemed"] == redeem
    assert abs(o["points_discount"] - redeem * 0.10) < 0.01
    # subtotal 24.90 + delivery 6.90 - 2.00 = 29.80
    expected_total = round(24.90 + burger["delivery_fee"] - 2.0, 2)
    assert abs(o["total"] - expected_total) < 0.01

    # verify points debited
    p1 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    assert p1 == p0 - redeem

    # advance to FINALIZADO
    oid = o["id"]
    for st in ["ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA", "FINALIZADO"]:
        rr = s.patch(f"{API}/orders/{oid}/status", json={"status": st}, headers=h(lojista_tok))
        assert rr.status_code == 200

    earned = int(o["total"])  # floor
    p2 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    assert p2 == p1 + earned, f"expected {p1+earned} got {p2}"

    # DOUBLE-FINALIZE MUST NOT DOUBLE-CREDIT
    rr2 = s.patch(f"{API}/orders/{oid}/status", json={"status": "FINALIZADO"}, headers=h(lojista_tok))
    assert rr2.status_code == 200
    p3 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    assert p3 == p2, f"double-credit! p2={p2} p3={p3}"


def test_loyalty_refund_on_cancel(s, cliente_tok, lojista_tok):
    p0 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    if p0 < 10:
        pytest.skip("not enough points")
    stores = s.get(f"{API}/stores").json()
    burger = next(x for x in stores if x["fantasy_name"] == "Burger House")
    det = s.get(f"{API}/stores/{burger['id']}").json()
    xburger = next(p for p in det["products"] if p["name"] == "X-Burger Clássico")
    r = s.post(f"{API}/orders", json={
        "store_id": burger["id"],
        "items": [{"product_id": xburger["id"], "quantity": 1,
                   "variations": {"Tamanho": "Simples", "Ponto da carne": "Ao ponto"}, "addons": []}],
        "payment_method": "PIX",
        "redeem_points": 10,
    }, headers=h(cliente_tok))
    assert r.status_code == 200
    oid = r.json()["id"]
    p1 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    assert p1 == p0 - 10
    # cancel by lojista
    rr = s.patch(f"{API}/orders/{oid}/status", json={"status": "CANCELADO"}, headers=h(lojista_tok))
    assert rr.status_code == 200
    p2 = s.get(f"{API}/loyalty", headers=h(cliente_tok)).json()["points"]
    assert p2 == p0, f"expected refund back to {p0} got {p2}"


# ============ Order with address_id snapshot ============
def test_order_with_address_snapshot(s, cliente_tok):
    hdr = h(cliente_tok)
    body = {
        "label": "TEST_Ordersnap", "street": "Rua X", "number": "1",
        "neighborhood": "N", "city": "C", "state": "S", "zip": "00000-000",
    }
    aid = s.post(f"{API}/addresses", json=body, headers=hdr).json()["id"]
    stores = s.get(f"{API}/stores").json()
    burger = next(x for x in stores if x["fantasy_name"] == "Burger House")
    det = s.get(f"{API}/stores/{burger['id']}").json()
    xburger = next(p for p in det["products"] if p["name"] == "X-Burger Clássico")
    r = s.post(f"{API}/orders", json={
        "store_id": burger["id"],
        "items": [{"product_id": xburger["id"], "quantity": 1,
                   "variations": {"Tamanho": "Simples", "Ponto da carne": "Ao ponto"}, "addons": []}],
        "payment_method": "PIX", "address_id": aid,
    }, headers=hdr)
    assert r.status_code == 200
    o = r.json()
    assert o["address_id"] == aid
    assert o.get("address", {}).get("street") == "Rua X"
    s.delete(f"{API}/addresses/{aid}", headers=hdr)
