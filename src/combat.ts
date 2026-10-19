import { NATURE, NATURE_TRIBE, UNITS, WALLS } from "./data";
import { fmt, fmtTime, toNum } from "./calc/format";
import { battle, type Army, type BattleResult } from "./calc/combat";
import { armyValue, combatUnits, optimize, type ArmyOption, type Objective, type OptimizeInput, type OptimizeResult } from "./calc/optimize";
import { mapDistance } from "./calc/merchants";
import { armyTravelSeconds } from "./calc/travel";
import { parseReport } from "./parse/report";
import { fillFromReport } from "./parse/combatInput";
import { parseTroops } from "./parse/troops";
import { parseSmithy } from "./parse/smithy";
import { combatOf, loadStore, newCombatArmy, newId, newVillage, saveStore, villageCombat, type CombatState, type Store, type VillageState } from "./storage";

/* Combat page: reads the inputs, runs the optimizer and battle(), and renders. All logic is in src/calc and src/parse. */

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const nums = (a: string[]) => a.map(toNum);
/** A map coordinate as typed, or null. Accepts the minus sign the game uses. */
const coord = (s: string | undefined) => { const t = String(s ?? "").trim().replace("−", "-"); return /^-?\d+$/.test(t) ? parseInt(t, 10) : null; };
const coordsOf = (x: string | undefined, y: string | undefined) => { const a = coord(x), b = coord(y); return a === null || b === null ? null : { x: a, y: b }; };
const TRIBES = Object.keys(UNITS);
const unitNames = (tribe: string) => (tribe === NATURE_TRIBE ? NATURE.map(a => a.name) : (UNITS[tribe] ?? []).map(u => u.name));
/** Units a smithy upgrades: all but chief and settler. */
const SMITHY_UNITS = 8;
const OBJECTIVES: [Objective, string, string][] = [
  ["fewestLosses", "Fewest losses", "Fewest losses"],
  ["smallestWin", "Smallest army that wins", "Smallest reinforcement that holds"],
  ["mostEnemyLosses", "Most enemy losses", "Most enemy losses"],
  ["mostLoot", "Most loot after losses", ""],
];

/* ---- state ---- */
const buildingOf = (tribe: string, unit: number) => UNITS[tribe]?.[unit]?.building;
const store: Store = loadStore(buildingOf) ?? (() => {
  const id = newId();
  return { version: 2, current: id, villages: { [id]: newVillage("My village", TRIBES[0], "1") }, overrides: {} } as Store;
})();
if (!store.villages[store.current]) store.current = Object.keys(store.villages)[0];
const c: CombatState = combatOf(store);
const village = (): VillageState => store.villages[c.village] ?? store.villages[store.current];
const ourTribe = () => (UNITS[village().tribe] ? village().tribe : TRIBES[0]);
const allowedUnits = () => c.allowed[ourTribe()] ?? combatUnits(ourTribe());
let lastResult: OptimizeResult | null = null;
let simCounts: string[] | null = null;

/* ---- rendering ---- */
function unitGrid(prefix: string, names: string[], values: string[], attrs: (i: number) => string) {
  return names.map((n, i) => `<div><label for="${prefix}${i}">${esc(n)}</label><input id="${prefix}${i}" ${attrs(i)} inputmode="numeric" autocomplete="off" value="${esc(values[i] ?? "")}"></div>`).join("");
}
const tribeOptions = (sel: string, nature: boolean) =>
  [...TRIBES, ...(nature ? [NATURE_TRIBE] : [])].map(t => `<option value="${t}"${t === sel ? " selected" : ""}>${t === NATURE_TRIBE ? "Nature (animals)" : t}</option>`).join("");

