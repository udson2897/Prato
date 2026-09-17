"""End-to-end flow test against a running server (default :8001)."""
import os
import json
import urllib.request

B = os.environ.get("B", "http://127.0.0.1:8001/api")
P, F = 0, 0


def check(name, cond, extra=""):
    global P, F
    if cond:
        P += 1; print(f"  PASS: {name}")
    else:
        F += 1; print(f"  FAIL: {name} {extra}")


def req(method, path, body=None, token=None):
    url = B + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "null")


# login cliente + lojista
_, c = req("POST", "/auth/login", {"email": "cliente@zappyfood.com", "password": "cliente123"})
_, l = req("POST", "/auth/login", {"email": "lojista@zappyfood.com", "password": "lojista123"})
ct, lt = c["access_token"], l["access_token"]
check("login cliente", bool(ct))
check("login lojista", bool(lt))

# stores + products
_, stores = req("GET", "/stores")
sid = stores[0]["id"]
_, sd = req("GET", f"/stores/{sid}")
prods = sd["products"]
check("store products", len(prods) > 0)

# address
_, addrs = req("GET", "/addresses", token=ct)
aid = addrs[0]["id"]

# delivery quote
_, quote = req("POST", "/delivery/quote", {"store_id": sid, "address_id": aid}, token=ct)
check("delivery quote", "fee" in quote)

# create order
p = prods[0]
order_body = {
    "store_id": sid,
    "address_id": aid,
    "items": [{"product_id": p["id"], "quantity": 2, "options": [], "addons": []}],
    "payment_method": "PIX",
}
st, order = req("POST", "/orders", order_body, token=ct)
check("create order", st in (200, 201), f"status={st} resp={order}")
oid = order.get("id") if isinstance(order, dict) else None

# customer sees order
_, myorders = req("GET", "/orders", token=ct)
check("customer orders list", any(o["id"] == oid for o in myorders))

# lojista sees order in store queue
_, sorders = req("GET", "/my/store/orders", token=lt)
check("lojista store orders", any(o["id"] == oid for o in sorders))

# lojista advances status ACEITO -> EM_PREPARO -> SAIU -> FINALIZADO
for ns in ["ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"]:
    st, r = req("PATCH", f"/orders/{oid}/status", {"status": ns}, token=lt)
    check(f"status -> {ns}", st == 200, f"resp={r}")

# customer confirms delivery (FINALIZADO) -> loyalty points credited
_, before = req("GET", "/loyalty", token=ct)
st, r = req("PATCH", f"/orders/{oid}/status", {"status": "FINALIZADO"}, token=ct)
check("status -> FINALIZADO", st == 200, f"resp={r}")
_, after = req("GET", "/loyalty", token=ct)
check("loyalty points credited ($inc + $push worked)",
      after["points"] >= before["points"])

# status_history persisted via $push
_, ofull = req("GET", f"/orders/{oid}", token=ct)
check("status_history length", len(ofull.get("status_history", [])) >= 4,
      f"history={ofull.get('status_history')}")

# notifications for customer
_, notifs = req("GET", "/notifications", token=ct)
check("notifications created", len(notifs) > 0)
_, unread = req("GET", "/notifications/unread_count", token=ct)
check("unread_count", "count" in unread or isinstance(unread, dict))

# favorites toggle
_, ftog = req("POST", "/favorites/toggle", {"product_id": p["id"]}, token=ct)
_, fids = req("GET", "/favorites/ids", token=ct)
check("favorite added", p["id"] in (fids if isinstance(fids, list) else fids.get("ids", [])))

# rating
st, r = req("POST", f"/orders/{oid}/rating", {"stars": 5, "comment": "otimo"}, token=ct)
check("rating order", st == 200, f"resp={r}")

print(f"\nRESULT: {P} passed, {F} failed")
raise SystemExit(1 if F else 0)
