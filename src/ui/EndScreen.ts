/** Full-screen "GAME OVER" / "VICTORY" panel with a button that starts a new game. */
export class EndScreen {
  private shown = false;

  show(victory: boolean, message: string, parent: HTMLElement = document.body): void {
    if (this.shown) return;
    this.shown = true;
    const root = document.createElement('div');
    root.className = 'end-screen';
    root.setAttribute('role', 'alertdialog');
    const card = document.createElement('div');
    card.className = 'end-card';
    card.style.setProperty('--end-color', victory ? '#5cff6a' : '#ff3b30');
    const title = document.createElement('h1');
    title.textContent = victory ? 'VICTORY' : 'GAME OVER';
    const text = document.createElement('p');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'New game';
    button.addEventListener('click', () => window.location.reload());
    card.append(title, text, button);
    root.append(card);
    parent.append(root);
  }
}
