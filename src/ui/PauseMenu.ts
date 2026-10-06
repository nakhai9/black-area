/** Esc pause modal: "Continue" resumes the game, "Quit game" goes back to the faction picker. */
export class PauseMenu {
  private readonly root: HTMLDivElement;

  constructor(onContinue: () => void, parent: HTMLElement = document.body) {
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
    card.append(title, text, actions);
    this.root.append(card);
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
  }
}
