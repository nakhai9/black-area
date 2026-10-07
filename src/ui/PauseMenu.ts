/** Background-music volume control wired into the pause menu. */
export interface MusicVolumeControl {
  get: () => number;
  set: (volume: number) => void;
}

/** Esc pause modal: music volume slider, "Continue" resumes the game, "Quit game" goes back to the faction picker. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  /** Re-reads the music volume into the slider (the sound system may not exist yet at construction). */
  private readonly syncVolume: () => void;

  constructor(onContinue: () => void, music: MusicVolumeControl, parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'end-screen pause-screen';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;
    const card = document.createElement('div');
    card.className = 'end-card';
    card.style.setProperty('--end-color', '#f5c542');
    const title = document.createElement('h1');
    title.textContent = 'PAUSED';
    const text = document.createElement('p');
    text.textContent = 'The game is paused. Press Esc or Continue to resume.';
    const volume = document.createElement('label');
    volume.className = 'pause-volume';
    const volumeText = document.createElement('span');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    const showVolume = (): void => {
      volumeText.textContent = `Music volume: ${slider.value}%`;
    };
    this.syncVolume = (): void => {
      slider.value = String(Math.round(music.get() * 100));
      showVolume();
    };
    slider.addEventListener('input', () => {
      music.set(Number(slider.value) / 100);
      showVolume();
    });
    volume.append(volumeText, slider);
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = 'Continue';
    resume.addEventListener('click', onContinue);
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.textContent = 'Quit game';
    // Reload without query params (e.g. ?faction=…) so the faction picker opens again.
    quit.addEventListener('click', () => window.location.assign(window.location.pathname));
    const actions = document.createElement('div');
    actions.className = 'pause-actions';
    actions.append(resume, quit);
    card.append(title, text, volume, actions);
    this.root.append(card);
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    if (open) this.syncVolume();
    this.root.hidden = !open;
  }
}
