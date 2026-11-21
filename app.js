// Khana Khazana: free, no account, no server. Everything is stored in this browser.
// Features inspired by ReciMe Plus, rebuilt here for free: paste-a-recipe import,
// cookbooks, guided cook mode, metric/imperial converter + serving scaling,
// nutrition fields, print/PDF via the browser, aisle-sorted grocery lists,
// and a photo note on a recipe. What this static app cannot do honestly:
// no social-media scraping, no OCR, and no AI assistant — those need a server.
const LS_RECIPES = "recipebox.recipes.v1";
const LS_DELETED = "recipebox.deleted.v1";
const LS_GROCERY = "recipebox.grocery.v1";
const LS_PLAN = "recipebox.plan.v1";

function loadRecipes() {
  const deleted = JSON.parse(localStorage.getItem(LS_DELETED) || "[]");
  const custom = JSON.parse(localStorage.getItem(LS_RECIPES) || "[]");
  const byId = {};
  window.DEFAULT_RECIPES.filter(r => !deleted.includes(r.id)).forEach(r => byId[r.id] = r);
  custom.forEach(r => byId[r.id] = r);
  return Object.values(byId).sort((a,b) => a.title.localeCompare(b.title));
}
function saveCustom(recipes) {
  const defaults = new Set(window.DEFAULT_RECIPES.map(r => r.id));
  localStorage.setItem(LS_RECIPES, JSON.stringify(recipes.filter(r => !defaults.has(r.id) || r.edited)));
}
function getState() { return { recipes: loadRecipes(), view: "recipes", query: "", category: "All", cookbook: "All", selected: null, cookStep: 0, units: "us", scale: 1, draft: null, photoData: null, cookChecked: new Set(), timerLeft: 0 }; }
let state = getState();
let timerInterval = null;

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

function categories() { return ["All", ...new Set(state.recipes.map(r => r.category).filter(Boolean))]; }
function cookbooks() {
  const all = new Set();
  state.recipes.forEach(r => (r.cookbooks || []).forEach(c => all.add(c)));
  return ["All", ...all];
}
function filteredRecipes() {
  const q = state.query.trim().toLowerCase();
  return state.recipes.filter(r => {
    if (state.category !== "All" && r.category !== state.category) return false;
    if (state.cookbook !== "All" && !(r.cookbooks || []).includes(state.cookbook)) return false;
    if (!q) return true;
    return (r.title + " " + (r.cookbooks || []).join(" ") + " " + r.ingredients.join(" ") + " " + r.directions.join(" ")).toLowerCase().includes(q);
  });
}

function show(view, selectedId) {
  stopTimer();
  state.view = view;
  if (selectedId !== undefined) state.selected = selectedId;
  state.cookStep = 0;
  state.cookChecked = new Set();
  render();
  if (view === "cook") requestWakeLock();
}

function render() {
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
  const main = document.getElementById("main");
  if (state.view === "recipes") main.innerHTML = recipesView();
  else if (state.view === "detail") main.innerHTML = detailView();
  else if (state.view === "cook") main.innerHTML = cookView();
  else if (state.view === "form") main.innerHTML = formView();
  else if (state.view === "grocery") main.innerHTML = groceryView();
  else if (state.view === "plan") main.innerHTML = planView();
  else if (state.view === "import") main.innerHTML = importView();
  else if (state.view === "paste") main.innerHTML = pasteView();
  bind();
}

