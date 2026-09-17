"""Iteration 10 - Tests for 'Reatribuir Rápido' improvement.

New assertions:
 1. Rafael Teste courier (CPF 99988877766 / senha 99988877766, ID ZF-ZMQBN)
    logs in via POST /api/auth/courier-login.
 2. Demo lojista lists Rafael in GET /api/my/couriers with status 'accepted'
    and name 'Rafael Teste' + courier_code 'ZF-ZMQBN'.
 3. Regression: PATCH /api/orders/{oid}/assign-courier with Rafael (accepted)
    returns 200 and creates courier_offer.status='pending'.
"""
import os
import random
import string
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
API = f"{BASE_URL}/api"

LOJISTA_EMAIL = "lojista@zappyfood.com"
LOJISTA_PASS = "lojista123"
CLIENTE_EMAIL = "cliente@zappyfood.com"
CLIENTE_PASS = "cliente123"

RAFAEL_CPF = "99988877766"
RAFAEL_PASS = "99988877766"
RAFAEL_CODE = "ZF-ZMQBN"
RAFAEL_NAME = "Rafael Teste"


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def lojista_token():
    r = requests.post(f"{API}/auth/login", json={"email": LOJISTA_EMAIL, "password": LOJISTA_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def cliente_token():
    r = requests.post(f"{API}/auth/login", json={"email": CLIENTE_EMAIL, "password": CLIENTE_PASS})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def rafael_token():
    r = requests.post(f"{API}/auth/courier-login", json={"cpf": RAFAEL_CPF, "password": RAFAEL_PASS})
    assert r.status_code == 200, f"Rafael courier-login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def store_id(lojista_token):
    r = requests.get(f"{API}/my/store", headers=H(lojista_token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _ensure_address(cliente_token, store):
    lst = requests.get(f"{API}/addresses", headers=H(cliente_token)).json()
    if lst:
        return lst[0]["id"]
    lat = (store.get("lat") or -23.55) + 0.001
    lng = (store.get("lng") or -46.63) + 0.001
    payload = {
        "label": "TEST_iter10", "street": "Rua Teste", "number": "1",
        "neighborhood": "Centro", "city": "SP", "state": "SP", "zip": "01000-000",
        "is_default": True, "lat": lat, "lng": lng,
    }
    r = requests.post(f"{API}/addresses", headers=H(cliente_token), json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _new_active_order(cliente_token, store_id):
    s = requests.get(f"{API}/stores/{store_id}")
    assert s.status_code == 200, s.text
    store = s.json()
    prods = store.get("products") or []
    assert prods, "store has no products"
    prod = prods[0]
    address_id = _ensure_address(cliente_token, store)
    payload = {
        "store_id": store_id,
        "items": [{"product_id": prod["id"], "quantity": 1}],
        "address_id": address_id,
        "payment_method": "PIX",
        "notes": "TEST_iter10_reassign",
    }
    r = requests.post(f"{API}/orders", headers=H(cliente_token), json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- Tests ----------

def test_rafael_courier_login_ok(rafael_token):
    """Rafael's courier-login returns a valid token."""
    assert rafael_token
    me = requests.get(f"{API}/auth/me", headers=H(rafael_token))
    assert me.status_code == 200, me.text
    j = me.json()
    assert j.get("courier_code") == RAFAEL_CODE, f"expected {RAFAEL_CODE}, got {j}"
    assert j.get("name") == RAFAEL_NAME, f"expected name {RAFAEL_NAME}, got {j.get('name')}"


def test_rafael_appears_as_accepted_in_lojista_list(lojista_token, rafael_token):
    r = requests.get(f"{API}/my/couriers", headers=H(lojista_token))
    assert r.status_code == 200, r.text
    lst = r.json()
    assert isinstance(lst, list) and len(lst) >= 1
    rafael = next((c for c in lst if c.get("courier_code") == RAFAEL_CODE), None)
    assert rafael, f"Rafael {RAFAEL_CODE} missing in /my/couriers: {lst}"
    assert rafael.get("status") == "accepted", f"Rafael status expected 'accepted', got {rafael.get('status')}"
    assert rafael.get("name") == RAFAEL_NAME


def test_regression_assign_rafael_creates_pending_offer(lojista_token, cliente_token, store_id, rafael_token):
    """PATCH /orders/{oid}/assign-courier with Rafael (accepted) => 200 + pending offer."""
    # get rafael id
    me = requests.get(f"{API}/auth/me", headers=H(rafael_token)).json()
    rafael_id = me["id"]

    oid = _new_active_order(cliente_token, store_id)
    r = requests.patch(
        f"{API}/orders/{oid}/assign-courier",
        headers=H(lojista_token),
        json={"courier_id": rafael_id},
    )
    assert r.status_code == 200, r.text
    o = r.json()
    offer = o.get("courier_offer")
    assert offer, f"missing courier_offer: {o}"
    assert offer["status"] == "pending"
    assert offer["courier_id"] == rafael_id
    assert offer.get("courier_name") == RAFAEL_NAME
    # order.courier still None until courier accepts
    assert not o.get("courier"), f"courier should NOT be set yet: {o.get('courier')}"


def test_regression_refused_state_shows_reassign_hint(lojista_token, cliente_token, store_id, rafael_token):
    """Assign then refuse => order.courier_refused set and courier_offer cleared.
    This is the state that triggers the queue 'Reatribuir' button in the UI."""
    me = requests.get(f"{API}/auth/me", headers=H(rafael_token)).json()
    rafael_id = me["id"]

    oid = _new_active_order(cliente_token, store_id)
    r = requests.patch(f"{API}/orders/{oid}/assign-courier", headers=H(lojista_token),
                       json={"courier_id": rafael_id})
    assert r.status_code == 200, r.text

    # Rafael refuses the offer
    ar = requests.post(f"{API}/orders/{oid}/offer-response",
                       headers=H(rafael_token), json={"accept": False})
    assert ar.status_code == 200, ar.text

    g = requests.get(f"{API}/orders/{oid}", headers=H(lojista_token)).json()
    assert not g.get("courier"), f"courier should be cleared: {g.get('courier')}"
    ref = g.get("courier_refused")
    assert ref and ref["courier_id"] == rafael_id, f"missing courier_refused: {g}"
    assert ref.get("courier_name") == RAFAEL_NAME