function renderMode() {
  const attack = c.side === "attack";
  document.querySelectorAll<HTMLInputElement>('input[name="side"]').forEach(r => (r.checked = r.value === c.side));
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(r => (r.checked = r.value === c.mode));
  document.querySelectorAll<HTMLInputElement>('input[name="source"]').forEach(r => (r.checked = r.value === c.source));
  $("enemyTitle").lastChild!.textContent = attack ? "Target" : "Incoming attack";
  $("enemyArmyTitle").textContent = attack ? "Troops there" : "Attacking army";
  $("wallTribeLabel").textContent = attack ? "Village owner's tribe" : "Your defended village's tribe";
  $("txLabel").textContent = attack ? "Target X" : "Defended village X";
  $("tyLabel").textContent = attack ? "Target Y" : "Defended village Y";
  $("villageLabel").textContent = attack ? "Attack from" : "Send reinforcements from";
  $("ownPopLabel").textContent = "Your population";
  $("enemyPopLabel").textContent = attack ? "Target's population" : "Attacker's population";
  $("pasteHint").textContent = attack
    ? "Paste a scout or battle report about the target: its troops, reinforcements, wall and scouted resources are filled in below."
    : "Paste a report of an attack on you: the attacker's army is filled in below.";
  $("addEnemy").hidden = !attack;
  $("homeBox").hidden = attack;
  $("lootBox").hidden = !(attack && c.mode === "raid");
  $("ownedBox").hidden = c.source !== "owned";
  $("optimalBox").hidden = c.source !== "optimal";
  const sel = $<HTMLSelectElement>("objective");
  const opts = OBJECTIVES.filter(([o]) => o !== "mostLoot" || (attack && c.mode === "raid"));
  if (!opts.some(([o]) => o === c.objective)) c.objective = "fewestLosses";
  sel.innerHTML = opts.map(([o, a, d]) => `<option value="${o}">${attack ? a : d}</option>`).join("");
  sel.value = c.objective;
}

function renderTarget() {
  $<HTMLSelectElement>("wallTribe").innerHTML = tribeOptions(c.wallTribe, false);
  const wallSel = $<HTMLSelectElement>("wall");
  wallSel.innerHTML = Array.from({ length: 21 }, (_, k) => `<option value="${k}">${k ? `Level ${k}` : "No wall"}</option>`).join("");
  wallSel.value = String(Math.min(20, toNum(c.wall)));
  $("wallLabel").textContent = WALLS[c.wallTribe]?.name ?? "Wall";
  renderEnemy();
  $("homeTroops").innerHTML = unitGrid("home", unitNames(c.wallTribe), c.home, i => `data-home="${i}"`);
  c.lootRes.forEach((v, i) => ($("loot" + i).value = v));
  $("cranny").value = c.cranny;
  $("tx").value = c.x; $("ty").value = c.y;
}

function renderEnemy() {
  const armies = c.side === "attack" ? c.enemy : c.enemy.slice(0, 1);
  $("enemyArmies").innerHTML = armies.map((a, k) => `
    <div class="army" data-a="${k}">
      <div class="army-top">
        <div><label for="etribe${k}">${k === 0 ? (c.side === "attack" ? "Village troops" : "Tribe") : `Reinforcement ${k}`}</label><select id="etribe${k}" data-etribe="${k}">${tribeOptions(a.tribe, c.side === "attack")}</select></div>
        ${k > 0 ? `<button type="button" class="remove" data-eremove="${k}">Remove</button>` : ""}
      </div>
      <div class="unit-grid">${unitGrid(`e${k}u`, unitNames(a.tribe), a.counts, i => `data-ea="${k}" data-eu="${i}"`)}</div>
    </div>`).join("");
}

function renderOurs() {
  const sel = $<HTMLSelectElement>("village");
  sel.innerHTML = Object.entries(store.villages).map(([id, s]) => `<option value="${id}">${esc(s.name)} · ${esc(s.tribe)}</option>`).join("");
  sel.value = c.village;
  const vc = villageCombat(village()), names = unitNames(ourTribe());
  $("ownTroops").innerHTML = unitGrid("own", names, vc.troops, i => `data-own="${i}"`);
  $("cap").value = c.cap;
  const allowed = allowedUnits();
  $("allowed").innerHTML = combatUnits(ourTribe()).map(i =>
    `<label class="check"><input type="checkbox" data-allow="${i}"${allowed.includes(i) ? " checked" : ""}> ${esc(names[i])}</label>`).join("");
  $("smithy").innerHTML = unitGrid("smith", names.slice(0, SMITHY_UNITS), vc.smithy, i => `data-smith="${i}"`);
  $<HTMLSelectElement>("objective").value = c.objective;
  $("wounded").checked = c.woundedRecoverable;
  $("ownPop").value = c.ownPop; $("enemyPop").value = c.enemyPop;
}

