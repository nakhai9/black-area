import { FACTIONS } from '../factions';
import { t } from '../i18n';
import { NetClient, type RoomView } from '../net/NetClient';
import type { FactionId } from '../types';
import { factionBadgeHtml } from './FactionBadge';
import { CARD_ORDER, factionCardHtml } from './FactionCard';

/** What the lobby hands to the game once the host starts the match. */
export interface MultiplayerStart {
  net: NetClient;
  faction: FactionId;
  seed: number;
  room: RoomView;
}

const NAME_KEY = 'black-area.mp-name';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Short message at the top of the screen for create / join success (green) or failure (red). */
function toast(text: string, ok: boolean): void {
  const el = document.createElement('div');
  el.className = `mp-toast ${ok ? 'ok' : 'fail'}`;
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2800);
  setTimeout(() => el.remove(), 3200);
}

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable: asked again next time */
  }
}

/**
 * Multiplayer lobby over the faction picker: create a room (name → 6-character code) or join one by its code,
 * pick a free nation, get ready; the host starts the match. Resolves with the start info, or null on "Back".
 */
export class MultiplayerLobby {
  private readonly root = document.createElement('div');
  private readonly net = new NetClient();
  private room: RoomView | null = null;
  private tab: 'create' | 'join' = 'create';
  /** Create / Join just sent: its answer (room or error) pops a success / failure toast. */
  private pending: 'create' | 'join' | null = null;

  constructor(private readonly host: HTMLElement) {
    this.root.className = 'fp-backdrop mp-backdrop';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
  }

