# ZappyFood — PRD / Estado do Projeto

## Contexto
App de delivery (ZappyFood): backend **FastAPI** + frontend **Expo/React Native**.

## Tarefa concluída: Migração de banco MongoDB → Supabase (PostgreSQL)
- Objetivo: conectar o projeto ao Supabase e deixá-lo pronto para rodar em ambiente externo (fora do Emergent).
- Abordagem: camada de compatibilidade Mongo→Postgres (JSONB) em `backend/db.py`, sem reescrever a lógica de negócio (~1893 linhas). Cada coleção vira tabela `(_pk bigserial, data jsonb)`.
- `server.py` alterado apenas na inicialização (usa `DATABASE_URL`), startup/shutdown e `/api/health` (com ping ao banco).

## Arquivos-chave
- `backend/db.py` — camada Mongo→Postgres (asyncpg)
- `backend/.env.example` — variáveis (DATABASE_URL, JWT_SECRET, ...)
- `supabase/schema.sql` — schema JSONB + índices
- `docker-compose.yml` + `backend/Dockerfile` — execução local/externa
- `scripts/migrate_mongo_to_supabase.py` — migração opcional de dados
- `README-SUPABASE.md` — instruções de execução externa
- `backend/test_compat.py` (24 testes) e `backend/test_e2e.py` (fluxo completo)

## Validação
- 24/24 testes unitários da camada de compatibilidade (Postgres real).
- Fluxo E2E: login, lojas/produtos, pedido, ciclo de status ($set/$push), fidelidade ($inc), notificações, favoritos, avaliação — OK.

## Observações / Pendências
- Upload de imagens usa object storage gerenciado do Emergent (opcional; fora do escopo). Para deploy externo, trocar por S3/Supabase Storage.
- Credenciais Supabase (DATABASE_URL) devem ser fornecidas pelo usuário no `.env`.
- Testado com Postgres local; usuário deve validar com a connection string do Supabase dele.
