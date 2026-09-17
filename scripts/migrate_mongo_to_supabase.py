"""Optional one-off data migration: MongoDB -> Supabase Postgres (JSONB).

Usage:
    export MONGO_URL='mongodb://localhost:27017'
    export DB_NAME='zappyfood'
    export DATABASE_URL='postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:5432/postgres'
    python scripts/migrate_mongo_to_supabase.py

It copies every document from each collection into the matching Postgres table,
stripping Mongo's internal _id (the app uses its own UUID `id` field).
Safe to re-run: pass --wipe to truncate target tables first.
"""
import os
import sys
import json
import asyncio

import asyncpg
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from db import _clean_dsn, _ssl_for  # noqa: E402

COLLECTIONS = [
    "users", "addresses", "stores", "products", "orders",
    "store_couriers", "notifications", "uploads", "coupons", "chat",
]


async def main(wipe=False):
    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    mdb = mongo[os.environ["DB_NAME"]]
    dsn = _clean_dsn(os.environ["DATABASE_URL"])
    pg = await asyncpg.create_pool(dsn, ssl=_ssl_for(dsn))

    async with pg.acquire() as conn:
        for name in COLLECTIONS:
            await conn.execute(
                f'CREATE TABLE IF NOT EXISTS "{name}" '
                f'(_pk bigserial PRIMARY KEY, data jsonb NOT NULL)'
            )
            if wipe:
                await conn.execute(f'TRUNCATE "{name}"')

            docs = await mdb[name].find({}, {"_id": 0}).to_list(None)
            count = 0
            for doc in docs:
                await conn.execute(
                    f'INSERT INTO "{name}"(data) VALUES($1::jsonb)',
                    json.dumps(doc, default=str),
                )
                count += 1
            print(f"  {name}: migrated {count} documents")

    await pg.close()
    mongo.close()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main(wipe="--wipe" in sys.argv))
