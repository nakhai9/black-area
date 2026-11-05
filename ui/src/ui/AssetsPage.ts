import { AVAILABLE_VEHICLES, CELL_SIZE, FACTION_ORDER } from "../constants";
import { type AssetKind, assetId, gameAssets, saveGameAssets } from "../core/GameAssets";
import { Infantry } from "../entities/Infantry";
import { Vehicle } from "../entities/Vehicle";
import { FACTIONS } from "../factions";
import { t } from "../i18n";
import { loadAircraftSprites } from "../render/AircraftSheets";
import { loadSoldierSprites } from "../render/InfantryArt";
import { loadMantisSprites } from "../render/MantisSheet";
import { loadRepairSprites } from "../render/RepairSheets";
import { SpriteCache } from "../render/SpriteCache";
import { loadTankSprites } from "../render/TankSheets";
import { loadTruckSprites } from "../render/TruckSheets";
import { BUILDING_ART, teamColoredKey } from "../render/sprites";
import { loadPictureArts } from "../render/sprites/PictureArt";
import { BUILD_OPTIONS, FOREIGN_BUILDS, buildCost, footprintOf } from "../systems/ConstructionSystem";
import type { FactionId, UnitTier, VehicleKind } from "../types";
import { type BuildingCard, drawBuildingCard } from "./BuildingGallery";
import { showResearchLab } from "./ResearchLab";
import { type UnitCard, drawUnitCard } from "./UnitGallery";

/** Reopens the Assets page after a save reloads the game (sessionStorage flag). */
export const ASSETS_REOPEN_KEY = "blackArea.assetsPage";

/** One soldier, vehicle or structure design of one nation, as listed on the Configuration tab. */
interface Asset {
  kind: AssetKind;
  design: FactionId;
  base: string;
  name: string;
  lines: string[];
  /** Draws picture `view` (0 = main) into a canvas; `null` when there is no such view. */
  picture: (view: number) => ((canvas: HTMLCanvasElement, time: number) => void) | null;
}

const VIEWS = 6;
const at = { x: 0, y: 0 };
const cache = new SpriteCache(BUILDING_ART);

function unitAsset(kind: "infantry" | "vehicle", design: FactionId, base: string): Asset {
  const unit = kind === "infantry" ? new Infantry(0, design, base as UnitTier, at) : new Vehicle(0, design, base as VehicleKind, at);
  const name = unit instanceof Vehicle ? unit.name : (unit as Infantry).profile.name;
  const lines = [`${t("Cost")}: ${unit.value} TB`, `${t("Health")}: ${unit.maxHp} HP`, `${t("Speed")}: ${(unit.speed / CELL_SIZE).toFixed(2)} ${t("cells/s")}`];
  lines.push(unit.weapon ? `${t("Weapon")}: ${unit.weapon.kind}, ${Math.round(unit.weapon.damage)} dmg, ${(unit.weapon.range / CELL_SIZE).toFixed(1)} ${t("cells")}` : `${t("Weapon")}: —`);
  return {
    kind,
    design,
    base,
    name,
    lines,
    // Six headings round the unit (the main view turns slowly).
    picture: (view) => (canvas, time) => {
      const card: UnitCard = { canvas, unit, heading: view === 0 ? undefined : ((view - 1) * Math.PI * 2) / (VIEWS - 1) };
      drawUnitCard(card, time);
    },
  };
}

