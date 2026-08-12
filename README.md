# Baazi MVP 0.1
2-player multiplayer Seep opening-deal prototype.

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Copy `.env.example` to `.env.local` and add Supabase URL + anon key.
4. `npm install`
5. `npm run dev`
6. For Netlify: build `npm run build`, publish `dist`, and add the two env vars.

This prototype synchronizes a private room, supports 2-4 players joining, and tests the 2-player 26-card opening: 4 to each player, 4 to floor, remaining 14 held, final 26 held for round 2. Full Seep capture/scoring rules are intentionally next.
# baazi-mvp
# baazi-mvp
