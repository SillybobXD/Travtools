import type { Res4, TrainingBuilding } from "./types";
import { BUILDINGS, MERCH, UNITS } from "./data";
import { fmt, fmtTime, toNum } from "./calc/format";
import { buildingTotals, type BuildRow } from "./calc/buildings";
import { maxTroops, trainingTime, troopsForTime } from "./calc/troops";
import { npcTargets, planNeeds, storageCaps } from "./calc/npc";
import { merchantsNeeded, travelSeconds } from "./calc/merchants";
import { loadState, saveState, type SavedState } from "./storage";

const BLDG_LABEL: Record<TrainingBuilding, string> = { B: "Barracks level", S: "Stable level", W: "Workshop level", R: "Residence or palace level" };
const NAMES = ["Wood", "Clay", "Iron", "Crop"];
const COLORS = ["var(--wood)", "var(--clay)", "var(--iron)", "var(--crop)"];
const RES = [0, 1, 2, 3] as const;
const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => toNum($(id).value);
const res4 = (f: (i: number) => number) => RES.map(f) as Res4;

/* ---- state ---- */
let mode = "max";
let builds: BuildRow[] = [];

const tribeSel = $<HTMLSelectElement>("tribe"), unitSel = $<HTMLSelectElement>("unit");
Object.keys(UNITS).forEach(t => tribeSel.add(new Option(t, t)));
function fillUnits() { unitSel.innerHTML = ""; UNITS[tribeSel.value].forEach((u, i) => unitSel.add(new Option(u.name, String(i)))); }
function loadUnit() {
  const u = UNITS[tribeSel.value][Number(unitSel.value)];
  for (let i = 0; i < 4; i++) $("cost" + i).value = String(u.cost[i]);
  $("upkeep").value = String(u.upkeep);
  $("baseTime").value = u.time ? String(u.time) : "";
  $("lvlLabel").textContent = BLDG_LABEL[u.building];
}
function loadMerchant() { const m = MERCH[tribeSel.value]; $("merchCap").value = String(m.capacity); $("merchSpeed").value = String(m.speed); }

function setMode(m: string) {
  mode = m;
  document.querySelectorAll<HTMLButtonElement>(".seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false"));
  $("troopFields").hidden = m === "none";
  $("countWrap").hidden = m !== "count";
  $("hoursWrap").hidden = m !== "time";
  $("minsWrap").hidden = m !== "time";
  calc();
}

