# Swasth

Swasth (meaning health) was formerly called Khana Khazana. It is a free recipe, meal-planning, grocery, and health-tracking app for Seth and family: save recipes, search them, plan meals for the week, compare foods, and turn ingredients into a grocery list split by store.

The live app runs as a Muse Space with a built-in database. Its code is not in this repository.

## What is in this repository

- `index.html`, `app.js`, `recipes.js`, `style.css` — the original static version from 2026-11-21 (9 preloaded recipes, browser local storage only). Kept as a backup. Open `index.html` in any modern browser, or host this folder free with GitHub Pages: go to the repository **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
- `data/` — a data snapshot exported 2026-11-25 from the live app. Data only, not app code:
  - `recipes.json` — 96 recipes, with ingredients, directions, sources, and nutrition figures (stated figures labelled as stated, estimates labelled as estimates).
  - `stores.json` — 5 stores for the shopping list.
  - `grocery.json` — 36 grocery items.
  - `profiles.json` — 1 health-tracking profile.

Features that live only in the Muse Space version (not in the static files here) include the weekly meal planner, the Compare view, Ask Muse, the experimental Graph Lab, store-split grocery lists, and per-person health tracking.