function buildingAsset(design: FactionId, optionId: string): Asset | null {
  const option = BUILD_OPTIONS.find((o) => o.id === optionId);
  if (!option) return null;
  const key = option.spriteKey(design);
  if (!BUILDING_ART[key.split("@")[0]!] && !BUILDING_ART[key]) return null;
  const fp = footprintOf(option, design);
  let hp = 0;
  try {
    hp = option.create(0, design, 0, 0).maxHp;
  } catch {
    hp = 0;
  }
  const others = FACTION_ORDER.filter((f) => f !== design).slice(0, 4);
  return {
    kind: "building",
    design,
    base: option.id,
    name: option.name,
    lines: [`${t("Cost")}: ${buildCost(option, design)} TB`, `${t("Health")}: ${hp || "—"} HP`, `${t("Plot")}: ${fp.w} × ${fp.d} ${t("cells")}`],
    // Main view, the turned (mirrored) plot, and the structure as taken by each other nation (captured colours).
    picture: (view) => {
      const sprite = view === 0 ? cache.get(key) : view === 1 ? cache.get(key, true) : others[view - 2] ? cache.get(teamColoredKey(key, others[view - 2]!)) : null;
      if (!sprite) return null;
      return (canvas, time) => drawBuildingCard({ canvas, sprite, bunker: option.id === "bunker" ? design : undefined } as BuildingCard, time);
    },
  };
}

function assetsOf(kind: AssetKind): Asset[] {
  const out: Asset[] = [];
  for (const f of FACTION_ORDER) {
    const nation = FACTIONS[f];
    if (kind === "infantry") for (const tier of Object.keys(nation.infantry)) out.push(unitAsset("infantry", f, tier));
    else if (kind === "vehicle") {
      for (const v of Object.keys(nation.vehicles) as VehicleKind[]) if (AVAILABLE_VEHICLES.includes(v)) out.push(unitAsset("vehicle", f, v));
    } else for (const o of BUILD_OPTIONS) if (!o.foreign) {
      const a = buildingAsset(f, o.id);
      if (a) out.push(a);
    }
  }
  return out;
}

const STYLE = `
  html, body { height: auto; overflow: auto; }
  .ap-page { max-width: 1280px; margin: 0 auto; padding: 20px 16px 48px; color: #d8dee4; font: 14px system-ui, sans-serif; }
  .ap-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .ap-head h1 { margin: 0; font-size: 22px; letter-spacing: 1px; flex: 1; }
  .ap-btn { padding: 7px 16px; border: 1px solid #56626d; border-radius: 6px; background: #1d2731; color: #d8dee4; font: inherit; cursor: pointer; }
  .ap-btn.primary { background: #3b6ea5; border-color: #3b6ea5; }
  .ap-btn.danger { border-color: #a5463b; color: #ffb4a8; }
  .ap-tabs { display: flex; gap: 6px; border-bottom: 1px solid #2c3742; margin-bottom: 14px; }
  .ap-tab { padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; color: #9aa4ad; font: inherit; cursor: pointer; }
  .ap-tab.on { color: #fff; border-bottom-color: #e8a33d; }
  .ap-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  @media (max-width: 900px) { .ap-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .ap-card { background: #c3cbd3; color: #1a2128; border: 1px solid #7d8994; border-radius: 8px; overflow: hidden; cursor: pointer; position: relative; }
  .ap-card canvas { display: block; width: 100%; height: 150px; background: #8e9aa6; }
  .ap-card div { padding: 7px 9px; display: flex; flex-direction: column; gap: 2px; }
  .ap-card small { color: #5f6b76; }
  .ap-card.deleted { opacity: 0.45; }
  .ap-tag { position: absolute; top: 6px; left: 6px; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #fff; }
  .ap-modal-bg { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: grid; place-items: center; z-index: 20; padding: 16px; }
  .ap-modal { background: #141b22; border: 1px solid #34404b; border-radius: 10px; width: min(1000px, 100%); max-height: calc(100vh - 32px); overflow: auto; display: flex; flex-direction: column; }
  .ap-modal-body { display: grid; grid-template-columns: minmax(0, 3fr) minmax(220px, 2fr); gap: 20px; padding: 18px; }
  @media (max-width: 760px) { .ap-modal-body { grid-template-columns: 1fr; } }
  .ap-main { width: 100%; aspect-ratio: 4 / 3; background: #fff; border-radius: 8px; display: block; }
  .ap-thumbs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 8px; }
  .ap-thumbs canvas { width: 100%; aspect-ratio: 1; background: #fff; border-radius: 6px; border: 2px solid transparent; cursor: pointer; display: block; }
  .ap-thumbs canvas.on { border-color: #e8a33d; }
  .ap-info h2 { margin: 0 0 4px; font-size: 20px; }
  .ap-info .ap-sub { color: #9aa4ad; margin-bottom: 12px; }
  .ap-info ul { margin: 0 0 14px; padding-left: 18px; line-height: 1.6; }
  .ap-info label { display: block; margin-bottom: 4px; color: #9aa4ad; }
  .ap-info select { width: 100%; padding: 6px; background: #1d2731; color: #d8dee4; border: 1px solid #56626d; border-radius: 6px; font: inherit; }
  .ap-note { color: #9aa4ad; font-size: 12px; margin-top: 6px; }
  .ap-foot { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #2c3742; }
  .ap-foot .grow { flex: 1; }
  .ap-acc { border: 1px solid #2c3742; border-radius: 6px; margin-top: 8px; }
  .ap-acc summary { padding: 8px 10px; cursor: pointer; }
  .ap-acc div { padding: 4px 12px 10px; display: grid; gap: 4px; max-height: 200px; overflow: auto; }
`;

