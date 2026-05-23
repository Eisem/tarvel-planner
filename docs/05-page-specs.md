# 05. Page Interaction Specs

## 5.1 Home (`/`)

Functions:

- Create room
- Join room

States:

- Loading submit
- Invalid room code
- Nickname conflict

Actions:

1. User submits create form -> `POST /rooms`
2. Save member token -> route to `/rooms/:roomCode/mark`

## 5.2 Mark Page (`/rooms/:roomCode/mark`)

Layout:

- Map canvas
- Search box
- Marker editor modal
- Personal marker list

Actions:

1. Search POI -> select result -> open marker editor prefilled
2. Map click -> reverse geocode -> open marker editor
3. Save marker -> API create -> realtime broadcast updates other members

Error handling:

- Save fails: keep modal values, show retry
- Geocode fails: fallback name `Dropped Pin`

## 5.3 Room Map (`/rooms/:roomCode/map`)

Layout:

- Full map with filter toolbar
- Aggregated marker popup panel

Actions:

1. Fetch all markers
2. Group by place strategy
3. Render single marker or aggregated marker with count badge

## 5.4 Plan Page (`/rooms/:roomCode/plans`)

Layout:

- Place pool (left)
- Weekly calendar (center)
- Plan summary + route map (right/bottom)

Actions:

1. Create new plan
2. Drag place card into calendar slot -> create PlanItem
3. Drag/resize calendar event -> update PlanItem
4. Recompute day route polyline after update

Conflict behavior (MVP):

- Last write wins
- Show toast when remote update arrives for same plan

## 5.5 Vote Page (`/rooms/:roomCode/vote`)

Layout:

- Plan cards with vote button
- Ranking list

Actions:

1. User votes one plan -> upsert vote
2. Refresh ranking via realtime `vote.updated` or API pull
3. Highlight best plan; on tie show `Tied #1`
