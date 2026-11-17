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
      out.push(block.replace(/src="ui\/public\//g, `src="${import.meta.env.BASE_URL}`));
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
  const bg = document.createElement("div");
  bg.className = "story-bg";
  bg.innerHTML = `<div class="story" role="dialog" aria-modal="true"><button class="story-close" type="button" aria-label="${t("Close")}">✕</button>${render(storyMarkdown(getLang()))}</div>`;
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
  window.addEventListener("keydown", onKey);
  document.body.appendChild(bg);
}