/* ---------- Measurement converter + serving scaling ---------- */
function qtyToNumber(q) {
  q = q.trim();
  if (q.includes("/")) {
    const parts = q.split(/\s+/);
    let total = 0;
    for (const p of parts) {
      if (p.includes("/")) { const [a,b] = p.split("/"); total += Number(a)/Number(b); }
      else total += Number(p);
    }
    return total;
  }
  return Number(q);
}
function formatQty(n) {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}
const UNIT_ALIASES = { cup:"cup", cups:"cup", c:"cup", tbsp:"tbsp", tbs:"tbsp", tablespoon:"tbsp", tablespoons:"tbsp", tsp:"tsp", teaspoon:"tsp", teaspoons:"tsp", ml:"ml", milliliter:"ml", milliliters:"ml", l:"l", litre:"l", liter:"l", litres:"l", liters:"l", g:"g", gram:"g", grams:"g", kg:"kg", kilogram:"kg", kilograms:"kg", oz:"oz", ounce:"oz", ounces:"oz", lb:"lb", lbs:"lb", pound:"lb", pounds:"lb", "fl oz":"fl oz", "floz":"fl oz" };
function convertIngredient(ing, scale, system) {
  const m = String(ing).match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*([A-Za-z]+(?:\s+oz)?)?\s*(.*)$/);
  if (!m) return ing;
  let qty = qtyToNumber(m[1]) * scale;
  let unitWord = (m[2] || "").toLowerCase();
  const rest = m[3] || "";
  const unit = UNIT_ALIASES[unitWord] || "";
  if (!unit) return (formatQty(qty) + (rest ? " " + rest : "")).trim();
  const plural = (u, q) => q === 1 ? u : u + (u === "cup" ? "s" : "");
  if (system === "metric") {
    if (unit === "cup") return formatQty(qty * 240) + " ml " + rest;
    if (unit === "tbsp") return formatQty(qty * 15) + " ml " + rest;
    if (unit === "tsp") return formatQty(qty * 5) + " ml " + rest;
    if (unit === "fl oz") return formatQty(qty * 30) + " ml " + rest;
    if (unit === "oz") return formatQty(qty * 28.35) + " g " + rest;
    if (unit === "lb") return formatQty(qty * 453.6) + " g " + rest;
    return formatQty(qty) + " " + plural(unit, qty) + " " + rest;
  }
  // US system: convert metric inputs back, leave US units scaled as-is.
  if (unit === "ml") {
    if (qty >= 240) return formatQty(qty / 240) + " cups " + rest;
    if (qty >= 15) return formatQty(qty / 15) + " tbsp " + rest;
    return formatQty(qty / 5) + " tsp " + rest;
  }
  if (unit === "l") return formatQty(qty * 1000 / 240) + " cups " + rest;
  if (unit === "g") {
    if (qty >= 453.6) return formatQty(qty / 453.6) + " lb " + rest;
    return formatQty(qty / 28.35) + " oz " + rest;
  }
  if (unit === "kg") return formatQty(qty * 2.205) + " lb " + rest;
  return formatQty(qty) + " " + plural(unit, qty) + " " + rest;
}

/* ---------- Nutrition (user-entered / stated values, never invented) ---------- */
function nutritionOf(r) {
  const n = r.nutrition || {};
  const proteinMatch = String(r.protein || "").match(/([\d.]+)\s*g\s*protein/i);
  return {
    calories: Number(n.calories) || 0,
    protein: Number(n.protein) || (proteinMatch ? Number(proteinMatch[1]) : 0),
    carbs: Number(n.carbs) || 0,
    fat: Number(n.fat) || 0
  };
}
function nutritionBox(r) {
  const n = nutritionOf(r);
  if (!n.calories && !n.protein && !n.carbs && !n.fat) return "";
  const parts = [];
  if (n.calories) parts.push(esc(n.calories) + " kcal");
  if (n.protein) parts.push(esc(n.protein) + "g protein");
  if (n.carbs) parts.push(esc(n.carbs) + "g carbs");
  if (n.fat) parts.push(esc(n.fat) + "g fat");
  return `<p class="meta"><strong>Nutrition (per serving, as entered/stated):</strong> ${parts.join(" · ")}</p>`;
}

/* ---------- Grocery aisles ---------- */
function aisleOf(text) {
  const t = text.toLowerCase();
  const has = (...words) => words.some(w => t.includes(w));
  if (has("onion","tomato","carrot","cucumber","pepper","capsicum","coriander","cilantro","ginger","chilli","chili","lemon","banana","beetroot","basil","curry leaves","potato","mushroom","spinach","lettuce","apple","lime")) return "Produce";
  if (has("milk","yogurt","yoghurt","dahi","paneer","butter","ghee","cheese","cream","curd")) return "Dairy & chilled";
  if (has("flour","oats","sugar","cocoa","baking","salt","oil","seed","cumin","turmeric","masala","lentil","dal","chickpea","chana","poha","rice","syrup","vanilla","chocolate","vinegar","sauce","peanut butter","almond")) return "Pantry";
  return "Other";
}

