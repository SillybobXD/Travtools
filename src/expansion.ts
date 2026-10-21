import { BUILDINGS, CULTURE, UNITS } from "./data";
import { fmt, fmtTime, toNum } from "./calc/format";
import { celebrationCp, celebrationSeconds, cpForecast, cpPerDay, DAY, expansionPlan, slotLevel, type CpEvent, type CpRepeat } from "./calc/culture";
import { rangeCost } from "./calc/buildings";
import { trainingTime } from "./calc/troops";
import { parseCulture } from "./parse/culture";
import { cultureOf, loadStore, newId, newVillage, saveStore, type CultureCeleb, type CultureEvent, type CultureState, type Store, type VillageState } from "./storage";
import type { Res4 } from "./types";

/* Expansion page: reads the inputs, runs the culture point forecast and the settler plan, and renders. All logic is in src/calc and src/parse. */

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const TRIBES = Object.keys(UNITS);
const RES_ICONS = ["wood", "clay", "iron", "crop"];
const KIND_NAME: Record<CultureEvent["kind"], string> = { small: "Small celebration", great: "Great celebration", artwork: "Artwork" };
const CELEB_KINDS = ["small", "great"] as const;

/* ---- state ---- */
const buildingOf = (tribe: string, unit: number) => UNITS[tribe]?.[unit]?.building;
const store: Store = loadStore(buildingOf) ?? (() => {
  const id = newId();
  return { version: 2, current: id, villages: { [id]: newVillage("My village", TRIBES[0], "1") }, overrides: {} } as Store;
})();
if (!store.villages[store.current]) store.current = Object.keys(store.villages)[0];
const c: CultureState = cultureOf(store);
const village = (): VillageState => store.villages[c.village] ?? store.villages[store.current];

