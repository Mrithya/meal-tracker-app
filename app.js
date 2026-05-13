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

let today = readStorage("todayMeals", []);
let history = readStorage("dailyHistory", []);

const keys = ["calories","completeProtein","totalProtein","carbs","fat","fiber","calcium","iron","potassium","selenium","omega3"];

function scaled(food, qty){
  const factor = Number(qty || 0) / food.serving;
  const out = {name: food.name, category: food.category, qty: Number(qty), serving: Number(food.serving), note: food.note};
  keys.forEach(k => out[k] = +(food[k] * factor).toFixed(1));
  return out;
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
    dailyHistory: history,
    targets: getTargets(),
    currentLog: getCurrentLog()
  };
}

function applyDataSnapshot(data){
  if(Array.isArray(data.todayMeals)) today = data.todayMeals;
  if(Array.isArray(data.dailyHistory)) history = data.dailyHistory;
  if(data.targets) setTargets(data.targets);
  if(data.currentLog) setCurrentLog(data.currentLog);
  saveBrowserState();
  renderAll();
}

function saveBrowserState(){
  localStorage.setItem("todayMeals", JSON.stringify(today));
  localStorage.setItem("dailyHistory", JSON.stringify(history));
  localStorage.setItem("mealTargets", JSON.stringify(getTargets()));
  localStorage.setItem("currentLog", JSON.stringify(getCurrentLog()));
}

function hydrateBrowserState(){
  setTargets(readStorage("mealTargets", {}));
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
  const q = document.getElementById("search").value.toLowerCase();
  const current = select.value;
  select.innerHTML = "";
  FOODS.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
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

function selectedFood(){
  return FOODS.find(f => f.name === document.getElementById("foodSelect").value);
}

function servingLabel(food){
  return `${food.serving}g${food.note ? `, ${food.note}` : ""}`;
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

function renderMeals(){
  document.getElementById("mealSections").innerHTML = meals.map(meal => {
    const items = today.filter(i => i.meal === meal);
    const mt = totals(items);
    return `<div class="meal"><h3>${meal}  <span class="small">${mt.calories} cal, ${mt.completeProtein}g complete protein</span></h3>
      <table><thead><tr><th>Food</th><th>Qty</th><th>Cal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th></th></tr></thead>
      <tbody>${items.map((i,idx) => `<tr><td>${i.name}<div class="small">${i.note||""}</div></td><td>${formatQty(i)}</td><td>${i.calories}</td><td>${i.completeProtein}</td><td>${i.carbs}</td><td>${i.fat}</td><td><button class="remove" onclick="removeItem('${i.id}')">x</button></td></tr>`).join("")}</tbody></table></div>`
  }).join("");
}

function removeItem(id){
  today = today.filter(i => i.id !== id);
  saveTodayState();
  renderAll();
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
  item.id = Date.now().toString() + Math.random().toString(16).slice(2);
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
  document.getElementById("historyTable").innerHTML = `<thead><tr><th>Date</th><th>Weight</th><th>Calories</th><th>Complete Protein</th><th>Steps</th><th>Cycle</th></tr></thead><tbody>` +
    history.slice().reverse().map(h => `<tr><td>${h.date}</td><td>${h.weight||""}</td><td>${h.calories}</td><td>${h.completeProtein}</td><td>${h.steps||""}</td><td>${h.cycleDay||""}</td></tr>`).join("") + `</tbody>`;
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

function renderAll(){ renderSummary(); renderMeals(); renderHistory(); }

document.getElementById("addFood").addEventListener("click", addFood);
document.getElementById("search").addEventListener("input", populateFoods);
document.getElementById("foodSelect").addEventListener("change", () => syncServingFromSelection(true));
document.getElementById("qty").addEventListener("input", () => syncServingFromSelection(false));
document.getElementById("saveDay").addEventListener("click", saveDay);
document.getElementById("exportCsv").addEventListener("click", exportCsv);
document.getElementById("clearToday").addEventListener("click", clearToday);
document.getElementById("connectDataFile").addEventListener("click", connectDataFile);
document.getElementById("exportJson").addEventListener("click", downloadJson);
document.getElementById("importJson").addEventListener("change", e => importJsonFile(e.target.files[0]));
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
