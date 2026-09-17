"""Iter4 bug fix regression: demo accounts must have correct role/active_role.
The seed_data idempotent repair (server.py ~L1490) forces:
  - cliente@zappyfood.com => role=cliente, active_role=cliente
  - lojista@zappyfood.com => role=lojista, active_role=lojista
This test ensures the login response reflects that (Gate routes by active_role).
"""
import os
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://delivery-saas-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def test_login_cliente_role_and_active_role(s):
    r = s.post(f"{API}/auth/login",
               json={"email": "cliente@zappyfood.com", "password": "cliente123"}, timeout=20)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["email"] == "cliente@zappyfood.com"
    assert u["role"] == "cliente"
    assert u["active_role"] == "cliente"


def test_login_lojista_role_and_active_role(s):
    r = s.post(f"{API}/auth/login",
               json={"email": "lojista@zappyfood.com", "password": "lojista123"}, timeout=20)
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["email"] == "lojista@zappyfood.com"
    assert u["role"] == "lojista"
    assert u["active_role"] == "lojista"


def test_login_entregador_role_and_active_role(s):
    r = s.post(f"{API}/auth/login",
               json={"email": "entregador@zappyfood.com", "password": "12345678900"}, timeout=20)
    # Entregador may not always be seeded; only assert if it exists
    if r.status_code == 404 or r.status_code == 401:
        pytest.skip("entregador demo account not present in this environment")
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u["role"] == "entregador"
    assert u["active_role"] == "entregador"