/* ---------- Views ---------- */
function recipesView() {
  const list = filteredRecipes();
  return `
    <div class="toolbar">
      <input id="q" type="search" placeholder="Search recipes or ingredients..." value="${esc(state.query)}">
      <select id="cat">${categories().map(c => `<option ${c===state.category?"selected":""}>${esc(c)}</option>`).join("")}</select>
      <select id="cookbook"><option value="All">All cookbooks</option>${cookbooks().slice(1).map(c => `<option ${c===state.cookbook?"selected":""}>${esc(c)}</option>`).join("")}</select>
      <button class="primary" onclick="show('form')">+ Add recipe</button>
      <button class="secondary" onclick="show('paste')">Paste a recipe</button>
    </div>
    <p class="hint">${list.length} recipe${list.length===1?"":"s"} · Free, no account. Your changes are saved in this browser only.</p>
    <div class="grid">${list.map(r => `
      <button class="card" onclick="show('detail','${r.id}')">
        <span class="tag">${esc(r.category||"Recipe")}</span>
        ${(r.cookbooks||[]).map(c => `<span class="tag">${esc(c)}</span>`).join("")}
        <h3>${esc(r.title)}</h3>
        <div class="meta">${esc([r.protein, r.servings, r.time].filter(Boolean).join(" · "))}</div>
        <div class="meta">${r.ingredients.length} ingredients · ${r.directions.length} steps</div>
      </button>`).join("") || "<p>No recipes match. Try a different search, or add one.</p>"}</div>`;
}

function detailView() {
  const r = state.recipes.find(x => x.id === state.selected);
  if (!r) return recipesView();
  const cook = state.cookStep;
  return `
    <button class="secondary" onclick="show('recipes')">&larr; All recipes</button>
    <div class="detail">
      <span class="tag">${esc(r.category||"Recipe")}</span>
      ${(r.cookbooks||[]).map(c => `<span class="tag">${esc(c)}</span>`).join("")}
      <h2>${esc(r.title)}</h2>
      <p class="meta">${esc([r.protein, r.servings, r.time].filter(Boolean).join(" · "))}</p>
      ${nutritionBox(r)}
      ${r.source ? `<p class="meta">Source: ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}</p>` : ""}
      ${r.notes ? `<p><strong>Note:</strong> ${esc(r.notes)}</p>` : ""}
      ${r.image ? `<img src="${esc(r.image)}" alt="Photo note for ${esc(r.title)}" style="max-width:100%;border-radius:12px">` : ""}
      <div class="actions">
        <button class="primary" onclick="show('cook','${r.id}')">Cook mode</button>
        <button class="secondary" onclick="addToGrocery('${r.id}')">Add ingredients to grocery list</button>
        <button class="secondary" onclick="window.print()">Print / PDF</button>
        <button class="secondary" onclick="show('form','${r.id}')">Edit</button>
        <button class="danger" onclick="deleteRecipe('${r.id}')">Delete</button>
      </div>
      <div class="toolbar">
        <label style="margin:0">Scale servings
          <select id="scale">${[0.5,1,2,3].map(s => `<option value="${s}" ${state.scale===s?"selected":""}>${s}×</option>`).join("")}</select>
        </label>
        <label style="margin:0">Units
          <select id="units"><option value="us" ${state.units==="us"?"selected":""}>US (cups, oz)</option><option value="metric" ${state.units==="metric"?"selected":""}>Metric (ml, g)</option></select>
        </label>
      </div>
      <h3>Ingredients</h3>
      <ul>${r.ingredients.map((ing,i) => `<li><label style="font-weight:normal"><input type="checkbox" data-ing="${i}"> ${esc(convertIngredient(ing, state.scale, state.units))}</label></li>`).join("")}</ul>
      <h3>Directions</h3>
      <div class="cook"><p class="step"><strong>Step ${cook+1} of ${r.directions.length}:</strong> ${esc(r.directions[cook])}</p>
      <div class="actions">
        <button class="secondary" ${cook===0?"disabled":""} onclick="stepCook(-1)">Previous</button>
        <button class="secondary" ${cook>=r.directions.length-1?"disabled":""} onclick="stepCook(1)">Next step</button>
      </div></div>
      <ol>${r.directions.map(d => `<li>${esc(d)}</li>`).join("")}</ol>
      <h3>Ask about this recipe</h3>
      <p class="hint">Local search of this recipe only — not an AI assistant. Ask e.g. “how long” or “chickpeas”.</p>
      <div class="toolbar"><input id="ask-q" placeholder="Ask about this recipe..."><button class="secondary" onclick="askRecipe()">Ask</button></div>
      <div id="ask-answer"></div>
    </div>`;
}
function stepCook(d) { state.cookStep = Math.max(0, Math.min(state.recipes.find(x=>x.id===state.selected).directions.length-1, state.cookStep+d)); render(); }
function askRecipe() {
  const r = state.recipes.find(x=>x.id===state.selected); if (!r) return;
  const q = (document.getElementById("ask-q").value || "").toLowerCase().trim();
  const lines = [...r.ingredients.map(t => "Ingredient: " + t), ...r.directions.map((t,i) => "Step " + (i+1) + ": " + t), r.notes ? "Note: " + r.notes : "", r.time ? "Time: " + r.time : "", r.servings ? "Servings: " + r.servings : ""].filter(Boolean);
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const scored = lines.map(line => ({ line, score: words.reduce((s,w) => s + (line.toLowerCase().includes(w) ? 1 : 0), 0) })).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 3);
  document.getElementById("ask-answer").innerHTML = scored.length
    ? "<ul>" + scored.map(x => `<li>${esc(x.line)}</li>`).join("") + "</ul>"
    : "<p class='hint'>Nothing in this recipe mentions that. Try a word from its ingredients or steps.</p>";
}

