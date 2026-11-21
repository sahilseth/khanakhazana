// Khana Khazana: free, no account, no server. Everything is stored in this browser.
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
function getState() { return { recipes: loadRecipes(), view: "recipes", query: "", category: "All", selected: null, cookStep: 0 }; }
let state = getState();

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

function categories() {
  return ["All", ...new Set(state.recipes.map(r => r.category).filter(Boolean))];
}

function filteredRecipes() {
  const q = state.query.trim().toLowerCase();
  return state.recipes.filter(r => {
    if (state.category !== "All" && r.category !== state.category) return false;
    if (!q) return true;
    return (r.title + " " + r.ingredients.join(" ") + " " + r.directions.join(" ")).toLowerCase().includes(q);
  });
}

function show(view, selectedId) {
  state.view = view;
  if (selectedId !== undefined) state.selected = selectedId;
  state.cookStep = 0;
  render();
}

function render() {
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
  const main = document.getElementById("main");
  if (state.view === "recipes") main.innerHTML = recipesView();
  else if (state.view === "detail") main.innerHTML = detailView();
  else if (state.view === "form") main.innerHTML = formView();
  else if (state.view === "grocery") main.innerHTML = groceryView();
  else if (state.view === "plan") main.innerHTML = planView();
  else if (state.view === "import") main.innerHTML = importView();
  bind();
}

