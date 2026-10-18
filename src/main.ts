import type { Res4, TrainingBuilding, Unit } from "./types";
import { BUILDINGS, CELEBRATIONS, MERCH, UNITS } from "./data";
import { fmt, fmtTime, toNum } from "./calc/format";
import { buildingTotals } from "./calc/buildings";
import { celebrationCost } from "./calc/celebrations";
import { maxTroopMix, mixDuration, trainingTime, troopMixForTime, type TimedRow } from "./calc/troops";
import { npcTargets, planNeeds, storageCaps } from "./calc/npc";
import { merchantsNeeded, travelSeconds } from "./calc/merchants";
import { parseOverview, type OverviewImport } from "./parse/overview";
import { loadStore, newId, newVillage, saveStore, type Store, type TroopRow, type VillageState } from "./storage";

const TRAIN_NAME: Record<TrainingBuilding, string> = { B: "Barracks", S: "Stable", W: "Workshop", R: "Residence or palace" };
const TRAIN_ORDER: TrainingBuilding[] = ["B", "S", "W", "R"];
const NAMES = ["Wood", "Clay", "Iron", "Crop"];
const COLORS = ["var(--wood)", "var(--clay)", "var(--iron)", "var(--crop)"];
const RES = [0, 1, 2, 3] as const;
/** Plain inputs saved per village as typed. */
const FIELDS = ["have0", "have1", "have2", "have3", "wh", "gr", "hours", "mins", "dist", "merchCap", "merchSpeed"];
const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => toNum($(id).value);
const res4 = (f: (i: number) => number) => RES.map(f) as Res4;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Blank or invalid ratio counts as 1; 0 leaves the row out. */
const ratio = (s: string) => { const n = parseFloat(String(s).replace(",", ".")); return isFinite(n) && n >= 0 ? n : 1; };

/* ---- state ---- */
const buildingOf = (tribe: string, unit: number) => UNITS[tribe]?.[unit]?.building;
let store: Store = loadStore(buildingOf) ?? (() => {
  const id = newId();
  return { version: 2, current: id, villages: { [id]: newVillage("My village", Object.keys(UNITS)[0], "1") }, overrides: {} } as Store;
})();
if (!store.villages[store.current]) store.current = Object.keys(store.villages)[0];
let v: VillageState = store.villages[store.current];

const tribeSel = $<HTMLSelectElement>("tribe"), villageSel = $<HTMLSelectElement>("village"), statSel = $<HTMLSelectElement>("statUnit");
Object.keys(UNITS).forEach(t => tribeSel.add(new Option(t, t)));

/** Unit stats with the user's edits applied. */
function unitStats(tribe: string, i: number): Unit {
  const base = UNITS[tribe][i], o = store.overrides[tribe]?.[i];
  return o ? { ...base, ...o } : base;
}
function trainOf(b: TrainingBuilding) { return v.train[b] ??= { lvl: "1", bonus: "" }; }

/* ---- villages ---- */
function fillVillages() {
  villageSel.innerHTML = "";
  for (const [id, s] of Object.entries(store.villages)) villageSel.add(new Option(s.name, id));
  villageSel.value = store.current;
  $<HTMLButtonElement>("deleteVillage").disabled = Object.keys(store.villages).length < 2;
}
function switchVillage(id: string) {
  save();
  store.current = id; v = store.villages[id];
  applyVillage();
}
/** Puts the current village's state into the page. */
function applyVillage() {
  if (!UNITS[v.tribe]) v.tribe = Object.keys(UNITS)[0];
  tribeSel.value = v.tribe;
  $("speed").value = v.speed || "1";
  $("pref").value = v.pref || "3";
  FIELDS.forEach(f => $(f).value = "");
  loadMerchant();
  $("hours").value = "8"; $("mins").value = "0";
  FIELDS.forEach(f => { const s = v.fields[f]; if (s != null && s !== "") $(f).value = s; });
  v.celebs = CELEBRATIONS.map((_, i) => v.celebs?.[i] ?? "");
  v.celebs.forEach((s, i) => $("celeb" + i).value = s);
  const units = UNITS[v.tribe];
  v.troops = (v.troops ?? []).filter(r => units[r.unit]);
  if (!v.troops.length) v.troops = [{ unit: 0, ratio: "1", count: "100" }];
  v.builds = (v.builds ?? []).filter(r => BUILDINGS[r.b]);
  v.train ??= {};
  fillVillages();
  fillStatUnits(v.troops[0].unit);
  renderBuilds();
  setMode(v.mode || "max");
}

