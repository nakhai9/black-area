import type { CapitalChoice } from '../entities/Unit';
import { t } from '../i18n';

/**
 * Shown when one of my engineers reaches an enemy nation's own capital: put that nation under an economic embargo,
 * or take the capital over. The engineer is used up whichever is picked. `isOpen` closes it on its own
 * once the engineer is gone (killed, or the capital fell meanwhile).
 */
export function askCapitalChoice(
  info: { capital: string; nation: string; embargoMinutes: number },
  pick: (c: CapitalChoice) => void,
  isOpen: () => boolean,
  parent: HTMLElement = document.body,
): void {
  const root = document.createElement('div');
  root.className = 'end-screen pause-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const card = document.createElement('div');
  card.className = 'end-card';
  card.style.setProperty('--end-color', '#ffd23f');
  const title = document.createElement('h2');
  title.textContent = t('Engineer in {capital}', { capital: info.capital });
  const text = document.createElement('p');
  text.textContent = t('Your engineer is inside the capital of {nation}. What should he do?', { nation: info.nation });
  const actions = document.createElement('div');
  actions.className = 'pause-actions';
  const close = (): void => {
    window.clearInterval(watch);
    root.remove();
  };
  const button = (c: CapitalChoice, label: string, tip: string): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lc-start';
    b.textContent = label;
    b.title = tip;
    b.addEventListener('click', () => {
      close();
      pick(c);
    });
    actions.append(b);
  };
  button('embargo', t('1. Embargo'), t('Their economy is wiped out: treasury and oil stock drop to 0, and they can neither earn nor spend for {minutes} minutes.', { minutes: info.embargoMinutes }));
  button('capture', t('2. Capture'), t('Take the capital: you unlock all of their structures, soldiers, vehicles and aircraft.'));
  card.append(title, text, actions);
  root.append(card);
  parent.append(root);
  const watch = window.setInterval(() => {
    if (!isOpen()) close();
  }, 250);
}
