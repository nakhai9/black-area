// The story is the README at the repo root (bundled as text), so the menu always tells the same story as GitHub.
import README from "../../../README.md?raw";
import { getLang, t } from "../i18n";

/** The story part of the README for a language: from its language heading up to the project notes. */
function storyMarkdown(lang: string): string {
  const [from, to] = lang === "vi" ? ["## 🇻🇳 Tiếng Việt", "### Chạy dự án"] : ["## 🇬🇧 English", "### Running the project"];
  const a = README.indexOf(from);
  const b = README.indexOf(to, a);
  if (a < 0) return "";
  return README.slice(a + from.length, b < 0 ? undefined : b);
}

/** README image paths point into ui/public. */
const fixSrc = (html: string): string => html.replace(/src="ui\/public\//g, `src="${import.meta.env.BASE_URL}`);

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline Markdown: **bold**, *italic*. */
const inline = (s: string): string =>
  escape(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");

/** The small Markdown subset the README story uses: headings, paragraphs, lists, quotes, tables and raw HTML blocks. */
function render(md: string): string {
  const out: string[] = [];
  const blocks = md.trim().split(/\n\s*\n/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block || block === "---") continue;
    if (block.startsWith("<")) {
      // Raw HTML from the README (emblem row, centred title, closing line); image paths point into ui/public.
      out.push(fixSrc(block));
      continue;
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(block);
    if (h) {
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
      continue;
    }
    const lines = block.split("\n");
    if (lines.every((l) => l.startsWith("- "))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`);
    } else if (lines.every((l) => l.startsWith(">"))) {
      out.push(`<blockquote>${lines.map((l) => inline(l.replace(/^>\s?/, ""))).join("<br>")}</blockquote>`);
    } else if (lines.every((l) => l.startsWith("|"))) {
      const cells = (l: string): string[] => l.slice(1, -1).split("|").map((c) => c.trim());
      const [head, , ...rows] = lines;
      out.push(
        `<table><thead><tr>${cells(head!).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
    } else out.push(`<p>${lines.map(inline).join(" ")}</p>`);
  }
  return out.join("\n");
}

const STYLE = `
  .story-bg { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, 0.72); }
  .story { position: relative; width: min(820px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 28px 36px 36px;
    background: #12181e; border: 1px solid #3a4651; border-radius: 10px; color: #d8dde2; font: 15px/1.65 inherit; font-family: inherit; }
  .story h2 { margin: 4px 0 16px; font-size: 26px; letter-spacing: 2px; text-transform: uppercase; color: #fff; }
  .story h4 { margin: 26px 0 8px; font-size: 16px; letter-spacing: 1.5px; text-transform: uppercase; color: #e8b84a; }
  .story p, .story ul, .story blockquote, .story table { margin: 0 0 12px; }
  .story ul { padding-left: 20px; }
  .story li { margin-bottom: 6px; }
  .story strong { color: #fff; }
  .story blockquote { padding: 8px 14px; border-left: 3px solid #e8b84a; background: rgba(255, 255, 255, 0.04); }
  .story table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .story th, .story td { padding: 6px 8px; border-bottom: 1px solid #2c3640; text-align: left; vertical-align: top; }
  .story th { color: #9aa6b1; font-weight: 600; }
  .story img { margin: 0 6px; }
  .story-close { position: sticky; top: 0; float: right; margin: -12px -20px 0 0; width: 34px; height: 34px; border-radius: 50%;
    border: 1px solid #5a646d; background: #1c242c; color: #d8dde2; font-size: 18px; line-height: 1; cursor: pointer; }
  .story-close:hover { background: #26303a; }
  .story-play { display: flex; align-items: center; gap: 10px; margin: 0 auto 20px; padding: 10px 22px 10px 14px; border-radius: 24px;
    border: 1px solid #e8b84a; background: rgba(232, 184, 74, 0.1); color: #e8b84a; font: inherit; font-weight: 600; letter-spacing: 1px;
    text-transform: uppercase; cursor: pointer; }
  .story-play::before { content: "▶"; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #e8b84a; color: #12181e; font-size: 12px; }
  .story-play:hover { background: rgba(232, 184, 74, 0.2); }
  .story { min-height: 220px; }
  .story:has(.story-intro:not(.done)) { overflow: hidden; }
  .story-intro { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 24px; background: #0b0f13;
    border-radius: 10px; text-align: center; cursor: pointer; transition: opacity .6s; }
  .story-intro.done { opacity: 0; pointer-events: none; }
  .story-intro p { margin: 0; color: #fff; font-size: clamp(20px, 3.6vw, 32px); font-weight: 600; letter-spacing: .5px; transition: opacity .5s; }
  .story-intro .si-slide { transition: opacity .5s; }
  .story-intro .si-slide.fade { opacity: 0; }
  .story-intro .si-emb { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
  .story-intro .si-emb:empty { display: none; }
  .story-intro .si-emb img { height: clamp(44px, 9vw, 76px); opacity: 0; animation: si-pop .6s ease-out forwards; }
  @keyframes si-pop { from { opacity: 0; transform: translateY(8px) scale(.9); } to { opacity: 1; transform: none; } }
  .story-intro p::after { content: "▌"; margin-left: 2px; animation: story-caret 1s steps(1) infinite; }
  .story-intro small { position: absolute; right: 16px; bottom: 12px; color: #6b7782; font-size: 12px; }
  @keyframes story-caret { 50% { opacity: 0; } }
  @media (max-width: 600px) { .story { padding: 20px 18px 28px; } .story table { font-size: 12px; } }
`;

/** Opens the story (README, in the current language) in a modal over the main menu. Esc, ✕ or a click outside closes it. */
export function openStory(): void {
  if (!document.getElementById("story-style")) {
    const st = document.createElement("style");
    st.id = "story-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }
  const md = storyMarkdown(getLang());
  const bg = document.createElement("div");
  bg.className = "story-bg";
  bg.innerHTML = `<div class="story" role="dialog" aria-modal="true"><button class="story-close" type="button" aria-label="${t("Close")}">✕</button><div class="story-intro"><div class="si-slide"><p></p><div class="si-emb"></div></div><small>${t("Click to skip")}</small></div><button class="story-play" type="button">${t("Play trailer")}</button>${render(md)}</div>`;
  const close = (): void => {
    bg.remove();
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  bg.addEventListener("click", (e) => {
    if (e.target === bg) close();
  });
  bg.querySelector(".story-close")!.addEventListener("click", close);
  const intro = bg.querySelector<HTMLElement>(".story-intro")!;
  const box = bg.querySelector<HTMLElement>(".story")!;
  bg.querySelector(".story-play")!.addEventListener("click", () => playIntro(intro, box));
  intro.addEventListener("click", () => stopIntro(intro));
  window.addEventListener("keydown", onKey);
  document.body.appendChild(bg);
  playIntro(intro, box);
}

/** Short trailer over the modal: white lines typed one by one (~5 s each), last slide shows the five factions, then the story. */
const INTRO_LINES = [
  "The oil runs dry",
  "The UN can no longer hold the world together",
  "Five powers break away",
  "Oil means money, energy, power",
  "Only one will stand last",
];
const FINAL_LINE = "A new world order is born";
const EMBLEMS = ["usa", "russia", "china", "europe", "islamic"];
const TYPE_MS = 40;
const HOLD_MS = 5000;
const FINAL_MS = 6500;
const timers = new WeakMap<HTMLElement, number[]>();

function stopIntro(intro: HTMLElement): void {
  for (const id of timers.get(intro) ?? []) clearTimeout(id);
  timers.set(intro, []);
  intro.classList.add("done");
}

function playIntro(intro: HTMLElement, box: HTMLElement): void {
  stopIntro(intro);
  box.scrollTop = 0;
  intro.classList.remove("done");
  const slide = intro.querySelector<HTMLElement>(".si-slide")!;
  const p = slide.querySelector("p")!;
  const emb = slide.querySelector<HTMLElement>(".si-emb")!;
  const ids: number[] = [];
  const at = (ms: number, fn: () => void): void => void ids.push(window.setTimeout(fn, ms));
  const lines = [...INTRO_LINES, FINAL_LINE];
  let time = 0;
  lines.forEach((raw, n) => {
    const line = t(raw);
    const last = n === lines.length - 1;
    at(time, () => {
      p.textContent = "";
      emb.innerHTML = "";
      slide.classList.remove("fade");
    });
    for (let i = 1; i <= line.length; i++) at(time + i * TYPE_MS, () => (p.textContent = line.slice(0, i)));
    if (last)
      at(time + line.length * TYPE_MS + 200, () => {
        emb.innerHTML = EMBLEMS.map(
          (e, k) => `<img src="${import.meta.env.BASE_URL}emblems/${e}.png" alt="" style="animation-delay:${k * 0.15}s">`,
        ).join("");
      });
    time += last ? FINAL_MS : HOLD_MS;
    at(time - 500, () => slide.classList.add("fade"));
  });
  at(time, () => intro.classList.add("done"));
  timers.set(intro, ids);
}
