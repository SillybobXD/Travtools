import type { Res4, TrainingBuilding, Unit } from "./types";
import { BUILDINGS, CAPACITY, CELEBRATIONS, MERCH, UNITS } from "./data";
import { fmt, fmtTime, toNum, toSignedNum } from "./calc/format";
import { buildingTotals } from "./calc/buildings";
import { celebrationCost } from "./calc/celebrations";
import { mixDuration, planTroops, trainingTime, type TroopMode } from "./calc/troops";
import { npcTargets, planNeeds, storageCaps } from "./calc/npc";
import { mapDistance, merchantsNeeded, travelSeconds } from "./calc/merchants";
import { timeToAffordDirect, timeToAffordTrade, timeToEmpty, timeToFull } from "./calc/timing";
import { parseOverview, type OverviewImport } from "./parse/overview";
import { loadStore, newId, newTroop, newVillage, normalizeTroops, saveStore, type Store, type TroopRow, type VillageState } from "./storage";

const TRAIN_NAME: Record<TrainingBuilding, string> = { B: "Barracks", S: "Stable", W: "Workshop", R: "Residence or palace" };
const TRAIN_ORDER: TrainingBuilding[] = ["B", "S", "W", "R"];
const NAMES = ["Wood", "Clay", "Iron", "Crop"];
const COLORS = ["var(--wood)", "var(--clay)", "var(--iron)", "var(--crop)"];
const ICONS = ["wood", "clay", "iron", "crop"];
/** An icon from the sprite in index.html. */
const icon = (name: string) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const RES = [0, 1, 2, 3] as const;
/** Plain inputs saved per village as typed. */
const FIELDS = ["have0", "have1", "have2", "have3", "wh", "gr", "x", "y", "dist", "merchCap", "merchSpeed", "prod0", "prod1", "prod2", "prod3"];
/** Fields whose change means the village numbers are fresh as of now. */
const STOCK_FIELDS = ["have0", "have1", "have2", "have3", "wh", "gr", "prod0", "prod1", "prod2", "prod3"];
const MODES: [TroopMode, string][] = [["max", "Max possible"], ["count", "Set number"], ["time", "Fill a time"]];
const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => toNum($(id).value);
const res4 = (f: (i: number) => number) => RES.map(f) as Res4;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** A map coordinate as typed, or null. Accepts the minus sign the game uses. */
const coord = (s: string | undefined) => { const t = String(s ?? "").trim().replace("−", "-"); return /^-?\d+$/.test(t) ? parseInt(t, 10) : null; };
const coordsOf = (x: string | undefined, y: string | undefined) => { const a = coord(x), b = coord(y); return a === null || b === null ? null : { x: a, y: b }; };
const joinAnd = (a: string[]) => a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
/** A clock time like "21:50", "tomorrow 03:10" or "Wed 14:00". */
function clock(at: number) {
  const d = new Date(at), t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  return days === 0 ? t : days === 1 ? `tomorrow ${t}` : `${d.toLocaleDateString([], { weekday: "short" })} ${t}`;
}
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
  fillSendFrom();
}
function fillSendFrom() {
  const sel = $<HTMLSelectElement>("sendFrom");
  if (v.sendFrom && (v.sendFrom === store.current || !store.villages[v.sendFrom])) v.sendFrom = "";
  sel.innerHTML = "";
  sel.add(new Option("Another village (type the distance)", ""));
  for (const [id, s] of Object.entries(store.villages)) {
    if (id === store.current) continue;
    const c = coordsOf(s.fields.x, s.fields.y);
    sel.add(new Option(c ? `${s.name} (${c.x}|${c.y})` : s.name, id));
  }
  sel.value = v.sendFrom ?? "";
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
  FIELDS.forEach(f => { const s = v.fields[f]; if (s != null && s !== "") $(f).value = s; });
  syncStorage();
  v.celebs = CELEBRATIONS.map((_, i) => v.celebs?.[i] ?? "");
  v.celebs.forEach((s, i) => $("celeb" + i).value = s);
  const units = UNITS[v.tribe];
  v.troops = (v.troops ?? []).filter(r => units[r.unit]);
  normalizeTroops(v);
  v.builds = (v.builds ?? []).filter(r => BUILDINGS[r.b]);
  v.train ??= {};
  v.hero = RES.map(i => !!v.hero?.[i]);
  v.hero.forEach((h, i) => $("hero" + i).checked = h);
  $("useTrade").checked = v.useTrade !== false;
  fillVillages();
  fillStatUnits(v.troops[0]?.unit ?? 0);
  renderBuilds();
  renderTroops();
  calc();
}

