import { t } from "../i18n";

/**
 * Research Lab (demo menu): previews generated products — soldiers, structures, vehicles — before they are added to
 * the game, laid out like a store's product page: one large view on top, six thumbnails under it (click one to show
 * it large), the product's name and notes beside them. Everything lives in public/research-lab/: one folder per
 * product (research-lab/<id>/ with its pictures) and products.json, the one file to edit to add, hide (enabled:
 * false) or remove a product — see research-lab/README.md. With nothing generated yet (no file, an empty list, or
 * fewer than six pictures) the empty views stay white.
 */
const LAB = "research-lab";

interface LabProduct {
  id: string;
  name: string;
  enabled?: boolean;
  kind?: string;
  notes?: string;
  images: string[];
}

const THUMBS = 6;

async function loadProducts(): Promise<LabProduct[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${LAB}/products.json`, { cache: "no-store" });
    if (!res.ok) return [];
    const list = ((await res.json()) as { products?: unknown }).products;
    return Array.isArray(list)
      ? (list as LabProduct[]).filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.images) && p.enabled !== false)
      : [];
  } catch {
    return [];
  }
}

export async function showResearchLab(host: HTMLElement): Promise<void> {
  const style = document.createElement("style");
  style.textContent = `
    html, body { height: auto; overflow: auto; }
    .rl-page { max-width: 1200px; margin: 0 auto; padding: 24px 16px 48px; color: #d8dee4; font: 14px system-ui, sans-serif; }
    .rl-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .rl-top h1 { margin: 0; font-size: 22px; letter-spacing: 1px; flex: 1; }
    .rl-top button, .rl-top select { padding: 6px 14px; border: 1px solid #56626d; border-radius: 6px; background: #1d2731; color: #d8dee4; font: inherit; cursor: pointer; }
    .rl-body { display: grid; grid-template-columns: minmax(0, 3fr) minmax(220px, 2fr); gap: 24px; }
    @media (max-width: 760px) { .rl-body { grid-template-columns: 1fr; } }
    .rl-main { aspect-ratio: 4 / 3; background: #fff; border-radius: 8px; display: grid; place-items: center; overflow: hidden; }
    .rl-main img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .rl-thumbs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 8px; }
    .rl-thumb { aspect-ratio: 1; background: #fff; border: 2px solid transparent; border-radius: 6px; padding: 0; overflow: hidden; display: grid; place-items: center; cursor: pointer; }
    .rl-thumb.on { border-color: #e8a33d; }
    .rl-thumb:disabled { cursor: default; }
    .rl-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .rl-info h2 { margin: 0 0 6px; font-size: 20px; }
    .rl-info .rl-kind { color: #9aa4ad; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; margin-bottom: 12px; }
    .rl-info p { white-space: pre-wrap; line-height: 1.5; margin: 0; }
  `;
  document.head.append(style);
  const page = document.createElement("div");
  page.className = "rl-page";
  page.innerHTML = `
    <div class="rl-top">
      <h1>${t("Research Lab")}</h1>
      <select class="rl-pick" hidden></select>
      <button class="rl-back" type="button">← ${t("Back")}</button>
    </div>
    <div class="rl-body">
      <div>
        <div class="rl-main"></div>
        <div class="rl-thumbs"></div>
      </div>
      <div class="rl-info"><h2></h2><div class="rl-kind"></div><p></p></div>
    </div>`;
  host.replaceChildren(page);
  page.querySelector(".rl-back")?.addEventListener("click", () => location.reload());

  const main = page.querySelector<HTMLElement>(".rl-main")!;
  const thumbs = page.querySelector<HTMLElement>(".rl-thumbs")!;
  const pick = page.querySelector<HTMLSelectElement>(".rl-pick")!;
  const info = page.querySelector<HTMLElement>(".rl-info")!;
  let folder = "";
  const img = (file: string): HTMLImageElement => {
    const i = new Image();
    i.src = `${import.meta.env.BASE_URL}${LAB}/${folder}/${file}`;
    i.alt = "";
    return i;
  };

  const show = (p: LabProduct | undefined): void => {
    const images = p?.images ?? [];
    folder = p?.id ?? "";
    info.querySelector("h2")!.textContent = p?.name ?? "";
    info.querySelector(".rl-kind")!.textContent = p?.kind ?? "";
    info.querySelector("p")!.textContent = p?.notes ?? "";
    const select = (k: number): void => {
      main.replaceChildren(...(images[k] ? [img(images[k])] : []));
      thumbs.querySelectorAll(".rl-thumb").forEach((b, i) => b.classList.toggle("on", i === k && !!images[k]));
    };
    thumbs.replaceChildren(
      ...Array.from({ length: THUMBS }, (_, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rl-thumb";
        if (images[k]) {
          b.append(img(images[k]));
          b.addEventListener("click", () => select(k));
          b.addEventListener("mouseenter", () => select(k));
        } else b.disabled = true;
        return b;
      }),
    );
    select(0);
  };

  const products = await loadProducts();
  if (products.length > 1) {
    pick.hidden = false;
    pick.replaceChildren(...products.map((p, i) => new Option(p.name, String(i))));
    pick.addEventListener("change", () => show(products[Number(pick.value)]));
  }
  show(products[0]);
}