function renderAll() { renderMode(); renderTarget(); renderOurs(); schedule(); }

/* ---- optimizer ---- */
const smithyLevels = () => nums(villageCombat(village()).smithy);
const pop = (s: string) => (toNum(s) > 0 ? toNum(s) : undefined);
const enemyArmies = (): Army[] => (c.side === "attack" ? c.enemy : c.enemy.slice(0, 1)).map(a => ({ tribe: a.tribe, counts: nums(a.counts) }));
const homeArmy = (): Army => ({ tribe: c.wallTribe, counts: nums(c.home) });
const villageInput = () => ({ tribe: c.wallTribe, wall: toNum(c.wall) });
const lootInput = () => (c.lootRes.some(s => s.trim()) ? { res: nums(c.lootRes) as [number, number, number, number], crannyCapacity: toNum(c.cranny) } : undefined);

function optimizerInput(): OptimizeInput {
  const tribe = ourTribe(), smithy = smithyLevels();
  const source = c.source === "owned"
    ? { kind: "owned" as const, villages: [{ name: village().name, counts: nums(villageCombat(village()).troops), smithy }] }
    : { kind: "optimal" as const, cap: toNum(c.cap), smithy };
  const common = { tribe, source, objective: c.objective, mode: c.mode, units: allowedUnits(), woundedRecoverable: c.woundedRecoverable };
  return c.side === "attack"
    ? { ...common, side: "attack", defenders: enemyArmies(), village: villageInput(), loot: lootInput(), attackerPop: pop(c.ownPop), defenderPop: pop(c.enemyPop) }
    : { ...common, side: "defend", attacker: enemyArmies()[0], home: [homeArmy()], village: villageInput(), attackerPop: pop(c.enemyPop), defenderPop: pop(c.ownPop) };
}

let timer = 0;
function schedule() {
  saveStore(store);
  clearTimeout(timer);
  timer = window.setTimeout(run, 200);
  renderSim();
}

function run() {
  const box = $("results");
  if (c.side === "defend" && !enemyArmies()[0].counts.some(n => n > 0)) { box.innerHTML = `<p class="hint" style="margin-top:0">Enter the attacking army, or paste a report.</p>`; lastResult = null; return; }
  if (c.source === "optimal" && !(toNum(c.cap) > 0)) { box.innerHTML = `<p class="hint" style="margin-top:0">Enter a resource cap.</p>`; lastResult = null; return; }
  lastResult = optimize(optimizerInput());
  const r = lastResult;
  if (!r.best) {
    const where = c.source === "owned" ? `the troops in ${esc(village().name)}` : "an army within the cap";
    box.innerHTML = `<p class="verdict warn">${c.side === "attack" ? `No attack with ${where} wins.` : `No reinforcement from ${where} holds.`}</p>
      <p class="hint">${c.source === "optimal" ? "Raise the cap" : "Add troops"}, allow more units, or pick “Most enemy losses” to see the best try.</p>`;
    return;
  }
  box.innerHTML = card(r.best, 0, true) + (r.alternatives.length ? `<h3>Alternatives</h3>` + r.alternatives.map((o, k) => card(o, k + 1, false)).join("") : "");
}

const travelText = (counts: number[]) => {
  const from = coordsOf(village().fields.x, village().fields.y), to = coordsOf(c.x, c.y);
  if (!from || !to) return "";
  const s = armyTravelSeconds(ourTribe(), counts, mapDistance(from, to), toNum(village().speed) || 1);
  return s ? fmtTime(s) : "";
};
const unitsLine = (tribe: string, counts: number[]) => {
  const names = unitNames(tribe);
  const parts = counts.flatMap((n, i) => (n > 0 ? [`<span><b>${fmt(n)}</b> ${esc(names[i])}</span>`] : []));
  return parts.length ? `<div class="units-line">${parts.join("")}</div>` : "";
};
const stat = (label: string, value: string, cls = "") => `<div class="stat"><span>${label}</span><strong${cls ? ` class="${cls}"` : ""}>${value}</strong></div>`;

