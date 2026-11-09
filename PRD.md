# Chariot v2: Product Requirements Document

Status: Draft for review
Owner: Dylan Matthews
Last updated: Nov 9, 2026

## 1. Summary

Chariot is a rideshare app only for San Jose State University students. A student who needs a ride requests one from a campus location, a nearby student driver accepts it, and the rider watches the driver approach on a live map. Because every user has a verified @sjsu.edu email, riders and drivers know they are traveling with fellow students.

One codebase (Expo + React Native) ships to iOS, Android and web. Supabase provides the database, auth and realtime updates, so there is no custom server.

## 2. Problem

- Getting around campus and to nearby housing, transit and jobs is hard without a car, and commercial rideshare is expensive for short trips.
- Many students already drive to campus and have empty seats, but there is no trusted way to connect them with riders.
- Students are more comfortable riding with someone verified as a fellow SJSU student than with a stranger.

## 3. Goals and non-goals

### Goals (MVP)
1. Only people with a verified @sjsu.edu email can create an account.
2. A rider can request a ride between two locations in a few taps.
3. Drivers see nearby open requests and can accept one. Two drivers can never accept the same ride.
4. After a driver accepts, the rider sees the driver's live location on a map.
5. The app works on iOS, Android and web from one codebase.

### Non-goals (MVP)
- Payments or tipping (planned for later)
- Ratings and reviews
- In-app chat or calling
- Scheduled rides (rides are on demand only)
- Ride pooling with multiple riders
- Background location tracking while the app is closed
- Address search or geocoding (a fixed list of campus locations is used instead)
- Admin dashboard

## 4. Users

| Persona | Description |
| --- | --- |
| Rider | An SJSU student who needs a short ride on or near campus. |
| Driver | An SJSU student with a car who is willing to give rides. |

A single account can be a rider or a driver. The role is picked during onboarding and can be changed in the profile.

## 5. User stories

### Account
- As a student, I can sign up with my @sjsu.edu email and a 6-digit code so I do not need a password.
- As a non-SJSU user, I am blocked from signing up with a clear error message.
- As a new user, I enter my name and choose whether I am a rider or a driver.
- As a driver, I enter my car description (make, color, plate) and number of seats.
- As a user, I stay signed in until I sign out.

### Rider
- As a rider, I pick a pickup and a dropoff from a list of campus locations, or use my current location as pickup.
- As a rider, I submit a request and see that it is waiting for a driver.
- As a rider, I see when a driver accepts, including their name and car.
- As a rider, I see the driver's location move on a map while they come to me.
- As a rider, I can cancel my request before the ride starts.
- As a rider, I see when the ride starts and when it is completed.

### Driver
- As a driver, I go online so I can see ride requests near me.
- As a driver, I see open requests sorted by distance from me, with pickup, dropoff and distance.
- As a driver, I accept a request and am told immediately if another driver already took it.
- As a driver, I see the pickup location on a map after accepting.
- As a driver, I mark the ride as started when the rider is in the car, and as completed at the dropoff.
- As a driver, I go offline when I stop driving.

## 6. Functional requirements

### 6.1 Authentication
- FR-1: Sign-in uses Supabase email OTP (a 6-digit code sent by email).
- FR-2: The database rejects any new user whose email does not end in @sjsu.edu (case insensitive). This check lives in the database so it cannot be bypassed by a modified client.
- FR-3: A profile row is created automatically for each new user.
- FR-4: The session is saved on the device and refreshed automatically.
- FR-5: Signed-out users can only reach the login screen. Signed-in users without a completed profile are sent to onboarding.

### 6.2 Profiles
- FR-6: Profile fields are full name, is_driver, car description and seats (1 to 7).
- FR-7: Drivers must have a car description and seat count before going online.
- FR-8: Users can edit only their own profile.

### 6.3 Ride lifecycle

Ride status moves through these states:

```
requested -> accepted -> in_progress -> completed
requested -> cancelled
accepted  -> cancelled
```

- FR-9: A rider creates a ride with pickup and dropoff (coordinates and labels). Status starts as requested.
- FR-10: A rider can have at most one active ride (requested, accepted or in_progress).
- FR-11: A driver can have at most one active ride (accepted or in_progress).
- FR-12: Accepting a ride is atomic. If two drivers accept at the same time, exactly one succeeds and the other gets "Ride is no longer available".
- FR-13: Only the assigned driver can start or complete a ride.
- FR-14: Only the rider can cancel, and only while the ride is requested or accepted.
- FR-15: All status changes go through database functions (accept_ride, start_ride, complete_ride, cancel_ride). The app never writes the status column directly, apart from creating the ride.
- FR-16: Timestamps are recorded for requested, accepted, started and completed.

### 6.4 Matching
- FR-17: Drivers who are online see open requests within 5 km of their current location, closest first.
- FR-18: The list updates in realtime when a request is created, accepted by someone else or cancelled.