/* ---- import from the game ---- */
interface ImportRow { name: string; res: Res4; active: boolean }
let importRows: ImportRow[] = [];
let importStock: OverviewImport["stock"] = null;

const sameName = (a: string | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

function previewImport() {
  const text = $<HTMLTextAreaElement>("importText").value;
  const r = parseOverview(text);
  importStock = r.stock;
  importRows = r.villages.map(x => ({ ...x, active: x.name === r.activeName }));
  // Top bar only (e.g. copied from another page): it belongs to the village shown here.
  if (!importRows.length && r.stock) importRows = [{ name: "", res: r.stock.res, active: true }];
  $("importStatus").textContent = "";
  const box = $("importPreview");
  if (!text.trim()) { box.innerHTML = ""; return; }
  if (!importRows.length) { box.innerHTML = `<p class="hint warn">Couldn't find resources in that text. Copy the whole Village overview page, Resources tab.</p>`; return; }
  const saved = Object.entries(store.villages);
  const matchOf = (row: ImportRow) => row.name ? saved.find(([, s]) => sameName(s.gameName, row.name) || sameName(s.name, row.name))?.[0] : store.current;
  const matched = new Set(importRows.map(matchOf));
  // First import: the village you were in goes into the one shown here, if nothing else claims it.
  const fallback = !v.gameName && !matched.has(store.current) ? store.current : undefined;
  box.innerHTML = `<div class="gap">` + importRows.map((row, i) => {
    const res = row.active && importStock ? importStock.res : row.res;
    const match = matchOf(row) ?? (row.active ? fallback : undefined);
    const opts = [`<option value="new"${match ? "" : " selected"}>New village</option>`,
      ...saved.map(([id, s]) => `<option value="${id}"${id === match ? " selected" : ""}>${esc(s.name)}</option>`),
      `<option value="skip">Skip</option>`].join("");
    return `<div class="imp-row">
      <div><strong>${row.name ? esc(row.name) : "Village you were in"}</strong>${row.active && row.name ? ` <span class="hint">(you were here)</span>` : ""}
        <div class="cost-line">${RES.map(k => `<span style="--c:${COLORS[k]}"><b>${NAMES[k]}</b> ${fmt(res[k])}</span>`).join("")}</div></div>
      <select data-i="${i}" aria-label="Save ${row.name ? esc(row.name) : "this village"} into">${opts}</select>
    </div>`;
  }).join("") + `</div><button type="button" class="primary gap" id="importApply">Update villages</button>`;
}

function applyImport() {
  save();
  let updated = 0, added = 0, activeId: string | null = null;
  document.querySelectorAll<HTMLSelectElement>("#importPreview select").forEach(sel => {
    const row = importRows[+sel.dataset.i!];
    if (sel.value === "skip") return;
    let id = sel.value;
    if (id === "new") {
      id = newId();
      store.villages[id] = newVillage(row.name || `Village ${Object.keys(store.villages).length + 1}`, v.tribe, v.speed);
      added++;
    } else updated++;
    const target = store.villages[id];
    if (row.name) target.gameName = row.name;
    const stock = row.active ? importStock : null;
    (stock ? stock.res : row.res).forEach((x, k) => target.fields["have" + k] = String(x));
    if (stock) { target.fields.wh = String(stock.warehouse); target.fields.gr = String(stock.granary); activeId = id; }
  });
  if (activeId) store.current = activeId;
  v = store.villages[store.current];
  applyVillage();
  $<HTMLTextAreaElement>("importText").value = "";
  $("importPreview").innerHTML = "";
  const parts = [updated && `updated ${updated} village${updated === 1 ? "" : "s"}`, added && `added ${added}`].filter(Boolean);
  $("importStatus").textContent = parts.length ? `Done: ${parts.join(", ")}.` + (activeId ? ` Showing ${v.name}, with its storage.` : "") : "Nothing imported.";
}

/* ---- unit stats ---- */
function fillStatUnits(sel: number) {
  statSel.innerHTML = "";
  UNITS[v.tribe].forEach((u, i) => statSel.add(new Option(u.name, String(i))));
  statSel.value = String(sel);
  showStats();
}
function showStats() {
  const u = unitStats(v.tribe, Number(statSel.value));
  for (let i = 0; i < 4; i++) $("cost" + i).value = String(u.cost[i]);
  $("upkeep").value = String(u.upkeep);
  $("baseTime").value = u.time ? String(u.time) : "";
}
function saveStats() {
  (store.overrides[v.tribe] ??= {})[statSel.value] = { cost: res4(i => num("cost" + i)), upkeep: num("upkeep"), time: num("baseTime") };
}
function loadMerchant() { const m = MERCH[tribeSel.value]; $("merchCap").value = String(m.capacity); $("merchSpeed").value = String(m.speed); }

/* ---- mode and rows ---- */
function setMode(m: string) {
  v.mode = m;
  document.querySelectorAll<HTMLButtonElement>(".seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false"));
  $("troopFields").hidden = m === "none";
  $("timeWrap").hidden = m !== "time";
  renderTroops();
  calc();
}

