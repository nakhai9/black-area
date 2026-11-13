import { createElement, X } from 'lucide';
import { t } from '../i18n';

/** The X in the top-right corner of every modal (same look everywhere: `.modal-close`). */
export function modalCloseButton(onClick: () => void): HTMLButtonElement {
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'modal-close';
  x.title = t('Close');
  x.setAttribute('aria-label', t('Close'));
  x.append(createElement(X, { width: 18, height: 18, 'stroke-width': 2.5, 'aria-hidden': 'true' }));
  x.addEventListener('click', onClick);
  return x;
}
