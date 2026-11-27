import { modalCloseButton } from './ModalClose';
import { t } from '../i18n';
import { cleanMatchCode } from '../net/CloudSave';

/**
 * Continue on a browser with no match code yet: asks for the match code of the cloud save to continue (shown on the
 * browser that saved it). Resolves with the cleaned code, or null when cancelled (X, Cancel, Esc).
 */
export function askMatchCode(parent: HTMLElement = document.body): Promise<string | null> {
  const root = document.createElement('div');
  root.className = 'end-screen pause-screen';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const card = document.createElement('form');
  card.className = 'end-card mc-card';
  card.style.setProperty('--end-color', '#f5c542'); // same as the pause menu
  const title = document.createElement('h2');
  title.className = 'mc-title';
  title.textContent = t('Continue');
  const label = document.createElement('label');
  label.className = 'mc-label';
  label.htmlFor = 'mc-input';
  label.textContent = t('Match code');
  const input = document.createElement('input');
  input.id = 'mc-input';
  input.className = 'mc-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 64;
  const hint = document.createElement('p');
  hint.className = 'mc-hint';
  hint.textContent = t('Find it on the main menu of the browser you saved on.');
  const error = document.createElement('p');
  error.className = 'mc-error';
  error.hidden = true;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = t('Cancel');
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.className = 'lc-start';
  ok.textContent = t('Continue');
  const actions = document.createElement('div');
  actions.className = 'pause-actions';
  actions.append(cancel, ok);
  card.append(modalCloseButton(() => cancel.click()), title, label, input, hint, error, actions);
  root.append(card);
  parent.append(root);
  input.focus();
  return new Promise((resolve) => {
    const done = (code: string | null): void => {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(code);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(null);
    };
    window.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => done(null));
    card.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = cleanMatchCode(input.value);
      if (!code) {
        error.textContent = t('That match code is not valid.');
        error.hidden = false;
        input.focus();
        return;
      }
      done(code);
    });
  });
}
