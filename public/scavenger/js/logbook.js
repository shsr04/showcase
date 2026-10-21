// Note: overlay that lists the logs collected on the current station, newest first.

const EMPTY = 'Nothing yet. Drift close to notes, plaques, screens and signs to collect their logs.';

export class Logbook {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.root = $('logbook');
    this.list = $('logbookList');
    this.meta = $('logbookMeta');
    this.open = false;
    $('btnLogsClose').addEventListener('click', () => this.hide());
  }

  // Note: entries come from storage, so they are written as plain text only.
  show(seed, entries) {
    this.meta.textContent = `${seed} // ${entries.length} ${entries.length === 1 ? 'ENTRY' : 'ENTRIES'}`;
    this.list.textContent = '';
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'is-empty';
      li.textContent = EMPTY;
      this.list.appendChild(li);
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const li = document.createElement('li');
      const title = document.createElement('b');
      title.textContent = e.title;
      const body = document.createElement('span');
      body.textContent = e.text;
      li.append(title, body);
      this.list.appendChild(li);
    }
    this.list.scrollTop = 0;
    this.root.classList.remove('is-hidden');
    this.open = true;
  }

  hide() {
    this.root.classList.add('is-hidden');
    this.open = false;
  }
}
