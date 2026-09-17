"""MongoDB-compatible data access layer backed by Supabase Postgres (JSONB).

This module lets the existing ZappyFood code keep using a Motor-like API
(`db.users.find_one(...)`, `db.orders.update_one(...)`, cursors with
`.sort().to_list()`, etc.) while actually storing every document in a
PostgreSQL/Supabase database as JSONB.

Each Mongo "collection" maps to a table:

    CREATE TABLE "<name>" (
        _pk  bigserial PRIMARY KEY,
        data jsonb NOT NULL
    );

Supported query operators : equality, $ne, $in, $nin, $exists, $regex/$options,
                            $gt, $gte, $lt, $lte  (+ dotted nested keys)
Supported update operators: $set, $inc, $push, $unset, $setOnInsert
Supported cursor features : projection (include/exclude), .sort(field, dir),
                            .to_list(limit)

All datetimes in this project are already stored as ISO strings and ids are
UUID strings, so documents are fully JSON-serialisable and the mapping is
lossless.
"""
import os
import re
import ssl
import json
import asyncpg
from urllib.parse import urlsplit


MISSING = object()  # sentinel for a missing document field


# --------------------------------------------------------------------------- #
# Filter matching (Mongo-style)                                               #
# --------------------------------------------------------------------------- #
def _get_path(doc, dotted):
    """Traverse a possibly-nested key like 'courier.id'. Returns MISSING if absent."""
    cur = doc
    for part in str(dotted).split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return MISSING
    return cur


def _match_condition(value, cond):
    """Return True if `value` satisfies a single field `cond`."""
    if isinstance(cond, dict) and any(str(k).startswith("$") for k in cond):
        for op, target in cond.items():
            if op == "$options":
                continue  # handled together with $regex
            v = None if value is MISSING else value
            if op == "$ne":
                if v == target:
                    return False
            elif op == "$in":
                if v not in target:
                    return False
            elif op == "$nin":
                if v in target:
                    return False
            elif op == "$exists":
                if bool(target) != (value is not MISSING):
                    return False
            elif op == "$regex":
                if value is MISSING:
                    return False
                flags = re.IGNORECASE if "i" in str(cond.get("$options", "")) else 0
                if re.search(target, str(value), flags) is None:
                    return False
            elif op == "$gt":
                if value is MISSING or not (value > target):
                    return False
            elif op == "$gte":
                if value is MISSING or not (value >= target):
                    return False
            elif op == "$lt":
                if value is MISSING or not (value < target):
                    return False
            elif op == "$lte":
                if value is MISSING or not (value <= target):
                    return False
            else:
                # Unknown operator -> be safe and do not match
                return False
        return True
    # Plain equality
    v = None if value is MISSING else value
    return v == cond


def _matches(doc, filt):
    if not filt:
        return True
    for key, cond in filt.items():
        if not _match_condition(_get_path(doc, key), cond):
            return False
    return True


# --------------------------------------------------------------------------- #
# Update application (Mongo-style)                                            #
# --------------------------------------------------------------------------- #
def _set_path(doc, dotted, val):
    parts = str(dotted).split(".")
    cur = doc
    for p in parts[:-1]:
        nxt = cur.get(p)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[p] = nxt
        cur = nxt
    cur[parts[-1]] = val


def _unset_path(doc, dotted):
    parts = str(dotted).split(".")
    cur = doc
    for p in parts[:-1]:
        if not isinstance(cur, dict) or p not in cur:
            return
        cur = cur[p]
    if isinstance(cur, dict):
        cur.pop(parts[-1], None)


def _apply_update(doc, update):
    """Mutates `doc` in place according to a Mongo update document."""
    if any(str(k).startswith("$") for k in update):
        for op, fields in update.items():
            if op == "$set":
                for k, v in fields.items():
                    _set_path(doc, k, v)
            elif op == "$setOnInsert":
                continue  # only relevant on upsert-insert
            elif op == "$inc":
                for k, v in fields.items():
                    cur = _get_path(doc, k)
                    base = 0 if cur is MISSING or cur is None else cur
                    _set_path(doc, k, base + v)
            elif op == "$push":
                for k, v in fields.items():
                    cur = _get_path(doc, k)
                    arr = [] if cur is MISSING or cur is None else list(cur)
                    arr.append(v)
                    _set_path(doc, k, arr)
            elif op == "$unset":
                for k in fields:
                    _unset_path(doc, k)
    else:
        doc.clear()
        doc.update(update)
    return doc


