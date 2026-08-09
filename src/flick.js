// Flick input: press a key and drag towards one of four directions to reach the
// legends that would otherwise need SHIFT or ALPHA. A radial preview appears
// under the finger, in the style of a Japanese flick keyboard.

const THRESHOLD = 22;      // px of travel before a direction is committed
const REPEAT_DELAY = 420;  // ms before auto-repeat starts
const REPEAT_RATE = 55;    // ms between repeats

export class FlickController {
  /**
   * @param {HTMLElement} root container holding the key elements
   * @param {(key, direction) => void} onFire
   * @param {(key) => object} getKeyData maps a DOM element's id to key data
   */
  constructor(root, onFire, getKeyData) {
    this.root = root;
    this.onFire = onFire;
    this.getKeyData = getKeyData;
    this.active = null;
    this.popup = null;
    this.repeatTimer = null;

    root.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    // Long-press context menus and double-tap zoom get in the way of flicking.
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDown = (e) => {
    const btn = e.target.closest('.key');
    if (!btn || btn.classList.contains('disabled')) return;
    e.preventDefault();

    const data = this.getKeyData(btn.dataset.keyId);
    if (!data) return;

    this.active = {
      el: btn, data, id: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      dir: 'center', moved: false,
    };
    btn.classList.add('pressed');
    haptic(8);

    if (hasFlickTargets(data)) this.showPopup(btn, data);
    this.startRepeat(data);
  };

  onMove = (e) => {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    e.preventDefault();

    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    const dist = Math.hypot(dx, dy);
    let dir = 'center';
    if (dist >= THRESHOLD) {
      const ang = Math.atan2(dy, dx);
      const deg = (ang * 180) / Math.PI;
      if (deg >= -45 && deg < 45) dir = 'right';
      else if (deg >= 45 && deg < 135) dir = 'down';
      else if (deg >= -135 && deg < -45) dir = 'up';
      else dir = 'left';
      // Fall back to the centre action when the direction is unassigned.
      if (!a.data[dir]) dir = 'center';
    }
    if (dir !== a.dir) {
      a.dir = dir;
      a.moved = dir !== 'center';
      this.updatePopup(dir);
      if (dir !== 'center') this.stopRepeat();
      haptic(4);
    }
  };

  onUp = (e) => {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.finish(a.dir);
  };

  onCancel = () => {
    if (this.active) this.finish(null);
  };

  finish(dir) {
    const a = this.active;
    this.active = null;
    this.stopRepeat();
    this.hidePopup();
    if (!a) return;
    a.el.classList.remove('pressed');
    if (dir === null) return;
    if (a.firedByRepeat && dir === 'center') return; // already delivered
    this.onFire(a.data, dir);
  }

  // --- auto-repeat for DEL and the arrow keys -------------------------------

  startRepeat(data) {
    if (!data.repeat) return;
    this.repeatTimer = setTimeout(() => {
      const tick = () => {
        if (!this.active) return;
        this.active.firedByRepeat = true;
        this.onFire(this.active.data, 'center');
        haptic(3);
        this.repeatTimer = setTimeout(tick, REPEAT_RATE);
      };
      tick();
    }, REPEAT_DELAY);
  }

  stopRepeat() {
    if (this.repeatTimer) { clearTimeout(this.repeatTimer); this.repeatTimer = null; }
  }

  // --- radial preview -------------------------------------------------------

  showPopup(btn, data) {
    const r = btn.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'flick-popup';
    for (const dir of ['center', 'up', 'right', 'down', 'left']) {
      const item = data[dir];
      const cell = document.createElement('div');
      cell.className = `flick-cell flick-${dir}`;
      if (item) {
        cell.textContent = item.label;
        if (item.tone) cell.classList.add(`tone-${item.tone}`);
      } else {
        cell.classList.add('empty');
      }
      pop.appendChild(cell);
    }
    document.body.appendChild(pop);
    const size = pop.offsetWidth;
    let left = r.left + r.width / 2 - size / 2;
    let top = r.top + r.height / 2 - pop.offsetHeight / 2;
    left = Math.max(4, Math.min(window.innerWidth - size - 4, left));
    top = Math.max(4, Math.min(window.innerHeight - pop.offsetHeight - 4, top));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.classList.add('visible');
    this.popup = pop;
    this.updatePopup('center');
  }

  updatePopup(dir) {
    if (!this.popup) return;
    for (const cell of this.popup.children) cell.classList.remove('active');
    const target = this.popup.querySelector(`.flick-${dir}`);
    if (target && !target.classList.contains('empty')) target.classList.add('active');
  }

  hidePopup() {
    if (!this.popup) return;
    this.popup.remove();
    this.popup = null;
  }
}

function hasFlickTargets(data) {
  return ['up', 'right', 'down', 'left'].some((d) => data[d]);
}

function haptic(ms) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* not supported */ }
  }
}