function cookView() {
  const r = state.recipes.find(x => x.id === state.selected);
  if (!r) return recipesView();
  const i = state.cookStep;
  const mins = r.directions[i].match(/(\d+)\s*(?:minutes?|mins?)\b/i);
  return `
    <button class="secondary" onclick="show('detail','${r.id}')">&larr; Back to recipe</button>
    <div class="detail cook">
      <span class="tag">Cook mode</span>
      <h2>${esc(r.title)}</h2>
      <p class="step"><strong>Step ${i+1} of ${r.directions.length}</strong></p>
      <p class="step">${esc(r.directions[i])}</p>
      <div class="actions">
        <button class="secondary" ${i===0?"disabled":""} onclick="stepCook(-1)">← Previous</button>
        <button class="primary" ${i>=r.directions.length-1?"disabled":""} onclick="stepCook(1)">Next step →</button>
      </div>
      <p class="hint">Screen stays on while you are in cook mode, where your browser allows it.</p>
      <div class="toolbar">
        <input id="timer-mins" type="number" min="1" max="180" value="${mins ? mins[1] : 5}" style="max-width:110px">
        <button class="secondary" onclick="startTimer()">Start timer</button>
        <button class="secondary" onclick="stopTimer()">Stop</button>
        <span id="timer-display">${state.timerLeft ? fmtTime(state.timerLeft) : ""}</span>
      </div>
      <h3>Ingredients — tick as you use them</h3>
      <ul>${r.ingredients.map((ing,idx) => `<li><label><input type="checkbox" ${state.cookChecked.has(idx)?"checked":""} onchange="toggleCookChecked(${idx})"> ${esc(convertIngredient(ing, state.scale, state.units))}</label></li>`).join("")}</ul>
    </div>`;
}
function toggleCookChecked(i) { state.cookChecked.has(i) ? state.cookChecked.delete(i) : state.cookChecked.add(i); }
function fmtTime(s) { return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0") + " left"; }
function startTimer() {
  const mins = Number(document.getElementById("timer-mins").value) || 5;
  stopTimer();
  state.timerLeft = mins * 60;
  timerInterval = setInterval(() => {
    state.timerLeft -= 1;
    const el = document.getElementById("timer-display");
    if (el) el.textContent = state.timerLeft > 0 ? fmtTime(state.timerLeft) : "Time's up!";
    if (state.timerLeft <= 0) { stopTimer(); if (el) el.textContent = "Time's up!"; }
  }, 1000);
  const el = document.getElementById("timer-display"); if (el) el.textContent = fmtTime(state.timerLeft);
}
function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
async function requestWakeLock() {
  try { if ("wakeLock" in navigator) await navigator.wakeLock.request("screen"); } catch { /* wake lock is best-effort */ }
}

function formView() {
  const draft = state.draft;
  const r = draft || state.recipes.find(x => x.id === state.selected) || { title:"", category:"Breakfast", protein:"", servings:"", time:"", source:"", sourceUrl:"", ingredients:[], directions:[], notes:"", cookbooks:[], nutrition:{}, image:"" };
  const isNew = !!draft || !state.selected || !state.recipes.some(x => x.id === state.selected);
  const n = r.nutrition || {};
  return `
    <button class="secondary" onclick="show('recipes')">&larr; Back</button>
    <h2>${isNew ? "Add a recipe" : "Edit recipe"}</h2>
    ${draft ? `<p class="hint">Filled in from your pasted recipe. Check the quantities and steps before saving.</p>` : ""}
    <form id="recipe-form">
      <label>Title<input name="title" required value="${esc(r.title)}"></label>
      <div class="row">
        <div><label>Category<input name="category" value="${esc(r.category)}" placeholder="Breakfast, Dessert..."></label></div>
        <div><label>Cookbooks (comma separated)<input name="cookbooks" value="${esc((r.cookbooks||[]).join(", "))}" placeholder="e.g. Weeknight, High protein"></label></div>
        <div><label>Protein / nutrition<input name="protein" value="${esc(r.protein)}" placeholder="e.g. 10g protein per slice"></label></div>
        <div><label>Servings<input name="servings" value="${esc(r.servings)}"></label></div>
        <div><label>Time<input name="time" value="${esc(r.time)}" placeholder="e.g. 30-35 min bake"></label></div>
      </div>
      <div class="row">
        <div><label>Calories (per serving)<input name="calories" type="number" min="0" value="${esc(n.calories ?? "")}"></label></div>
        <div><label>Protein g<input name="proteinG" type="number" min="0" step="0.1" value="${esc(n.protein ?? "")}"></label></div>
        <div><label>Carbs g<input name="carbs" type="number" min="0" step="0.1" value="${esc(n.carbs ?? "")}"></label></div>
        <div><label>Fat g<input name="fat" type="number" min="0" step="0.1" value="${esc(n.fat ?? "")}"></label></div>
      </div>
      <p class="hint">Nutrition is only shown if you enter it (or the recipe states protein). Khana Khazana does not calculate nutrition from ingredients.</p>
      <label>Source<input name="source" value="${esc(r.source)}" placeholder="Where did this recipe come from?"></label>
      <label>Source URL<input name="sourceUrl" type="url" value="${esc(r.sourceUrl)}"></label>
      <label>Ingredients (one per line)<textarea name="ingredients" rows="8" required>${esc(r.ingredients.join("\n"))}</textarea></label>
      <label>Directions (one step per line)<textarea name="directions" rows="8" required>${esc(r.directions.join("\n"))}</textarea></label>
      <label>Notes<textarea name="notes" rows="3">${esc(r.notes)}</textarea></label>
      <label>Photo note (e.g. a cookbook page — stored in this browser only)<input type="file" id="photo-input" accept="image/*"></label>
      ${r.image ? `<img src="${esc(r.image)}" alt="" style="max-width:240px;border-radius:12px">` : ""}
      <p class="hint">Photos are not text-scanned (no OCR). Keep photos small; very large photos can fill browser storage.</p>
      <div class="actions"><button class="primary" type="submit">Save recipe</button><button class="secondary" type="button" onclick="show('recipes')">Cancel</button></div>
    </form>`;
}

function groceryView() {
  const items = JSON.parse(localStorage.getItem(LS_GROCERY) || "[]");
  const order = ["Produce", "Dairy & chilled", "Pantry", "Other"];
  const grouped = {};
  items.forEach((it, idx) => { const a = aisleOf(it.text); (grouped[a] = grouped[a] || []).push({ ...it, idx }); });
  return `
    <h2>Grocery list</h2>
    <p class="hint">Sorted by store aisle. Tick items as you shop. Add ingredients from any recipe with the button on its page.</p>
    <form id="grocery-form" class="toolbar"><input name="item" required placeholder="Add an item..."><button class="primary" type="submit">Add</button></form>
    ${order.filter(a => grouped[a]).map(a => `<h3>${a}</h3><ul>${grouped[a].sort((x,y) => x.text.localeCompare(y.text)).map(it => `<li><label class="${it.done?"checked":""}"><input type="checkbox" ${it.done?"checked":""} onchange="toggleGrocery(${it.idx})"> ${esc(it.text)}</label> <button class="secondary" onclick="removeGrocery(${it.idx})">Remove</button></li>`).join("")}</ul>`).join("") || "<p>No items yet.</p>"}
    <div class="actions"><button class="secondary" onclick="clearCheckedGrocery()">Clear ticked items</button><button class="danger" onclick="clearGrocery()">Clear all</button></div>`;
}

function planView() {
  const plan = JSON.parse(localStorage.getItem(LS_PLAN) || "{}");
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  days.forEach(d => { const r = state.recipes.find(x => x.id === plan[d]); if (r) { const n = nutritionOf(r); totals.calories += n.calories; totals.protein += n.protein; totals.carbs += n.carbs; totals.fat += n.fat; } });
  const hasTotals = totals.calories || totals.protein || totals.carbs || totals.fat;
  return `<h2>Meal plan</h2><p class="hint">Pick a recipe for each day. Saved in this browser.</p>
  <table><tr><th>Day</th><th>Recipe</th></tr>${days.map(d => `<tr><td>${d}</td><td><select onchange="setPlan('${d}',this.value)"><option value="">—</option>${state.recipes.map(r=>`<option value="${r.id}" ${plan[d]===r.id?"selected":""}>${esc(r.title)}</option>`).join("")}</select></td></tr>`).join("")}</table>
  ${hasTotals ? `<p class="meta"><strong>Week total (from entered/stated nutrition only):</strong> ${totals.calories} kcal · ${totals.protein}g protein · ${totals.carbs}g carbs · ${totals.fat}g fat</p>` : `<p class="hint">Add nutrition values to recipes to see weekly totals here.</p>`}
  <div class="actions"><button class="primary" onclick="addPlanToGrocery()">Add all planned recipes to grocery list</button><button class="secondary" onclick="window.print()">Print / PDF</button></div>`;
}
function addPlanToGrocery() {
  const plan = JSON.parse(localStorage.getItem(LS_PLAN) || "{}");
  const items = JSON.parse(localStorage.getItem(LS_GROCERY) || "[]");
  let added = 0;
  Object.values(plan).forEach(id => { const r = state.recipes.find(x => x.id === id); if (r) r.ingredients.forEach(text => { if (!items.some(i => i.text === text)) { items.push({ text, done: false }); added++; } }); });
  localStorage.setItem(LS_GROCERY, JSON.stringify(items));
  alert(added + " new ingredients added to your grocery list.");
}

function importView() {
  return `<h2>Import / export</h2>
  <p>Export saves all your recipes (including the preloaded ones and your edits) as a JSON file, or print a recipe to PDF from its page with Print / PDF. Import loads a Khana Khazana JSON file. To save a recipe from a website or social post, use <strong>Paste a recipe</strong>: copy the whole recipe text and paste it there. This app cannot scrape Instagram, TikTok, or Facebook directly — that needs a server and those sites' permission.</p>
  <div class="actions"><button class="primary" onclick="exportJson()">Download JSON</button><button class="secondary" onclick="show('paste')">Paste a recipe</button></div>
  <label>Import JSON file<input type="file" id="import-file" accept=".json,application/json"></label>`;
}

function pasteView() {
  return `<h2>Paste a recipe</h2>
  <p>Copy a whole recipe — title, ingredients, and steps — and paste it below. Khana Khazana will split it into a recipe you can check and save. Headings like “Ingredients” and “Directions” help it split cleanly.</p>
  <label>Recipe text<textarea id="paste-text" rows="14" placeholder="Chocolate Oats&#10;&#10;Ingredients&#10;1/2 cup oats&#10;1 cup milk&#10;&#10;Directions&#10;1. Mix everything...&#10;2. Chill overnight..."></textarea></label>
  <label>Source link (optional, saved with the recipe)<input id="paste-url" type="url" placeholder="https://..."></label>
  <div class="actions"><button class="primary" onclick="parsePaste()">Split into a recipe</button><button class="secondary" onclick="show('recipes')">Cancel</button></div>`;
}
function cleanLine(s) { return s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim(); }
function parsePasteRecipe(text, sourceUrl) {
  const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const isHeader = (l, re) => re.test(l.replace(/[:#]/g, "").trim());
  const ingIdx = rawLines.findIndex(l => isHeader(l, /^ingredients$/i));
  const dirIdx = rawLines.findIndex(l => isHeader(l, /^(directions|instructions|method|steps)$/i));
  let title = "", ingredients = [], directions = [];
  if (ingIdx >= 0 && dirIdx > ingIdx) {
    title = rawLines.slice(0, ingIdx).join(" ") || "Pasted recipe";
    ingredients = rawLines.slice(ingIdx + 1, dirIdx).map(cleanLine).filter(Boolean);
    directions = rawLines.slice(dirIdx + 1).map(cleanLine).filter(Boolean);
  } else {
    // Blank-line blocks: title / ingredients / directions.
    const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    if (blocks.length >= 3) {
      title = blocks[0].split("\n")[0];
      ingredients = blocks[1].split("\n").map(cleanLine).filter(Boolean);
      directions = blocks.slice(2).join("\n").split("\n").map(cleanLine).filter(Boolean);
    } else {
      title = rawLines[0] || "Pasted recipe";
      const rest = rawLines.slice(1);
      const splitAt = rest.findIndex(l => l.length > 70 || /^(heat|add|mix|stir|cook|bake|preheat|serve|place|combine|pour|fold|whisk|blend|chill|refrigerate)/i.test(l));
      const cut = splitAt > 0 ? splitAt : Math.ceil(rest.length / 2);
      ingredients = rest.slice(0, cut).map(cleanLine).filter(Boolean);
      directions = rest.slice(cut).map(cleanLine).filter(Boolean);
    }
  }
  // A single numbered paragraph of steps: split on "1. ", "2. " etc.
  if (directions.length === 1 && /\b1[.)]\s/.test(directions[0])) {
    directions = directions[0].split(/\s*\d+[.)]\s+/).map(s => s.trim()).filter(Boolean);
  }
  return { title: title.replace(/^#+\s*/, ""), category: "Recipe", protein: "", servings: "", time: "", source: sourceUrl ? "Pasted from link" : "Pasted recipe", sourceUrl: sourceUrl || "", ingredients, directions, notes: "Pasted recipe — check quantities and steps before saving.", cookbooks: [], nutrition: {}, image: "" };
}
function parsePaste() {
  const text = document.getElementById("paste-text").value;
  const url = document.getElementById("paste-url").value.trim();
  if (!text.trim()) { alert("Paste a recipe first."); return; }
  const draft = parsePasteRecipe(text, url);
  if (!draft.ingredients.length || !draft.directions.length) { alert("Could not split that text. Add an “Ingredients” heading and a “Directions” heading and try again."); return; }
  state.draft = draft; state.selected = null; state.photoData = null; show("form");
}

function bind() {
  const q = document.getElementById("q");
  if (q) q.addEventListener("input", e => { state.query = e.target.value; const pos = e.target.selectionStart; render(); const nq = document.getElementById("q"); nq.focus(); nq.setSelectionRange(pos,pos); });
  const cat = document.getElementById("cat");
  if (cat) cat.addEventListener("change", e => { state.category = e.target.value; render(); });
  const cb = document.getElementById("cookbook");
  if (cb) cb.addEventListener("change", e => { state.cookbook = e.target.value; render(); });
  const scaleEl = document.getElementById("scale");
  if (scaleEl) scaleEl.addEventListener("change", e => { state.scale = Number(e.target.value); render(); });
  const unitsEl = document.getElementById("units");
  if (unitsEl) unitsEl.addEventListener("change", e => { state.units = e.target.value; render(); });
  const photo = document.getElementById("photo-input");
  if (photo) photo.addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 600 * 1024) { alert("That photo is over 600 KB. Please use a smaller photo so browser storage does not fill up."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { state.photoData = reader.result; };
    reader.readAsDataURL(file);
  });
  const form = document.getElementById("recipe-form");
  if (form) form.addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(form);
    const lines = k => String(fd.get(k)||"").split("\n").map(s=>s.trim()).filter(Boolean);
    const isDraft = !!state.draft;
    const id = !isDraft && state.selected && state.recipes.some(x=>x.id===state.selected) ? state.selected : "recipe-" + Date.now();
    const existing = state.recipes.find(x => x.id === id);
    const num = k => { const v = Number(fd.get(k)); return Number.isFinite(v) && v > 0 ? v : undefined; };
    const nutrition = {};
    if (num("calories") !== undefined) nutrition.calories = num("calories");
    if (num("proteinG") !== undefined) nutrition.protein = num("proteinG");
    if (num("carbs") !== undefined) nutrition.carbs = num("carbs");
    if (num("fat") !== undefined) nutrition.fat = num("fat");
    const rec = { id, title: fd.get("title").trim(), category: fd.get("category").trim()||"Recipe", cookbooks: String(fd.get("cookbooks")||"").split(",").map(s=>s.trim()).filter(Boolean), protein: fd.get("protein").trim(), servings: fd.get("servings").trim(), time: fd.get("time").trim(), nutrition, source: fd.get("source").trim(), sourceUrl: fd.get("sourceUrl").trim(), ingredients: lines("ingredients"), directions: lines("directions"), notes: fd.get("notes").trim(), image: state.photoData || (existing ? existing.image || "" : ""), edited: true };
    const all = loadRecipes().filter(r => r.id !== id);
    all.push(rec);
    saveCustom(all);
    localStorage.setItem(LS_DELETED, JSON.stringify(JSON.parse(localStorage.getItem(LS_DELETED)||"[]").filter(d=>d!==id)));
    state.draft = null; state.photoData = null;
    state = { ...getState(), units: state.units, scale: state.scale, query: state.query, category: state.category, cookbook: state.cookbook };
    show("detail", id);
  });
  const gf = document.getElementById("grocery-form");
  if (gf) gf.addEventListener("submit", e => { e.preventDefault(); const items = JSON.parse(localStorage.getItem(LS_GROCERY)||"[]"); items.push({text: new FormData(gf).get("item").trim(), done:false}); localStorage.setItem(LS_GROCERY, JSON.stringify(items)); render(); });
  const imp = document.getElementById("import-file");
  if (imp) imp.addEventListener("change", async e => {
    const text = await e.target.files[0].text();
    try { const data = JSON.parse(text); const arr = Array.isArray(data) ? data : data.recipes; if (!Array.isArray(arr)) throw new Error("bad file");
      const existing = loadRecipes(); const byId = {}; existing.forEach(r=>byId[r.id]=r); arr.forEach(r=>{ if(r.title) byId[r.id||("recipe-"+Date.now()+"-"+Math.random())]= {...r, id: r.id||("recipe-"+Date.now()), edited:true}; });
      saveCustom(Object.values(byId)); state = getState(); show("recipes"); alert("Imported " + arr.length + " recipes."); }
    catch { alert("That file could not be imported. It must be a Khana Khazana JSON export."); }
  });
}

function addToGrocery(id) {
  const r = state.recipes.find(x=>x.id===id); if(!r) return;
  const items = JSON.parse(localStorage.getItem(LS_GROCERY)||"[]");
  r.ingredients.forEach(text => { const shown = convertIngredient(text, state.scale, state.units); if(!items.some(i=>i.text===shown)) items.push({text: shown, done:false}); });
  localStorage.setItem(LS_GROCERY, JSON.stringify(items));
  alert(r.ingredients.length + " ingredients added to your grocery list.");
}
function deleteRecipe(id) {
  if (!confirm("Delete this recipe? You can restore the preloaded ones with Reset below.")) return;
  const defaults = new Set(window.DEFAULT_RECIPES.map(r=>r.id));
  if (defaults.has(id)) {
    const deleted = JSON.parse(localStorage.getItem(LS_DELETED)||"[]"); deleted.push(id);
    localStorage.setItem(LS_DELETED, JSON.stringify(deleted));
    const custom = JSON.parse(localStorage.getItem(LS_RECIPES)||"[]").filter(r=>r.id!==id);
    localStorage.setItem(LS_RECIPES, JSON.stringify(custom));
  } else {
    localStorage.setItem(LS_RECIPES, JSON.stringify(JSON.parse(localStorage.getItem(LS_RECIPES)||"[]").filter(r=>r.id!==id)));
  }
  state = getState(); show("recipes");
}
function toggleGrocery(i){ const items=JSON.parse(localStorage.getItem(LS_GROCERY)||"[]"); items[i].done=!items[i].done; localStorage.setItem(LS_GROCERY,JSON.stringify(items)); render(); }
function removeGrocery(i){ const items=JSON.parse(localStorage.getItem(LS_GROCERY)||"[]"); items.splice(i,1); localStorage.setItem(LS_GROCERY,JSON.stringify(items)); render(); }
function clearCheckedGrocery(){ localStorage.setItem(LS_GROCERY, JSON.stringify(JSON.parse(localStorage.getItem(LS_GROCERY)||"[]").filter(i=>!i.done))); render(); }
function clearGrocery(){ if(confirm("Clear the whole grocery list?")){ localStorage.setItem(LS_GROCERY,"[]"); render(); } }
function setPlan(day, id){ const plan=JSON.parse(localStorage.getItem(LS_PLAN)||"{}"); if(id) plan[day]=id; else delete plan[day]; localStorage.setItem(LS_PLAN, JSON.stringify(plan)); }
function exportJson(){
  const blob = new Blob([JSON.stringify({app:"Khana Khazana", exportedAt:new Date().toISOString(), recipes: loadRecipes()}, null, 2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "khana-khazana-recipes.json"; a.click(); URL.revokeObjectURL(a.href);
}
function resetAll(){ if(confirm("Reset all recipes, grocery list and meal plan? Your added recipes will be removed.")){ localStorage.removeItem(LS_RECIPES); localStorage.removeItem(LS_DELETED); localStorage.removeItem(LS_GROCERY); localStorage.removeItem(LS_PLAN); state=getState(); render(); } }

document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));
render();
