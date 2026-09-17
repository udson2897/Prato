"""Iteration 8 - Courier reformulation end-to-end backend tests.

Covers:
- Courier self-registration (POST /api/courier/register) with ZF-XXXXX id.
- Duplicate CPF rejected with 409.
- Courier login by CPF+CPF (POST /api/auth/courier-login).
- Lojista invites by courier_code (POST /api/my/couriers/invite): 404 for unknown, 409 for duplicate.
- Courier lists and accepts/rejects invites (/api/courier/me/invites*).
- PATCH /api/orders/{oid}/assign-courier only when courier is linked & accepted
  (creates courier_offer, does NOT set order.courier yet).
- GET /api/courier/me/offers lists pending offers with pickup/delivery/store_name.
- POST /api/orders/{oid}/offer-response accept -> sets order.courier ; refuse -> clears offer.
- GET /api/courier/me/orders -> only accepted orders.
- GET /api/courier/me/earnings -> day/week/month + stores breakdown + day_orders.
"""
import os
import random
import string
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://delivery-saas-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

LOJISTA_EMAIL = "lojista@zappyfood.com"
LOJISTA_PASS = "lojista123"
CLIENTE_EMAIL = "cliente@zappyfood.com"
CLIENTE_PASS = "cliente123"


def _rand_cpf() -> str:
    return "".join(random.choices(string.digits, k=11))


def _rand_plate() -> str:
    return "".join(random.choices(string.ascii_uppercase, k=3)) + str(random.randint(0, 9)) + "".join(random.choices(string.ascii_uppercase, k=1)) + "".join(random.choices(string.digits, k=2))


def _headers(tok: str) -> dict:
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
def courier():
    """Register a brand new courier."""
    cpf = _rand_cpf()
    payload = {"name": f"TEST_Courier_{cpf[-4:]}", "cpf": cpf, "plate": _rand_plate(), "renavam": "12345678901"}
    r = requests.post(f"{API}/courier/register", json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["user"]["role"] == "entregador"
    assert data["user"]["courier_code"].startswith("ZF-")
    return {
        "cpf": cpf,
        "payload": payload,
        "token": data["access_token"],
        "id": data["user"]["id"],
        "courier_code": data["user"]["courier_code"],
        "name": data["user"]["name"],
    }


# =============== Courier register / login ===============
class TestCourierAuth:
    def test_register_returns_zf_code(self, courier):
        assert courier["courier_code"].startswith("ZF-")
        assert len(courier["courier_code"]) == 8  # ZF- + 5 chars

    def test_register_duplicate_cpf_returns_409(self, courier):
        r = requests.post(f"{API}/courier/register", json=courier["payload"])
        assert r.status_code == 409, r.text

    def test_courier_login_cpf_as_password(self, courier):
        r = requests.post(f"{API}/auth/courier-login", json={"cpf": courier["cpf"], "password": courier["cpf"]})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["user"]["role"] == "entregador"
        assert j["user"]["id"] == courier["id"]

    def test_courier_login_wrong_password(self, courier):
        r = requests.post(f"{API}/auth/courier-login", json={"cpf": courier["cpf"], "password": "00000000000"})
        assert r.status_code == 401


# =============== Invite flow ===============
class TestInvite:
    def test_invite_unknown_code_404(self, lojista_token):
        r = requests.post(f"{API}/my/couriers/invite", json={"courier_code": "ZF-ZZZZZ"}, headers=_headers(lojista_token))
        assert r.status_code == 404, r.text

    def test_invite_ok(self, lojista_token, courier):
        r = requests.post(f"{API}/my/couriers/invite", json={"courier_code": courier["courier_code"]}, headers=_headers(lojista_token))
        assert r.status_code == 200, r.text
        assert r.json()["courier"]["courier_code"] == courier["courier_code"]

    def test_invite_duplicate_409(self, lojista_token, courier):
        r = requests.post(f"{API}/my/couriers/invite", json={"courier_code": courier["courier_code"]}, headers=_headers(lojista_token))
        assert r.status_code == 409, r.text

    def test_courier_lists_invite(self, courier):
        r = requests.get(f"{API}/courier/me/invites", headers=_headers(courier["token"]))
        assert r.status_code == 200
        invs = r.json()
        assert any(iv["status"] == "pending" for iv in invs)
        # save invite id for accept test
        courier["invite_id"] = next(iv["id"] for iv in invs if iv["status"] == "pending")

    def test_courier_accepts_invite(self, courier):
        r = requests.post(
            f"{API}/courier/me/invites/{courier['invite_id']}/respond",
            json={"accept": True}, headers=_headers(courier["token"]),
        )
        assert r.status_code == 200

    def test_lojista_sees_accepted_courier(self, lojista_token, courier):
        r = requests.get(f"{API}/my/couriers", headers=_headers(lojista_token))
        assert r.status_code == 200
        rows = r.json()
        row = next((c for c in rows if c["id"] == courier["id"]), None)
        assert row is not None, f"courier not in list {rows}"
        assert row["status"] == "accepted"


# =============== Assign courier -> offer -> accept flow ===============
@pytest.fixture(scope="module")
def order_id(cliente_token, lojista_token):
    """Create an order for a store owned by demo lojista."""
    stores_r = requests.get(f"{API}/my/store", headers=_headers(lojista_token))
    assert stores_r.status_code == 200
    store = stores_r.json()
    # get products of that store
    pr = requests.get(f"{API}/stores/{store['id']}")
    assert pr.status_code == 200
    products = pr.json().get("products", [])
    assert products, "no products for demo store"
    item = {"product_id": products[0]["id"], "quantity": 1, "notes": "TEST_iter8_offer"}
    # get customer default address (or create one)
    ar = requests.get(f"{API}/addresses", headers=_headers(cliente_token))
    addrs = ar.json() if ar.status_code == 200 else []
    if not addrs:
        addr_payload = {"label": "TEST", "street": "R Teste", "number": "1",
                        "neighborhood": "Centro", "city": "SP", "state": "SP",
                        "zip": "01000-000", "lat": -23.55, "lng": -46.63, "is_default": True}
        ar2 = requests.post(f"{API}/addresses", json=addr_payload, headers=_headers(cliente_token))
        assert ar2.status_code == 200
        addr_id = ar2.json()["id"]
    else:
        addr_id = next((a["id"] for a in addrs if a.get("is_default")), addrs[0]["id"])
    body = {"store_id": store["id"], "items": [item], "address_id": addr_id,
            "payment_method": "PIX", "notes": "TEST_iter8_offer"}
    r = requests.post(f"{API}/orders", json=body, headers=_headers(cliente_token))
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestAssignAndOffer:
    def test_assign_creates_offer_no_courier_yet(self, lojista_token, courier, order_id):
        r = requests.patch(
            f"{API}/orders/{order_id}/assign-courier",
            json={"courier_id": courier["id"]}, headers=_headers(lojista_token),
        )
        assert r.status_code == 200, r.text
        o = r.json()
        assert o.get("courier_offer", {}).get("status") == "pending"
        assert o["courier_offer"]["courier_id"] == courier["id"]
        assert o["courier_offer"]["store_name"]
        assert o["courier_offer"]["pickup"]["name"]
        assert o.get("courier") in (None, {})  # not set yet

    def test_assign_unlinked_courier_returns_404(self, lojista_token, order_id):
        # Register a fresh courier that has NOT been invited
        cpf = _rand_cpf()
        rr = requests.post(f"{API}/courier/register", json={
            "name": "TEST_Unlinked", "cpf": cpf, "plate": _rand_plate(), "renavam": "12345678901"})
        assert rr.status_code == 201
        stranger_id = rr.json()["user"]["id"]
        r = requests.patch(
            f"{API}/orders/{order_id}/assign-courier",
            json={"courier_id": stranger_id}, headers=_headers(lojista_token),
        )
        assert r.status_code == 404, r.text

    def test_courier_sees_offer(self, courier, order_id):
        r = requests.get(f"{API}/courier/me/offers", headers=_headers(courier["token"]))
        assert r.status_code == 200
        offers = r.json()
        off = next((o for o in offers if o["id"] == order_id), None)
        assert off is not None
        assert off["store_name"]
        assert off["pickup"]
        assert off["delivery"]

    def test_courier_refuses_then_reassigns_then_accepts(self, lojista_token, courier, order_id):
        # 1) refuse
        r = requests.post(
            f"{API}/orders/{order_id}/offer-response",
            json={"accept": False}, headers=_headers(courier["token"]),
        )
        assert r.status_code == 200
        # order should have offer cleared -> can be reassigned
        g = requests.get(f"{API}/orders/{order_id}", headers=_headers(lojista_token))
        assert g.status_code == 200
        assert g.json().get("courier_offer") in (None, {}) or g.json().get("courier_offer", {}).get("status") != "pending"

        # 2) reassign
        r2 = requests.patch(
            f"{API}/orders/{order_id}/assign-courier",
            json={"courier_id": courier["id"]}, headers=_headers(lojista_token),
        )
        assert r2.status_code == 200

        # 3) accept
        r3 = requests.post(
            f"{API}/orders/{order_id}/offer-response",
            json={"accept": True}, headers=_headers(courier["token"]),
        )
        assert r3.status_code == 200

        # order.courier now set
        g2 = requests.get(f"{API}/orders/{order_id}", headers=_headers(lojista_token))
        assert g2.status_code == 200
        o = g2.json()
        assert o.get("courier", {}).get("id") == courier["id"]
        assert o["courier_offer"]["status"] == "accepted"


# =============== Courier my orders + earnings ===============
class TestCourierViews:
    def test_my_orders_contains_accepted(self, courier, order_id):
        r = requests.get(f"{API}/courier/me/orders", headers=_headers(courier["token"]))
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert order_id in ids

    def test_earnings_shape(self, courier):
        r = requests.get(f"{API}/courier/me/earnings", headers=_headers(courier["token"]))
        assert r.status_code == 200
        j = r.json()
        for k in ("day", "week", "month"):
            assert k in j
            assert "total" in j[k]
            assert "stores" in j[k]
        assert isinstance(j.get("day_orders", []), list)
