# ZappyFood — Backend migrado para Supabase (PostgreSQL)

O backend FastAPI foi migrado de **MongoDB** para **Supabase Postgres**, mantendo
100% da lógica e dos contratos de API existentes (o app Expo não precisa de
mudanças de código, apenas apontar para a URL do backend).

## Como funciona a migração

O código continua usando uma API estilo Mongo (`db.users.find_one(...)`,
`db.orders.update_one(...)`, cursores com `.sort().to_list()`), mas agora tudo é
persistido no **PostgreSQL/Supabase** através de uma camada de compatibilidade
(`backend/db.py`). Cada "coleção" vira uma tabela com uma coluna `data jsonb`:

```
users, addresses, stores, products, orders,
store_couriers, notifications, uploads, coupons, chat
```

As tabelas e índices são criados automaticamente no startup (ou manualmente com
`supabase/schema.sql`). Como todas as datas já eram strings ISO e os ids são
UUIDs, o mapeamento é sem perdas.

Operadores suportados: `$set, $inc, $push, $unset, $in, $nin, $ne, $exists,
$regex/$options, $gt/$gte/$lt/$lte`, chaves aninhadas (`courier.id`), projeções
(inclusão/exclusão) e `sort`.

---

## 1) Configurar as credenciais do Supabase

1. Crie um projeto em https://supabase.com/dashboard
2. Clique em **Connect** → copie a **connection string** (prefira **Session pooler**, porta 5432)
3. Copie `backend/.env.example` para `backend/.env` e preencha:

```env
DATABASE_URL=postgresql://postgres.<ref>:<SUA-SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
JWT_SECRET=<gere com: openssl rand -hex 32>
# DB_SSL é ativado automaticamente para hosts *.supabase.com
```

(Opcional) Crie o schema manualmente colando `supabase/schema.sql` no SQL Editor do Supabase.

---

## 2) Rodar o backend

### Opção A — Local com Python

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

### Opção B — Docker (Postgres local embutido, sem Supabase para testar)

```bash
docker compose up --build
# backend em http://localhost:8000
```

Para usar o Supabase com Docker, defina `DATABASE_URL` num arquivo `.env` ao lado
do `docker-compose.yml` (e você pode remover o serviço `db`).

### Verificar a conexão

```bash
curl http://localhost:8000/api/health
# {"ok":true,"service":"zappyfood","database":"ok"}
```

Usuários demo criados no seed:
- cliente@zappyfood.com / cliente123
- lojista@zappyfood.com / lojista123
- entregador@zappyfood.com (login por CPF no fluxo do app)

---

## 3) Rodar o frontend (Expo)

```bash
cd frontend
yarn install    # ou npm install
# aponte para o backend:
export EXPO_PUBLIC_BACKEND_URL="http://<IP-do-backend>:8000"
yarn start
```

---

## 4) (Opcional) Migrar dados existentes do MongoDB

```bash
export MONGO_URL='mongodb://localhost:27017'
export DB_NAME='zappyfood'
export DATABASE_URL='postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:5432/postgres'
python scripts/migrate_mongo_to_supabase.py          # copia os dados
python scripts/migrate_mongo_to_supabase.py --wipe   # limpa o destino antes
```

---

## Testes de validação incluídos

- `backend/test_compat.py` — 24 testes unitários da camada Mongo→Postgres
- `backend/test_e2e.py` — fluxo ponta-a-ponta (login, pedido, ciclo de status, fidelidade, notificações)

```bash
cd backend && python test_compat.py        # requer um Postgres acessível
# e, com o servidor rodando:
B=http://127.0.0.1:8000/api python test_e2e.py
```

---

## Observação sobre upload de imagens

O upload de imagens (`/api/upload`) usa o **object storage gerenciado do Emergent**
(`EMERGENT_LLM_KEY` + `INTEGRATION_PROXY_URL`). Isso é **opcional** — o app roda
sem ele (apenas o upload falha). Para um deploy 100% externo, troque essa parte
por S3 ou Supabase Storage. Este item está **fora do escopo** da migração de banco.
