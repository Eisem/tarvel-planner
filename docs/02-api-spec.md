# 02. API Spec (Execution Contract)

Base URL: `/api/v1`

Auth (MVP): `Authorization: Bearer <memberToken>`

Response envelope:

```json
{
  "code": "OK",
  "message": "success",
  "data": {},
  "requestId": "uuid"
}
```

Error envelope:

```json
{
  "code": "ROOM_NOT_FOUND",
  "message": "room does not exist",
  "data": null,
  "requestId": "uuid"
}
```

## 2.1 Room

### POST /rooms

Create room and owner member.

Request:

```json
{
  "roomName": "Tokyo Trip",
  "nickname": "Mary"
}
```

Response `data`:

```json
{
  "roomId": "room_xxx",
  "roomCode": "A8K21P",
  "memberId": "mem_xxx",
  "memberToken": "jwt"
}
```

### POST /rooms/join

Request:

```json
{
  "roomCode": "A8K21P",
  "nickname": "Tom"
}
```

Response `data`: same shape as create room.

### GET /rooms/:roomCode

Returns room profile and current status.

### PATCH /rooms/:roomCode/status

Owner-only state transition.

Request:

```json
{
  "toStatus": "PLANNING"
}
```

Allowed: `MARKING -> PLANNING -> VOTING -> FINISHED`

## 2.2 Member

### GET /rooms/:roomCode/members

List members with role and color.

## 2.3 Marker

### POST /rooms/:roomId/markers

Request:

```json
{
  "placeName": "Tokyo Tower",
  "poiId": "B0FFG9",
  "lng": 139.7454,
  "lat": 35.6586,
  "address": "4 Chome-2-8 Shibakoen",
  "budget": 300,
  "purpose": "night view",
  "expectedDurationMinutes": 90,
  "priority": "HIGH",
  "note": "take photos"
}
```

### GET /rooms/:roomId/markers

Query params:

- `memberId` optional
- `priority` optional
- `minBudget` optional
- `maxBudget` optional

### PATCH /markers/:markerId

Editable by owner marker member (or owner role if enabled).

### DELETE /markers/:markerId

Soft delete recommended (`deletedAt`).

## 2.4 Plan

### POST /rooms/:roomId/plans

Request:

```json
{
  "title": "Mary 3-day plan",
  "description": "city + food focus"
}
```

### GET /rooms/:roomId/plans

List all plans with summary counts.

### PATCH /plans/:planId

Update title/description/status.

## 2.5 PlanItem

### POST /plans/:planId/items

Request:

```json
{
  "markerId": "marker_xxx",
  "dayIndex": 1,
  "startTime": "2026-07-03T09:00:00Z",
  "endTime": "2026-07-03T10:30:00Z",
  "orderIndex": 1,
  "transportMode": "WALK",
  "note": "arrive early"
}
```

### PATCH /plan-items/:id

Supports drag/resize updates of start/end/order.

### DELETE /plan-items/:id

Remove item from plan.

## 2.6 Vote

### POST /plans/:planId/vote

Behavior: upsert by `(roomId, memberId)`.

Response `data`:

```json
{
  "planId": "plan_1",
  "roomId": "room_1",
  "memberId": "mem_1"
}
```

### GET /rooms/:roomId/vote-result

Response includes ranked plans, counts, and tie state.

## 2.7 Error Codes

- `ROOM_NOT_FOUND`
- `ROOM_STATUS_INVALID`
- `MEMBER_NOT_FOUND`
- `FORBIDDEN_ACTION`
- `MARKER_NOT_FOUND`
- `PLAN_NOT_FOUND`
- `PLAN_ITEM_NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT_VERSION`
- `INTERNAL_ERROR`