function buildOptions(sel: number) {
  return BUILDINGS.map((b, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${b.name}</option>`).join("");
}
function renderBuilds() {
  const box = $("builds");
  if (!v.builds.length) { box.innerHTML = `<p class="hint" style="margin-top:0">No upgrades yet. Add a building to include its cost in the plan.</p>`; return; }
  box.innerHTML = v.builds.map((r, i) => `
    <div class="brow" data-i="${i}">
      <div class="brow-top">
        <div><label for="bsel${i}">Building</label><select id="bsel${i}" data-f="b">${buildOptions(r.b)}</select></div>
        <button type="button" class="remove" data-remove="${i}" aria-label="Remove ${BUILDINGS[r.b].name}">Remove</button>
      </div>
      <div class="brow-nums">
        <div><label for="bfrom${i}">Current level</label><input id="bfrom${i}" data-f="from" inputmode="numeric" value="${esc(String(r.from))}"></div>
        <div><label for="bto${i}">Target level</label><input id="bto${i}" data-f="to" inputmode="numeric" value="${esc(String(r.to))}"></div>
        <div><label for="bqty${i}">How many</label><input id="bqty${i}" data-f="qty" inputmode="numeric" value="${esc(String(r.qty))}"></div>
      </div>
      <div class="cost-line" id="bcost${i}"></div>
    </div>`).join("");
}

function renderTroops() {
  const units = UNITS[v.tribe], many = v.troops.length > 1, counting = v.mode === "count";
  $("troops").innerHTML = v.troops.map((r, i) => {
    const opts = units.map((u, k) => `<option value="${k}"${k === r.unit ? " selected" : ""}>${u.name}</option>`).join("");
    const field = counting
      ? `<div><label for="tcount${i}">Number of units</label><input id="tcount${i}" data-f="count" inputmode="numeric" autocomplete="off" value="${esc(r.count)}"></div>`
      : `<div><label for="tratio${i}">Ratio</label><input id="tratio${i}" data-f="ratio" inputmode="decimal" autocomplete="off" value="${esc(r.ratio)}"></div>`;
    return `
    <div class="brow" data-i="${i}">
      <div class="brow-top">
        <div><label for="tunit${i}">Unit</label><select id="tunit${i}" data-f="unit">${opts}</select></div>
        ${many ? `<button type="button" class="remove" data-remove="${i}" aria-label="Remove ${esc(units[r.unit].name)}">Remove</button>` : ""}
      </div>
      ${many || counting ? `<div class="brow-nums">${field}<div class="trow-out" id="tout${i}"></div></div>` : ""}
    </div>`;
  }).join("");
  $("ratioHint").hidden = !many || counting;
  renderTrainFields();
}

/** Level and bonus inputs for each training building the rows use. */
function renderTrainFields() {
  const used = TRAIN_ORDER.filter(b => v.troops.some(r => UNITS[v.tribe][r.unit].building === b));
  $("trainFields").innerHTML = used.map(b => {
    const t = trainOf(b), name = TRAIN_NAME[b];
    return `<div class="grid2 gap">
      <div><label for="tlvl${b}">${name} level</label><input id="tlvl${b}" data-b="${b}" data-f="lvl" inputmode="numeric" autocomplete="off" value="${esc(t.lvl)}"></div>
      <div><label for="tbon${b}">${name} time bonus %</label><input id="tbon${b}" data-b="${b}" data-f="bonus" inputmode="numeric" autocomplete="off" value="${esc(t.bonus)}"></div>
    </div>`;
  }).join("");
}

/* ---- main calculation ---- */
function calc() {
  const have = res4(i => num("have" + i));
  const wh = num("wh"), gr = num("gr");
  const caps = storageCaps(wh, gr);
  const speed = parseInt($("speed").value, 10) || 1;

  /* buildings */
  const bt = buildingTotals(v.builds, BUILDINGS);
  const { tot: bTot, peak: bPeak, sum: bSum } = bt;
  bt.rows.forEach((r, i) => {
    const el = $("bcost" + i);
    if (!el) return;
    if (!r.valid) { el.innerHTML = `<span class="hint" style="margin:0">Set a target level above ${r.from}. Max level is ${r.max}.</span>`; return; }
    el.innerHTML = RES.map(k => `<span style="--c:${COLORS[k]}"><b>${NAMES[k]}</b> ${fmt(r.cost[k])}</span>`).join("") +
      `<span>Total ${fmt(r.cost.reduce((a, b) => a + b, 0))}</span>`;
  });

  /* celebrations */
  const cc = celebrationCost(CELEBRATIONS, v.celebs.map(toNum));
  const ccSum = cc.tot.reduce((a, b) => a + b, 0);
  const otherTot = res4(i => bTot[i] + cc.tot[i]);

  /* troops */
  const haveTotal = have.reduce((a, b) => a + b, 0);
  const rows = v.troops.map(r => {
    const u = unitStats(v.tribe, r.unit), t = trainOf(u.building);
    return { u, perUnit: trainingTime(u.time, toNum(t.lvl), speed, toNum(t.bonus)), weight: ratio(r.ratio), group: u.building };
  });
  const timed: TimedRow[] = rows;
  let counts = rows.map(() => 0), capLimited = -1;
  if (v.mode === "max") ({ counts, capLimited } = maxTroopMix(rows.map(r => ({ cost: r.u.cost, weight: r.weight })), haveTotal, otherTot, caps));
  else if (v.mode === "count") counts = v.troops.map(r => toNum(r.count));
  else if (v.mode === "time") counts = troopMixForTime(timed, (num("hours") * 60 + num("mins")) * 60);
  if (v.mode === "none") counts = rows.map(() => 0);

  if (v.mode !== "none") {
    const upkeep = rows.reduce((s, r, i) => s + r.u.upkeep * counts[i], 0);
    const parts = [];
    if (rows.length === 1) {
      const [r] = rows, n = counts[0];
      parts.push(`<div><div class="big">${fmt(n)}</div><span class="hint" style="margin:0">${esc(r.u.name)}</span></div>`);
      if (r.perUnit > 0) {
        parts.push(`<div class="stat"><span>Each unit</span><strong>${fmtTime(r.perUnit)}</strong></div>`);
        parts.push(`<div class="stat"><span>All units</span><strong>${fmtTime(r.perUnit * n)}</strong></div>`);
      } else parts.push(`<div class="stat"><span>Training time</span><strong class="warn">Add base time in Unit stats</strong></div>`);
    } else {
      rows.forEach((r, i) => {
        const el = $("tout" + i); if (!el) return;
        el.innerHTML = `<b>${fmt(counts[i])}</b> ` + (r.perUnit > 0 ? `· each ${fmtTime(r.perUnit)} · all ${fmtTime(r.perUnit * counts[i])}` : `· <span class="warn">no base time</span>`);
      });
      parts.push(`<div><div class="big">${fmt(counts.reduce((a, b) => a + b, 0))}</div><span class="hint" style="margin:0">units in total</span></div>`);
      parts.push(rows.every(r => r.perUnit > 0)
        ? `<div class="stat"><span>All done in</span><strong>${fmtTime(mixDuration(timed, counts))}</strong></div>`
        : `<div class="stat"><span>Training time</span><strong class="warn">Add base time in Unit stats</strong></div>`);
    }
    parts.push(`<div class="stat"><span>Upkeep</span><strong>${fmt(upkeep)} crop/h</strong></div>`);
    $("troopOut").innerHTML = parts.join("");
  }
  const need = res4(i => otherTot[i] + rows.reduce((s, r, k) => s + r.u.cost[i] * counts[k], 0));
  const troopSum = rows.reduce((s, r, k) => s + r.u.cost.reduce((a, b) => a + b, 0) * counts[k], 0);

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
  if (ccSum > 0) notes.push(`Celebrations: ${fmt(ccSum)}.`);
  if (troopSum > 0) notes.push(`Troops: ${fmt(troopSum)}.`);
  if (v.mode === "max" && capLimited >= 0) notes.push(`<span class="warn">Your ${capLimited === 3 ? "granary" : "warehouse"} caps the troop count: more ${NAMES[capLimited].toLowerCase()} wouldn't fit.</span>`);
  const over = RES.filter(i => caps[i] !== Infinity && need[i] > caps[i]);
  if (over.length) notes.push(`<span class="warn">${over.map(i => NAMES[i]).join(", ")} needed is more than your storage holds at once, so you'll have to do this in more than one round.</span>`);
  const peakOver: number[] = RES.filter(i => caps[i] !== Infinity && Math.max(bPeak[i], cc.peak[i]) > caps[i]);
  if (peakOver.length) {
    const bOver = peakOver.some(i => bPeak[i] > caps[i]), cOver = peakOver.some(i => cc.peak[i] > caps[i]);
    const what = bOver && cOver ? "upgrade level or celebration" : cOver ? "celebration" : "upgrade level";
    notes.push(`<span class="warn">At least one ${what} costs more ${peakOver.map(i => NAMES[i].toLowerCase()).join(" and ")} than your storage can hold. Upgrade the ${peakOver.includes(3) && peakOver.length === 1 ? "granary" : peakOver.includes(3) ? "warehouse and granary" : "warehouse"} first.</span>`);
  }
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
    const exact = shortEach.map((s, i) => s > 0 ? `<span style="color:${COLORS[i]};font-weight:700">${NAMES[i]}</span> ${fmt(s)}` : null).filter(Boolean).join(", ");
    send = `<p><strong>Without trading:</strong> send ${exact}. That's ${fmt(shortSum)} total, ${fmt(merchants(shortSum))} merchant${merchants(shortSum) === 1 ? "" : "s"}.</p>`;
    if (!coveredNpc) {
      const gap = needSum - haveTotal;
      send += `<p><strong>With an NPC trade after:</strong> send ${fmt(gap)} of any resource, ${fmt(merchants(gap))} merchant${merchants(gap) === 1 ? "" : "s"}, then trade to the “Needed” amounts.</p>`;
    } else send += `<p><strong>Or skip sending</strong> and use the NPC trade above.</p>`;
    send += `<p class="hint" style="margin:0">${travelTxt.trim()}</p>`;
  }
  $("sendBox").innerHTML = send;

  $("unitWarn").innerHTML = v.tribe === "Spartans"
    ? `<span class="warn">Spartan costs are unverified and base times are blank. Check them against your game.</span>` : "";

  save();
}

/* ---- persistence ---- */
function save() {
  v.tribe = tribeSel.value; v.speed = $("speed").value; v.pref = $("pref").value;
  FIELDS.forEach(f => v.fields[f] = $(f).value);
  saveStore(store);
}

/* ---- events ---- */
villageSel.addEventListener("change", () => switchVillage(villageSel.value));
$("newVillage").addEventListener("click", () => {
  const name = prompt("Name of the new village", `Village ${Object.keys(store.villages).length + 1}`);
  if (name === null) return;
  const id = newId();
  store.villages[id] = newVillage(name.trim() || `Village ${Object.keys(store.villages).length + 1}`, v.tribe, v.speed);
  switchVillage(id);
});
$("renameVillage").addEventListener("click", () => {
  const name = prompt("New name for this village", v.name);
  if (name === null || !name.trim()) return;
  v.name = name.trim(); fillVillages(); save();
});
$("importText").addEventListener("input", previewImport);
$("importPreview").addEventListener("click", e => { if ((e.target as HTMLElement).id === "importApply") applyImport(); });
$("deleteVillage").addEventListener("click", () => {
  if (Object.keys(store.villages).length < 2 || !confirm(`Delete “${v.name}”? Its saved plan will be lost.`)) return;
  delete store.villages[store.current];
  store.current = Object.keys(store.villages)[0]; v = store.villages[store.current];
  applyVillage();
});

tribeSel.addEventListener("change", () => {
  v.tribe = tribeSel.value;
  v.troops = [{ unit: 0, ratio: "1", count: v.troops[0]?.count ?? "100" }];
  loadMerchant(); fillStatUnits(0); renderTroops(); calc();
});
$("speed").addEventListener("change", calc);
$("pref").addEventListener("change", calc);
FIELDS.forEach(f => $(f).addEventListener("input", calc));
CELEBRATIONS.forEach((_, i) => $("celeb" + i).addEventListener("input", e => { v.celebs[i] = (e.target as HTMLInputElement).value; calc(); }));
["cost0", "cost1", "cost2", "cost3", "upkeep", "baseTime"].forEach(f => $(f).addEventListener("input", () => { saveStats(); calc(); }));
statSel.addEventListener("change", showStats);
$("resetUnit").addEventListener("click", () => { delete store.overrides[v.tribe]?.[statSel.value]; showStats(); calc(); });
document.querySelectorAll<HTMLButtonElement>(".seg button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode!)));

$("addBuild").addEventListener("click", () => {
  v.builds.push({ b: 0, from: 0, to: 1, qty: 1 });
  renderBuilds(); calc();
  const sel = $("bsel" + (v.builds.length - 1)); if (sel) sel.focus();
});
$("builds").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  const row = t.closest<HTMLElement>(".brow"); if (!row) return;
  const i = +row.dataset.i!, f = t.dataset.f as "b" | "from" | "to" | "qty";
  if (f === "b") v.builds[i].b = +t.value; else v.builds[i][f] = t.value;
  calc();
});
$("builds").addEventListener("change", e => { if ((e.target as HTMLElement).dataset.f === "b") { renderBuilds(); calc(); } });
$("builds").addEventListener("click", e => {
  const r = (e.target as HTMLElement).dataset.remove; if (r == null) return;
  v.builds.splice(+r, 1); renderBuilds(); calc();
});

$("addTroop").addEventListener("click", () => {
  const last = v.troops[v.troops.length - 1];
  v.troops.push({ unit: last ? last.unit : 0, ratio: "1", count: last ? last.count : "100" });
  renderTroops(); calc();
  const sel = $("tunit" + (v.troops.length - 1)); if (sel) sel.focus();
});
$("troops").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  const row = t.closest<HTMLElement>(".brow"); if (!row) return;
  const r = v.troops[+row.dataset.i!], f = t.dataset.f as keyof TroopRow;
  if (f === "unit") { r.unit = +t.value; statSel.value = t.value; showStats(); renderTrainFields(); }
  else if (f === "ratio" || f === "count") r[f] = t.value;
  calc();
});
$("troops").addEventListener("click", e => {
  const r = (e.target as HTMLElement).dataset.remove; if (r == null) return;
  v.troops.splice(+r, 1); renderTroops(); calc();
});
$("trainFields").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  trainOf(t.dataset.b as TrainingBuilding)[t.dataset.f as "lvl" | "bonus"] = t.value;
  calc();
});

applyVillage();
