# Chariot v2

Student rideshare app for SJSU. Solo rebuild by Dylan Matthews.

## Stack
- App: Expo (React Native) + Expo Router, one codebase for iOS, Android and web
- Backend: Supabase (Postgres + PostGIS, Auth, Realtime). No custom server.
- Maps: react-native-maps on mobile, MapLibre on web

## MVP scope
1. SJSU-only sign-up (@sjsu.edu emails, enforced in the database)
2. Ride requests + matching (riders request, nearby drivers accept)
3. Live map + driver tracking
Payments come later.

## Database
Schema is in supabase/001_schema.sql: profiles, rides, driver_locations, RLS policies,
nearby_requests() and accept_ride() functions, Realtime on rides and driver_locations.

## How I want to work
- Go step by step and explain each new piece line by line. I want to understand
  everything well enough to explain it in an interview.
- One milestone at a time. Stop after each step so I can test it.
- No em dashes in docs or comments.

## Milestones
1. Database + auth (schema written, needs to run in Supabase)
2. App skeleton: Expo project, login, rider/driver home screens
3. Ride requests + matching
4. Live map + tracking
5. Polish + deploy (web on Vercel, mobile via Expo Go/TestFlight, README, demo video)