function buildOptions(sel: number) {
  return BUILDINGS.map((b, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${b.name}</option>`).join("");
}
function renderBuilds() {
  const box = $("builds");
  if (!builds.length) { box.innerHTML = `<p class="hint" style="margin-top:0">No upgrades yet. Add a building to include its cost in the plan.</p>`; return; }
  box.innerHTML = builds.map((r, i) => `
    <div class="brow" data-i="${i}">
      <div class="brow-top">
        <div><label for="bsel${i}">Building</label><select id="bsel${i}" data-f="b">${buildOptions(r.b)}</select></div>
        <button type="button" class="remove" data-remove="${i}" aria-label="Remove ${BUILDINGS[r.b].name}">Remove</button>
      </div>
      <div class="brow-nums">
        <div><label for="bfrom${i}">Current level</label><input id="bfrom${i}" data-f="from" inputmode="numeric" value="${r.from}"></div>
        <div><label for="bto${i}">Target level</label><input id="bto${i}" data-f="to" inputmode="numeric" value="${r.to}"></div>
        <div><label for="bqty${i}">How many</label><input id="bqty${i}" data-f="qty" inputmode="numeric" value="${r.qty}"></div>
      </div>
      <div class="cost-line" id="bcost${i}"></div>
    </div>`).join("");
}

/* ---- main calculation ---- */
function calc() {
  const have = res4(i => num("have" + i));
  const wh = num("wh"), gr = num("gr");
  const caps = storageCaps(wh, gr);
  const speed = parseInt($("speed").value, 10) || 1;

  /* buildings */
  const bt = buildingTotals(builds, BUILDINGS);
  const { tot: bTot, peak: bPeak, sum: bSum } = bt;
  bt.rows.forEach((r, i) => {
    const el = $("bcost" + i);
    if (!el) return;
    if (!r.valid) { el.innerHTML = `<span class="hint" style="margin:0">Set a target level above ${r.from}. Max level is ${r.max}.</span>`; return; }
    el.innerHTML = RES.map(k => `<span style="--c:${COLORS[k]}"><b>${NAMES[k]}</b> ${fmt(r.cost[k])}</span>`).join("") +
      `<span>Total ${fmt(r.cost.reduce((a, b) => a + b, 0))}</span>`;
  });

  /* troops */
  const cost = res4(i => num("cost" + i));
  const cSum = cost.reduce((a, b) => a + b, 0);
  const upkeep = num("upkeep");
  const perUnit = trainingTime(num("baseTime"), num("lvl"), speed, num("bonus"));
  const unitName = unitSel.options[unitSel.selectedIndex].text;
  const haveTotal = have.reduce((a, b) => a + b, 0);
  let n = 0, capLimited = -1;
  if (mode === "max") ({ count: n, capLimited } = maxTroops(haveTotal, bTot, cost, caps));
  else if (mode === "count") n = num("count");
  else if (mode === "time") n = troopsForTime((num("hours") * 60 + num("mins")) * 60, perUnit);

  if (mode !== "none") {
    const parts = [`<div><div class="big">${fmt(n)}</div><span class="hint" style="margin:0">${unitName}</span></div>`];
    if (perUnit > 0) {
      parts.push(`<div class="stat"><span>Each unit</span><strong>${fmtTime(perUnit)}</strong></div>`);
      parts.push(`<div class="stat"><span>All units</span><strong>${fmtTime(perUnit * n)}</strong></div>`);
    } else parts.push(`<div class="stat"><span>Training time</span><strong class="warn">Add base time in Unit stats</strong></div>`);
    parts.push(`<div class="stat"><span>Upkeep</span><strong>${fmt(n * upkeep)} crop/h</strong></div>`);
    $("troopOut").innerHTML = parts.join("");
  }
  const tN = mode === "none" ? 0 : n;
  const need = res4(i => bTot[i] + cost[i] * tN);

  /* verdict */
  const { needSum, shortEach, shortSum, coveredDirect, coveredNpc, useNpc } = planNeeds(have, need);
  let verdict;
  if (needSum === 0) verdict = "Add buildings or troops to see what they cost.";
  else if (coveredDirect) verdict = `You already have enough. No trade needed.`;
  else if (coveredNpc) verdict = `One NPC trade covers it. You have ${fmt(haveTotal - needSum)} to spare.`;
  else verdict = `You're ${fmt(needSum - haveTotal)} resources short, even after trading.`;
  $("verdict").textContent = verdict;

  /* NPC targets */
  const target = useNpc ? npcTargets(need, haveTotal, caps, parseInt($("pref").value, 10)) : need.slice() as Res4;
  $("prefWrap").hidden = !useNpc;
  $("lastHead").textContent = useNpc ? "Set NPC to" : "Missing";

  const body = $("planBody"); body.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const tr = document.createElement("tr"); tr.style.setProperty("--c", COLORS[i]);
    let last;
    if (useNpc) {
      const d = target[i] - have[i], cls = d > 0 ? "up" : d < 0 ? "down" : "zero";
      const pct = caps[i] === Infinity ? null : Math.min(100, target[i] / caps[i] * 100);
      last = `<span class="strong">${fmt(target[i])}</span> <span class="${cls}">(${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))})</span>` +
        (pct === null ? "" : `<div class="bar"><i style="width:${pct}%"></i></div>`);
    } else last = shortEach[i] > 0 ? `<span class="down">${fmt(shortEach[i])}</span>` : `<span class="zero">0</span>`;
    tr.innerHTML = `<td>${NAMES[i]}</td><td>${fmt(have[i])}</td><td>${fmt(need[i])}</td><td>${last}</td>`;
    body.appendChild(tr);
  }
  $("planFoot").innerHTML = `<tr><td>Total</td><td>${fmt(haveTotal)}</td><td>${fmt(needSum)}</td><td>${useNpc ? fmt(target.reduce((a, b) => a + b, 0)) : fmt(shortSum)}</td></tr>`;

  /* notes */
  const notes = [];
  if (bSum > 0) notes.push(`Buildings: ${fmt(bSum)}.`);
  if (tN > 0) notes.push(`Troops: ${fmt(tN * cSum)}.`);
  if (mode === "max" && capLimited >= 0) notes.push(`<span class="warn">Your ${capLimited === 3 ? "granary" : "warehouse"} caps the troop count: more ${NAMES[capLimited].toLowerCase()} wouldn't fit.</span>`);
  const over = RES.filter(i => caps[i] !== Infinity && need[i] > caps[i]);
  if (over.length) notes.push(`<span class="warn">${over.map(i => NAMES[i]).join(", ")} needed is more than your storage holds at once, so you'll have to do this in more than one round.</span>`);
  const peakOver: number[] = RES.filter(i => caps[i] !== Infinity && bPeak[i] > caps[i]);
  if (peakOver.length) notes.push(`<span class="warn">At least one upgrade level costs more ${peakOver.map(i => NAMES[i].toLowerCase()).join(" and ")} than your storage can hold. Upgrade the ${peakOver.includes(3) && peakOver.length === 1 ? "granary" : peakOver.includes(3) ? "warehouse and granary" : "warehouse"} first.</span>`);
  if (!wh || !gr) notes.push("Add warehouse and granary capacity so the plan respects storage.");
  $("planNote").innerHTML = notes.join(" ");

  /* sending */
  const cap = num("merchCap"), mspd = num("merchSpeed"), dist = parseFloat($("dist").value) || 0;
  const merchants = (amt: number) => merchantsNeeded(amt, cap);
  const travel = travelSeconds(dist, mspd, speed);
  const travelTxt = travel ? ` Travel time one way: <strong>${fmtTime(travel)}</strong>.` : " Add a distance to see travel time.";
  let send;
  if (needSum === 0) send = `<p class="zero">Nothing to send yet.</p>`;
  else if (coveredDirect) send = `<p class="good">Nothing to send. This village already has everything.</p>`;
  else {
    const exact = shortEach.map((v, i) => v > 0 ? `<span style="color:${COLORS[i]};font-weight:700">${NAMES[i]}</span> ${fmt(v)}` : null).filter(Boolean).join(", ");
    send = `<p><strong>Without trading:</strong> send ${exact}. That's ${fmt(shortSum)} total, ${fmt(merchants(shortSum))} merchant${merchants(shortSum) === 1 ? "" : "s"}.</p>`;
    if (!coveredNpc) {
      const gap = needSum - haveTotal;
      send += `<p><strong>With an NPC trade after:</strong> send ${fmt(gap)} of any resource, ${fmt(merchants(gap))} merchant${merchants(gap) === 1 ? "" : "s"}, then trade to the “Needed” amounts.</p>`;
    } else send += `<p><strong>Or skip sending</strong> and use the NPC trade above.</p>`;
    send += `<p class="hint" style="margin:0">${travelTxt.trim()}</p>`;
  }
  $("sendBox").innerHTML = send;

  $("unitWarn").innerHTML = tribeSel.value === "Spartans"
    ? `<span class="warn">Spartan costs are unverified and base times are blank. Check them against your game.</span>` : "";

  save();
}

/* ---- persistence ---- */
const FIELDS = ["have0", "have1", "have2", "have3", "wh", "gr", "lvl", "count", "hours", "mins", "bonus", "dist", "merchCap", "merchSpeed"];
function save() {
  const s: SavedState = { tribe: tribeSel.value, unit: unitSel.value, speed: $("speed").value, pref: $("pref").value, mode, builds };
  FIELDS.forEach(f => s[f] = $(f).value);
  saveState(s);
}
function restore() {
  const s = loadState();
  if (s && s.tribe && UNITS[s.tribe]) tribeSel.value = s.tribe;
  fillUnits();
  if (s && s.unit != null && unitSel.options[Number(s.unit)]) unitSel.value = s.unit;
  loadUnit(); loadMerchant();
  $("lvl").value = "1"; $("count").value = "100"; $("hours").value = "8"; $("mins").value = "0";
  if (s) {
    FIELDS.forEach(f => { if (s[f] != null && s[f] !== "") $(f).value = String(s[f]); });
    if (s.speed) $("speed").value = s.speed;
    if (s.pref) $("pref").value = s.pref;
    if (Array.isArray(s.builds)) builds = s.builds.filter(r => BUILDINGS[r.b]);
    if (s.mode) mode = s.mode;
  }
}

/* ---- events ---- */
tribeSel.addEventListener("change", () => { fillUnits(); loadUnit(); loadMerchant(); calc(); });
unitSel.addEventListener("change", () => { loadUnit(); calc(); });
$("resetUnit").addEventListener("click", () => { loadUnit(); calc(); });
$("speed").addEventListener("change", calc);
$("pref").addEventListener("change", calc);
document.querySelectorAll("main > section input, details input").forEach(el => el.addEventListener("input", calc));
document.querySelectorAll<HTMLButtonElement>(".seg button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode!)));
$("addBuild").addEventListener("click", () => {
  builds.push({ b: 0, from: 0, to: 1, qty: 1 });
  renderBuilds(); calc();
  const sel = $("bsel" + (builds.length - 1)); if (sel) sel.focus();
});
$("builds").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  const row = t.closest<HTMLElement>(".brow"); if (!row) return;
  const i = +row.dataset.i!, f = t.dataset.f as keyof BuildRow;
  if (f === "b") builds[i].b = +t.value; else builds[i][f] = t.value;
  calc();
});
$("builds").addEventListener("change", e => { if ((e.target as HTMLElement).dataset.f === "b") { renderBuilds(); calc(); } });
$("builds").addEventListener("click", e => {
  const r = (e.target as HTMLElement).dataset.remove; if (r == null) return;
  builds.splice(+r, 1); renderBuilds(); calc();
});

restore();
renderBuilds();
setMode(mode);
