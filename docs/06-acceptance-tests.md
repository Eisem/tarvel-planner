# 06. Acceptance Test Cases

Format: Given / When / Then

## A. Room

1. Given valid nickname, when create room, then returns roomCode and memberToken.
2. Given existing roomCode, when join with new nickname, then join succeeds.
3. Given invalid roomCode, when join, then returns `ROOM_NOT_FOUND`.

## B. Marker

4. Given joined member, when create marker with POI, then marker visible to all room members.
5. Given marker owner, when edit marker fields, then update is persisted and broadcast.
6. Given non-owner, when edit marker, then returns `FORBIDDEN_ACTION`.
7. Given no POI, when map click create marker, then address fallback is saved.
8. Given same place via different users, when fetching room map, then markers aggregate.

## C. Plan

9. Given room markers exist, when create plan, then plan appears in list.
10. Given a plan, when add plan item by drag action, then calendar event appears.
11. Given a plan item, when resize end time, then new endTime persists.
12. Given a plan item, when drag to another day, then dayIndex and time persist.
13. Given plan items sorted by time, when map rerenders, then polyline follows same order.

## D. Vote

14. Given member has not voted, when vote plan A, then count(A)+1.
15. Given member voted plan A, when change vote to plan B, then count(A)-1 and count(B)+1.
16. Given tie highest counts, when fetch result, then tied plans marked tied.

## E. Realtime

17. Given two members online, when one creates marker, then second sees it within 1s target.
18. Given connection drop, when reconnect and rejoin, then client recovers latest snapshot.
19. Given duplicate event delivery, when frontend processes eventId, then duplicate ignored.

## F. State and Permissions

20. Given room status MARKING, when owner transitions to PLANNING, then transition succeeds.
21. Given room status FINISHED, when normal member edits plan, then blocked by policy.