/* ---- time helpers ---- */
/** A clock time like "today 21:50", "tomorrow 03:10" or "Fri 24 Oct 14:00". */
function clock(at: number) {
  const d = new Date(at), t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  if (days === 0) return `today ${t}`;
  if (days === 1) return `tomorrow ${t}`;
  if (days === -1) return `yesterday ${t}`;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${t}`;
}
const fromNow = (at: number) => { const s = (at - Date.now()) / 1000; return s >= 0 ? `in ${fmtTime(s)}` : `${fmtTime(-s)} ago`; };
/** ms ↔ the value of a datetime-local input, in local time. */
const toInput = (ms: number | undefined) => (ms == null || !isFinite(ms) ? "" : new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
const fromInput = (s: string) => (s ? new Date(s).getTime() : NaN);
/** The next five minutes, as a start for new events. */
const soon = () => Math.ceil(Date.now() / 300000) * 300000;

/* ---- numbers ---- */
const alliancePct = () => parseFloat(c.alliance.replace(",", ".")) || 0;
const total = () => cpPerDay(toNum(c.villages), toNum(c.hero), alliancePct());
/** Where the forecast starts: when the CP were read, or now if they never were. */
const start = () => c.cpAt ?? Date.now();
const villageCpOf = (name: string | undefined) => (name ? c.villageCp[name]?.cp ?? 0 : 0);
const celebData = (e: CultureCeleb) => CULTURE.celebrations[e.kind === "great" ? 1 : 0];
/** Default CP: an Artwork gives a day of production; a celebration its amount within its cap. */
const defaultCp = (e: CultureEvent | CultureCeleb, perDay = total()) => (e.kind === "artwork" ? perDay
  : celebrationCp(celebData(e as CultureCeleb), villageCpOf(e.village), perDay));
const eventCp = (e: CultureEvent | CultureCeleb, perDay = total()) => (e.cp.trim() ? toNum(e.cp) : defaultCp(e, perDay));
const celebLabel = (e: CultureCeleb) => KIND_NAME[e.kind] + (e.village ? ` in ${e.village}` : "");
const serverSpeed = () => toNum(village().speed) || 1;
/** How long each of a village's celebrations lasts; 0 without a Town Hall level. */
const celebSeconds = (e: CultureCeleb) => (toNum(e.th) > 0 ? celebrationSeconds(celebData(e), toNum(e.th), serverSpeed(), CULTURE.townHallFactor) : 0);

/** Artworks and celebrations that don't repeat, in seconds from the start. */
function events(perDay = total(), extra: CpEvent[] = []): CpEvent[] {
  const s = start();
  return [
    ...c.events.map(e => ({ at: (e.at - s) / 1000, cp: eventCp(e, perDay), label: "Artwork" })),
    ...c.celebs.filter(e => !(e.repeat && celebSeconds(e))).map(e => ({ at: (e.at - s) / 1000, cp: eventCp(e, perDay), label: celebLabel(e) })),
    ...extra,
  ];
}

/** Celebrations held back to back: the current one ends at `at`, each next one a celebration later. */
function celebRepeats(perDay = total()): CpRepeat[] {
  const s = start();
  return c.celebs.flatMap(e => {
    const every = celebSeconds(e);
    if (!e.repeat || !every) return [];
    let first = (e.at - s) / 1000;
    while (first < 0) first += every;
    return [{ first, every, cp: eventCp(e, perDay), label: celebLabel(e) }];
  });
}

/** The daily quest reward, from its next time on or after the start. */
function quest(): CpRepeat | null {
  if (!c.quest || c.questAt == null) return null;
  const every = CULTURE.dailyQuest.everyDays * DAY;
  let first = (c.questAt - start()) / 1000;
  while (first < 0) first += every;
  return { first, every, cp: CULTURE.dailyQuest.cp, label: "Daily quest reward" };
}

const forecastWith = (perDay: number, extra: CpEvent[] = []) =>
  cpForecast(toNum(c.cp), toNum(c.need), perDay, events(perDay, extra), [quest(), ...celebRepeats(perDay)]);

/* ---- rendering ---- */
function renderInputs() {
  $("cp").value = c.cp; $("need").value = c.need;
  $("villages").value = c.villages; $("alliance").value = c.alliance;
  const hero = toNum(c.hero), tiers = CULTURE.helmets.map(h => [h.cpPerDay, `${h.name}${h.cpPerDay ? ` (+${fmt(h.cpPerDay)})` : ""}`] as const);
  if (!tiers.some(([v]) => v === hero)) tiers.push([hero, `Other (+${fmt(hero)})`] as never);
  $<HTMLSelectElement>("hero").innerHTML = tiers.map(([v, n]) => `<option value="${v}"${v === hero ? " selected" : ""}>${esc(n)}</option>`).join("");
  $("quest").checked = c.quest;
  $("questLabel").textContent = `Daily quest reward (${fmt(CULTURE.dailyQuest.cp)} every ${CULTURE.dailyQuest.everyDays} days)`;
  $("questAt").value = toInput(c.questAt);
  renderCelebs(); renderEvents();
  const vs = $<HTMLSelectElement>("village");
  vs.innerHTML = Object.entries(store.villages).map(([id, v]) => `<option value="${id}">${esc(v.name)} · ${esc(v.tribe)}</option>`).join("");
  vs.value = c.village;
  document.querySelectorAll<HTMLInputElement>('input[name="building"]').forEach(r => (r.checked = r.value === c.building));
  $("level").value = c.level; $("used").value = c.used;
  $("buildH").value = c.buildH; $("buildM").value = c.buildM; $("settlers").value = c.settlers;
  $<HTMLDetailsElement>("pasteBox").open = !c.cp;
}

function renderCelebs() {
  const names = [...new Set([...Object.keys(c.villageCp), ...Object.values(store.villages).map(v => v.gameName ?? v.name)])];
  const perDay = total();
  $("celebs").innerHTML = c.celebs.map((e, k) => `
    <div class="army" data-k="${k}">
      <div class="army-top">
        <div><label for="cvil${k}">Village</label><select id="cvil${k}" data-cf="village"><option value="">—</option>${names.map(n => `<option${n === e.village ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
        <button type="button" class="remove" data-cremove="${k}">Remove</button>
      </div>
      <div class="grid2">
        <div><label for="ckind${k}">Kind</label><select id="ckind${k}" data-cf="kind">${CELEB_KINDS.map(kind => `<option value="${kind}"${kind === e.kind ? " selected" : ""}>${KIND_NAME[kind]}</option>`).join("")}</select></div>
        <div><label for="cth${k}">Town Hall level</label><input id="cth${k}" data-cf="th" inputmode="numeric" autocomplete="off" value="${esc(e.th)}"></div>
        <div><label for="cat${k}">${e.repeat ? "Current one ends" : "Ends at"}</label><input id="cat${k}" type="datetime-local" data-cf="at" value="${toInput(e.at)}"></div>
        <div><label for="ccp${k}">CP each</label><input id="ccp${k}" data-cf="cp" inputmode="numeric" autocomplete="off" value="${esc(e.cp)}" placeholder="${fmt(defaultCp(e, perDay))}"></div>
      </div>
      <label class="check plain gap"><input type="checkbox" data-cf="repeat"${e.repeat ? " checked" : ""}> Back to back (24/7)</label>
      <p class="hint" data-chint="${k}">${celebHint(e)}</p>
    </div>`).join("") || `<p class="hint" style="margin-top:0">None running.</p>`;
}

function celebHint(e: CultureCeleb) {
  const d = celebSeconds(e);
  if (!d) return e.repeat ? `<span class="warn">Enter the Town Hall level to repeat it.</span>` : "";
  return `Each lasts ${fmtTime(d)} at ${serverSpeed()}× speed: ${(DAY / d).toFixed(1)} a day.`;
}

function renderEvents() {
  const perDay = total();
  $("events").innerHTML = c.events.map((e, k) => `
    <div class="army" data-k="${k}">
      <div class="army-top">
        <div class="grid2">
          <div><label for="eat${k}">Used at</label><input id="eat${k}" type="datetime-local" data-ef="at" value="${toInput(e.at)}"></div>
          <div><label for="ecp${k}">CP</label><input id="ecp${k}" data-ef="cp" inputmode="numeric" autocomplete="off" value="${esc(e.cp)}" placeholder="${fmt(defaultCp(e, perDay))}"></div>
        </div>
        <button type="button" class="remove" data-eremove="${k}">Remove</button>
      </div>
    </div>`).join("") || `<p class="hint" style="margin-top:0">None planned.</p>`;
}

function renderHints() {
  $("cpAtHint").textContent = c.cpAt ? `As of ${clock(c.cpAt)}. Paste or type the numbers again to start from a later time.` : "";
  const t = total(), game = c.gameTotal;
  $("totalHint").innerHTML = `Total <b>${fmt(t)}</b> per day` + (game != null && toNum(c.villages) ? (game === t ? ", as the game shows." : ` <span class="warn">(the game showed ${fmt(game)})</span>.`) : ".")
    + " The alliance bonus counts on the hero's CP too.";
}

function renderForecast() {
  const box = $("forecast");
  if (!(toNum(c.need) > 0)) { box.innerHTML = `<p class="hint" style="margin-top:0">Enter your culture points and what the next village needs, or paste the Residence's Culture points tab.</p>`; return; }
  const perDay = total(), f = forecastWith(perDay);
  if (!isFinite(f.seconds)) { box.innerHTML = `<p class="verdict warn">Never: nothing adds culture points.</p>`; return; }
  const at = start() + f.seconds * 1000;
  const rows = [
    `<tr><td>Already produced</td><td></td><td>${fmt(toNum(c.cp))}</td></tr>`,
    `<tr><td>Production</td><td>${fmt(perDay)}/day</td><td>${fmt(f.fromProduction)}</td></tr>`,
    ...grouped(f.events).map(g => `<tr><td>${esc(g.label)}${g.n > 1 ? ` ×${g.n}` : ""}</td><td>${esc(clock(start() + g.first * 1000))}${g.n > 1 ? ` to ${esc(clock(start() + g.last * 1000))}` : ""}</td><td>${fmt(g.cp)}</td></tr>`),
  ];
  const game = c.gameEstimate != null && c.cpAt != null
    ? `<p class="hint">The game said ${esc(clock(c.gameEstimate))} from production alone${f.events.length ? "" : `; this is ${fmtTime(Math.abs(at - c.gameEstimate) / 1000)} ${at >= c.gameEstimate ? "later" : "sooner"}`}.</p>` : "";
  box.innerHTML = `
    <p class="verdict ${at <= Date.now() ? "good" : ""}">${at <= Date.now() ? "Enough culture points now" : `Next village ${esc(clock(at))}`}</p>
    <p class="hint" style="margin-top:-6px">${esc(fromNow(at))}</p>
    ${game}
    <div class="table-wrap gap"><table class="fit">
      <thead><tr><th>Culture points</th><th>When</th><th>CP</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
      <tfoot><tr><td>Next village at</td><td></td><td>${fmt(toNum(c.need))}</td></tr></tfoot>
    </table></div>
    ${whatIf(f.seconds, perDay)}`;
}

/** The forecast's events by label: how many, the first and last time, and their CP together. */
function grouped(evs: CpEvent[]) {
  const out: { label: string; n: number; first: number; last: number; cp: number }[] = [];
  for (const e of evs) {
    const g = out.find(x => x.label === e.label);
    if (g) { g.n++; g.last = e.at; g.cp += e.cp; } else out.push({ label: e.label, n: 1, first: e.at, last: e.at, cp: e.cp });
  }
  return out;
}

/** How much sooner a boost gets the next village. */
function whatIf(base: number, perDay: number) {
  if (base <= 0) return "";
  const out: string[] = [];
  const now = (Date.now() - start()) / 1000;
  const art = forecastWith(perDay, [{ at: Math.max(0, now), cp: perDay, label: "Artwork" }]).seconds;
  if (art < base) out.push(`An Artwork now (+${fmt(perDay)}): ${fmtTime(base - art)} sooner`);
  const hero = toNum(c.hero), next = CULTURE.helmets.find(h => h.cpPerDay > hero);
  if (next) {
    const pd = cpPerDay(toNum(c.villages), next.cpPerDay, alliancePct());
    const s = forecastWith(pd).seconds;
    if (s < base) out.push(`${esc(next.name)}: ${fmtTime(base - s)} sooner`);
  }
  return out.length ? `<h3>What would help</h3><ul class="hint list">${out.map(s => `<li>${s}</li>`).join("")}</ul>` : "";
}

function renderSchedule() {
  const box = $("schedule"), v = village();
  const used = c.used.trim() ? toNum(c.used) : usedSlots(v) ?? 0;
  $("used").placeholder = String(usedSlots(v) ?? 0);
  const level = Math.min(20, toNum(c.level)), slot = slotLevel(c.building, used);
  if (slot === null) { $("buildBox").hidden = true; box.innerHTML = `<p class="hint warn">A ${c.building} has no more slots after ${used}. Pick another village.</p>`; return; }
  const target = Math.max(level, slot), building = level < slot;
  $("buildBox").hidden = !building;
  $("slotHint").textContent = building ? `The free slot comes at level ${slot}.` : "";
  $("buildLabel").textContent = `Level ${level} → ${slot}, hours`;

  const units = UNITS[v.tribe] ?? [], si = units.findIndex(u => u.name === "Settler"), settler = units[si];
  const n = Math.max(0, toNum(c.settlers));
  const per = settler?.time ? trainingTime(settler.time, target, toNum(v.speed) || 1, toNum(v.train?.R?.bonus)) : 0;
  const buildSeconds = building ? (toNum(c.buildH) * 3600 + toNum(c.buildM) * 60) : 0;

  const b = BUILDINGS.find(x => x.name === c.building)!;
  const cost: Res4 = building ? rangeCost(b, level, slot).tot : [0, 0, 0, 0];
  const settlerCost = (settler?.cost ?? [0, 0, 0, 0]).map(x => x * n) as Res4;
  const costLine = (r: Res4) => `<div class="cost-line">${r.map((x, i) => `<span style="--c: var(--${RES_ICONS[i]})"><b><svg class="ico" aria-hidden="true"><use href="#i-${RES_ICONS[i]}"></use></svg></b>${fmt(x)}</span>`).join("")}</div>`;
  const costs = `${building ? `<h3>${c.building} ${level} → ${slot}</h3>${costLine(cost)}` : ""}
    ${n ? `<h3>${n} settler${n === 1 ? "" : "s"}</h3>${costLine(settlerCost)}<p class="hint">${per ? `${fmtTime(per)} each at level ${target}${toNum(v.train?.R?.bonus) ? ` with a ${toNum(v.train?.R?.bonus)}% bonus` : ""}, one after another.` : `<span class="warn">Settler training time unknown for ${esc(v.tribe)}.</span>`}</p>` : ""}`;

  const perDay = total(), f = toNum(c.need) > 0 ? forecastWith(perDay) : null;
  if (!f || !isFinite(f.seconds)) { box.innerHTML = costs; return; }
  // Plan in seconds from now: building and training can't start in the past.
  const now = Date.now(), cpIn = Math.max(0, (start() + f.seconds * 1000 - now) / 1000);
  const p = expansionPlan(cpIn, buildSeconds, per, n);
  const at = (s: number) => now + s * 1000;
  const step = (label: string, s: number) => `<tr><td>${label}</td><td>${esc(clock(at(s)))}</td><td>${s <= 0 ? (s < -60 ? `<span class="warn">${fmtTime(-s)} late</span>` : "now") : `in ${fmtTime(s)}`}</td></tr>`;
  const missingBuild = building && !buildSeconds;
  box.innerHTML = `
    <p class="verdict gap ${p.late ? "warn" : "good"}">${p.late
      ? `Too late for the CP: earliest village ${esc(clock(at(p.readyAt)))}`
      : `Start ${building ? `the ${c.building}` : "the settlers"} by ${esc(clock(at(building ? p.buildStart : p.settlersStart)))}`}</p>
    ${p.late ? `<p class="hint" style="margin-top:-6px">Building and training take ${fmtTime(p.soonest)}; the culture points are there ${cpIn > 0 ? `in ${fmtTime(cpIn)}` : "now"}. Start now.</p>` : ""}
    ${missingBuild ? `<p class="hint warn">Enter the build time for the ${c.building} upgrades.</p>` : ""}
    <div class="table-wrap gap"><table class="fit">
      <thead><tr><th>Step</th><th>Latest start</th><th></th></tr></thead>
      <tbody>
        ${building ? step(`${c.building} ${level} → ${slot}`, p.buildStart) : ""}
        ${n && per ? Array.from({ length: n }, (_, k) => step(`Settler ${k + 1}`, p.settlersStart + k * per)).join("") : ""}
      </tbody>
      <tfoot><tr><td>Settlers leave</td><td>${esc(clock(at(p.readyAt)))}</td><td>${p.readyAt > 0 ? `in ${fmtTime(p.readyAt)}` : "now"}</td></tr></tfoot>
    </table></div>
    ${costs}`;
}

/** Settlement slots in use in a saved village, from the overview's Culture points tab. */
function usedSlots(v: VillageState): number | null {
  const row = c.villageCp[v.gameName ?? ""] ?? c.villageCp[v.name];
  return row?.slots ? row.slots[0] : null;
}

function update() {
  saveStore(store);
  renderHints(); renderForecast(); renderSchedule();
}

/* ---- pasting ---- */
function paste() {
  const text = $<HTMLTextAreaElement>("cultureText").value, status = $("pasteStatus");
  if (!text.trim()) { status.textContent = ""; return; }
  const r = parseCulture(text), read: string[] = [];
  const now = Date.now();
  if (r.produced != null) { c.cp = String(r.produced); c.cpAt = now; read.push(`${fmt(r.produced)} culture points`); }
  if (r.needed != null) { c.need = String(r.needed); read.push(`${fmt(r.needed)} for the next village`); }
  if (r.active != null && r.other != null) c.villages = String(r.active + r.other);
  else if (r.villages.length) c.villages = String(r.villages.reduce((a, v) => a + v.cpPerDay, 0));
  if (r.hero != null) c.hero = String(r.hero);
  if (r.alliancePct != null) c.alliance = String(r.alliancePct);
  if (r.total != null) { c.gameTotal = r.total; read.push(`${fmt(r.total)} per day`); }
  if (r.estimate != null) c.gameEstimate = r.estimate;
  if (r.villages.length) {
    c.villageCp = Object.fromEntries(r.villages.map(v => [v.name, { cp: v.cpPerDay, ...(v.slots ? { slots: v.slots } : {}) }]));
    read.push(`${r.villages.length} villages with their CP per day and slots`);
    // A running celebration sets when that village's current one ends; its kind, Town Hall and repeat stay.
    const running = r.villages.filter(v => v.celebrationLeft != null);
    for (const v of running) {
      const at = now + v.celebrationLeft! * 1000, row = c.celebs.find(e => e.village === v.name);
      if (row) row.at = at;
      else c.celebs.push({ village: v.name, kind: "small", at, th: "", repeat: true, cp: "" });
    }
    if (running.length) read.push(`${running.length} running celebration${running.length === 1 ? "" : "s"}`);
    const noTh = c.celebs.filter(e => e.repeat && !toNum(e.th)).length;
    if (noTh) read.push(`<span class="warn">enter the Town Hall level and kind of ${noTh === 1 ? "one celebration" : `${noTh} celebrations`} below</span>`);
  }
  status.innerHTML = read.length ? `Read ${read.join(", ")}.` + (r.produced == null ? " Now paste the Residence's or Palace's Culture points tab." : "")
    : `<span class="warn">No culture points found in that text. Copy the whole page in English.</span>`;
  renderInputs(); $<HTMLDetailsElement>("pasteBox").open = true; update();
}

/* ---- events ---- */
const field = (id: string, key: "cp" | "need" | "villages" | "alliance" | "level" | "used" | "buildH" | "buildM" | "settlers", after?: () => void) =>
  $(id).addEventListener("input", e => { c[key] = (e.target as HTMLInputElement).value; after?.(); update(); });
field("cp", "cp", () => (c.cpAt = Date.now()));
field("need", "need");
field("villages", "villages", () => { renderCelebs(); renderEvents(); });
field("alliance", "alliance", () => { renderCelebs(); renderEvents(); });
["level", "used", "buildH", "buildM", "settlers"].forEach(k => field(k, k as "level"));
$("cultureText").addEventListener("input", paste);
$("hero").addEventListener("change", e => { c.hero = (e.target as HTMLSelectElement).value; renderCelebs(); renderEvents(); update(); });
$("quest").addEventListener("change", e => { c.quest = (e.target as HTMLInputElement).checked; if (c.quest && c.questAt == null) { c.questAt = soon(); $("questAt").value = toInput(c.questAt); } update(); });
$("questAt").addEventListener("input", e => { const t = fromInput((e.target as HTMLInputElement).value); c.questAt = isNaN(t) ? undefined : t; update(); });
$("addCeleb").addEventListener("click", () => { c.celebs.push({ kind: "small", at: soon(), th: "", repeat: true, cp: "", village: village().gameName ?? village().name }); renderCelebs(); update(); });
$("addArtwork").addEventListener("click", () => { c.events.push({ kind: "artwork", at: soon(), cp: "" }); renderEvents(); update(); });
$("events").addEventListener("click", e => {
  const k = (e.target as HTMLElement).dataset.eremove;
  if (k != null) { c.events.splice(+k, 1); renderEvents(); update(); }
});
$("events").addEventListener("input", e => {
  const t = e.target as HTMLInputElement, k = t.closest<HTMLElement>("[data-k]")?.dataset.k, f = t.dataset.ef;
  if (k == null || !f) return;
  const ev = c.events[+k];
  if (f === "at") { const ms = fromInput(t.value); if (!isNaN(ms)) ev.at = ms; }
  else if (f === "cp") ev.cp = t.value;
  update();
});
$("celebs").addEventListener("click", e => {
  const k = (e.target as HTMLElement).dataset.cremove;
  if (k != null) { c.celebs.splice(+k, 1); renderCelebs(); update(); }
});
$("celebs").addEventListener("input", e => {
  const t = e.target as HTMLInputElement, k = t.closest<HTMLElement>("[data-k]")?.dataset.k, f = t.dataset.cf;
  if (k == null || !f) return;
  const ev = c.celebs[+k];
  if (f === "at") { const ms = fromInput(t.value); if (!isNaN(ms)) ev.at = ms; }
  else if (f === "cp") ev.cp = t.value;
  else if (f === "th") ev.th = t.value;
  else if (f === "village") ev.village = t.value || undefined;
  else if (f === "kind") ev.kind = t.value as CultureCeleb["kind"];
  else if (f === "repeat") ev.repeat = t.checked;
  // Selects and the checkbox change labels and defaults; text fields only update the hint, to keep the cursor.
  if (f === "village" || f === "kind" || f === "repeat") renderCelebs();
  else { const h = document.querySelector(`[data-chint="${k}"]`); if (h) h.innerHTML = celebHint(ev); }
  update();
});
// The slot village's server speed sets celebration lengths too.
$("village").addEventListener("change", e => { c.village = (e.target as HTMLSelectElement).value; renderCelebs(); update(); });
document.querySelectorAll<HTMLInputElement>('input[name="building"]').forEach(r => r.addEventListener("change", () => { c.building = r.value as CultureState["building"]; update(); }));

renderInputs();
update();
// Keep the countdowns current.
setInterval(() => { renderForecast(); renderSchedule(); }, 60000);
