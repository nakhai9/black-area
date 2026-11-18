import { finishGameAndReturnToMenu } from '../net/CloudSave';
import { modalCloseButton } from './ModalClose';
import { t } from '../i18n';
import { FACTIONS } from '../factions';
import { factionBadge } from './FactionBadge';
import type { FactionId } from '../types';

/**
 * End of the war, written as a diplomatic letter from the Global Monitoring Center to the player's head of state:
 * congratulations on victory, or a formal note of defeat. Letterhead: the nation's emblem with its small flag; signed Black Area.
 * Test it with VITE_TEST_END_MODAL=victory | defeat in .env.local (shown as soon as the game starts).
 */
export class EndScreen {
  private shown = false;

  /** `newGame`: offer the New game button (solo games only; a multiplayer match shows the letter alone). */
  show(victory: boolean, message: string, faction?: FactionId, parent: HTMLElement = document.body, newGame = true, leaderName?: string): void {
    if (this.shown) return;
    this.shown = true;
    const root = document.createElement('div');
    root.className = 'end-screen';
    root.setAttribute('role', 'alertdialog');
    const card = document.createElement('div');
    card.className = victory ? 'end-card end-letter' : 'end-card end-letter end-defeat';
    card.style.setProperty('--end-color', victory ? '#ffd23a' : '#ff3b30');

    const f = faction ? FACTIONS[faction] : undefined;
    const head = document.createElement('div');
    head.className = 'letter-head';
    // The nation's emblem with its small flag over the lower right corner, as on the main menu cards.
    if (faction) head.append(factionBadge(faction, 'md'));
    const title = document.createElement('h1');
    title.textContent = victory ? t('VICTORY') : t('GAME OVER');
    const kind = document.createElement('div');
    kind.className = 'letter-kind';
    kind.textContent = victory ? t('Letter of congratulations') : t('Diplomatic note');

    const body = document.createElement('div');
    body.className = 'letter-body';
    const date = document.createElement('p');
    date.className = 'letter-date';
    date.textContent = new Date().toLocaleDateString();
    const salute = document.createElement('p');
    salute.className = 'letter-salute';
    salute.textContent = f
      ? t('Dear {title} {name},', { title: t(f.leader.title), name: leaderName && leaderName !== 'Commander' ? leaderName : f.leader.name })
      : t('Dear Sir or Madam,');
    const p1 = document.createElement('p');
    p1.textContent = f
      ? victory
        ? t('On behalf of the international community, we extend our warmest congratulations to you and to the people of {nation}. Under your leadership, {nation} has prevailed in this war.', { nation: t(f.name) })
        : t('We regret to inform you that {nation}, the nation under your leadership, has lost this war.', { nation: t(f.name) })
      : '';
    const p2 = document.createElement('p');
    p2.textContent = message;
    const p3 = document.createElement('p');
    p3.textContent = victory
      ? t('May peace and prosperity be with your nation. Please accept, Your Excellency, the assurances of our highest consideration.')
      : t('We hope that peace will soon return to your people. Please accept, Your Excellency, the assurances of our highest consideration.');
    const sign = document.createElement('p');
    sign.className = 'letter-sign';
    sign.textContent = 'Black Area';
    body.append(date, salute, ...(p1.textContent ? [p1] : []), p2, p3, sign);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('New game');
    // The war is over: closing the letter (X or New game) deletes the cloud save and the player id, then goes back to
    // the main menu (nothing left to Continue). Multiplayer (no New game): X only hides the panel, as before.
    const finish = (): void => void finishGameAndReturnToMenu();
    button.addEventListener('click', finish);
    card.append(modalCloseButton(newGame ? finish : () => root.remove()), head, title, kind, body, ...(newGame ? [button] : []));
    root.append(card);
    parent.append(root);
  }
}