function verdictOf(win: boolean) {
  return c.side === "attack" ? (win ? "Wins" : "Loses") : (win ? "Holds" : "Falls");
}

function card(o: ArmyOption, k: number, best: boolean) {
  const travel = travelText(o.counts);
  const sent = o.counts.some(n => n > 0);
  const army = sent ? unitsLine(ourTribe(), o.counts) : `<p class="hint" style="margin-top:0">No reinforcements needed: the troops at home hold.</p>`;
  const lootShown = c.side === "attack" && (c.mode === "raid" || c.objective === "mostLoot");
  return `<div class="card${best ? " best" : ""}">
    <p class="verdict ${o.win ? "good" : "warn"}">${verdictOf(o.win)}${best ? "" : ` · option ${k + 1}`}</p>
    ${army}
    <div class="troop-out">
      ${stat("Army value", fmt(o.cost))}
      ${stat("Our losses", fmt(o.ownLost), o.ownLost ? "down" : "")}
      ${stat("Of them wounded", fmt(o.ownWounded))}
      ${stat("Enemy losses", fmt(o.enemyLost), o.enemyLost ? "up" : "")}
      ${lootShown && o.loot !== null ? stat("Loot", fmt(o.loot)) : ""}
      ${travel ? stat("Travel", travel) : ""}
    </div>
    <button type="button" data-sim="${k}">Simulate / edit this army</button>
  </div>`;
}

