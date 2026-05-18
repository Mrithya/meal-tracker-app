const meals = ["Breakfast","Mid Morning","Lunch","Snack","Dinner","Supplements"];
let connectedDataFileHandle = null;
let dataSaveTimer = null;

function readStorage(key, fallback){
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function asArray(value){
  return Array.isArray(value) ? value : [];
}

function isRecord(value){
  return value && typeof value === "object";
}

function asRecordArray(value){
  return asArray(value).filter(isRecord);
}

function isValidFood(food){
  return food && typeof food.name === "string" && Number.isFinite(Number(food.serving));
}

let today = asRecordArray(readStorage("todayMeals", []));
let history = asRecordArray(readStorage("dailyHistory", []));
let measurements = asRecordArray(readStorage("measurements", []));
let workouts = asRecordArray(readStorage("workouts", []));
let customFoods = asRecordArray(readStorage("customFoods", [])).filter(isValidFood);

const keys = ["calories","completeProtein","totalProtein","carbs","fat","fiber","calcium","iron","potassium","selenium","omega3"];

function createItemId(){
  return `meal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isSafeItemId(id){
  return /^[-a-zA-Z0-9_.]+$/.test(String(id || ""));
}

function ensureTodayItemIds(){
  let changed = false;
  const seen = new Set();
  today.forEach(item => {
    if(!isSafeItemId(item.id) || seen.has(item.id)) {
      item.id = createItemId();
      changed = true;
    }
    seen.add(item.id);
  });
  return changed;
}

ensureTodayItemIds();

function allFoods(){
  customFoods = asRecordArray(customFoods).filter(isValidFood);
  return [...FOODS, ...customFoods].filter(isValidFood).sort((a,b) => a.name.localeCompare(b.name));
}

function scaled(food, qty){
  const factor = Number(qty || 0) / food.serving;
  const out = {name: food.name, category: food.category, qty: Number(qty), serving: Number(food.serving), note: food.note};
  keys.forEach(k => out[k] = +(food[k] * factor).toFixed(1));
  return out;
}

function foodFromLoggedItem(item){
  const food = allFoods().find(f => f.name === item.name);
  if(food) return food;
  const qty = Number(item.qty || 0);
  const serving = Number(item.serving || qty || 1);
  const factor = qty ? serving / qty : 1;
  const foodLike = {name: item.name, category: item.category, serving, note: item.note};
  keys.forEach(k => foodLike[k] = +(Number(item[k] || 0) * factor).toFixed(1));
  return foodLike;
}

function totals(items=today){
  const t = {};
  keys.forEach(k => t[k]=0);
  items.forEach(i => keys.forEach(k => t[k] += Number(i[k]||0)));
  keys.forEach(k => t[k]=+t[k].toFixed(1));
  return t;
}

function getTargets(){
  return {
    calories:+document.getElementById("targetCalories").value,
    protein:+document.getElementById("targetProtein").value,
    carbs:+document.getElementById("targetCarbs").value,
    fat:+document.getElementById("targetFat").value,
    fiber:+document.getElementById("targetFiber").value,
    water:+document.getElementById("targetWater").value
  }
}

function setTargets(targets={}){
  const fields = {
    calories: "targetCalories",
    protein: "targetProtein",
    carbs: "targetCarbs",
    fat: "targetFat",
    fiber: "targetFiber",
    water: "targetWater"
  };
  Object.entries(fields).forEach(([key,id]) => {
    if(targets[key] !== undefined && targets[key] !== null) document.getElementById(id).value = targets[key];
  });
}

function getCurrentLog(){
  return {
    weight: document.getElementById("weight").value,
    cycleDay: document.getElementById("cycleDay").value,
    steps: document.getElementById("steps").value,
    water: document.getElementById("water").value
  };
}

function setCurrentLog(log={}){
  ["weight","cycleDay","steps","water"].forEach(id => {
    if(log[id] !== undefined && log[id] !== null) document.getElementById(id).value = log[id];
  });
}

function buildDataSnapshot(){
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    todayMeals: today,
    today,
    dailyHistory: history,
    history,
    measurements,
    workouts,
    customFoods,
    targets: getTargets(),
    currentLog: getCurrentLog()
  };
}

function applyDataSnapshot(data){
  today = asRecordArray(data.todayMeals || data.today || today);
  history = asRecordArray(data.dailyHistory || data.history || history);
  measurements = asRecordArray(data.measurements || measurements);
  workouts = asRecordArray(data.workouts || workouts);
  customFoods = asRecordArray(data.customFoods || customFoods).filter(isValidFood);
  ensureTodayItemIds();
  if(data.targets) setTargets(data.targets);
  if(data.currentLog) setCurrentLog(data.currentLog);
  saveBrowserState();
  renderAll();
}

function saveBrowserState(){
  localStorage.setItem("todayMeals", JSON.stringify(today));
  localStorage.setItem("dailyHistory", JSON.stringify(history));
  localStorage.setItem("measurements", JSON.stringify(measurements));
  localStorage.setItem("workouts", JSON.stringify(workouts));
  localStorage.setItem("customFoods", JSON.stringify(customFoods));
  const targets = getTargets();
  localStorage.setItem("mealTargets", JSON.stringify(targets));
  localStorage.setItem("targets", JSON.stringify(targets));
  localStorage.setItem("currentLog", JSON.stringify(getCurrentLog()));
}

function hydrateBrowserState(){
  setTargets(readStorage("mealTargets", readStorage("targets", {})));
  setCurrentLog(readStorage("currentLog", {}));
}

function setDataStatus(message){
  const status = document.getElementById("dataStatus");
  if(status) status.textContent = message;
}

function queueDataFileSave(){
  clearTimeout(dataSaveTimer);
  dataSaveTimer = setTimeout(() => saveConnectedDataFile(), 300);
}

async function saveConnectedDataFile(){
  if(!connectedDataFileHandle || !connectedDataFileHandle.createWritable) return;
  try {
    const writable = await connectedDataFileHandle.createWritable();
    await writable.write(JSON.stringify(buildDataSnapshot(), null, 2));
    await writable.close();
    setDataStatus("Saved to connected data.json and browser storage.");
  } catch (err) {
    setDataStatus("Browser storage saved. Connected JSON save needs permission again.");
  }
}

function downloadJson(){
  saveBrowserState();
  const blob = new Blob([JSON.stringify(buildDataSnapshot(), null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.json";
  a.click();
  URL.revokeObjectURL(url);
  setDataStatus("Exported data.json. Keep it in this iCloud Drive app folder for backup.");
}

async function importJsonFile(file){
  if(!file) return;
  try {
    const text = await file.text();
    applyDataSnapshot(JSON.parse(text));
    setDataStatus(`Imported ${file.name} into browser storage.`);
  } catch (err) {
    setDataStatus("That JSON file could not be imported.");
  }
}

async function connectDataFile(){
  if(!window.showOpenFilePicker) {
    setDataStatus("This browser cannot directly update data.json. Use Export JSON and Import JSON for iCloud backup.");
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{description: "Meal tracker JSON", accept: {"application/json": [".json"]}}]
    });
    connectedDataFileHandle = handle;
    const file = await handle.getFile();
    const text = await file.text();
    if(text.trim()) applyDataSnapshot(JSON.parse(text));
    await saveConnectedDataFile();
  } catch (err) {
    setDataStatus("No data.json connected.");
  }
}

function populateFoods(){
  const select = document.getElementById("foodSelect");
  const q = document.getElementById("search").value;
  const current = select.value;
  select.innerHTML = "";
  allFoods().filter(f => foodMatches(f, q))
    .forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.dataset.serving = f.serving;
      opt.textContent = `${f.name} (${servingLabel(f)}, ${f.calories} cal)`;
      select.appendChild(opt);
    });
  if([...select.options].some(opt => opt.value === current)) select.value = current;
  syncServingFromSelection(true);
}

function normalizeText(text){
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function editDistanceWithinOne(a, b){
  if(Math.abs(a.length - b.length) > 1) return false;
  let edits = 0, i = 0, j = 0;
  while(i < a.length && j < b.length) {
    if(a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if(edits > 1) return false;
      if(a.length > b.length) i++;
      else if(b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function orderedLettersMatch(word, query){
  if(query.length < 3) return false;
  let index = 0;
  for(const char of word) {
    if(char === query[index]) index++;
    if(index === query.length) return true;
  }
  return false;
}

function fuzzyIncludes(text, query){
  const haystack = normalizeText(text);
  const needle = normalizeText(query);
  if(!needle) return true;
  if(haystack.includes(needle)) return true;
  const words = haystack.split(" ");
  return needle.split(" ").every(q => words.some(w => w.includes(q) || orderedLettersMatch(w, q) || (q.length > 3 && editDistanceWithinOne(w, q))));
}

function foodMatches(food, query){
  return fuzzyIncludes(`${food.name} ${food.category} ${food.note || ""} ${food.servingLabel || ""}`, query);
}

function selectedFood(){
  return allFoods().find(f => f.name === document.getElementById("foodSelect").value);
}

function servingLabel(food){
  const label = food.servingLabel || `${food.serving}g`;
  const grams = `${food.serving}g`;
  const base = label === grams ? grams : `${label} = ${grams}`;
  return `${base}${food.note ? `, ${food.note}` : ""}`;
}

function servingCountLabel(qty, serving){
  const amount = Number(qty || 0);
  const base = Number(serving || 0);
  if(!amount || !base) return "";
  const count = amount / base;
  const rounded = Math.round(count * 100) / 100;
  return `${rounded} ${rounded === 1 ? "serving" : "servings"}`;
}

function syncServingFromSelection(resetQty=false){
  const food = selectedFood();
  const qty = document.getElementById("qty");
  const info = document.getElementById("servingInfo");
  if(!food) {
    if(info) info.textContent = "";
    return;
  }
  if(resetQty) qty.value = food.serving;
  if(info) {
    const count = servingCountLabel(qty.value, food.serving);
    info.textContent = `${count ? `${count} = ` : ""}${servingLabel(food)}`;
  }
}

function formatQty(item){
  const grams = Number(item.qty || 0);
  const serving = Number(item.serving || 0);
  const count = servingCountLabel(grams, serving);
  if(!count) return `${grams}g`;
  return `${count}<div class="small">${grams}g</div>`;
}

function editQtyControls(item){
  return `<div class="qtyEditor"><div>${formatQty(item)}</div><div class="qtyEditRow"><input id="qty-${item.id}" type="number" min="0" step="0.1" value="${Number(item.qty || 0)}" onkeydown="handleQtyEditKey(event, '${item.id}')"><button class="updateQty" onclick="updateItemQty('${item.id}')">Update</button></div></div>`;
}

function totalCells(totals){
  return `<td>${totals.calories}</td><td>${totals.completeProtein}</td><td>${totals.carbs}</td><td>${totals.fiber}</td><td>${totals.fat}</td>`;
}

function renderBuilderTotals(){
  const totalsNow = totals();
  const target = getTargets();
  const remaining = target.calories ? target.calories - totalsNow.calories : null;
  const builderTotals = document.getElementById("builderTotals");
  if(!builderTotals) return;
  builderTotals.innerHTML = `<div><span>Running Daily Total</span><b>${totalsNow.calories} cal</b>${remaining !== null ? `<span class="small">${remaining.toFixed(1)} cal remaining</span>` : ""}</div><div><span>Complete Protein</span><b>${totalsNow.completeProtein}g</b></div><div><span>Carbs</span><b>${totalsNow.carbs}g</b></div><div><span>Fiber</span><b>${totalsNow.fiber}g</b></div><div><span>Fat</span><b>${totalsNow.fat}g</b></div>`;
}

function renderSummary(){
  const t = totals();
  const target = getTargets();
  const cards = [
    ["Calories", t.calories, target.calories, "cal"],
    ["Complete Protein", t.completeProtein, target.protein, "g"],
    ["Total Protein", t.totalProtein, null, "g"],
    ["Carbs", t.carbs, target.carbs, "g"],
    ["Fat", t.fat, target.fat, "g"],
    ["Fiber", t.fiber, target.fiber, "g"],
    ["Selenium", t.selenium, 55, "mcg"],
    ["Omega 3", t.omega3, 1.1, "g"]
  ];
  document.getElementById("summaryCards").innerHTML = cards.map(([n,v,target,u]) => {
    const rem = target !== null ? `<span class="small">Remaining: ${(target-v).toFixed(1)} ${u}</span>` : "";
    return `<div class="card"><span>${n}</span><b>${v} ${u}</b>${rem}</div>`;
  }).join("");

  const warnings = [];
  const fatItems = today.filter(i => ["Nut","Fat","Protein Fat"].includes(i.category));
  const hasNuts = today.some(i => ["Almonds","Walnuts","Brazil Nut","Pumpkin Seeds","Peanut Butter"].includes(i.name));
  const hasSardines = today.some(i => i.name.includes("Sardines") || i.name.includes("Salmon"));
  const hasGuac = today.some(i => i.name.includes("Guacamole"));
  const hasPaneer = today.some(i => i.name.includes("Paneer"));

  if(t.completeProtein < target.protein - 25) warnings.push("Complete protein is still low. Next meal should include chicken, egg whites, yogurt, cottage cheese, fish, tofu or soya chunks.");
  if(t.fat > target.fat) warnings.push("Fat is above target. Keep the next meal lean.");
  if(t.fiber < 15) warnings.push("Fiber is low. Add poriyal, greens, berries, chia or legumes.");
  if(t.selenium > 160) warnings.push("Selenium is high. Avoid extra Brazil nuts today.");
  if(hasNuts && hasSardines && hasGuac) warnings.push("You have nuts + sardines/salmon + guac. Avoid more fats today.");
  if(hasPaneer && hasNuts) warnings.push("Paneer + nuts today. Skip peanut butter or extra guac.");
  if(t.calories > target.calories) warnings.push("Calories are over target. Do not panic, just keep the next meal protein plus vegetables.");

  document.getElementById("guidance").innerHTML = warnings.length
    ? warnings.map(w => `<div class="warning">${w}</div>`).join("")
    : `<div class="good">Looks balanced so far.</div>`;
}

function renderMealLogTotals(){
  const container = document.getElementById("mealLogTotals");
  if(!container) return;
  const t = totals();
  container.innerHTML = `
    <div class="mealLogTotalCard primary"><span>Today's Calories</span><b>${t.calories} cal</b></div>
    <div class="mealLogTotalCard"><span>Complete Protein</span><b>${t.completeProtein}g</b></div>
    <div class="mealLogTotalCard"><span>Carbs</span><b>${t.carbs}g</b></div>
    <div class="mealLogTotalCard"><span>Fiber</span><b>${t.fiber}g</b></div>
    <div class="mealLogTotalCard"><span>Fat</span><b>${t.fat}g</b></div>
  `;
}

function renderMeals(){
  renderMealLogTotals();
  renderBuilderTotals();
  document.getElementById("mealSections").innerHTML = meals.map(meal => {
    const items = today.filter(i => i.meal === meal);
    const mt = totals(items);
    return `<div class="meal"><h3>${meal}  <span class="small">${mt.calories} cal, ${mt.completeProtein}g protein, ${mt.fiber}g fiber, ${mt.fat}g fat</span></h3>
      <table><thead><tr><th>Food</th><th>Qty</th><th>Cal</th><th>Protein</th><th>Carbs</th><th>Fiber</th><th>Fat</th><th></th></tr></thead>
      <tbody>${items.map(i => `<tr><td>${i.name}<div class="small">${i.note||""}</div></td><td>${editQtyControls(i)}</td><td>${i.calories}</td><td>${i.completeProtein}</td><td>${i.carbs}</td><td>${i.fiber}</td><td>${i.fat}</td><td><button class="remove" onclick="removeItem('${i.id}')">x</button></td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">${meal} Total</td>${totalCells(mt)}<td></td></tr></tfoot></table></div>`
  }).join("");
}

function removeItem(id){
  today = today.filter(i => i.id !== id);
  saveTodayState();
  renderAll();
}

function updateItemQty(id){
  const input = document.getElementById(`qty-${id}`);
  const item = today.find(i => i.id === id);
  const qty = Number(input && input.value);
  if(!item || !qty || qty <= 0) return;
  const updated = scaled(foodFromLoggedItem(item), qty);
  updated.meal = item.meal;
  updated.id = item.id;
  today = today.map(i => i.id === id ? updated : i);
  saveTodayState();
  renderAll();
}

function handleQtyEditKey(event, id){
  if(event.key === "Enter") updateItemQty(id);
}

function saveTodayState(){
  saveBrowserState();
  queueDataFileSave();
  if(!connectedDataFileHandle) setDataStatus("Saved to browser storage. Export or connect data.json for iCloud backup.");
}

function addFood(){
  const food = selectedFood();
  const qty = +document.getElementById("qty").value;
  const meal = document.getElementById("meal").value;
  if(!food || !qty) return;
  const item = scaled(food, qty);
  item.meal = meal;
  item.id = createItemId();
  today.push(item);
  saveTodayState();
  renderAll();
}

function saveDay(){
  const t = totals();
  history.push({
    date: new Date().toISOString().slice(0,10),
    cycleDay: document.getElementById("cycleDay").value,
    weight: document.getElementById("weight").value,
    steps: document.getElementById("steps").value,
    water: document.getElementById("water").value,
    ...t
  });
  localStorage.setItem("dailyHistory", JSON.stringify(history));
  saveTodayState();
  renderHistory();
}

function renderHistory(){
  document.getElementById("historyTable").innerHTML = `<thead><tr><th>Date</th><th>Weight</th><th>Calories</th><th>Complete Protein</th><th>Fiber</th><th>Fat</th><th>Steps</th><th>Cycle</th></tr></thead><tbody>` +
    history.slice().reverse().map(h => `<tr><td>${h.date}</td><td>${h.weight||""}</td><td>${h.calories}</td><td>${h.completeProtein}</td><td>${h.fiber||0}</td><td>${h.fat||0}</td><td>${h.steps||""}</td><td>${h.cycleDay||""}</td></tr>`).join("") + `</tbody>`;
}

function saveMeasurement(){
  measurements.push({
    date: new Date().toISOString().slice(0,10),
    weight: document.getElementById("mWeight").value,
    waist: document.getElementById("waist").value,
    lowerBelly: document.getElementById("lowerBelly").value,
    hips: document.getElementById("hips").value,
    neck: document.getElementById("neck").value,
    cycleDay: document.getElementById("mCycleDay").value
  });
  saveTodayState();
  renderMeasurements();
}

function renderMeasurements(){
  const table = document.getElementById("measurementTable");
  if(!table) return;
  table.innerHTML = `<thead><tr><th>Date</th><th>Weight</th><th>Waist</th><th>Lower Belly</th><th>Hips</th><th>Neck</th><th>Cycle</th></tr></thead><tbody>` +
    measurements.slice().reverse().map(m => `<tr><td>${m.date||""}</td><td>${m.weight||""}</td><td>${m.waist||""}</td><td>${m.lowerBelly||""}</td><td>${m.hips||""}</td><td>${m.neck||""}</td><td>${m.cycleDay||""}</td></tr>`).join("") + `</tbody>`;
}

function saveWorkout(){
  const notes = document.getElementById("workoutNotes");
  workouts.push({
    date: new Date().toISOString().slice(0,10),
    type: document.getElementById("workoutType").value,
    notes: notes.value
  });
  notes.value = "";
  saveTodayState();
  renderWorkouts();
}

function renderWorkouts(){
  const table = document.getElementById("workoutTable");
  if(!table) return;
  table.innerHTML = `<thead><tr><th>Date</th><th>Type</th><th>Notes</th></tr></thead><tbody>` +
    workouts.slice().reverse().map(w => `<tr><td>${w.date||""}</td><td>${w.type||""}</td><td>${w.notes||""}</td></tr>`).join("") + `</tbody>`;
}

function foodRow(food){
  return `<tr><td>${food.name}</td><td>${food.category}</td><td>${servingLabel(food)}</td><td>${food.calories}</td><td>${food.completeProtein}</td><td>${food.carbs}</td><td>${food.fat}</td></tr>`;
}

function renderFoodDatabase(){
  const table = document.getElementById("foodDbTable");
  if(!table) return;
  const q = document.getElementById("foodDbSearch").value;
  const foods = allFoods().filter(f => foodMatches(f, q));
  table.innerHTML = `<thead><tr><th>Food</th><th>Category</th><th>Serving</th><th>Cal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>` +
    foods.map(foodRow).join("") + `</tbody>`;
}

function numericInput(id){
  return +document.getElementById(id).value || 0;
}

function saveCustomFood(){
  const name = document.getElementById("cfName").value.trim();
  const serving = numericInput("cfServing") || 100;
  if(!name) return;
  const completeProtein = numericInput("cfCompleteProtein");
  const totalProtein = numericInput("cfTotalProtein") || completeProtein;
  const food = {
    name,
    category: document.getElementById("cfCategory").value.trim() || "Custom",
    serving,
    servingLabel: document.getElementById("cfServingLabel").value.trim() || `${serving}g`,
    defaultMode: document.getElementById("cfDefaultMode").value,
    calories: numericInput("cfCalories"),
    completeProtein,
    totalProtein,
    carbs: numericInput("cfCarbs"),
    fat: numericInput("cfFat"),
    fiber: numericInput("cfFiber"),
    calcium: numericInput("cfCalcium"),
    iron: numericInput("cfIron"),
    potassium: numericInput("cfPotassium"),
    selenium: numericInput("cfSelenium"),
    omega3: numericInput("cfOmega3"),
    note: document.getElementById("cfNote").value.trim() || "Custom food"
  };
  const existing = customFoods.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
  if(existing >= 0) customFoods[existing] = food;
  else customFoods.push(food);
  saveTodayState();
  populateFoods();
  renderFoodDatabase();
  renderCustomFoods();
}

function renderCustomFoods(){
  const table = document.getElementById("customFoodTable");
  if(!table) return;
  table.innerHTML = `<thead><tr><th>Food</th><th>Category</th><th>Serving</th><th>Cal</th><th>Protein</th></tr></thead><tbody>` +
    customFoods.map(f => `<tr><td>${f.name}</td><td>${f.category}</td><td>${servingLabel(f)}</td><td>${f.calories}</td><td>${f.completeProtein}</td></tr>`).join("") + `</tbody>`;
}

function exportCsv(){
  const rows = [["date","weight","cycleDay","calories","completeProtein","totalProtein","carbs","fat","fiber","steps","water"]];
  history.forEach(h => rows.push([h.date,h.weight,h.cycleDay,h.calories,h.completeProtein,h.totalProtein,h.carbs,h.fat,h.fiber,h.steps,h.water]));
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "meal_tracker_export.csv"; a.click();
}

function clearToday(){
  if(confirm("Clear today's meal builder?")) {
    today = [];
    saveTodayState();
    renderAll();
  }
}

function renderAll(){
  renderSummary();
  renderMeals();
  renderHistory();
  renderMeasurements();
  renderWorkouts();
  renderFoodDatabase();
  renderCustomFoods();
}

function on(id, event, handler){
  const element = document.getElementById(id);
  if(element) element.addEventListener(event, handler);
}

document.querySelectorAll("nav button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(section => section.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(button.dataset.tab).classList.add("active");
  });
});

