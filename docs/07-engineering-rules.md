# 07. Engineering Rules

## Stack Lock

- Frontend: React + TypeScript + Vite
- Backend: NestJS + TypeScript + Prisma
- DB: PostgreSQL
- Realtime: Socket.IO

## Code Standards

- TypeScript strict mode enabled
- ESLint + Prettier required
- API DTO validation on all write endpoints
- No `any` unless documented exception

## Time and Locale

- Persist timestamps in UTC
- Display timezone configurable in frontend

## Environment Variables

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `AMAP_WEB_SERVICE_KEY` (if server-side map APIs used)
- `REDIS_URL` (optional)

Frontend:

- `VITE_AMAP_JS_KEY`
- `VITE_API_BASE_URL`
- `VITE_SOCKET_URL`

## Performance Targets (MVP)

- Marker list fetch p95 < 500ms (excluding network variance)
- Realtime fan-out in room up to 20 concurrent members
- Map interactions remain usable with 1000 markers in room

## Security Baseline

- Validate room membership for all room-scoped APIs
- Rate limit join/create endpoints
- Restrict AMap key by domain and security config
