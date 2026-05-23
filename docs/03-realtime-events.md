# 03. Realtime Events (Socket Contract)

Transport: Socket.IO

Room channel: `room:{roomCode}`

## 3.1 Client -> Server

### room.join

```json
{
  "roomCode": "A8K21P",
  "memberId": "mem_xxx",
  "token": "jwt"
}
```

### room.leave

```json
{
  "roomCode": "A8K21P",
  "memberId": "mem_xxx"
}
```

## 3.2 Server -> Clients

Envelope:

```json
{
  "eventId": "uuid",
  "event": "marker.created",
  "roomCode": "A8K21P",
  "operatorMemberId": "mem_xxx",
  "payload": {},
  "timestamp": "2026-05-23T12:00:00Z",
  "version": 1
}
```

Events:

- `member.joined`
- `member.left`
- `marker.created`
- `marker.updated`
- `marker.deleted`
- `plan.created`
- `plan.updated`
- `plan.deleted`
- `planItem.created`
- `planItem.updated`
- `planItem.deleted`
- `vote.updated`

## 3.3 Idempotency Rules

- Frontend keeps a short-lived `eventId` cache (e.g., 2-5 minutes)
- Duplicate `eventId` is ignored
- If `version` is older than local entity version, ignore event

## 3.4 Reconnect Strategy

- On reconnect, emit `room.join`
- Immediately request latest snapshots:
  - markers
  - plans + plan items
  - vote results