/* ---- storage dropdowns ---- */
/** Shows the level that matches the typed capacity, or "Other amount" with the field. */
function syncStorage() {
  for (const id of ["wh", "gr"]) {
    const sel = $<HTMLSelectElement>(id + "Lvl"), raw = $(id).value.trim();
    const lvl = CAPACITY.indexOf(toNum(raw));
    sel.value = !raw ? "" : lvl >= 0 ? String(lvl) : "custom";
    $(id).hidden = sel.value !== "custom";
  }
}
function fillStorage() {
  for (const [id, name] of [["wh", "warehouse"], ["gr", "granary"]]) {
    const sel = $<HTMLSelectElement>(id + "Lvl");
    sel.add(new Option("Not set", ""));
    CAPACITY.forEach((c, lvl) => sel.add(new Option(lvl ? `Level ${lvl} · ${fmt(c)}` : `No ${name} · ${fmt(c)}`, String(lvl))));
    sel.add(new Option("Other amount", "custom"));
    sel.addEventListener("change", () => {
      const input = $(id);
      if (sel.value === "custom") { input.hidden = false; input.focus(); }
      else { input.value = sel.value === "" ? "" : String(CAPACITY[+sel.value]); input.hidden = true; }
      v.resAt = Date.now();
      calc();
    });
  }
}

/* ---- import from the game ---- */
/**
 * One village from a paste: resources (Resources tab or top bar), storage (Capacity tab or top bar),
 * production (Production tab) and the crop balance after upkeep (top bar, village you were in).
 */
interface ImportRow { name: string; res?: Res4; wh?: number; gr?: number; prod?: Res4; cropNet?: number; active: boolean }
let importRows: ImportRow[] = [];
let importCoords: OverviewImport["coords"] = {};

