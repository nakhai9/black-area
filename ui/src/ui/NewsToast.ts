import { TriangleAlert, createElement } from 'lucide';
import type { WorldPoint } from '../types';
import { t } from '../i18n';

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

/** At most this many alert toasts on screen; older ones leave first. */
const MAX_ALERT_TOASTS = 4;

/**
 * Alerts ("X is under attack!") as toasts in the top-right corner, styled like the news but with an alert icon in
 * place of the "BREAKING NEWS" tag. Clicking one looks at where it happened.
 */
export class AlertToast {
  private readonly stack: HTMLElement;

  constructor(
    private readonly onClick: (at: WorldPoint) => void,
    parent: HTMLElement = document.body,
  ) {
    this.stack = document.createElement('div');
    this.stack.className = 'news-stack alert-stack';
    this.stack.setAttribute('role', 'status');
    this.stack.setAttribute('aria-live', 'assertive');
    parent.append(this.stack);
  }

  show(detail: string, at: WorldPoint, seconds = 8): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'news alert-toast';
    el.title = t('Click to look at it');
    const tag = document.createElement('span');
    tag.className = 'news-tag';
    tag.append(createElement(TriangleAlert, { width: 18, height: 18, 'stroke-width': 2.4, 'aria-hidden': 'true' }));
    const text = document.createElement('span');
    text.className = 'news-text';
    text.textContent = detail;
    el.append(tag, text);
    el.addEventListener('click', () => this.onClick(at));
    this.stack.prepend(el);
    while (this.stack.children.length > MAX_ALERT_TOASTS) this.stack.lastElementChild?.remove();
    window.setTimeout(() => el.classList.add('leaving'), seconds * 1000);
    window.setTimeout(() => el.remove(), seconds * 1000 + 600);
  }
}
