"""
Iteration 7 — Bug fix: multi-store courier assignment.
Root cause: PATCH /api/orders/{oid}/assign-courier required courier.store_id == order.store_id.
Fix: courier is now accepted if it belongs to ANY store owned by the current lojista.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

LOJISTA = {"email": "lojista@zappyfood.com", "password": "lojista123"}
CLIENTE = {"email": "cliente@zappyfood.com", "password": "cliente123"}


# ---------- auth helpers ----------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def lojista_headers():
    return _login(LOJISTA)


@pytest.fixture(scope="module")
def cliente_headers():
    return _login(CLIENTE)


# ---------- feature helpers ----------
@pytest.fixture(scope="module")
def stores(lojista_headers):
    """Fetch the 3 seeded stores owned by demo lojista via the public /stores endpoint,
    matching by their well-known names (there is no /my/stores plural endpoint)."""
    r = requests.get(f"{API}/stores", timeout=15)
    assert r.status_code == 200, r.text
    all_stores = r.json()
    wanted = {"Burger House", "Pizzaria Bella", "Açaí Tropical"}
    st = [s for s in all_stores if s.get("fantasy_name") in wanted]
    assert len(st) >= 2, f"expected >=2 demo stores, got names={[s.get('fantasy_name') for s in st]}"
    return st


@pytest.fixture(scope="module")
def couriers(lojista_headers):
    r = requests.get(f"{API}/my/couriers", headers=lojista_headers, timeout=15)
    assert r.status_code == 200, r.text
    cs = r.json()
    assert isinstance(cs, list) and len(cs) >= 1, "expected at least one seeded courier (João Entregador)"
    return cs


def _find_store_by_name(stores, name):
    for s in stores:
        if s.get("fantasy_name") == name:
            return s
    return None


def _pick_secondary_store(stores):
    """Any store whose fantasy_name is not 'Burger House'."""
    for s in stores:
        if s.get("fantasy_name") != "Burger House":
            return s
    raise AssertionError("no secondary store found")


@pytest.fixture(scope="module")
def cliente_address(cliente_headers):
    """Ensure the cliente has at least one address; return its id."""
    r = requests.get(f"{API}/addresses", headers=cliente_headers, timeout=15)
    assert r.status_code == 200, r.text
    addrs = r.json() or []
    if addrs:
        return addrs[0]["id"]
    payload = {
        "label": "Casa", "line1": "Rua Teste, 123", "line2": "",
        "district": "Centro", "city": "Sao Paulo", "state": "SP", "zip": "01000-000",
    }
    r = requests.post(f"{API}/addresses", json=payload, headers=cliente_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _get_or_create_order(cliente_headers, store, notes_prefix, address_id):
    """Create a new cliente order for this store."""
    r = requests.get(f"{API}/stores/{store['id']}", timeout=15)
    assert r.status_code == 200, r.text
    prods = r.json().get("products", [])
    assert isinstance(prods, list) and len(prods) >= 1, f"store {store.get('fantasy_name')} has no products"
    p = prods[0]
    payload = {
        "store_id": store["id"],
        "items": [{"product_id": p["id"], "quantity": 1}],
        "payment_method": "PIX",
        "notes": f"{notes_prefix}_{uuid.uuid4().hex[:6]}",
        "address_id": address_id,
    }
    r = requests.post(f"{API}/orders", json=payload, headers=cliente_headers, timeout=20)
    assert r.status_code in (200, 201), f"create order failed: {r.status_code} {r.text}"
    return r.json()


# ---------- tests ----------
class TestAssignCourierMultiStore:
    """Assign courier across all stores of same owner."""

    def test_courier_belongs_to_primary_store(self, couriers, stores):
        # João Entregador is registered under Burger House (primary)
        burger = _find_store_by_name(stores, "Burger House")
        assert burger, "Burger House not found among demo lojista's stores"
        c = couriers[0]
        assert c["store_id"] == burger["id"], (
            f"expected seeded courier's store_id={burger['id']} (Burger House), got {c['store_id']}"
        )

    def test_assign_to_secondary_store_order(self, lojista_headers, cliente_headers, cliente_address, stores, couriers):
        """Order on a NON-primary store must accept a courier from the primary store (same owner)."""
        secondary = _pick_secondary_store(stores)
        order = _get_or_create_order(cliente_headers, secondary, "TEST_iter7_secondary", cliente_address)
        c = couriers[0]

        r = requests.patch(
            f"{API}/orders/{order['id']}/assign-courier",
            json={"courier_id": c["id"]},
            headers=lojista_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"assign failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("courier"), f"response missing courier: {body}"
        assert body["courier"]["id"] == c["id"]
        assert body["courier"]["name"] == c["name"]
        assert body["courier"]["cpf"] == c["cpf"]
        assert body["courier"]["plate"] == c["plate"]

        # Verify persistence via GET /orders/{id}
        g = requests.get(f"{API}/orders/{order['id']}", headers=lojista_headers, timeout=15)
        assert g.status_code == 200, g.text
        gb = g.json()
        assert gb.get("courier", {}).get("id") == c["id"]
        assert gb["store_id"] == secondary["id"]
        assert gb["store_id"] != couriers[0]["store_id"], "sanity: order store must differ from courier store"

    def test_assign_to_primary_store_order(self, lojista_headers, cliente_headers, cliente_address, stores, couriers):
        """Same courier still works for primary-store order (no regression)."""
        burger = _find_store_by_name(stores, "Burger House")
        order = _get_or_create_order(cliente_headers, burger, "TEST_iter7_primary", cliente_address)
        c = couriers[0]

        r = requests.patch(
            f"{API}/orders/{order['id']}/assign-courier",
            json={"courier_id": c["id"]},
            headers=lojista_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"assign primary failed: {r.status_code} {r.text}"
        assert r.json().get("courier", {}).get("id") == c["id"]

    def test_assign_unknown_courier_returns_404(self, lojista_headers, cliente_headers, cliente_address, stores):
        secondary = _pick_secondary_store(stores)
        order = _get_or_create_order(cliente_headers, secondary, "TEST_iter7_unknown", cliente_address)
        r = requests.patch(
            f"{API}/orders/{order['id']}/assign-courier",
            json={"courier_id": "nonexistent-" + uuid.uuid4().hex},
            headers=lojista_headers,
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"
        assert "Entregador" in r.json().get("detail", ""), r.text

    def test_assign_unknown_order_returns_404(self, lojista_headers, couriers):
        r = requests.patch(
            f"{API}/orders/nonexistent-{uuid.uuid4().hex}/assign-courier",
            json={"courier_id": couriers[0]["id"]},
            headers=lojista_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_assign_requires_auth(self, couriers, cliente_headers, cliente_address, stores):
        secondary = _pick_secondary_store(stores)
        order = _get_or_create_order(cliente_headers, secondary, "TEST_iter7_noauth", cliente_address)
        r = requests.patch(
            f"{API}/orders/{order['id']}/assign-courier",
            json={"courier_id": couriers[0]["id"]},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected auth failure, got {r.status_code}"