### 6.5 Live tracking
- FR-19: While online, a driver's app sends its location to the database every 5 seconds while the app is open.
- FR-20: The rider of an active ride sees their driver's location update in realtime on a map.
- FR-21: A driver's location is visible only to the rider of their current active ride. No one else can see where drivers are.
- FR-22: When a driver goes offline or completes a ride, their location stops being shared.

### 6.6 Maps
- FR-23: Mobile uses react-native-maps. Web uses MapLibre. Both sit behind one shared map component.
- FR-24: The map shows pickup, dropoff and the driver marker, and is centered on SJSU by default.

### 6.7 Campus locations
- FR-25: A fixed list of SJSU pickup and dropoff points (for example MLK Library, Student Union, the South, West and North garages, Campus Village, the SJSU Diridon area) is bundled with the app.

## 7. Data model

Defined in `supabase/001_schema.sql`.

| Table | Purpose | Key columns |
| --- | --- | --- |
| profiles | One row per user | id, full_name, is_driver, car_desc, seats |
| rides | One row per ride request | id, rider_id, driver_id, status, pickup, dropoff, labels, timestamps |
| driver_locations | Latest location per driver | driver_id, location, is_online, updated_at |

Locations are stored as PostGIS geography points so distance queries are done in the database.

### Database functions
| Function | Who calls it | What it does |
| --- | --- | --- |
| nearby_requests(lat, lng, radius_m) | Driver | Open requests within the radius, closest first |
| accept_ride(ride) | Driver | Atomically assigns the driver if the ride is still open |
| start_ride(ride) | Assigned driver | accepted to in_progress |
| complete_ride(ride) | Assigned driver | in_progress to completed |
| cancel_ride(ride) | Rider | requested or accepted to cancelled |

start_ride, complete_ride and cancel_ride are new and need to be added to the schema.

## 8. Security and privacy

- Row Level Security is enabled on every table.
- Riders can read only their own rides. Drivers can read open requests and rides assigned to them.
- Users can update only their own profile.
- The rider cancel policy in the current schema is replaced by cancel_ride(), so a rider can no longer change other fields of a ride or cancel a completed one.
- Driver locations are readable only by the rider of that driver's active ride.
- Supabase keys in the app are the public anon key only. The service role key is never shipped.
- Known MVP tradeoff: any user can set themselves as a driver. There is no license or insurance check yet.

## 9. Non-functional requirements

- Platforms: iOS and Android through Expo Go for the MVP, and web on Vercel.
- Performance: a ride status change should appear on the other user's screen within 2 seconds.
- Reliability: losing the network should show an error state, not crash, and the app should recover on reconnect.
- Accessibility: readable text sizes, sufficient contrast and labeled buttons.
- Cost: run on the Supabase and Vercel free tiers.

## 10. Screens

| Screen | Who | Contents |
| --- | --- | --- |
| Login | Everyone | Email field, then 6-digit code field |
| Onboarding | New users | Name, role, car and seats for drivers |
| Rider home | Rider | Pickup and dropoff pickers, Request button |
| Rider active ride | Rider | Status, driver info, map with driver marker, Cancel button |
| Driver home | Driver | Online toggle, list of nearby requests |
| Driver active ride | Driver | Map with pickup and dropoff, Start and Complete buttons |
| Profile | Everyone | Edit profile, switch role, sign out |

## 11. Milestones

Each milestone ends with a stop so it can be tested before moving on.

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | Database and auth | Schema runs in Supabase. A non-SJSU sign-up fails. A non-driver calling accept_ride fails. |
| 2 | App skeleton | Can sign in with an SJSU email, finish onboarding and land on the correct rider or driver home screen on iOS, Android and web. |
| 3 | Ride requests and matching | In two browser windows, a rider requests a ride, a driver sees it and accepts it, and the rider's screen updates without refreshing. |
| 4 | Live map and tracking | The rider sees the driver's marker move. Start and complete work end to end. |
| 5 | Polish and deploy | Web is live on Vercel, mobile runs in Expo Go, and the README and demo video are done. |

## 12. Success metrics

For the MVP, success is technical:
- A full ride (request, accept, start, complete) works on all three platforms.
- No race condition lets two drivers accept the same ride.
- No user can read data that RLS should hide (tested by hand with two accounts).

After launch, possible metrics: weekly active riders, the share of requests that get accepted, and the median time to acceptance.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Not enough drivers online, so requests go unanswered | Show a clear "no drivers nearby" state. Seed with friends for the demo. |
| Location drains battery | Foreground only, updated every 5 seconds only while online |
| Safety between strangers | SJSU-only accounts, driver car info shown to the rider. Ratings and reporting come later. |
| Expo SDK changes break APIs | Check the versioned docs for SDK 58 before using any Expo API |

## 14. Open questions

1. Should riders see all online drivers on the map before requesting, or only their assigned driver? (The current plan is assigned driver only, for privacy.)
2. Should a request expire automatically if nobody accepts it within a time limit, for example 10 minutes?
3. Is 5 km the right matching radius, or should matching be limited to campus?
4. Should drivers be able to set a destination and only see requests going the same way?
5. Which campus locations belong in the fixed list?
