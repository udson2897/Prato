"""Iteration 11: Courier navigation modal regression tests.

Covers:
- POST /api/auth/courier-login (CPF 99988877766)
- GET /api/courier/me/orders -> ensure QZY8PZ (or any active order) returns
  address with `street` and lat/lng (so 'Iniciar rota' is enabled).
- assign-courier -> offer-response(accept:true) flow sets order.courier.
"""
import os
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://delivery-saas-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

COURIER_CPF = "99988877766"
COURIER_ID = "ZF-ZMQBN"
LOJISTA_EMAIL = "lojista@zappyfood.com"
LOJISTA_PASS = "lojista123"
CLIENTE_EMAIL = "cliente@zappyfood.com"
CLIENTE_PASS = "cliente123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def courier_token():
    r = requests.post(f"{API}/auth/courier-login",
                      json={"cpf": COURIER_CPF, "password": COURIER_CPF}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def lojista_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": LOJISTA_EMAIL, "password": LOJISTA_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def cliente_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": CLIENTE_EMAIL, "password": CLIENTE_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- courier /me/orders regression ----------
class TestCourierMyOrders:
    def test_courier_login(self, courier_token):
        assert courier_token

    def test_my_orders_contains_qzy8pz_with_address(self, courier_token):
        r = requests.get(f"{API}/courier/me/orders", headers=_h(courier_token), timeout=15)
        assert r.status_code == 200, r.text
        orders = r.json()
        assert isinstance(orders, list)
        assert len(orders) > 0, "Courier has no orders assigned"
        # Prefer QZY8PZ if present, otherwise assert on first active order
        target = next((o for o in orders if o.get("code") == "QZY8PZ"), None)
        if target is None:
            active = [o for o in orders if o.get("status") in
                      ("AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA")]
            assert active, f"No active order for courier. Got: {[o.get('code') for o in orders]}"
            target = active[0]
        addr = target.get("address")
        assert addr is not None, f"Order {target.get('code')} has no address"
        assert addr.get("street"), f"Address has no street: {addr}"
        # Coords should exist so 'Iniciar rota' is enabled (canRoute=true)
        assert addr.get("lat") is not None and addr.get("lng") is not None, \
            f"Address missing lat/lng: {addr}"

    def test_my_order_detail_qzy8pz(self, courier_token):
        r = requests.get(f"{API}/courier/me/orders", headers=_h(courier_token), timeout=15)
        codes = [o.get("code") for o in r.json()]
        code = "QZY8PZ" if "QZY8PZ" in codes else codes[0]
        r2 = requests.get(f"{API}/courier/me/order/{code}", headers=_h(courier_token), timeout=15)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["code"] == code
        assert d.get("address"), "Detail must include address for startRoute() to succeed"
        assert d["address"].get("street"), "Address.street is required for canRoute fallback"


# ---------- assign -> offer-response(accept) flow ----------
class TestAssignAcceptFlow:
    def test_full_assign_accept_flow(self, cliente_token, lojista_token, courier_token):
        # 1) cliente creates an order (uses first store from /stores)
        r_stores = requests.get(f"{API}/stores", headers=_h(cliente_token), timeout=15)
        assert r_stores.status_code == 200
        stores = r_stores.json()
        assert stores, "No stores available"
        store = stores[0]

        r_prods = requests.get(f"{API}/stores/{store['id']}",
                               headers=_h(cliente_token), timeout=15)
        assert r_prods.status_code == 200
        products = r_prods.json().get("products", [])
        assert products, "Store has no products"
        product = next((p for p in products if p.get("available", True)), products[0])

        # get address of cliente
        r_addr = requests.get(f"{API}/addresses", headers=_h(cliente_token), timeout=15)
        assert r_addr.status_code == 200
        addrs = r_addr.json()
        assert addrs, "Cliente has no addresses"
        addr = next((a for a in addrs if a.get("is_default")), addrs[0])

        payload = {
            "store_id": store["id"],
            "items": [{"product_id": product["id"], "quantity": 1}],
            "address_id": addr["id"],
            "payment_method": "PIX",
        }
        r_o = requests.post(f"{API}/orders", json=payload, headers=_h(cliente_token), timeout=20)
        assert r_o.status_code in (200, 201), r_o.text
        order = r_o.json()
        oid = order["id"]

        try:
            # look up courier user id via lojista's /my/couriers
            r_couriers = requests.get(f"{API}/my/couriers", headers=_h(lojista_token), timeout=15)
            assert r_couriers.status_code == 200
            couriers = r_couriers.json()
            match = next((c for c in couriers if c.get("courier_code") == COURIER_ID or c.get("cpf") == COURIER_CPF), None)
            assert match is not None, f"Courier {COURIER_ID} not linked to lojista: {couriers}"
            courier_user_id = match.get("id") or match.get("courier_id") or match.get("user_id")
            assert courier_user_id, f"No id field in courier link: {match}"

            # 2) lojista assigns courier
            r_a = requests.patch(f"{API}/orders/{oid}/assign-courier",
                                 json={"courier_id": courier_user_id},
                                 headers=_h(lojista_token), timeout=15)
            assert r_a.status_code == 200, r_a.text
            body = r_a.json()
            # Expect courier_offer with pending status on the order
            assert body.get("courier_offer"), f"assign-courier returned no courier_offer: {body}"
            assert body["courier_offer"].get("status") == "pending"

            # 3) entregador accepts offer
            # find offer id from courier's /offers
            r_offers = requests.get(f"{API}/courier/me/offers", headers=_h(courier_token), timeout=15)
            assert r_offers.status_code == 200
            offers = r_offers.json()
            my_offer = next((o for o in offers if o.get("order_id") == oid or o.get("code") == order.get("code")), None)
            assert my_offer is not None, f"No offer for order {oid} in {offers}"

            r_resp = requests.post(f"{API}/orders/{oid}/offer-response",
                                   json={"accept": True},
                                   headers=_h(courier_token), timeout=15)
            assert r_resp.status_code == 200, r_resp.text

            # 4) verify order.courier is set now
            r_orders = requests.get(f"{API}/courier/me/orders",
                                    headers=_h(courier_token), timeout=15)
            assert r_orders.status_code == 200
            codes = [o.get("code") for o in r_orders.json()]
            assert order["code"] in codes, \
                f"Order {order['code']} not in courier's list after accept: {codes}"
        finally:
            # best-effort cleanup: cancel order if endpoint exists
            try:
                requests.post(f"{API}/orders/{oid}/cancel", headers=_h(cliente_token), timeout=10)
            except Exception:
                pass
