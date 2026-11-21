# Khana Khazana

A free recipe manager, inspired by Paprika's core ideas but built from scratch: save recipes, search them, plan meals for the week, and turn ingredients into a grocery list.

No account. No subscription. No server. Your recipes are stored in your browser's local storage, and you can export them as JSON any time.

## Use it

Open `index.html` in any modern browser, or host this folder free with GitHub Pages:

1. Go to the repository **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Save. GitHub will give you a free `*.github.io` address for the app.

## Features

- 9 preloaded recipes (7 protein breakfasts, flourless chickpea blondies, red-lentil chocolate protein cake), each with its source link
- Search by recipe or ingredient, and filter by category
- Add, edit, and delete recipes
- Step-by-step cook view
- Grocery list built from a recipe's ingredients, with tick-off and clearing
- Weekly meal plan (Monday–Sunday)
- Import / export all recipes as JSON
- Reset everything back to the preloaded recipes

## A note on the preloaded recipes

The 7 breakfast dishes keep Thevegetarianladki's dish names and protein counts from her "7 Protein Breakfast Ideas" Reel, but their ingredients and steps are matching recipes found on the internet — the creator sends her exact recipes by DM and they are not published. The blondies use a tested internet version, because the Reel itself listed no sweetener or salt. The chocolate protein cake is the creator's own published recipe from The Conscious Plant Kitchen. Each recipe says so in its note and links to its source.

## Tech

Plain HTML, CSS, and JavaScript. No build step, no dependencies, no tracking.
