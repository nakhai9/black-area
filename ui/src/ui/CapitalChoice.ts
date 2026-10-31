import type { CapitalChoice } from '../entities/Unit';
import { t } from '../i18n';

/** Icon in front of each choice: economic embargo (Material Design Icons), military embargo (Game Icons), capture (SmartIcons Glyph). */
const CHOICE_ICONS: Record<CapitalChoice, string> = {
  embargo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 11h2v2h-2zm-4-8h7a2 2 0 0 1 2 2v14h1v2H2v-2h8V5a2 2 0 0 1 2-2m0 2v14h7V5M6.2 5H2.8v-.5a1.7 1.7 0 0 1 3.4 0M7 5v-.5a2.5 2.5 0 0 0-5 0V5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1"/></svg>',
  disarm: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M66.54 18.002a18.07 18.07 0 0 0-12.37 4.541c-7.508 6.632-8.218 18.094-1.586 25.602c4.394 4.974 10.906 6.945 16.986 5.792l57.838 65.475l-50.373 44.498l24.188 27.38c9.69-21.368 22.255-39.484 37.427-54.65l6.91 36.188c25.092-6.290 49.834-10.563 74.366-12.873l-23.912-27.07l-38.66-12.483c17.117-12.9 36.734-22.97 58.62-30.474l-24.19-27.385l-50.37 44.496l-57.92-65.57c1.79-5.835.617-12.43-3.72-17.34a18.1 18.1 0 0 0-13.235-6.128zm384.397 0a18.1 18.1 0 0 0-13.232 6.127c-4.338 4.91-5.514 11.506-3.723 17.343l-57.920 65.568l-50.37-44.497l-24.188 27.385c21.884 7.504 41.5 17.573 58.62 30.472l-38.66 12.485l-23.255 26.324c24.71 1.863 49.367 5.706 74.118 11.46l6.498-34.03c15.173 15.166 27.74 33.282 37.43 54.65l24.185-27.38l-50.372-44.498l57.838-65.475c6.08 1.153 12.593-.818 16.987-5.792c6.63-7.508 5.92-18.97-1.586-25.602a18.07 18.07 0 0 0-12.37-4.541zm-186.425 158.51c-39.56-.098-79.467 5.226-120.633 16.095c-2.046 90.448 34.484 209.35 118.47 259.905c81.295-49.13 122.402-169.902 120.552-259.914c-39.75-10.496-78.910-15.988-118.390-16.086zm-117.176 153.5L60.47 428.35l-12.2 63.894l61.9-19.994l68.49-77.535c-12.86-20.108-23.246-42.03-31.324-64.703m228.203 6.11c-8.69 22.238-19.577 43.634-32.706 63.142l64.473 72.986l61.898 19.994l-12.2-63.894l-81.466-92.23z"/></svg>',
  capture: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.863 2.581a7.44 7.44 0 0 0-1.820 4.363h.971a6.45 6.45 0 0 1 1.551-3.662zm1.403 1.401a5.47 5.47 0 0 0-1.26 2.962l4.221-.001zM6.969.042a7.44 7.44 0 0 0-4.363 1.8l.703.703a6.5 6.5 0 0 1 3.66-1.502zm0 1.989a5.5 5.5 0 0 0-2.958 1.216l2.958 2.958zM2.002 8.032a5.4 5.4 0 0 0 1.227 2.971l2.998-2.970zm-1.961 0a7.32 7.32 0 0 0 1.8 4.346l.687-.68a6.35 6.35 0 0 1-1.519-3.666zm3.926 3.7a5.5 5.5 0 0 0 3.002 1.252V8.731zM2.58 13.119a7.43 7.43 0 0 0 4.389 1.823v-.97a6.5 6.5 0 0 1-3.701-1.540zm10.563-.74a7.33 7.33 0 0 0 1.801-4.346h-.952a6.36 6.36 0 0 1-1.526 3.674zM8.756 8.033l3.009 2.98a5.4 5.4 0 0 0 1.234-2.980zm4.238-1.09a5.47 5.47 0 0 0-1.266-2.970l-2.971 2.970zm1.947 0a7.43 7.43 0 0 0-1.820-4.362l-.693.693a6.43 6.43 0 0 1 1.559 3.669zm-6.925 7.999a7.44 7.44 0 0 0 4.387-1.821l-.68-.68a6.5 6.5 0 0 1-3.707 1.532zm0-1.956a5.5 5.5 0 0 0 3.008-1.244l-3.008-3.010z"/></svg>',
};

/**
 * Shown when one of my engineers reaches an enemy nation's own capital: put that nation under an economic embargo,
 * a military embargo,
 * or take the capital over. The engineer is used up whichever is picked. `isOpen` closes it on its own
 * once the engineer is gone (killed, or the capital fell meanwhile).
 */
export function askCapitalChoice(
  info: { capital: string; nation: string; embargoMinutes: number; disarmMinutes: number },
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
  actions.className = 'pause-actions capital-choice-actions';
  const close = (): void => {
    window.clearInterval(watch);
    root.remove();
  };
  const button = (c: CapitalChoice, label: string, tip: string): void => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `lc-start capital-choice capital-choice-${c}`;
    b.innerHTML = CHOICE_ICONS[c];
    const span = document.createElement('span');
    span.textContent = label;
    b.append(span);
    b.title = tip;
    b.addEventListener('click', () => {
      close();
      pick(c);
    });
    actions.append(b);
  };
  button('embargo', t('1. Embargo'), t('Their economy is wiped out: treasury and oil stock drop to 0, and they can neither earn nor spend for {minutes} minutes.', { minutes: info.embargoMinutes }));
  button('disarm', t('2. Military embargo'), t('They lose every Barracks, War Factory and Airfield and cannot attack or rebuild them for {minutes} minutes; then they may re-arm from scratch.', { minutes: info.disarmMinutes }));
  button('capture', t('3. Capture'), t('Take the capital: you unlock all of their structures, soldiers, vehicles and aircraft.'));
  card.append(title, text, actions);
  root.append(card);
  parent.append(root);
  const watch = window.setInterval(() => {
    if (!isOpen()) close();
  }, 250);
}