const sameName = (a: string | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

function previewImport() {
  const text = $<HTMLTextAreaElement>("importText").value;
  const r = parseOverview(text);
  importCoords = r.coords;
  const byName = new Map<string, ImportRow>();
  const rowFor = (name: string) => byName.get(name) ?? byName.set(name, { name, active: name === r.activeName }).get(name)!;
  r.villages.forEach(x => rowFor(x.name).res = x.res);
  r.capacities.forEach(x => Object.assign(rowFor(x.name), { wh: x.warehouse, gr: x.granary }));
  r.production.forEach(x => rowFor(x.name).prod = x.perHour);
  importRows = [...byName.values()];
  // Top bar only (e.g. copied from another page): it belongs to the village shown here.
  if (!importRows.length && r.stock) importRows = [{ name: "", active: true }];
  // The top bar is the freshest data for the village you were in.
  const s = r.stock;
  if (s) importRows.filter(x => x.active).forEach(x => Object.assign(x, { res: s.res, wh: s.warehouse, gr: s.granary, cropNet: s.cropBalance }));
  $("importStatus").textContent = "";
  const box = $("importPreview");
  if (!text.trim()) { box.innerHTML = ""; return; }
  if (!importRows.length) { box.innerHTML = `<p class="hint warn">Couldn't find resources, production or storage in that text. Copy the whole Village overview page: the Resources, Production or Capacity tab.</p>`; return; }
  const saved = Object.entries(store.villages);
  const matchOf = (row: ImportRow) => row.name ? saved.find(([, s]) => sameName(s.gameName, row.name) || sameName(s.name, row.name))?.[0] : store.current;
  const matched = new Set(importRows.map(matchOf));
  // First import: the village you were in goes into the one shown here, if nothing else claims it.
  const fallback = !v.gameName && !matched.has(store.current) ? store.current : undefined;
  box.innerHTML = `<div class="gap">` + importRows.map((row, i) => {
    const match = matchOf(row) ?? (row.active ? fallback : undefined);
    const opts = [`<option value="new"${match ? "" : " selected"}>New village</option>`,
      ...saved.map(([id, s]) => `<option value="${id}"${id === match ? " selected" : ""}>${esc(s.name)}</option>`),
      `<option value="skip">Skip</option>`].join("");
    return `<div class="imp-row">
      <div><strong>${row.name ? esc(row.name) : "Village you were in"}</strong>${row.active && row.name ? ` <span class="hint">(you were here)</span>` : ""}
        ${row.res ? `<div class="cost-line">${RES.map(k => `<span style="--c:${COLORS[k]}"><b>${NAMES[k]}</b> ${fmt(row.res![k])}</span>`).join("")}</div>` : ""}
        ${row.wh != null ? `<div class="cost-line"><span><b>Warehouse</b> ${fmt(row.wh)}</span><span><b>Granary</b> ${fmt(row.gr!)}</span></div>` : ""}
        ${row.prod ? `<div class="cost-line">${RES.map(k => `<span style="--c:${COLORS[k]}"><b>${NAMES[k]}/h</b> ${fmt(k === 3 && row.cropNet != null ? row.cropNet : row.prod![k])}</span>`).join("")}</div>` : ""}</div>
      <select data-i="${i}" aria-label="Save ${row.name ? esc(row.name) : "this village"} into">${opts}</select>
    </div>`;
  }).join("") + `</div><button type="button" class="primary gap" id="importApply">Update villages</button>`;
}

function applyImport() {
  save();
  let updated = 0, added = 0, storage = 0, activeId: string | null = null;
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
    if (row.name) { target.gameName = row.name; target.name = row.name; }
    const c = importCoords[row.name];
    if (c) { target.fields.x = String(c.x); target.fields.y = String(c.y); }
    row.res?.forEach((x, k) => target.fields["have" + k] = String(x));
    if (row.res) target.resAt = Date.now();
    if (row.wh != null) { target.fields.wh = String(row.wh); target.fields.gr = String(row.gr); storage++; }
    if (row.prod) {
      // Keep a crop balance we already have over the tab's crop before upkeep.
      const keepCrop = target.cropGross === false && !!target.fields.prod3;
      row.prod.forEach((x, k) => { if (k < 3 || !keepCrop) target.fields["prod" + k] = String(x); });
      if (!keepCrop) target.cropGross = true;
    }
    // The top bar's crop balance is what actually reaches the granary.
    if (row.cropNet != null) { target.fields.prod3 = String(row.cropNet); target.cropGross = false; }
    if (row.prod || row.cropNet != null || row.wh != null) target.resAt ??= Date.now();
    if (row.active) activeId = id;
  });
  if (activeId) store.current = activeId;
  v = store.villages[store.current];
  applyVillage();
  $<HTMLTextAreaElement>("importText").value = "";
  $("importPreview").innerHTML = "";
  const parts = [updated && `updated ${updated} village${updated === 1 ? "" : "s"}`, added && `added ${added}`].filter(Boolean);
  $("importStatus").textContent = parts.length
    ? `Done: ${parts.join(", ")}.` + (storage ? ` Storage set for ${storage}.` : "") + (activeId ? ` Showing ${v.name}.` : "")
    : "Nothing imported.";
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

/* ---- rows ---- */
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
  const units = UNITS[v.tribe], many = v.troops.length > 1;
  const maxRows = v.troops.filter(r => r.mode === "max").length;
  $("troops").innerHTML = v.troops.map((r, i) => {
    const opts = units.map((u, k) => `<option value="${k}"${k === r.unit ? " selected" : ""}>${u.name}</option>`).join("");
    const modes = MODES.map(([m, label]) => `<option value="${m}"${m === r.mode ? " selected" : ""}>${label}</option>`).join("");
    const input = (f: "ratio" | "count" | "hours" | "mins", label: string, mode = "numeric", cls = "") =>
      `<div${cls ? ` class="${cls}"` : ""}><label for="t${f}${i}">${label}</label><input id="t${f}${i}" data-f="${f}" inputmode="${mode}" autocomplete="off" value="${esc(r[f] ?? "")}"></div>`;
    const fields = r.mode === "count" ? input("count", "Number of units", "numeric", "span2")
      : r.mode === "time" ? `<div class="trow-time">${input("hours", "Hours")}${input("mins", "Minutes")}</div>`
      : maxRows > 1 ? input("ratio", "Ratio", "decimal", "span2") : "";
    return `
    <div class="brow" data-i="${i}">
      <div class="brow-top">
        <div><label for="tunit${i}">Unit</label><select id="tunit${i}" data-f="unit">${opts}</select></div>
        <button type="button" class="remove" data-remove="${i}" aria-label="Remove ${esc(units[r.unit].name)}">Remove</button>
      </div>
      <div class="brow-nums trow-nums">
        <div><label for="tmode${i}">How many</label><select id="tmode${i}" data-f="mode">${modes}</select></div>
        ${fields}
      </div>
      ${many ? `<div class="cost-line" id="tout${i}"></div>` : ""}
    </div>`;
  }).join("") || `<p class="hint" style="margin-top:0">No troops planned. Add a troop type to include training in the plan.</p>`;
  $("ratioHint").hidden = !many;
  renderTrainFields();
}

