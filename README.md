# Multi-user Trip Planner Spec Pack

This repository contains an execution-ready documentation pack for building a
multi-user trip planning system with map markers, collaborative planning,
voting, and real-time sync.

## Recommended Order

1. Read `docs/00-project-charter.md`
2. Lock scope in `docs/01-scope-and-milestones.md`
3. Finalize contracts:
   - `docs/02-api-spec.md`
   - `docs/03-realtime-events.md`
   - `docs/04-data-model-prisma.md`
4. Confirm interaction behavior in `docs/05-page-specs.md`
5. Validate with `docs/06-acceptance-tests.md`
6. Apply implementation constraints from `docs/07-engineering-rules.md`

## Run Backend with PostgreSQL

1. Copy `apps/server/.env.example` to `apps/server/.env`
2. Update `DATABASE_URL` to your Docker PostgreSQL instance
3. Run migration:

```bash
npm run prisma:migrate -w apps/server
```

4. Start backend:

```bash
npm run dev:server
```

## Status

- [ ] Product scope finalized
- [ ] API contract frozen
- [ ] DB schema frozen
- [ ] Realtime protocol frozen
- [ ] Acceptance tests approved