on("addFood", "click", addFood);
on("search", "input", populateFoods);
on("foodSelect", "change", () => syncServingFromSelection(true));
on("qty", "input", () => syncServingFromSelection(false));
on("saveDay", "click", saveDay);
on("saveMeasurement", "click", saveMeasurement);
on("saveWorkout", "click", saveWorkout);
on("saveCustomFood", "click", saveCustomFood);
on("foodDbSearch", "input", renderFoodDatabase);
on("exportCsv", "click", exportCsv);
on("exportCsvBackup", "click", exportCsv);
on("clearToday", "click", clearToday);
on("connectDataFile", "click", connectDataFile);
on("exportJson", "click", downloadJson);
on("exportJsonBackup", "click", downloadJson);
on("importJson", "change", e => importJsonFile(e.target.files[0]));
on("importJsonBackup", "change", e => importJsonFile(e.target.files[0]));
["weight","cycleDay","steps","water"].forEach(id => document.getElementById(id).addEventListener("input", () => {
  saveBrowserState();
  queueDataFileSave();
}));
["targetCalories","targetProtein","targetCarbs","targetFat","targetFiber","targetWater"].forEach(id => document.getElementById(id).addEventListener("input", () => {
  saveBrowserState();
  queueDataFileSave();
  renderSummary();
}));

hydrateBrowserState();
populateFoods();
renderAll();