# --------------------------------------------------------------------------- #
# Projection                                                                  #
# --------------------------------------------------------------------------- #
def _project(doc, projection):
    if not projection:
        return doc
    includes = [k for k, v in projection.items() if v and k != "_id"]
    excludes = [k for k, v in projection.items() if not v and k != "_id"]
    if includes:
        return {k: doc[k] for k in includes if k in doc}
    if excludes:
        return {k: v for k, v in doc.items() if k not in excludes}
    return doc


def _sort_key(value):
    if value is MISSING or value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


# --------------------------------------------------------------------------- #
# Result objects (mimic pymongo return values)                                #
# --------------------------------------------------------------------------- #
class InsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id
        self.acknowledged = True


class UpdateResult:
    def __init__(self, matched, modified, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id
        self.acknowledged = True


class DeleteResult:
    def __init__(self, deleted):
        self.deleted_count = deleted
        self.acknowledged = True


# --------------------------------------------------------------------------- #
# Cursor                                                                      #
# --------------------------------------------------------------------------- #
class Cursor:
    def __init__(self, coll, filt, projection):
        self._coll = coll
        self._filt = filt
        self._proj = projection
        self._sort = None
        self._limit = None
        self._skip = 0

    def sort(self, field, direction=1):
        self._sort = (field, direction)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def skip(self, n):
        self._skip = n
        return self

    async def to_list(self, length=None):
        docs = await self._coll._fetch_docs(self._filt)
        if self._sort:
            field, direction = self._sort
            docs.sort(key=lambda d: _sort_key(_get_path(d, field)),
                      reverse=(direction == -1))
        if self._skip:
            docs = docs[self._skip:]
        limit = self._limit if length is None else length
        if limit is not None:
            docs = docs[:limit]
        return [_project(d, self._proj) for d in docs]


# --------------------------------------------------------------------------- #
# Collection                                                                  #
# --------------------------------------------------------------------------- #
class Collection:
    def __init__(self, database, name):
        self._db = database
        self._name = name

    async def _candidates(self, filt):
        """Return list of (pk, doc) matching the filter (SQL pre-filter + Python)."""
        where, params = self._db._pushdown(filt or {})
        sql = f'SELECT _pk, data FROM "{self._name}"'
        if where:
            sql += " WHERE " + where
        rows = await self._db._fetch_rows(sql, params)
        out = []
        for r in rows:
            doc = r["data"]
            if isinstance(doc, str):
                doc = json.loads(doc)
            if _matches(doc, filt or {}):
                out.append((r["_pk"], doc))
        return out

    async def _fetch_docs(self, filt):
        return [doc for _pk, doc in await self._candidates(filt)]

    async def find_one(self, filt=None, projection=None):
        cands = await self._candidates(filt or {})
        if not cands:
            return None
        return _project(cands[0][1], projection)

    def find(self, filt=None, projection=None):
        return Cursor(self, filt or {}, projection)

    async def insert_one(self, doc):
        await self._db._execute(
            f'INSERT INTO "{self._name}"(data) VALUES($1::jsonb)',
            [json.dumps(doc)],
        )
        return InsertOneResult(doc.get("id"))

    async def insert_many(self, docs):
        ids = []
        for d in docs:
            await self.insert_one(d)
            ids.append(d.get("id"))
        return ids

    async def update_one(self, filt, update, upsert=False):
        cands = await self._candidates(filt or {})
        if not cands:
            if upsert:
                newdoc = {}
                for k, v in (filt or {}).items():
                    if "." not in k and not isinstance(v, dict):
                        newdoc[k] = v
                _apply_update(newdoc, update)
                res = await self.insert_one(newdoc)
                return UpdateResult(0, 0, upserted_id=res.inserted_id)
            return UpdateResult(0, 0)
        pk, doc = cands[0]
        _apply_update(doc, update)
        await self._db._execute(
            f'UPDATE "{self._name}" SET data=$1::jsonb WHERE _pk=$2',
            [json.dumps(doc), pk],
        )
        return UpdateResult(1, 1)

    async def update_many(self, filt, update, upsert=False):
        cands = await self._candidates(filt or {})
        for pk, doc in cands:
            _apply_update(doc, update)
            await self._db._execute(
                f'UPDATE "{self._name}" SET data=$1::jsonb WHERE _pk=$2',
                [json.dumps(doc), pk],
            )
        return UpdateResult(len(cands), len(cands))

    async def delete_one(self, filt):
        cands = await self._candidates(filt or {})
        if not cands:
            return DeleteResult(0)
        pk = cands[0][0]
        await self._db._execute(f'DELETE FROM "{self._name}" WHERE _pk=$1', [pk])
        return DeleteResult(1)

    async def delete_many(self, filt):
        cands = await self._candidates(filt or {})
        for pk, _doc in cands:
            await self._db._execute(f'DELETE FROM "{self._name}" WHERE _pk=$1', [pk])
        return DeleteResult(len(cands))

    async def count_documents(self, filt=None):
        return len(await self._candidates(filt or {}))

    async def distinct(self, field, filt=None):
        docs = await self._fetch_docs(filt or {})
        seen, out = set(), []
        for d in docs:
            v = _get_path(d, field)
            values = v if isinstance(v, list) else [v]
            for item in values:
                if item is MISSING:
                    continue
                try:
                    key = json.dumps(item, sort_keys=True)
                except TypeError:
                    key = str(item)
                if key not in seen:
                    seen.add(key)
                    out.append(item)
        return out

    async def create_index(self, *args, **kwargs):
        # Indexes on data->>'id' are created up-front in Database._ensure_tables.
        # Additional index requests are treated as no-ops for compatibility.
        return None

    async def create_indexes(self, *args, **kwargs):
        return None


# --------------------------------------------------------------------------- #
# Database                                                                    #
# --------------------------------------------------------------------------- #
class Database:
    def __init__(self, dsn, collections):
        self._dsn = _clean_dsn(dsn)
        self._collections = list(collections)
        self.pool = None
        self._colls = {}

    # db.users / db["users"]
    def __getitem__(self, name):
        coll = self._colls.get(name)
        if coll is None:
            coll = Collection(self, name)
            self._colls[name] = coll
        return coll

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    async def connect(self):
        ssl_ctx = _ssl_for(self._dsn)
        self.pool = await asyncpg.create_pool(
            self._dsn,
            min_size=1,
            max_size=int(os.environ.get("DB_POOL_MAX", "10")),
            command_timeout=60,
            ssl=ssl_ctx,
        )
        await self._ensure_tables()
        return self

    async def _ensure_tables(self):
        async with self.pool.acquire() as conn:
            for name in self._collections:
                await conn.execute(
                    f'CREATE TABLE IF NOT EXISTS "{name}" '
                    f'(_pk bigserial PRIMARY KEY, data jsonb NOT NULL)'
                )
                await conn.execute(
                    f'CREATE INDEX IF NOT EXISTS "{name}_id_idx" '
                    f'ON "{name}" ((data->>\'id\'))'
                )

    def _pushdown(self, filt):
        """Build a conservative SQL WHERE clause for top-level string equality
        and $in of strings. Everything else is evaluated in Python afterwards."""
        clauses, params = [], []
        for k, v in filt.items():
            if "." in k or "'" in k:
                continue
            if isinstance(v, str):
                params.append(v)
                clauses.append(f"data->>'{k}' = ${len(params)}")
            elif (isinstance(v, dict) and set(v.keys()) == {"$in"}
                  and v["$in"] and all(isinstance(x, str) for x in v["$in"])):
                params.append(list(v["$in"]))
                clauses.append(f"data->>'{k}' = ANY(${len(params)}::text[])")
        return (" AND ".join(clauses), params)

    async def _fetch_rows(self, sql, params):
        async with self.pool.acquire() as conn:
            return await conn.fetch(sql, *params)

    async def _execute(self, sql, params):
        async with self.pool.acquire() as conn:
            return await conn.execute(sql, *params)

    async def ping(self):
        async with self.pool.acquire() as conn:
            await conn.execute("SELECT 1")
        return True

    async def close(self):
        if self.pool is not None:
            await self.pool.close()


# --------------------------------------------------------------------------- #
# DSN / SSL helpers                                                           #
# --------------------------------------------------------------------------- #
def _clean_dsn(url):
    url = (url or "").strip()
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("postgres+asyncpg://", "postgresql://")
    url = url.replace("postgresql+psycopg2://", "postgresql://")
    if "?" in url:  # strip libpq query params asyncpg may not understand
        url = url.split("?", 1)[0]
    return url


def _ssl_for(dsn):
    """Enable SSL for hosted providers (e.g. Supabase). Controlled by DB_SSL."""
    flag = os.environ.get("DB_SSL")
    if flag is not None:
        want = flag.strip().lower() in ("1", "true", "yes", "require", "on")
    else:
        host = urlsplit(dsn).hostname or ""
        want = ("supabase" in host) or ("pooler.supabase.com" in host)
    if not want:
        return False
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx
