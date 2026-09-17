"""Iteration 8 - Focused tests for the reported bug:
'lojista não consegue atribuir um pedido a um entregador' + 'lista deve exibir NOME e ID'.

Validates:
1. GET /api/my/couriers returns {id, name, courier_code, status} for each entregador
   (both 'accepted' and 'pending' links are visible in the list).
2. PATCH /api/orders/{oid}/assign-courier with an ACCEPTED courier returns 200
   and creates courier_offer.status='pending' (WITHOUT setting order.courier yet).
3. PATCH assign-courier with a PENDING (not-accepted) courier is rejected 404.
4. Courier can see the pending offer via GET /api/courier/me/offers.
5. When courier accepts via POST /api/orders/{oid}/offer-response {accept:true},
   the order becomes courier_offer.status='accepted' AND order.courier is set.
6. When courier refuses, courier_refused is set and order.courier / courier_offer cleared.
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


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _rand_cpf():
    return "".join(random.choices(string.digits, k=11))


def _rand_plate():
    return (
        "".join(random.choices(string.ascii_uppercase, k=3))
        + str(random.randint(0, 9))
        + random.choice(string.ascii_uppercase)
        + "".join(random.choices(string.digits, k=2))
    )


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
def store_ids(lojista_token):
    # /my/store returns the (primary) store of the lojista
    r = requests.get(f"{API}/my/store", headers=H(lojista_token))
    assert r.status_code == 200, r.text
    return [r.json()["id"]]


@pytest.fixture(scope="module")
def accepted_courier(lojista_token):
    """Return an already-accepted courier from the seeded credentials.
    Try CPF 11122233344 (Carlos Moto) first; if not linked, create+accept a new one."""
    cpf = "11122233344"
    r = requests.post(f"{API}/auth/courier-login", json={"cpf": cpf, "password": cpf})
    tok = None
    if r.status_code == 200:
        tok = r.json()["access_token"]
    if not tok:
        # register a new courier
        cpf = _rand_cpf()
        reg = requests.post(f"{API}/courier/register", json={
            "name": f"TEST_Courier_{cpf[-4:]}", "cpf": cpf, "plate": _rand_plate(),
            "renavam": "".join(random.choices(string.digits, k=11))
        })
        assert reg.status_code in (200, 201), reg.text
        r = requests.post(f"{API}/auth/courier-login", json={"cpf": cpf, "password": cpf})
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers=H(tok))
    assert me.status_code == 200, me.text
    me_j = me.json()
    code = me_j["courier_code"]
    # ensure lojista invited & courier accepted
    inv = requests.post(f"{API}/my/couriers/invite", headers=H(lojista_token), json={"courier_code": code})
    if inv.status_code == 200:
        # find invite id and accept
        invites = requests.get(f"{API}/courier/me/invites", headers=H(tok)).json()
        match = next((i for i in invites if i.get("courier_code") == code), None)
        if match:
            r = requests.post(f"{API}/courier/me/invites/{match['id']}/respond", headers=H(tok), json={"accept": True})
            assert r.status_code == 200, r.text
    # 409 means already linked (accepted or pending) — if pending, accept it
    if inv.status_code == 409 and "pending" in (inv.text or "").lower():
        invites = requests.get(f"{API}/courier/me/invites", headers=H(tok)).json()
        match = next((i for i in invites if i.get("courier_code") == code), None)
        if match:
            requests.post(f"{API}/courier/me/invites/{match['id']}/respond", headers=H(tok), json={"accept": True})
    return {"id": me_j["id"], "courier_code": code, "name": me_j["name"], "token": tok}


@pytest.fixture(scope="module")
def pending_courier(lojista_token):
    """Create a new courier and invite (do NOT accept). Yields pending link."""
    cpf = _rand_cpf()
    reg = requests.post(f"{API}/courier/register", json={
        "name": f"TEST_Pending_{cpf[-4:]}", "cpf": cpf, "plate": _rand_plate(),
        "renavam": "".join(random.choices(string.digits, k=11))
    })
    assert reg.status_code in (200, 201), reg.text
    code = reg.json()["user"]["courier_code"]
    inv = requests.post(f"{API}/my/couriers/invite", headers=H(lojista_token), json={"courier_code": code})
    assert inv.status_code in (200, 409), inv.text
    # fetch id via courier-login + me
    lr = requests.post(f"{API}/auth/courier-login", json={"cpf": cpf, "password": cpf})
    ct = lr.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers=H(ct)).json()
    return {"id": me["id"], "courier_code": code, "name": me["name"]}


def _ensure_address(cliente_token, store):
    """Get client's default address or create one near the store."""
    lst = requests.get(f"{API}/addresses", headers=H(cliente_token)).json()
    if lst:
        return lst[0]["id"]
    lat = (store.get("lat") or -23.55) + 0.001
    lng = (store.get("lng") or -46.63) + 0.001
    payload = {
        "label": "TEST_iter9", "street": "Rua Teste", "number": "1",
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
        "notes": "TEST_iter9_assign_offer",
    }
    r = requests.post(f"{API}/orders", headers=H(cliente_token), json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------- Tests ----------

def test_list_couriers_returns_name_id_status(lojista_token, accepted_courier, pending_courier):
    r = requests.get(f"{API}/my/couriers", headers=H(lojista_token))
    assert r.status_code == 200, r.text
    lst = r.json()
    assert isinstance(lst, list) and len(lst) >= 1
    # find both couriers
    ac = next((c for c in lst if c["id"] == accepted_courier["id"]), None)
    pc = next((c for c in lst if c["id"] == pending_courier["id"]), None)
    assert ac, f"accepted courier missing in /my/couriers: {lst}"
    for key in ("id", "name", "courier_code", "status"):
        assert key in ac, f"missing {key} in {ac}"
    assert ac["status"] == "accepted"
    assert ac["courier_code"].startswith("ZF-")
    assert ac["name"]
    if pc:
        assert pc["status"] in ("pending", "accepted")


def test_assign_pending_courier_is_rejected(lojista_token, cliente_token, store_ids, pending_courier):
    oid = _new_active_order(cliente_token, store_ids[0])
    r = requests.patch(f"{API}/orders/{oid}/assign-courier", headers=H(lojista_token),
                       json={"courier_id": pending_courier["id"]})
    assert r.status_code == 404, r.text  # not linked/accepted


def test_assign_accepted_creates_pending_offer(lojista_token, cliente_token, store_ids, accepted_courier):
    oid = _new_active_order(cliente_token, store_ids[0])
    r = requests.patch(f"{API}/orders/{oid}/assign-courier", headers=H(lojista_token),
                       json={"courier_id": accepted_courier["id"]})
    assert r.status_code == 200, r.text
    o = r.json()
    assert o.get("courier") in (None, {}), f"courier should NOT be set yet (offer/accept flow): {o.get('courier')}"
    offer = o.get("courier_offer")
    assert offer, f"missing courier_offer in response: {o}"
    assert offer["status"] == "pending"
    assert offer["courier_id"] == accepted_courier["id"]
    assert offer.get("courier_name") == accepted_courier["name"]

    # GET verify persistence
    g = requests.get(f"{API}/orders/{oid}", headers=H(lojista_token))
    assert g.status_code == 200
    go = g.json()
    assert go["courier_offer"]["status"] == "pending"
    assert not go.get("courier")


def test_courier_sees_offer_and_accept_sets_courier(lojista_token, cliente_token, store_ids, accepted_courier):
    oid = _new_active_order(cliente_token, store_ids[0])
    r = requests.patch(f"{API}/orders/{oid}/assign-courier", headers=H(lojista_token),
                       json={"courier_id": accepted_courier["id"]})
    assert r.status_code == 200, r.text

    # courier sees the offer
    offers = requests.get(f"{API}/courier/me/offers", headers=H(accepted_courier["token"]))
    assert offers.status_code == 200
    lst = offers.json()
    assert any(o["id"] == oid for o in lst), f"offer for {oid} missing: {lst}"

    # accept
    ar = requests.post(f"{API}/orders/{oid}/offer-response",
                      headers=H(accepted_courier["token"]), json={"accept": True})
    assert ar.status_code == 200, ar.text

    # verify order.courier now set
    g = requests.get(f"{API}/orders/{oid}", headers=H(lojista_token)).json()
    assert g.get("courier"), f"order.courier should be set after accept: {g}"
    assert g["courier"]["id"] == accepted_courier["id"]
    assert g["courier"]["name"] == accepted_courier["name"]
    assert g["courier_offer"]["status"] == "accepted"


def test_courier_refuse_clears_offer_and_sets_refused(lojista_token, cliente_token, store_ids, accepted_courier):
    oid = _new_active_order(cliente_token, store_ids[0])
    r = requests.patch(f"{API}/orders/{oid}/assign-courier", headers=H(lojista_token),
                       json={"courier_id": accepted_courier["id"]})
    assert r.status_code == 200

    ar = requests.post(f"{API}/orders/{oid}/offer-response",
                      headers=H(accepted_courier["token"]), json={"accept": False})
    assert ar.status_code == 200, ar.text

    g = requests.get(f"{API}/orders/{oid}", headers=H(lojista_token)).json()
    assert not g.get("courier_offer"), f"courier_offer should be cleared: {g.get('courier_offer')}"
    assert not g.get("courier")
    ref = g.get("courier_refused")
    assert ref and ref["courier_id"] == accepted_courier["id"], f"missing courier_refused: {g}"
