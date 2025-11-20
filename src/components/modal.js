// /src/components/modal.js
export function openModal(options = {}) {
  const backdrop = document.getElementById('modalBackdrop');
  const modal = document.getElementById('modal');
  if (!modal) return;
  // default: center with backdrop
  if (options.target) {
    // show as popover near target element
    const rect = options.target.getBoundingClientRect();
    // remember trigger so outside-click logic ignores it
    window.__activePopoverTrigger = options.target;
    modal.classList.add('popover');
    // compute viewport coordinates and use fixed positioning to avoid scroll/ancestor transform issues
    let left = rect.right + 8; // right side with small gap (viewport coords)
    let top = rect.top;
    modal.style.position = 'fixed';
    // show modal to measure its size, keep backdrop hidden
    if (backdrop) backdrop.hidden = true;
    modal.hidden = false;
    // adjust position if it would overflow viewport
    setTimeout(() => {
      const mw = modal.offsetWidth || 260;
      const mh = modal.offsetHeight || 120;
      let placedLeft = false;
      // if it would overflow to the right of the viewport, place to the left of the trigger
      if (left + mw > window.innerWidth) {
        left = Math.max(8, rect.left - mw - 8);
        placedLeft = true;
      }
      // if it would overflow bottom, push it up so it fits in viewport
      if (top + mh > window.innerHeight) {
        top = Math.max(8, window.innerHeight - mh - 8);
      }
      modal.style.left = `${left}px`;
      modal.style.top = `${top}px`;
      // add class to indicate popover was placed left of trigger
      if (placedLeft) modal.classList.add('popover-left');
      else modal.classList.remove('popover-left');
      modal.style.visibility = 'visible';
    }, 0);
  } else {
    modal.classList.remove('popover');
    modal.style.left = '';
    modal.style.top = '';
    modal.style.position = '';
    if (backdrop) backdrop.hidden = false;
    modal.hidden = false;
  }
}

export function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  const modal = document.getElementById('modal');
  if (!modal) return;
  if (backdrop) backdrop.hidden = true;
  modal.hidden = true;
  modal.classList.remove('popover');
  modal.style.left = '';
  modal.style.top = '';
  modal.style.visibility = '';
  modal.style.position = '';
  // clear active trigger
  try { window.__activePopoverTrigger = null; } catch(e){}
}

export function bindModal(onClose) {
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.addEventListener('click', onClose);
  const pfClose = document.getElementById('pfClose');
  if (pfClose) pfClose.addEventListener('click', onClose);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onClose();
  });
  // Click outside popover should close it (but ignore clicks on the trigger)
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('modal');
    if (!modal) return;
    if (!modal.classList.contains('popover')) return;
    if (modal.contains(e.target)) return;
    // ignore clicks on the original trigger element
    const trig = window.__activePopoverTrigger;
    if (trig && (trig === e.target || (trig.contains && trig.contains(e.target)))) return;
    // ignore clicks inside icon picker while it's open
    const picker = document.getElementById('iconPicker');
    if (picker && picker.contains(e.target)) return;
    if (window.__iconPickerOpen) return;
    // click is outside popover and trigger -> close
    onClose();
  });
}
