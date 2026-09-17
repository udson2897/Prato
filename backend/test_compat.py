"""Standalone correctness test for the Mongo->Postgres JSONB compat layer.
Run:  cd /app/backend && python test_compat.py
"""
import os
import asyncio

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/zappyfood")
os.environ.setdefault("DB_SSL", "false")

from db import Database  # noqa: E402

PASS = 0
FAIL = 0


def check(name, cond):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS: {name}")
    else:
        FAIL += 1
        print(f"  FAIL: {name}")


async def main():
    db = Database(os.environ["DATABASE_URL"], ["users", "orders", "stores"])
    await db.connect()
    # clean slate
    async with db.pool.acquire() as c:
        for t in ("users", "orders", "stores"):
            await c.execute(f'TRUNCATE "{t}"')

    # ---- insert_one + find_one by id -------------------------------------
    await db.users.insert_one({"id": "u1", "email": "a@x.com", "role": "cliente",
                               "loyalty_points": 100, "favorites": ["p1", "p2"]})
    await db.users.insert_one({"id": "u2", "email": "b@x.com", "role": "lojista",
                               "loyalty_points": 0})
    u = await db.users.find_one({"id": "u1"})
    check("find_one by id", u and u["email"] == "a@x.com")

    # ---- projection: exclusion ------------------------------------------
    u = await db.users.find_one({"id": "u1"}, {"_id": 0, "favorites": 0})
    check("projection exclusion", u and "favorites" not in u and "email" in u)

    # ---- projection: inclusion ------------------------------------------
    u = await db.users.find_one({"id": "u1"}, {"_id": 0, "email": 1})
    check("projection inclusion", u == {"email": "a@x.com"})

    # ---- $inc ------------------------------------------------------------
    await db.users.update_one({"id": "u1"}, {"$inc": {"loyalty_points": 50}})
    u = await db.users.find_one({"id": "u1"})
    check("$inc", u["loyalty_points"] == 150)
    await db.users.update_one({"id": "u1"}, {"$inc": {"loyalty_points": -20}})
    u = await db.users.find_one({"id": "u1"})
    check("$inc negative", u["loyalty_points"] == 130)

    # ---- $set + matched_count -------------------------------------------
    r = await db.users.update_one({"id": "u1"}, {"$set": {"phone": "123"}})
    check("update_one matched_count", r.matched_count == 1)
    r = await db.users.update_one({"id": "nope"}, {"$set": {"phone": "x"}})
    check("update_one no match", r.matched_count == 0)

    # ---- $in -------------------------------------------------------------
    docs = await db.users.find({"id": {"$in": ["u1", "u2"]}}, {"_id": 0}).to_list(100)
    check("$in", len(docs) == 2)

    # ---- $ne -------------------------------------------------------------
    docs = await db.users.find({"role": {"$ne": "cliente"}}, {"_id": 0}).to_list(100)
    check("$ne", len(docs) == 1 and docs[0]["id"] == "u2")

    # ---- $regex + $options ----------------------------------------------
    await db.stores.insert_one({"id": "s1", "fantasy_name": "Pizza Place", "category": "Pizza", "status": "ABERTA"})
    await db.stores.insert_one({"id": "s2", "fantasy_name": "Burger Joint", "category": "Burger", "status": "FECHADA"})
    docs = await db.stores.find({"fantasy_name": {"$regex": "pizza", "$options": "i"}}).to_list(100)
    check("$regex case-insensitive", len(docs) == 1 and docs[0]["id"] == "s1")

    # ---- distinct --------------------------------------------------------
    cats = await db.stores.distinct("category")
    check("distinct", sorted(cats) == ["Burger", "Pizza"])

    # ---- $push -----------------------------------------------------------
    await db.orders.insert_one({"id": "o1", "customer_id": "u1", "store_id": "s1",
                                "status": "AGUARDANDO_CONFIRMACAO", "total": 55.0,
                                "created_at": "2025-06-01T10:00:00+00:00",
                                "status_history": [{"status": "AGUARDANDO_CONFIRMACAO"}],
                                "courier": {"id": "c1", "name": "Bob"}})
    await db.orders.insert_one({"id": "o2", "customer_id": "u1", "store_id": "s1",
                                "status": "ACEITO", "total": 30.0,
                                "created_at": "2025-06-02T10:00:00+00:00",
                                "status_history": []})
    await db.orders.update_one({"id": "o1"},
                               {"$set": {"status": "ACEITO"},
                                "$push": {"status_history": {"status": "ACEITO"}}})
    o = await db.orders.find_one({"id": "o1"})
    check("$push", len(o["status_history"]) == 2 and o["status"] == "ACEITO")

    # ---- nested dotted query --------------------------------------------
    docs = await db.orders.find({"courier.id": "c1"}).to_list(100)
    check("nested dotted query", len(docs) == 1 and docs[0]["id"] == "o1")

    # ---- $unset ----------------------------------------------------------
    await db.orders.update_one({"id": "o1"}, {"$unset": {"courier": ""}})
    o = await db.orders.find_one({"id": "o1"})
    check("$unset", "courier" not in o)

    # ---- sort desc + to_list limit --------------------------------------
    docs = await db.orders.find({"customer_id": "u1"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    check("sort desc", [d["id"] for d in docs] == ["o2", "o1"])
    docs = await db.orders.find({"customer_id": "u1"}).sort("created_at", 1).to_list(1)
    check("sort asc + limit", len(docs) == 1 and docs[0]["id"] == "o1")

    # ---- $exists ---------------------------------------------------------
    await db.orders.update_one({"id": "o1"}, {"$set": {"rating": 5}})
    docs = await db.orders.find({"rating": {"$exists": True}}, {"_id": 0, "rating": 1}).to_list(100)
    check("$exists true", len(docs) == 1 and docs[0] == {"rating": 5})

    # ---- count_documents -------------------------------------------------
    n = await db.orders.count_documents({"customer_id": "u1"})
    check("count_documents", n == 2)
    n = await db.orders.count_documents({})
    check("count_documents all", n == 2)

    # ---- update_many -----------------------------------------------------
    r = await db.orders.update_many({"customer_id": "u1"}, {"$set": {"seen": True}})
    check("update_many", r.modified_count == 2)
    docs = await db.orders.find({"seen": True}).to_list(100)
    check("update_many effect", len(docs) == 2)

    # ---- delete_one ------------------------------------------------------
    await db.orders.delete_one({"id": "o2"})
    n = await db.orders.count_documents({})
    check("delete_one", n == 1)

    # ---- $in with None (seed idempotency pattern) -----------------------
    await db.stores.update_one({"id": "s1", "address_text": {"$in": [None, ""]}},
                               {"$set": {"address_text": "Rua X"}})
    s = await db.stores.find_one({"id": "s1"})
    check("$in None matches missing field", s.get("address_text") == "Rua X")

    # ---- create_index no-op ---------------------------------------------
    await db.users.create_index("email", unique=True)
    check("create_index no-op", True)

    await db.close()
    print(f"\nRESULT: {PASS} passed, {FAIL} failed")
    raise SystemExit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