  open(): Promise<MultiplayerStart | null> {
    this.host.append(this.root);
    return new Promise((resolve) => {
      const finish = (result: MultiplayerStart | null): void => {
        if (!result) this.net.close();
        this.root.remove();
        resolve(result);
      };
      this.root.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
        if (!el) return;
        const act = el.dataset.act;
        // Each tab has its own name field; the one of the open tab counts.
        const name = this.value(`[data-panel="${this.tab}"] .mp-name`);
        if (act === 'back') finish(null);
        else if (act === 'tab' && el.dataset.tab) this.showTab(el.dataset.tab as 'create' | 'join');
        else if (act === 'create') this.send('create', { t: 'create', room: this.value('.mp-room'), code: this.value('.mp-new-code').toUpperCase(), name: this.remember(name), slots: Number(this.value('.mp-slots')) });
        else if (act === 'join') {
          const room = this.value('.mp-join-room');
          const code = this.value('.mp-code').toUpperCase();
          if (!room || !code) {
            this.setError(t('Type the room name and room code.'));
            toast(`${t('Could not join the room')}: ${t('Type the room name and room code.')}`, false);
          }
          else this.send('join', { t: 'join', room, code, name: this.remember(name) });
        }
        else if (act === 'leave') this.net.send({ t: 'leave' });
        else if (act === 'ready') this.net.send({ t: 'ready', ready: !this.me()?.ready });
        else if (act === 'start') this.net.send({ t: 'start' });
        else if (act === 'faction' && el.dataset.faction) this.net.send({ t: 'faction', faction: el.dataset.faction as FactionId });
      });
      this.net.onMessage = (msg) => {
        if (msg.t === 'room') {
          if (msg.room && this.pending) {
            const vars = { name: msg.room.name, code: msg.room.code };
            toast(this.pending === 'create' ? t('Room "{name}" created — code {code}.', vars) : t('Joined room "{name}".', vars), true);
          }
          this.pending = null;
          this.room = msg.room;
          this.render();
        } else if (msg.t === 'error') {
          if (this.pending) toast(`${this.pending === 'create' ? t('Could not create the room') : t('Could not join the room')}: ${t(msg.message)}`, false);
          else if (!this.room && msg.message.startsWith('Room closed')) toast(t(msg.message), false);
          this.pending = null;
          this.setError(t(msg.message));
        }
        else if (msg.t === 'start') {
          const me = msg.room.players.find((p) => p.id === this.net.id);
          if (me) finish({ net: this.net, faction: me.faction, seed: msg.seed, room: msg.room });
        }
      };
      this.net.onClose = () => {
        this.room = null;
        this.render();
        this.setError(t('Disconnected from the multiplayer server'));
      };
      this.renderMessage(t('Connecting…'));
      this.net.connect().then(
        () => this.render(),
        (err: Error) => this.renderMessage(t(err.message), true),
      );
    });
  }

  /** Create room / Join room tabs: only the open tab's form (and its Create / Join button) shows. */
  private showTab(tab: 'create' | 'join'): void {
    this.tab = tab;
    for (const el of this.root.querySelectorAll<HTMLElement>('.mp-tab')) {
      const on = el.dataset.tab === tab;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', String(on));
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('.mp-panel')) el.hidden = el.dataset.panel !== tab;
    this.setError('');
  }

  private send(kind: 'create' | 'join', msg: Parameters<NetClient['send']>[0]): void {
    this.pending = kind;
    this.net.send(msg);
  }

  private me() {
    return this.room?.players.find((p) => p.id === this.net.id);
  }

  private value(sel: string): string {
    return this.root.querySelector<HTMLInputElement>(sel)?.value.trim() ?? '';
  }

  private remember(name: string): string {
    saveName(name);
    return name;
  }

  private setError(text: string): void {
    const el = this.root.querySelector<HTMLElement>('.mp-error');
    if (el) el.textContent = text;
  }

  private frame(body: string): string {
    return `
      <div class="fp-modal mp-modal">
        <header class="fp-header"><h1>${t('Play with your friends')}</h1></header>
        ${body}
        <p class="mp-error" role="alert"></p>
      </div>`;
  }

  private renderMessage(text: string, withBack = false): void {
    this.root.innerHTML = this.frame(`
      <p class="mp-note">${esc(text)}</p>
      ${withBack ? `<footer class="fp-footer"><button class="fp-load" type="button" data-act="back">${t('Back')}</button></footer>` : ''}`);
  }

  private render(): void {
    if (!this.room) {
      this.root.innerHTML = this.frame(`
        <div class="mp-tabs" role="tablist">
          <button type="button" role="tab" class="mp-tab" data-act="tab" data-tab="create">${t('Create room')}</button>
          <button type="button" role="tab" class="mp-tab" data-act="tab" data-tab="join">${t('Join room')}</button>
        </div>
        <div class="mp-panels">
          <section class="mp-panel" data-panel="create" role="tabpanel">
            <label class="mp-field">${t('Your name')}<input class="mp-name" maxlength="24" value="${esc(savedName())}" /></label>
            <label class="mp-field">${t('Room name')}<input class="mp-room" maxlength="24" /></label>
            <label class="mp-field">${t('Room code')}<input class="mp-new-code mp-code-input" maxlength="6" autocapitalize="characters" placeholder="${t('4–6 letters or digits (empty: random)')}" /></label>
            <label class="mp-field">${t('Players')}<select class="mp-slots">${[2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${t('{n} players', { n })}</option>`).join('')}</select></label>
            <button class="fp-deploy" type="button" data-act="create">${t('Create')}</button>
          </section>
          <section class="mp-panel" data-panel="join" role="tabpanel">
            <label class="mp-field">${t('Your name')}<input class="mp-name" maxlength="24" value="${esc(savedName())}" /></label>
            <label class="mp-field">${t('Room name')}<input class="mp-join-room" maxlength="24" /></label>
            <label class="mp-field">${t('Room code')}<input class="mp-code mp-code-input" maxlength="6" autocapitalize="characters" /></label>
            <button class="fp-deploy" type="button" data-act="join">${t('Join')}</button>
          </section>
        </div>
        <footer class="fp-footer"><button class="fp-load" type="button" data-act="back">${t('Back')}</button></footer>`);
      this.showTab(this.tab);
      return;
    }
    const room = this.room;
    const me = this.me();
    const isHost = room.hostId === this.net.id;
    const taken = new Map(room.players.map((p) => [p.faction, p]));
    const rows = room.players
      .map(
        (p) => `<li class="${p.id === this.net.id ? 'me' : ''}">
          ${factionBadgeHtml(p.faction, 'sm')}
          <span class="mp-player">${esc(p.name)}${p.id === room.hostId ? ` <small>(${t('host')})</small>` : ''}</span>
          <span class="mp-nation">${FACTIONS[p.faction].shortName}</span>
          <span class="mp-ready ${p.ready || p.id === room.hostId ? 'on' : ''}">${p.id === room.hostId ? '' : p.ready ? t('Ready') : t('Not ready')}</span>
        </li>`,
      )
      .join('');
    // Nation cards like the main menu's; a card taken by another player is locked and shows who has it.
    const nations = CARD_ORDER.map((f) => {
      const owner = taken.get(f);
      const mine = owner?.id === this.net.id;
      const tag = owner ? `<span class="mp-card-owner">${mine ? t('You') : esc(owner.name)}</span>` : '';
      return `<button type="button" class="fp-card ${mine ? 'selected' : ''} ${owner && !mine ? 'mp-taken' : ''}" role="radio" aria-checked="${mine}" data-act="faction" data-faction="${f}" ${owner && !mine ? 'disabled' : ''} style="--team:${FACTIONS[f].colors.primary}">${tag}${factionCardHtml(f)}</button>`;
    }).join('');
    const full = room.players.length >= room.maxPlayers;
    const allReady = full && room.players.every((p) => p.ready || p.id === room.hostId);
    this.root.innerHTML = this.frame(`
      <div class="mp-roomhead">
        <span>${esc(room.name)}</span>
        <span class="mp-codebox" title="${t('Give this code to your friends')}">${t('Code')}: <b>${room.code}</b></span>
        <span>${room.players.length}/${room.maxPlayers}</span>
      </div>
      <ul class="mp-players">${rows}${Array.from({ length: room.maxPlayers - room.players.length }, () => `<li class="mp-empty">${t('Waiting for a player…')}</li>`).join('')}</ul>
      ${full ? '' : `<p class="mp-note">${t('The room is not full yet: {n} more player(s) needed.', { n: room.maxPlayers - room.players.length })}</p>`}
      ${room.maxPlayers < 5 ? `<p class="mp-note">${t('Nations nobody picks stay on the map as occupiable capitals, like Japan or Korea.')}</p>` : ''}
      <div class="fp-grid mp-grid">${nations}</div>
      <footer class="fp-footer">
        <button class="fp-load" type="button" data-act="leave">${t('Leave room')}</button>
        ${
          isHost
            ? `<button class="fp-deploy" type="button" data-act="start" ${allReady ? '' : 'disabled'} title="${full ? '' : t('Room not full yet')}">${t('Start')}</button>`
            : `<button class="fp-deploy" type="button" data-act="ready">${me?.ready ? t('Not ready') : t('Ready')}</button>`
        }
      </footer>`);
  }
}