const levelOptions = (sel: number) => Array.from({ length: 20 }, (_, k) => `<option value="${k + 1}"${k + 1 === sel ? " selected" : ""}>${k + 1}</option>`).join("");

/** Level and bonus inputs for each training building the rows use. */
function renderTrainFields() {
  const used = TRAIN_ORDER.filter(b => v.troops.some(r => UNITS[v.tribe][r.unit].building === b));
  $("trainFields").innerHTML = used.map(b => {
    const t = trainOf(b), name = TRAIN_NAME[b];
    return `<div class="grid2 gap">
      <div><label for="tlvl${b}">${name} level</label><select id="tlvl${b}" data-b="${b}" data-f="lvl">${levelOptions(Math.min(20, toNum(t.lvl) || 1))}</select></div>
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
  // One switch decides whether the plan uses an NPC trade; "Do not convert into" only applies when it does.
  const trade = v.useTrade !== false;
  const ticked = RES.map(i => !!v.hero![i]);
  const convert = RES.map(i => !trade || !ticked[i]);
  $("tradeOpts").hidden = !trade;
  const rows = v.troops.map(r => {
    const u = unitStats(v.tribe, r.unit), t = trainOf(u.building);
    const perUnit = trainingTime(u.time, toNum(t.lvl), speed, toNum(t.bonus));
    return {
      u, perUnit, group: u.building,
      plan: { mode: r.mode!, cost: u.cost, weight: ratio(r.ratio), count: toNum(r.count), seconds: (toNum(r.hours) * 60 + toNum(r.mins)) * 60, perUnit },
    };
  });
  const plans = rows.map(r => r.plan), hasMax = plans.some(p => p.mode === "max");
  const { counts, capLimited } = planTroops(plans, have, otherTot, caps, convert, trade);
  /** "Max possible" counts the other way round, shown in brackets. */
  const alt = hasMax ? (trade ? planTroops(plans, have, otherTot, caps, [true, true, true, true], false) : planTroops(plans, have, otherTot, caps, RES.map(i => !ticked[i]), true)).counts : [];
  const altLabel = trade ? "without trading" : "with a trade";

  const upkeep = rows.reduce((s, r, i) => s + r.u.upkeep * counts[i], 0);
  const parts = [];
  if (rows.length === 1) {
    const [r] = rows, n = counts[0];
    parts.push(`<div><div class="big">${fmt(n)}</div><span class="hint" style="margin:0">${esc(r.u.name)}</span></div>`);
    if (hasMax) parts.push(`<div class="stat"><span>${trade ? "Without trading" : "With a trade"}</span><strong>${fmt(alt[0])}</strong></div>`);
    if (r.perUnit > 0) {
      parts.push(`<div class="stat"><span>Each unit</span><strong>${fmtTime(r.perUnit)}</strong></div>`);
      parts.push(`<div class="stat"><span>All units</span><strong>${fmtTime(r.perUnit * n)}</strong></div>`);
    } else parts.push(`<div class="stat"><span>Training time</span><strong class="warn">Add base time in Unit stats</strong></div>`);
  } else if (rows.length > 1) {
    rows.forEach((r, i) => {
      const el = $("tout" + i); if (!el) return;
      el.innerHTML = `<span><b>${fmt(counts[i])}</b> units</span>` + (r.plan.mode === "max" ? `<span class="zero">(${fmt(alt[i])} ${altLabel})</span>` : "") +
        (r.perUnit > 0 ? `<span>each ${fmtTime(r.perUnit)}</span><span>all ${fmtTime(r.perUnit * counts[i])}</span>` : `<span class="warn">no base time</span>`);
    });
    parts.push(`<div><div class="big">${fmt(counts.reduce((a, b) => a + b, 0))}</div><span class="hint" style="margin:0">units in total</span></div>`);
    parts.push(rows.every(r => r.perUnit > 0)
      ? `<div class="stat"><span>All done in</span><strong>${fmtTime(mixDuration(rows, counts))}</strong></div>`
      : `<div class="stat"><span>Training time</span><strong class="warn">Add base time in Unit stats</strong></div>`);
  }
  if (rows.length) parts.push(`<div class="stat"><span>Upkeep</span><strong>${fmt(upkeep)} crop/h</strong></div>`);
  $("troopOut").innerHTML = parts.join("");
  const troopCost = (keep: (k: number) => boolean) => res4(i => rows.reduce((s, r, k) => s + (keep(k) ? r.u.cost[i] * counts[k] : 0), 0));
  /** Everything in the plan, "Max possible" troops included: what the NPC trade has to produce. */
  const need = res4(i => otherTot[i] + troopCost(() => true)[i]);
  /** The plan without "Max possible" troops, which only use what's left: what's worth sending or waiting for. */
  const fixedNeed = res4(i => otherTot[i] + troopCost(k => plans[k].mode !== "max")[i]);
  const troopSum = rows.reduce((s, r, k) => s + r.u.cost.reduce((a, b) => a + b, 0) * counts[k], 0);

  /* verdict */
  const { haveTotal, needSum, needAll, shortEach, shortSum, villageShortSum, heroTake, heroSum, coveredDirect, coveredNpc } = planNeeds(have, need, convert);
  const useNpc = trade && coveredNpc && !coveredDirect;
  const heroList = joinAnd(RES.filter(i => heroTake[i] > 0).map(i => `${fmt(heroTake[i])} ${NAMES[i].toLowerCase()}`));
  const heroTxt = heroSum > 0 ? ` Then claim ${heroList} from the hero.` : "";
  let verdict;
  if (needAll === 0) verdict = "Add buildings or troops to see what they cost.";
  else if (coveredDirect) verdict = heroSum > 0 ? `Enough once you claim ${heroList} from the hero. No trade needed.` : "You already have enough. No trade needed.";
  else if (!trade) verdict = `You're missing ${fmt(villageShortSum)} resources without trading.`;
  else if (coveredNpc) verdict = `One NPC trade covers it. You have ${fmt(haveTotal - needSum)} to spare.` + heroTxt;
  else verdict = `You're ${fmt(needSum - haveTotal)} resources short, even after trading.` + heroTxt;
  $("verdict").textContent = verdict;

  /* timing: for the fixed plan, since "Max possible" troops already fit what you have */
  const fixed = planNeeds(have, fixedNeed, convert);
  const perHour = res4(i => toSignedNum($("prod" + i).value));
  const hasProd = perHour.some(p => p !== 0);
  /** "in 1:20:00 (21:50)" counted from when the numbers were entered, or null for never. */
  const when = (secs: number) => {
    if (secs === Infinity) return null;
    const at = (v.resAt ?? Date.now()) + secs * 1000, left = (at - Date.now()) / 1000;
    return left <= 0 ? `now (since ${clock(at)})` : `in ${fmtTime(left)} (${clock(at)})`;
  };
  const fill: string[] = [];
  if (hasProd) {
    const full = timeToFull(have, perHour, caps);
    const first = [0, 1, 2].reduce((a, b) => full[b] < full[a] ? b : a);
    if (full[first] < Infinity) fill.push(`Warehouse full ${when(full[first])}, ${NAMES[first].toLowerCase()} first.`);
    if (full[3] < Infinity) fill.push(`Granary full ${when(full[3])}.`);
    const empty = timeToEmpty(have[3], perHour[3]);
    if (empty < Infinity) fill.push(`<span class="warn">Crop runs out ${when(empty)}.</span>`);
    if (!fill.length) fill.push("Add warehouse and granary capacity to see when storage fills up.");
    if (v.cropGross) fill.push("Crop/h is from the Production tab, before troop upkeep. Paste while you're in this village to use its real crop balance.");
  } else fill.push("Add production to see when storage fills up and when you can afford the plan.");
  $("fillNote").innerHTML = fill.join(" ");
  let afford = "";
  const waitFor = trade ? !fixed.coveredNpc : !fixed.coveredDirect;
  if (hasProd && fixed.needAll > 0 && waitFor) {
    const w = when(trade ? timeToAffordTrade(have, fixedNeed, perHour, caps, convert) : timeToAffordDirect(have, fixedNeed, perHour, caps, convert));
    afford = w ? `Enough ${trade ? "for the trade" : "without trading"} ${w}.` : "Your production and storage won't get there on their own.";
  }
  $("affordNote").innerHTML = afford;

  /* NPC targets */
  const prefSel = $<HTMLSelectElement>("pref");
  [...prefSel.options].forEach(o => o.disabled = !convert[+o.value]);
  if (!convert[+prefSel.value]) { const first = [3, 0, 1, 2].find(i => convert[i]); if (first !== undefined) prefSel.value = String(first); }
  const target = useNpc ? npcTargets(need, haveTotal, caps, parseInt(prefSel.value, 10), convert) : need.slice() as Res4;
  $("prefWrap").hidden = !useNpc;
  $("lastHead").textContent = useNpc ? "Set NPC to" : "Missing";

  const body = $("planBody"); body.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const tr = document.createElement("tr"); tr.style.setProperty("--c", COLORS[i]);
    let last;
    const bar = (n: number) => caps[i] === Infinity ? "" : `<div class="bar"><i style="width:${Math.min(100, n / caps[i] * 100)}%"></i></div>`;
    if (!convert[i]) {
      const take = heroTake[i] > 0 ? `<div class="up">hero +${fmt(heroTake[i])}</div>` : "";
      last = useNpc ? `<span class="strong">0</span> <span class="${have[i] ? "down" : "zero"}">(${have[i] ? "−" : "±"}${fmt(have[i])})</span>${take}`
        : take || `<span class="zero">0</span>`;
    } else if (useNpc) {
      const d = target[i] - have[i], cls = d > 0 ? "up" : d < 0 ? "down" : "zero";
      last = `<span class="strong">${fmt(target[i])}</span> <span class="${cls}">(${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))})</span>` + bar(target[i]);
    } else last = shortEach[i] > 0 ? `<span class="down">${fmt(shortEach[i])}</span>` : `<span class="zero">0</span>`;
    tr.innerHTML = `<td>${icon(ICONS[i])}${NAMES[i]}</td><td>${fmt(have[i])}</td><td>${fmt(need[i])}</td><td>${last}</td>`;
    body.appendChild(tr);
  }
  $("planFoot").innerHTML = `<tr><td>Total</td><td>${fmt(have.reduce((a, b) => a + b, 0))}</td><td>${fmt(needAll)}</td><td>${useNpc ? fmt(target.reduce((a, b) => a + b, 0)) : fmt(shortSum)}</td></tr>`;

  /* notes */
  const notes = [];
  if (bSum > 0) notes.push(`Buildings: ${fmt(bSum)}.`);
  if (ccSum > 0) notes.push(`Celebrations: ${fmt(ccSum)}.`);
  if (troopSum > 0) notes.push(`Troops: ${fmt(troopSum)}.`);
  if (capLimited >= 0) notes.push(`<span class="warn">Your ${capLimited === 3 ? "granary" : "warehouse"} caps the troop count: more ${NAMES[capLimited].toLowerCase()} wouldn't fit.</span>`);
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

  /* sending: for the fixed plan, since "Max possible" troops already fit what you have */
  const src = v.sendFrom ? store.villages[v.sendFrom] : undefined;
  const here = coordsOf($("x").value, $("y").value), there = src && coordsOf(src.fields.x, src.fields.y);
  const auto = here && there ? mapDistance(here, there) : null;
  const distEl = $("dist");
  distEl.readOnly = auto !== null;
  if (auto !== null) distEl.value = String(Math.round(auto * 10) / 10);
  const cap = num("merchCap"), mspd = num("merchSpeed"), dist = auto ?? (parseFloat(distEl.value) || 0);
  const merchants = (amt: number) => `${fmt(merchantsNeeded(amt, cap))} merchant${merchantsNeeded(amt, cap) === 1 ? "" : "s"}`;
  const travel = travelSeconds(dist, mspd, speed);
  const travelTxt = travel ? `Travel time one way: <strong>${fmtTime(travel)}</strong>.`
    : src && auto === null ? "Add map coordinates for both villages to get the distance." : "Add a distance to see travel time.";
  // Sending without a trade means the village alone: ticked resources are sent too.
  const sendList = fixed.villageShort.map((s, i) => s > 0 ? `<span style="color:${COLORS[i]};font-weight:700">${NAMES[i]}</span> ${fmt(s)}` : null).filter(Boolean).join(", ");
  const sendAll = `send ${sendList} (${fmt(fixed.villageShortSum)} total, ${merchants(fixed.villageShortSum)})`;
  const leftNote = hasMax ? " “Max possible” troops use what's left." : "";
  let send;
  if (needAll === 0) send = `<p class="zero">Nothing to send yet.</p>`;
  else if (fixed.villageShortSum === 0) send = `<p class="good">Nothing to send. This village already has everything.${leftNote}</p>`;
  else {
    if (!trade) send = `<p><strong>Send</strong> ${sendList}. That's ${fmt(fixed.villageShortSum)} total, ${merchants(fixed.villageShortSum)}.</p>`;
    else if (fixed.coveredDirect) send = `<p class="good">Nothing to send: claim ${heroList} from the hero.${leftNote}</p><p>Or ${sendAll}.</p>`;
    else if (fixed.coveredNpc) send = `<p class="good">Nothing to send: the NPC trade above covers it.${leftNote}</p><p>To skip the trade, ${sendAll}.</p>`;
    else {
      const gap = fixed.needSum - fixed.haveTotal;
      send = `<p><strong>Send ${fmt(gap)} of any resource</strong> (${merchants(gap)}), then make the NPC trade above${heroSum > 0 ? ` and claim ${heroList} from the hero` : ""}.</p><p>Or, without trading, ${sendAll}.</p>`;
    }
    if (src) {
      const srcHave = res4(i => toNum(src.fields["have" + i]));
      const low = RES.filter(i => fixed.villageShort[i] > srcHave[i]);
      if (low.length) send += `<p class="warn">${esc(src.name)} only has ${joinAnd(low.map(i => `${fmt(srcHave[i])} ${NAMES[i].toLowerCase()}`))} saved here.</p>`;
    }
    send += `<p class="hint" style="margin:0">${travelTxt}</p>`;
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
  v.troops = v.troops.length ? [{ ...v.troops[0], unit: 0 }] : [];
  loadMerchant(); fillStatUnits(0); renderTroops(); calc();
});
$("speed").addEventListener("change", calc);
$("pref").addEventListener("change", calc);
FIELDS.forEach(f => $(f).addEventListener("input", calc));
CELEBRATIONS.forEach((_, i) => $("celeb" + i).addEventListener("input", e => { v.celebs[i] = (e.target as HTMLInputElement).value; calc(); }));
["cost0", "cost1", "cost2", "cost3", "upkeep", "baseTime"].forEach(f => $(f).addEventListener("input", () => { saveStats(); calc(); }));
statSel.addEventListener("change", showStats);
$("resetUnit").addEventListener("click", () => { delete store.overrides[v.tribe]?.[statSel.value]; showStats(); calc(); });
RES.forEach(i => $("hero" + i).addEventListener("change", e => { v.hero![i] = (e.target as HTMLInputElement).checked; calc(); }));
STOCK_FIELDS.forEach(f => $(f).addEventListener("input", () => { v.resAt = Date.now(); if (f === "prod3") v.cropGross = false; }, { capture: true }));
$("useTrade").addEventListener("change", e => { v.useTrade = (e.target as HTMLInputElement).checked; calc(); });
$("sendFrom").addEventListener("change", e => { v.sendFrom = (e.target as HTMLSelectElement).value; calc(); });

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
  v.troops.push(last ? { ...last, ratio: "1" } : newTroop(0));
  renderTroops(); calc();
  const sel = $("tunit" + (v.troops.length - 1)); if (sel) sel.focus();
});
$("troops").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  const row = t.closest<HTMLElement>(".brow"); if (!row) return;
  const r = v.troops[+row.dataset.i!], f = t.dataset.f as keyof TroopRow;
  if (f === "unit") { r.unit = +t.value; statSel.value = t.value; showStats(); renderTrainFields(); }
  else if (f === "mode") { r.mode = t.value as TroopMode; renderTroops(); }
  else if (f === "ratio" || f === "count" || f === "hours" || f === "mins") r[f] = t.value;
  calc();
});
$("troops").addEventListener("click", e => {
  const r = (e.target as HTMLElement).dataset.remove; if (r == null) return;
  v.troops.splice(+r, 1); renderTroops(); calc();
  if (!v.troops.length) $("addTroop").focus();
});
$("trainFields").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  trainOf(t.dataset.b as TrainingBuilding)[t.dataset.f as "lvl" | "bonus"] = t.value;
  calc();
});

fillStorage();
applyVillage();