function recipesView() {
  const list = filteredRecipes();
  return `
    <div class="toolbar">
      <input id="q" type="search" placeholder="Search recipes or ingredients..." value="${esc(state.query)}">
      <select id="cat">${categories().map(c => `<option ${c===state.category?"selected":""}>${esc(c)}</option>`).join("")}</select>
      <button class="primary" onclick="show('form')">+ Add recipe</button>
    </div>
    <p class="hint">${list.length} recipe${list.length===1?"":"s"} · Free, no account. Your changes are saved in this browser only.</p>
    <div class="grid">${list.map(r => `
      <button class="card" onclick="show('detail','${r.id}')">
        <span class="tag">${esc(r.category||"Recipe")}</span>
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
      <h2>${esc(r.title)}</h2>
      <p class="meta">${esc([r.protein, r.servings, r.time].filter(Boolean).join(" · "))}</p>
      ${r.source ? `<p class="meta">Source: ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}</p>` : ""}
      ${r.notes ? `<p><strong>Note:</strong> ${esc(r.notes)}</p>` : ""}
      <div class="actions">
        <button class="primary" onclick="addToGrocery('${r.id}')">Add ingredients to grocery list</button>
        <button class="secondary" onclick="show('form','${r.id}')">Edit</button>
        <button class="danger" onclick="deleteRecipe('${r.id}')">Delete</button>
      </div>
      <h3>Ingredients</h3>
      <ul>${r.ingredients.map((ing,i) => `<li><label style="font-weight:normal"><input type="checkbox" data-ing="${i}"> ${esc(ing)}</label></li>`).join("")}</ul>
      <h3>Directions</h3>
      <div class="cook"><p class="step"><strong>Step ${cook+1} of ${r.directions.length}:</strong> ${esc(r.directions[cook])}</p>
      <div class="actions">
        <button class="secondary" ${cook===0?"disabled":""} onclick="stepCook(-1)">Previous</button>
        <button class="secondary" ${cook>=r.directions.length-1?"disabled":""} onclick="stepCook(1)">Next step</button>
      </div></div>
      <ol>${r.directions.map(d => `<li>${esc(d)}</li>`).join("")}</ol>
    </div>`;
}
function stepCook(d) { state.cookStep = Math.max(0, Math.min(state.recipes.find(x=>x.id===state.selected).directions.length-1, state.cookStep+d)); render(); }

function formView() {
  const r = state.recipes.find(x => x.id === state.selected) || { title:"", category:"Breakfast", protein:"", servings:"", time:"", source:"", sourceUrl:"", ingredients:[], directions:[], notes:"" };
  const isNew = !state.selected || !state.recipes.some(x => x.id === state.selected);
  return `
    <button class="secondary" onclick="show('recipes')">&larr; Back</button>
    <h2>${isNew ? "Add a recipe" : "Edit recipe"}</h2>
    <form id="recipe-form">
      <label>Title<input name="title" required value="${esc(r.title)}"></label>
      <div class="row">
        <div><label>Category<input name="category" value="${esc(r.category)}" placeholder="Breakfast, Dessert..."></label></div>
        <div><label>Protein / nutrition<input name="protein" value="${esc(r.protein)}" placeholder="e.g. 10g protein per slice"></label></div>
        <div><label>Servings<input name="servings" value="${esc(r.servings)}"></label></div>
        <div><label>Time<input name="time" value="${esc(r.time)}" placeholder="e.g. 30-35 min bake"></label></div>
      </div>
      <label>Source<input name="source" value="${esc(r.source)}" placeholder="Where did this recipe come from?"></label>
      <label>Source URL<input name="sourceUrl" type="url" value="${esc(r.sourceUrl)}"></label>
      <label>Ingredients (one per line)<textarea name="ingredients" rows="8" required>${esc(r.ingredients.join("\n"))}</textarea></label>
      <label>Directions (one step per line)<textarea name="directions" rows="8" required>${esc(r.directions.join("\n"))}</textarea></label>
      <label>Notes<textarea name="notes" rows="3">${esc(r.notes)}</textarea></label>
      <div class="actions"><button class="primary" type="submit">Save recipe</button><button class="secondary" type="button" onclick="show('recipes')">Cancel</button></div>
    </form>`;
}

function groceryView() {
  const items = JSON.parse(localStorage.getItem(LS_GROCERY) || "[]");
  return `
    <h2>Grocery list</h2>
    <p class="hint">Tick items as you shop. Add ingredients from any recipe with the button on its page.</p>
    <form id="grocery-form" class="toolbar"><input name="item" required placeholder="Add an item..."><button class="primary" type="submit">Add</button></form>
    <ul>${items.map((it,i) => `<li><label class="${it.done?"checked":""}"><input type="checkbox" ${it.done?"checked":""} onchange="toggleGrocery(${i})"> ${esc(it.text)}</label> <button class="secondary" onclick="removeGrocery(${i})">Remove</button></li>`).join("") || "<li>No items yet.</li>"}</ul>
    <div class="actions"><button class="secondary" onclick="clearCheckedGrocery()">Clear ticked items</button><button class="danger" onclick="clearGrocery()">Clear all</button></div>`;
}

function planView() {
  const plan = JSON.parse(localStorage.getItem(LS_PLAN) || "{}");
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  return `<h2>Meal plan</h2><p class="hint">Pick a recipe for each day. Saved in this browser.</p>
  <table><tr><th>Day</th><th>Recipe</th></tr>${days.map(d => `<tr><td>${d}</td><td><select onchange="setPlan('${d}',this.value)"><option value="">—</option>${state.recipes.map(r=>`<option value="${r.id}" ${plan[d]===r.id?"selected":""}>${esc(r.title)}</option>`).join("")}</select></td></tr>`).join("")}</table>`;
}

function importView() {
  return `<h2>Import / export</h2>
  <p>Export saves all your recipes (including the preloaded ones and your edits) as a JSON file. Import loads a Khana Khazana JSON file. To save a recipe from a website, open it in your browser, copy its ingredients and directions, and paste them into the Add recipe form. Paprika-style automatic web clipping needs a server, so this free version keeps that step manual on purpose.</p>
  <div class="actions"><button class="primary" onclick="exportJson()">Download JSON</button></div>
  <label>Import JSON file<input type="file" id="import-file" accept=".json,application/json"></label>`;
}

function bind() {
  const q = document.getElementById("q");
  if (q) q.addEventListener("input", e => { state.query = e.target.value; const pos = e.target.selectionStart; render(); const nq = document.getElementById("q"); nq.focus(); nq.setSelectionRange(pos,pos); });
  const cat = document.getElementById("cat");
  if (cat) cat.addEventListener("change", e => { state.category = e.target.value; render(); });
  const form = document.getElementById("recipe-form");
  if (form) form.addEventListener("submit", e => {
    e.preventDefault();
    const fd = new FormData(form);
    const lines = k => String(fd.get(k)||"").split("\n").map(s=>s.trim()).filter(Boolean);
    const id = state.selected && state.recipes.some(x=>x.id===state.selected) ? state.selected : "recipe-" + Date.now();
    const rec = { id, title: fd.get("title").trim(), category: fd.get("category").trim()||"Recipe", protein: fd.get("protein").trim(), servings: fd.get("servings").trim(), time: fd.get("time").trim(), source: fd.get("source").trim(), sourceUrl: fd.get("sourceUrl").trim(), ingredients: lines("ingredients"), directions: lines("directions"), notes: fd.get("notes").trim(), edited: true };
    const all = loadRecipes().filter(r => r.id !== id);
    all.push(rec);
    saveCustom(all);
    // If editing a default recipe, keep it in custom storage; if it was deleted before, undelete it.
    localStorage.setItem(LS_DELETED, JSON.stringify(JSON.parse(localStorage.getItem(LS_DELETED)||"[]").filter(d=>d!==id)));
    state = getState(); show("detail", id);
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
  r.ingredients.forEach(text => { if(!items.some(i=>i.text===text)) items.push({text, done:false}); });
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
