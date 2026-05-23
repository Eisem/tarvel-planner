# 01. Scope and Milestones

## Decision Log (v1.0-frozen)

Frozen at: 2026-05-23

1. Mobile scope (MVP): A
   - Mobile supports browsing + basic form operations.
   - Full drag scheduling UX on mobile is out of MVP scope.

2. Permission strictness (MVP): A
   - Loose permissions in MVP: most stages remain editable.
   - Stage-based hard lock is deferred.

3. Login requirement: A
   - Anonymous nickname entry is allowed.
   - No mandatory account login in MVP.

4. Nickname uniqueness: A
   - Nickname must be unique within a room.

5. Marker edit permissions: A
   - Marker creator can edit/delete own marker.
   - Room owner can manage all markers.

6. Voting rule: A
   - One active vote per member per room.
   - Vote can be changed (upsert behavior).

7. Tie handling: A
   - Highest tied plans are marked tied.
   - Room owner confirms final winner manually.

8. Route capability (MVP): A
   - Route preview uses straight polyline only.
   - Real road routing is deferred.

9. Concurrency strategy (PlanItem): A
   - Last write wins in MVP.
   - Client shows "plan updated" notification on remote overwrite.

10. Timezone strategy: A
   - Persist all datetime values in UTC.
   - Frontend renders using room timezone.

## MVP Scope (Must Have)

1. Room create/join with nickname
2. Personal marker creation/editing
3. Room-level marker aggregation and map display
4. Plan creation with calendar scheduling
5. Vote per member (single active vote)
6. Realtime updates via Socket.IO

## Out of Scope (MVP)

- Real road routing (use polyline straight lines)
- Advanced conflict merge UI
- Mobile-first drag interactions
- Payment/account system

## Milestones

### M1: Room + Marker Basics

- Create/join room
- Marker CRUD
- Member color distinction

### M2: Aggregation + Realtime Marker Sync

- Place grouping strategy (poiId/name+address/geo threshold)
- Aggregated marker rendering
- Realtime marker events

### M3: Plan Scheduling

- Create plan
- Drag place into calendar
- Resize/move schedule blocks
- Draw route polylines by day

### M4: Voting + Finalization

- Vote submit/change
- Vote count updates
- Tie handling + owner final decision

## Definition of Done (Global)

- End-to-end path is functional across all pages
- API contract and payloads match docs exactly
- DB constraints enforce business rules
- Realtime events are idempotent on frontend consumption
- Acceptance tests in `06-acceptance-tests.md` all pass
