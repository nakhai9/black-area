/**
 * "BREAKING NEWS" toasts in the top-left corner of the screen (e.g. a nation has been defeated).
 * Several can be on screen at once; each fades out by itself.
 */
export class NewsToast {
  private readonly stack: HTMLElement;

  constructor(parent: HTMLElement = document.body) {
    this.stack = document.createElement('div');
    this.stack.className = 'news-stack';
    this.stack.setAttribute('role', 'status');
    this.stack.setAttribute('aria-live', 'assertive');
    parent.append(this.stack);
  }

  show(headline: string, detail: string, seconds = 9): void {
    const el = document.createElement('div');
    el.className = 'news';
    const tag = document.createElement('span');
    tag.className = 'news-tag';
    tag.textContent = headline;
    const text = document.createElement('span');
    text.className = 'news-text';
    text.textContent = detail;
    el.append(tag, text);
    this.stack.append(el);
    window.setTimeout(() => el.classList.add('leaving'), seconds * 1000);
    window.setTimeout(() => el.remove(), seconds * 1000 + 600);
  }
}