/* ---- simulate ---- */
function openSim(k: number) {
  const o = k === 0 ? lastResult?.best : lastResult?.alternatives[k - 1];
  if (!o) return;
  simCounts = o.counts.map(n => (n ? String(n) : ""));
  $("simBox").hidden = false;
  $("simTroops").innerHTML = unitGrid("sim", unitNames(ourTribe()), simCounts, i => `data-sim-u="${i}"`);
  renderSim();
  $("simBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeSim() { $("simBox").hidden = true; simCounts = null; }

function renderSim() {
  if (!simCounts || $("simBox").hidden) return;
  const ours: Army = { tribe: ourTribe(), counts: nums(simCounts), smithy: smithyLevels() };
  const enemy = enemyArmies();
  let r: BattleResult, win: boolean, ownLost: number, ownWounded: number, enemyLost: number;
  if (c.side === "attack") {
    r = battle({ attacker: ours, defenders: enemy, village: villageInput(), mode: c.mode, attackerPop: pop(c.ownPop), defenderPop: pop(c.enemyPop) });
    win = r.winner === "attacker";
    ownLost = armyValue(ours.tribe, r.attackerLosses); ownWounded = armyValue(ours.tribe, r.attackerWounded);
    enemyLost = enemy.reduce((s, a, k) => s + armyValue(a.tribe, r.defenderLosses[k]), 0);
  } else {
    const defenders = [homeArmy(), ours];
    r = battle({ attacker: enemy[0], defenders, village: villageInput(), mode: c.mode, attackerPop: pop(c.enemyPop), defenderPop: pop(c.ownPop) });
    win = r.winner === "defender";
    ownLost = defenders.reduce((s, a, k) => s + armyValue(a.tribe, r.defenderLosses[k]), 0);
    ownWounded = defenders.reduce((s, a, k) => s + armyValue(a.tribe, r.defenderWounded[k]), 0);
    enemyLost = armyValue(enemy[0].tribe, r.attackerLosses);
  }
  const ourLosses = c.side === "attack" ? unitsLine(ours.tribe, r.attackerLosses) : unitsLine(ours.tribe, r.defenderLosses[1]) + unitsLine(c.wallTribe, r.defenderLosses[0]);
  const theirLosses = c.side === "attack" ? enemy.map((a, k) => unitsLine(a.tribe, r.defenderLosses[k])).join("") : unitsLine(enemy[0].tribe, r.attackerLosses);
  const travel = travelText(ours.counts);
  $("simOut").innerHTML = `
    <p class="verdict gap ${win ? "good" : "warn"}">${verdictOf(win)}</p>
    <div class="troop-out" style="margin-top:0">
      ${stat("Attack", fmt(r.attack))}
      ${stat("Defence", fmt(r.def))}
      ${stat("Army value", fmt(armyValue(ours.tribe, ours.counts)))}
      ${stat("Our losses", fmt(ownLost), ownLost ? "down" : "")}
      ${stat("Of them wounded", fmt(ownWounded))}
      ${stat("Enemy losses", fmt(enemyLost), enemyLost ? "up" : "")}
      ${travel ? stat("Travel", travel) : ""}
    </div>
    <h3>We lose</h3>${ourLosses || `<p class="hint" style="margin-top:0">Nothing.</p>`}
    <h3>They lose</h3>${theirLosses || `<p class="hint" style="margin-top:0">Nothing.</p>`}`;
}

/* ---- pasting ---- */
function pasteReport() {
  const text = $<HTMLTextAreaElement>("reportText").value, status = $("reportStatus");
  if (!text.trim()) { status.textContent = ""; return; }
  const r = parseReport(text);
  if (!r) { status.innerHTML = `<span class="warn">No report found in that text. Copy the whole report page in English.</span>`; return; }
  const f = fillFromReport(r, c.side);
  if (f.enemy.length) c.enemy = f.enemy.map(a => ({ tribe: a.tribe, counts: a.counts.map(n => (n ? String(n) : "")) }));
  if (f.wallTribe) c.wallTribe = f.wallTribe;
  if (f.wall !== null) c.wall = String(f.wall);
  if (f.coords) { c.x = String(f.coords.x); c.y = String(f.coords.y); }
  if (f.loot) { c.lootRes = f.loot.res.map(String); c.cranny = String(f.loot.crannyCapacity); }
  const parts = [
    f.enemy.length ? `${f.enemy.length === 1 ? "1 army" : `${f.enemy.length} armies`} (${f.enemy.map(a => a.tribe).join(", ")})` : "",
    f.wall !== null ? `wall level ${f.wall}` : "",
    f.loot ? "scouted resources" : "",
    f.coords ? `coordinates (${f.coords.x}|${f.coords.y})` : "",
  ].filter(Boolean);
  status.innerHTML = (parts.length ? `Read ${parts.join(", ")}. Check and edit them below.` : "Nothing to fill in from that report.")
    + (f.skipped ? ` <span class="warn">${f.skipped === 1 ? "One army was" : `${f.skipped} armies were`} hidden or not recognised.</span>` : "");
  renderTarget(); schedule();
}

function pasteTroops() {
  const text = $<HTMLTextAreaElement>("troopText").value, status = $("troopStatus");
  if (!text.trim()) { status.textContent = ""; return; }
  const troops = parseTroops(text), smithy = parseSmithy(text);
  const rows = troops.villages.length ? troops.villages.map(v => ({ name: v.name, values: v.counts }))
    : smithy.villages.map(v => ({ name: v.name, values: v.levels }));
  if (!rows.length) { status.innerHTML = `<span class="warn">No Troops or Smithy table found in that text.</span>`; return; }
  const kind = troops.villages.length ? "troops" : "smithy levels";
  const same = (a: string | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
  const done: string[] = [], missing: string[] = [];
  for (const row of rows) {
    const sv = Object.values(store.villages).find(v => same(v.gameName, row.name) || same(v.name, row.name));
    if (!sv) { missing.push(row.name); continue; }
    const vc = villageCombat(sv);
    const target = troops.villages.length ? vc.troops : vc.smithy;
    row.values.forEach((n, i) => (target[i] = n ? String(n) : ""));
    done.push(sv.name);
  }
  status.innerHTML = (done.length ? `Saved ${kind} for ${done.map(esc).join(", ")}.` : "")
    + (missing.length ? ` <span class="warn">No saved village called ${missing.map(esc).join(", ")}: add it on the Village planner page first.</span>` : "");
  renderOurs(); schedule();
}

/* ---- events ---- */
document.querySelectorAll<HTMLInputElement>('input[name="side"]').forEach(r => r.addEventListener("change", () => {
  c.side = r.value as CombatState["side"];
  if (c.side === "defend") c.wallTribe = ourTribe();
  closeSim();
  renderAll();
}));
document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(r => r.addEventListener("change", () => { c.mode = r.value as CombatState["mode"]; renderMode(); schedule(); }));
document.querySelectorAll<HTMLInputElement>('input[name="source"]').forEach(r => r.addEventListener("change", () => { c.source = r.value as CombatState["source"]; renderMode(); schedule(); }));
$("reportText").addEventListener("input", pasteReport);
$("troopText").addEventListener("input", pasteTroops);
$("wallTribe").addEventListener("change", e => { c.wallTribe = (e.target as HTMLSelectElement).value; c.home = c.home.map(() => ""); renderTarget(); schedule(); });
$("wall").addEventListener("change", e => { c.wall = (e.target as HTMLSelectElement).value; schedule(); });
$("enemyArmies").addEventListener("input", e => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.ea != null) { c.enemy[+t.dataset.ea].counts[+t.dataset.eu!] = t.value; schedule(); }
});
$("enemyArmies").addEventListener("change", e => {
  const t = e.target as HTMLSelectElement;
  if (t.dataset.etribe != null) { c.enemy[+t.dataset.etribe] = newCombatArmy(t.value); renderEnemy(); schedule(); }
});
$("enemyArmies").addEventListener("click", e => {
  const k = (e.target as HTMLElement).dataset.eremove;
  if (k != null) { c.enemy.splice(+k, 1); renderEnemy(); schedule(); }
});
$("addEnemy").addEventListener("click", () => { c.enemy.push(newCombatArmy(c.wallTribe)); renderEnemy(); schedule(); });
$("homeTroops").addEventListener("input", e => { const t = e.target as HTMLInputElement; c.home[+t.dataset.home!] = t.value; schedule(); });
document.querySelectorAll<HTMLInputElement>("[data-loot]").forEach(i => i.addEventListener("input", () => { c.lootRes[+i.dataset.loot!] = i.value; schedule(); }));
$("cranny").addEventListener("input", e => { c.cranny = (e.target as HTMLInputElement).value; schedule(); });
$("tx").addEventListener("input", e => { c.x = (e.target as HTMLInputElement).value; schedule(); });
$("ty").addEventListener("input", e => { c.y = (e.target as HTMLInputElement).value; schedule(); });
$("village").addEventListener("change", e => { c.village = (e.target as HTMLSelectElement).value; closeSim(); renderOurs(); schedule(); });
$("ownTroops").addEventListener("input", e => { const t = e.target as HTMLInputElement; villageCombat(village()).troops[+t.dataset.own!] = t.value; schedule(); });
$("smithy").addEventListener("input", e => { const t = e.target as HTMLInputElement; villageCombat(village()).smithy[+t.dataset.smith!] = t.value; schedule(); });
$("cap").addEventListener("input", e => { c.cap = (e.target as HTMLInputElement).value; schedule(); });
$("allowed").addEventListener("change", () => {
  c.allowed[ourTribe()] = [...document.querySelectorAll<HTMLInputElement>("[data-allow]")].filter(i => i.checked).map(i => +i.dataset.allow!);
  schedule();
});
$("objective").addEventListener("change", e => { c.objective = (e.target as HTMLSelectElement).value as Objective; schedule(); });
$("wounded").addEventListener("change", e => { c.woundedRecoverable = (e.target as HTMLInputElement).checked; schedule(); });
$("ownPop").addEventListener("input", e => { c.ownPop = (e.target as HTMLInputElement).value; schedule(); });
$("enemyPop").addEventListener("input", e => { c.enemyPop = (e.target as HTMLInputElement).value; schedule(); });
$("results").addEventListener("click", e => { const k = (e.target as HTMLElement).dataset.sim; if (k != null) openSim(+k); });
$("simTroops").addEventListener("input", e => { const t = e.target as HTMLInputElement; if (simCounts) { simCounts[+t.dataset.simU!] = t.value; renderSim(); } });
$("simClose").addEventListener("click", closeSim);

renderAll();
