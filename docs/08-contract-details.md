# 08. Contract Details (DTO / Errors / Status Copy)

This file is the implementation-ready supplement to API and page specs.

## 8.1 DTO Checklist

## Room

### CreateRoomRequestDto

```ts
type CreateRoomRequestDto = {
  roomName?: string;      // optional, 1..50 chars if provided
  nickname: string;       // required, 1..24 chars
  timezone?: string;      // optional IANA timezone, default "Asia/Shanghai"
};
```

### CreateRoomResponseDto

```ts
type CreateRoomResponseDto = {
  roomId: string;
  roomCode: string;
  roomStatus: "MARKING" | "PLANNING" | "VOTING" | "FINISHED";
  timezone: string;
  memberId: string;
  memberRole: "OWNER" | "MEMBER";
  memberToken: string;
};
```

### JoinRoomRequestDto

```ts
type JoinRoomRequestDto = {
  roomCode: string;       // 6..12 uppercase letters/numbers
  nickname: string;       // required, unique in room
};
```

### JoinRoomResponseDto

```ts
type JoinRoomResponseDto = {
  roomId: string;
  roomCode: string;
  roomStatus: "MARKING" | "PLANNING" | "VOTING" | "FINISHED";
  timezone: string;
  memberId: string;
  memberRole: "OWNER" | "MEMBER";
  memberToken: string;
};
```

### UpdateRoomStatusRequestDto

```ts
type UpdateRoomStatusRequestDto = {
  toStatus: "MARKING" | "PLANNING" | "VOTING" | "FINISHED";
};
```

## Member

### MemberDto

```ts
type MemberDto = {
  memberId: string;
  nickname: string;
  color: string;          // hex color
  role: "OWNER" | "MEMBER";
  online: boolean;
  joinedAt: string;       // ISO UTC
};
```

## Marker

### CreateMarkerRequestDto

```ts
type CreateMarkerRequestDto = {
  placeName: string;                 // required, 1..120
  poiId?: string;                    // optional AMap POI id
  lng: number;                       // -180..180
  lat: number;                       // -90..90
  address?: string;
  budget?: number;                   // >= 0
  purpose?: string;                  // <= 300
  expectedDurationMinutes?: number;  // 1..1440
  priority?: "LOW" | "MEDIUM" | "HIGH";
  note?: string;                     // <= 1000
};
```

### UpdateMarkerRequestDto

```ts
type UpdateMarkerRequestDto = Partial<CreateMarkerRequestDto>;
```

### MarkerDto

```ts
type MarkerDto = {
  markerId: string;
  roomId: string;
  memberId: string;
  placeName: string;
  poiId?: string;
  placeKey: string;
  lng: number;
  lat: number;
  address?: string;
  budget?: number;
  purpose?: string;
  expectedDurationMinutes?: number;
  priority: "LOW" | "MEDIUM" | "HIGH";
  note?: string;
  createdAt: string;
  updatedAt: string;
};
```

## Plan

### CreatePlanRequestDto

```ts
type CreatePlanRequestDto = {
  title: string;          // 1..80
  description?: string;   // <= 2000
};
```

### PlanDto

```ts
type PlanDto = {
  planId: string;
  roomId: string;
  creatorMemberId: string;
  title: string;
  description?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
};
```

## PlanItem

### CreatePlanItemRequestDto

```ts
type CreatePlanItemRequestDto = {
  markerId: string;
  dayIndex: number;       // >= 1
  startTime: string;      // ISO UTC
  endTime: string;        // ISO UTC, > startTime
  orderIndex?: number;    // default assigned by service
  transportMode?: "WALK" | "TAXI" | "BUS" | "DRIVE";
  note?: string;
};
```

### UpdatePlanItemRequestDto

```ts
type UpdatePlanItemRequestDto = {
  dayIndex?: number;
  startTime?: string;
  endTime?: string;
  orderIndex?: number;
  transportMode?: "WALK" | "TAXI" | "BUS" | "DRIVE";
  note?: string;
};
```

### PlanItemDto

```ts
type PlanItemDto = {
  planItemId: string;
  planId: string;
  markerId: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  orderIndex: number;
  transportMode: "WALK" | "TAXI" | "BUS" | "DRIVE";
  note?: string;
  version: number;
};
```

## Vote

### VotePlanRequestDto

```ts
type VotePlanRequestDto = {
  // path param planId is source of truth
};
```

### VoteResultItemDto

```ts
type VoteResultItemDto = {
  planId: string;
  title: string;
  voteCount: number;
  isBest: boolean;
  isTied: boolean;
};
```

## 8.2 Error Code Details

`code` is stable for programmatic handling. `message` can be localized later.

- `OK`: success
- `VALIDATION_ERROR`: request failed schema/rule checks
- `UNAUTHORIZED`: missing/invalid token
- `FORBIDDEN_ACTION`: role/ownership rule denied
- `ROOM_NOT_FOUND`: roomCode/roomId not found
- `ROOM_STATUS_INVALID`: invalid state transition
- `ROOM_CODE_INVALID`: roomCode format invalid
- `NICKNAME_CONFLICT`: nickname already exists in room
- `MEMBER_NOT_FOUND`: member missing in context
- `MARKER_NOT_FOUND`: marker not found or soft-deleted
- `PLAN_NOT_FOUND`: plan missing
- `PLAN_ITEM_NOT_FOUND`: plan item missing
- `VOTE_NOT_ALLOWED`: vote blocked by business policy
- `TIME_RANGE_INVALID`: endTime <= startTime
- `CONFLICT_VERSION`: optimistic lock conflict (reserved for v1.1)
- `RATE_LIMITED`: too many requests
- `INTERNAL_ERROR`: unhandled server error

Recommended HTTP mapping:

- `OK` -> 200/201
- `VALIDATION_ERROR` -> 400
- `UNAUTHORIZED` -> 401
- `FORBIDDEN_ACTION` -> 403
- `*_NOT_FOUND` -> 404
- `NICKNAME_CONFLICT`, `CONFLICT_VERSION` -> 409
- `RATE_LIMITED` -> 429
- `INTERNAL_ERROR` -> 500

## 8.3 UI Status Copy (Chinese)

Use short and consistent text in MVP.

## Generic

- loading: `加载中...`
- retry: `重试`
- save_success: `保存成功`
- save_failed: `保存失败，请重试`
- network_error: `网络异常，请检查连接`

## Room

- room_create_success: `房间已创建`
- room_join_success: `已加入房间`
- room_not_found: `房间不存在，请检查房间码`
- nickname_conflict: `昵称已被占用，请换一个`

## Marker

- marker_create_success: `地点已添加`
- marker_update_success: `地点已更新`
- marker_delete_success: `地点已删除`
- marker_permission_denied: `你只能编辑自己的标点`
- geocode_fallback_name: `未命名地点`

## Plan

- plan_create_success: `方案已创建`
- plan_item_create_success: `行程已安排`
- plan_item_update_success: `行程已更新`
- plan_remote_updated: `方案已被其他成员更新`

## Vote

- vote_success: `投票成功`
- vote_changed: `已改投`
- vote_tied: `当前并列第一，等待房主确认`
- vote_best_marked: `当前最高票方案`

## 8.4 Backend Normalization Rules

- Trim all string fields before validation.
- Empty string in optional fields should be normalized to `null`.
- `priority` default is `MEDIUM`.
- `placeKey` generation:
  - if `poiId` exists: `poi:${poiId}`
  - else: `geo:${lng.toFixed(4)},${lat.toFixed(4)}`
- `roomCode` normalization: uppercase.
