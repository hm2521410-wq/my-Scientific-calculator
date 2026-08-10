// Flick input: press a key and drag towards one of four directions to reach the
// legends that would otherwise need SHIFT or ALPHA. A radial preview appears
// under the finger, in the style of a Japanese flick keyboard.

const THRESHOLD = 22;      // px of travel before a direction is committed
const REPEAT_DELAY = 420;  // ms before auto-repeat starts
const REPEAT_RATE = 55;    // ms between repeats
const LONG_PRESS = 480;    // ms held still before a key's long-press action fires

export class FlickController {
  /**
   * @param {HTMLElement} root container holding the key elements
   * @param {(key, direction) => void} onFire
   * @param {(key) => object} getKeyData maps a DOM element's id to key data
   * @param {(key, rect, origin) => ?object} openPicker optional; when a key
   *        declares `holdPicker`, holding it calls this and, if it returns a
   *        { update, commit, cancel } controller, the same unbroken drag then
   *        scrubs that picker instead of flicking.
   */
  constructor(root, onFire, getKeyData, openPicker = null) {
    this.root = root;
    this.onFire = onFire;
    this.getKeyData = getKeyData;
    this.openPicker = openPicker;
    this.active = null;
    this.popup = null;
    this.repeatTimer = null;
    this.longPressTimer = null;

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

    // A key with `instantPicker` skips the flick popup entirely: its ladder
    // opens the moment it is touched, and the same drag scrubs it.
    if (data.instantPicker && this.openPicker) {
      const picker = this.openPicker(data, btn.getBoundingClientRect(),
        { x: e.clientX, y: e.clientY });
      if (picker) {
        this.active.picker = picker;
        picker.update(e.clientX, e.clientY);
        return;
      }
    }

    if (hasFlickTargets(data)) this.showPopup(btn, data);
    this.startRepeat(data);
    this.startLongPress(data);
  };

  onMove = (e) => {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    e.preventDefault();

    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;

    // Once a hold-picker is open the drag belongs to it.
    if (a.picker) { a.picker.update(e.clientX, e.clientY); return; }

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
    if (dist > 6) this.stopLongPress();
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
    this.stopLongPress();
    this.hidePopup();
    if (!a) return;
    a.el.classList.remove('pressed');
    if (a.picker) {
      if (dir === null) a.picker.cancel();
      else a.picker.commit();
      return;
    }
    if (dir === null) return;
    if (a.firedByLongPress) return;                  // the hold already acted
    if (a.firedByRepeat && dir === 'center') return; // already delivered
    this.onFire(a.data, dir);
  }

  // --- long press -----------------------------------------------------------

  startLongPress(data) {
    if (!data.longPress && !data.holdPicker) return;
    this.longPressTimer = setTimeout(() => {
      const a = this.active;
      if (!a || a.dir !== 'center') return;
      this.stopRepeat();
      this.hidePopup();
      haptic(14);

      if (data.holdPicker && this.openPicker) {
        const picker = this.openPicker(a.data, a.el.getBoundingClientRect(), { x: a.x0, y: a.y0 });
        if (picker) {
          a.picker = picker;
          picker.update(a.x0, a.y0);
          return;
        }
      }
      a.firedByLongPress = true;
      a.el.classList.remove('pressed');
      if (data.longPress) this.onFire(a.data, 'longPress');
    }, LONG_PRESS);
  }

  stopLongPress() {
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
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