function swatch(f: FactionId): string {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${FACTIONS[f].colors.primary};margin-right:6px"></span>`;
}

function factionSelect(value: FactionId): HTMLSelectElement {
  const s = document.createElement("select");
  for (const f of FACTION_ORDER) s.append(new Option(FACTIONS[f].name, f, false, f === value));
  return s;
}

async function save(mutate: (file: ReturnType<typeof gameAssets>) => void): Promise<void> {
  const file = gameAssets();
  mutate(file);
  try {
    await saveGameAssets(file);
    try {
      sessionStorage.setItem(ASSETS_REOPEN_KEY, "1");
    } catch {
      /* the page just opens on the demo menu */
    }
    location.reload();
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

/** Amazon-style product modal: large view + six thumbnails, details and the nation that sells it; Delete / Close, Apply. */
function openAssetModal(a: Asset): void {
  const id = assetId(a.kind, a.design, a.base);
  const current = gameAssets().assets[id] ?? {};
  const bg = document.createElement("div");
  bg.className = "ap-modal-bg";
  bg.innerHTML = `
    <div class="ap-modal">
      <div class="ap-modal-body">
        <div><canvas class="ap-main"></canvas><div class="ap-thumbs"></div></div>
        <div class="ap-info">
          <h2></h2>
          <div class="ap-sub">${swatch(a.design)}${FACTIONS[a.design].name} · ${a.kind}${current.deleted ? ` · <b style="color:#ffb4a8">${t("Deleted")}</b>` : ""}</div>
          <ul>${a.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
          <label>${t("Sold by")}</label>
          <div class="ap-sel"></div>
          <div class="ap-note"></div>
        </div>
      </div>
      <div class="ap-foot">
        <button class="ap-btn danger ap-del" type="button">${current.deleted ? t("Restore") : t("Delete")}</button>
        <button class="ap-btn ap-close" type="button">${t("Close")}</button>
        <span class="grow"></span>
        <button class="ap-btn primary ap-apply" type="button">${t("Apply")}</button>
      </div>
    </div>`;
  bg.querySelector("h2")!.textContent = a.name;
  const select = factionSelect(current.faction ?? a.design);
  bg.querySelector(".ap-sel")!.append(select);
  if (a.kind === "building" && !FOREIGN_BUILDS.has(a.base)) {
    select.disabled = true;
    bg.querySelector(".ap-note")!.textContent = t("Only the power plant, barracks, war factory, airfield and high-tech center can be sold by another nation.");
  }
  document.body.append(bg);

  const main = bg.querySelector<HTMLCanvasElement>(".ap-main")!;
  const thumbs = bg.querySelector<HTMLElement>(".ap-thumbs")!;
  let view = 0;
  const draws = Array.from({ length: VIEWS }, (_, k) => a.picture(k));
  const thumbCanvases = draws.map((d, k) => {
    const c = document.createElement("canvas");
    if (d) c.addEventListener("click", () => (view = k));
    thumbs.append(c);
    return c;
  });
  let alive = true;
  const frame = (now: number): void => {
    if (!alive) return;
    const time = now / 1000;
    draws[view]?.(main, time);
    draws.forEach((d, k) => {
      d?.(thumbCanvases[k]!, time);
      thumbCanvases[k]!.classList.toggle("on", k === view);
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const close = (): void => {
    alive = false;
    bg.remove();
  };
  bg.addEventListener("click", (e) => e.target === bg && close());
  bg.querySelector(".ap-close")!.addEventListener("click", close);
  bg.querySelector(".ap-del")!.addEventListener("click", () =>
    void save((file) => {
      const o = { ...(file.assets[id] ?? {}) };
      if (o.deleted) delete o.deleted;
      else o.deleted = true;
      if (Object.keys(o).length) file.assets[id] = o;
      else delete file.assets[id];
    }),
  );
  bg.querySelector(".ap-apply")!.addEventListener("click", () =>
    void save((file) => {
      const o = { ...(file.assets[id] ?? {}) };
      const seller = select.value as FactionId;
      if (seller === a.design) delete o.faction;
      else o.faction = seller;
      if (Object.keys(o).length) file.assets[id] = o;
      else delete file.assets[id];
    }),
  );
}

function configTab(root: HTMLElement): void {
  root.innerHTML = `<div class="ap-tabs ap-sub-tabs"></div><div class="ap-grid"></div>`;
  const tabs = root.querySelector<HTMLElement>(".ap-sub-tabs")!;
  const grid = root.querySelector<HTMLElement>(".ap-grid")!;
  let stop = (): void => undefined;
  const open = (kind: AssetKind): void => {
    stop();
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.kind === kind));
    const file = gameAssets();
    const items = assetsOf(kind).map((a) => {
      const o = file.assets[assetId(a.kind, a.design, a.base)] ?? {};
      const card = document.createElement("div");
      card.className = `ap-card${o.deleted ? " deleted" : ""}`;
      const canvas = document.createElement("canvas");
      const label = document.createElement("div");
      label.innerHTML = `<b></b><small>${swatch(a.design)}${FACTIONS[a.design].shortName}${o.faction ? ` → ${FACTIONS[o.faction].shortName}` : ""}</small>`;
      label.querySelector("b")!.textContent = a.name;
      card.append(canvas, label);
      if (o.deleted) card.insertAdjacentHTML("beforeend", `<span class="ap-tag" style="background:#a5463b">${t("Deleted")}</span>`);
      else if (o.faction) card.insertAdjacentHTML("beforeend", `<span class="ap-tag" style="background:${FACTIONS[o.faction].colors.primary}">${t("Moved")}</span>`);
      card.addEventListener("click", () => openAssetModal(a));
      grid.append(card);
      return { canvas, draw: a.picture(0) };
    });
    let alive = true;
    stop = () => (alive = false);
    const frame = (now: number): void => {
      if (!alive || !grid.isConnected) return;
      for (const it of items) it.draw?.(it.canvas, now / 1000);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  for (const [kind, label] of [["infantry", t("Soldiers")], ["vehicle", t("Vehicles")], ["building", t("Structures")]] as const) {
    const b = document.createElement("button");
    b.className = "ap-tab";
    b.dataset.kind = kind;
    b.textContent = label;
    b.addEventListener("click", () => {
      grid.replaceChildren();
      open(kind);
    });
    tabs.append(b);
  }
  open("infantry");
}

/** Research Lab → Add: pick the nation whose shop gets the product and tick what must stand / exist before it can be bought. */
export function openResearchAdd(productId: string, productName: string): void {
  const bg = document.createElement("div");
  bg.className = "ap-modal-bg";
  bg.innerHTML = `
    <div class="ap-modal" style="width:min(560px,100%)">
      <div style="padding:18px" class="ap-info">
        <h2></h2>
        <div class="ap-sub">${t("Add to a nation's shop")}</div>
        <label>${t("Nation")}</label>
        <div class="ap-sel"></div>
        <div class="ap-reqs"></div>
        <div class="ap-note">${t("Saved to the game assets file only: the product does nothing in a game until it is programmed.")}</div>
      </div>
      <div class="ap-foot">
        <button class="ap-btn ap-close" type="button">${t("Close")}</button>
        <span class="grow"></span>
        <button class="ap-btn primary ap-apply" type="button">${t("Apply")}</button>
      </div>
    </div>`;
  bg.querySelector("h2")!.textContent = productName;
  const select = factionSelect(FACTION_ORDER[0]!);
  bg.querySelector(".ap-sel")!.append(select);
  const reqs = bg.querySelector<HTMLElement>(".ap-reqs")!;
  const fill = (): void => {
    const f = select.value as FactionId;
    const nation = FACTIONS[f];
    const groups: [string, AssetKind, string[], (b: string) => string][] = [
      [t("Structures"), "building", BUILD_OPTIONS.filter((o) => !o.foreign).map((o) => o.id), (b) => BUILD_OPTIONS.find((o) => o.id === b)?.name ?? b],
      [t("Vehicles"), "vehicle", (Object.keys(nation.vehicles) as VehicleKind[]).filter((v) => AVAILABLE_VEHICLES.includes(v)), (b) => nation.vehicles[b as VehicleKind]?.name ?? b],
      [t("Soldiers"), "infantry", Object.keys(nation.infantry), (b) => nation.infantry[b as UnitTier]?.name ?? b],
    ];
    reqs.replaceChildren(
      ...groups.map(([title, kind, bases, name]) => {
        const d = document.createElement("details");
        d.className = "ap-acc";
        d.innerHTML = `<summary>${title}</summary><div></div>`;
        const list = d.querySelector("div")!;
        for (const b of bases) {
          const l = document.createElement("label");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = assetId(kind, f, b);
          l.append(cb, ` ${name(b)}`);
          list.append(l);
        }
        return d;
      }),
    );
  };
  select.addEventListener("change", fill);
  fill();
  document.body.append(bg);
  bg.addEventListener("click", (e) => e.target === bg && bg.remove());
  bg.querySelector(".ap-close")!.addEventListener("click", () => bg.remove());
  bg.querySelector(".ap-apply")!.addEventListener("click", () => {
    const requires = [...reqs.querySelectorAll<HTMLInputElement>("input:checked")].map((c) => c.value);
    void save((file) => {
      file.research = file.research.filter((r) => !(r.product === productId && r.faction === select.value));
      file.research.push({ product: productId, faction: select.value as FactionId, requires, addedAt: new Date().toISOString() });
    });
  });
}

/** Demo menu → Assets game: Configuration (soldiers / vehicles / structures) and Research Lab tabs. */
export async function showAssetsPage(host: HTMLElement): Promise<void> {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
  const page = document.createElement("div");
  page.className = "ap-page";
  page.innerHTML = `
    <div class="ap-head"><h1>${t("Game assets")}</h1><button class="ap-btn ap-back" type="button">← ${t("Back")}</button></div>
    <div class="ap-tabs ap-main-tabs"></div>
    <div class="ap-body">${t("Loading pictures…")}</div>`;
  host.replaceChildren(page);
  page.querySelector(".ap-back")!.addEventListener("click", () => location.reload());
  await Promise.allSettled([loadPictureArts(), loadSoldierSprites(), loadTankSprites(), loadAircraftSprites(), loadRepairSprites(), loadTruckSprites(), loadMantisSprites()]);
  const body = page.querySelector<HTMLElement>(".ap-body")!;
  const tabs = page.querySelector<HTMLElement>(".ap-main-tabs")!;
  const show = (id: "config" | "lab"): void => {
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
    body.replaceChildren();
    if (id === "config") configTab(body);
    else void showResearchLab(body, openResearchAdd);
  };
  for (const [id, label] of [["config", t("Configuration")], ["lab", t("Research Lab")]] as const) {
    const b = document.createElement("button");
    b.className = "ap-tab";
    b.dataset.id = id;
    b.textContent = label;
    b.addEventListener("click", () => show(id));
    tabs.append(b);
  }
  show("config");
}
