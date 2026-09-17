"""Iteration 12: Test DELETE /api/my/couriers/{courier_id} removes a courier link.

Bug context: On the lojista courier panel, removing a courier used Alert.alert
with buttons which does not fire onPress on RN Web. The fix uses an in-app Modal.
The backend endpoint already worked; we validate it here and ensure the list
reflects the removal.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://delivery-saas-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

LOJISTA = {"email": "lojista@zappyfood.com", "password": "lojista123"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def lojista_tok(s):
    r = s.post(f"{API}/auth/login", json=LOJISTA, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register_courier(s):
    """Register a temporary TEST_ courier and return (user, tokens)."""
    cpf = "".join([str((i * 7 + 3) % 10) for i in range(11)])
    # ensure unique cpf using random
    cpf = "".join([str(uuid.uuid4().int % 10) for _ in range(11)])
    payload = {
        "name": f"TEST_Rem {uuid.uuid4().hex[:6]}",
        "cpf": cpf,
        "plate": "TST0000",
        "renavam": "0" * 11,
    }
    r = s.post(f"{API}/courier/register", json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    return data["user"], data


# ============== Setup: invite a fresh courier ==============
@pytest.fixture(scope="module")
def linked_courier(s, lojista_tok):
    """Create a courier, have lojista invite them, and accept so status='accepted'."""
    courier_user, ctokens = _register_courier(s)
    code = courier_user["courier_code"]
    # invite
    r = s.post(f"{API}/my/couriers/invite", json={"courier_code": code}, headers=auth(lojista_tok))
    assert r.status_code == 200, r.text
    # find the pending invite as the courier and accept it
    inv = s.get(f"{API}/courier/me/invites", headers={"Authorization": f"Bearer {ctokens['access_token']}"}).json()
    assert isinstance(inv, list) and len(inv) >= 1
    link_id = inv[0]["id"]
    r2 = s.post(
        f"{API}/courier/me/invites/{link_id}/respond",
        json={"accept": True},
        headers={"Authorization": f"Bearer {ctokens['access_token']}"},
    )
    assert r2.status_code == 200
    return courier_user


def test_courier_in_list_before_remove(s, lojista_tok, linked_courier):
    r = s.get(f"{API}/my/couriers", headers=auth(lojista_tok))
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert linked_courier["id"] in ids, f"Newly linked courier not in list: {ids}"
    entry = next(c for c in r.json() if c["id"] == linked_courier["id"])
    assert entry["status"] == "accepted"


def test_delete_courier_link_returns_ok(s, lojista_tok, linked_courier):
    r = s.delete(f"{API}/my/couriers/{linked_courier['id']}", headers=auth(lojista_tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True


def test_courier_not_in_list_after_remove(s, lojista_tok, linked_courier):
    r = s.get(f"{API}/my/couriers", headers=auth(lojista_tok))
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert linked_courier["id"] not in ids, (
        f"Removed courier still in list: {linked_courier['id']} present in {ids}"
    )


def test_delete_courier_idempotent(s, lojista_tok, linked_courier):
    """Second DELETE on same courier should still return 200 with ok:true (no-op)."""
    r = s.delete(f"{API}/my/couriers/{linked_courier['id']}", headers=auth(lojista_tok))
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_delete_courier_requires_lojista(s, linked_courier):
    # Register a cliente and confirm they can't call the endpoint
    email = f"TEST_cli_{uuid.uuid4().hex[:6]}@example.com"
    reg = s.post(f"{API}/auth/register", json={
        "name": "TEST Cli", "email": email, "password": "abc12345", "role": "cliente"
    }).json()
    r = s.delete(
        f"{API}/my/couriers/{linked_courier['id']}",
        headers={"Authorization": f"Bearer {reg['access_token']}"},
    )
    assert r.status_code == 403


def test_delete_courier_unauthenticated(s, linked_courier):
    r = s.delete(f"{API}/my/couriers/{linked_courier['id']}")
    assert r.status_code == 401
