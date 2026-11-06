(() => {
  'use strict';
  const colors = {
    red: { label: 'Red', hex: '#e74c3c', diameter: 235 },
    yellow: { label: 'Yellow', hex: '#f1c40f', diameter: 232 },
    green: { label: 'Green', hex: '#2ecc71', diameter: 234 },
    blue: { label: 'Blue', hex: '#3498db', diameter: 233 },
  };
  const avatar = document.getElementById('demo-avatar');
  const avatarFrame = document.getElementById('demo-avatar-frame');
  const colorButtons = document.querySelectorAll('[data-player-color]');
  colorButtons.forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.playerColor;
    const color = colors[key];
    if (!color) return;
    avatar.src = `/workers/1-nemo-${key}.png?v=1.0.4`;
    avatar.alt = `Nemo ${color.label}ocean animal avatar`;
    avatar.style.setProperty('--avatar-scale', `${256 / color.diameter * 100}%`);
    avatarFrame.style.borderColor = color.hex;
    colorButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));

  let angle = 0;
  const rotate = () => {
    angle += 90;
    document.getElementById('rotation-image').style.transform = `rotate(${angle}deg)`;
    document.getElementById('rotation-angle').textContent = `Orientation: ${angle % 360}°`;
  };
  document.getElementById('rotation-tile').addEventListener('click', rotate);
  document.getElementById('rotation-control').addEventListener('click', rotate);

  const beachButtons = document.querySelectorAll('[data-beach-count]');
  beachButtons.forEach(button => button.addEventListener('click', () => {
    const count = Number(button.dataset.beachCount);
    document.getElementById('sea-count').textContent = String(count);
    document.getElementById('sea-total').textContent = String(count * 3);
    beachButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));

  const dialog = document.getElementById('tile-dialog');
  const dialogImage = document.getElementById('dialog-image');
  let dialogOpener = null;
  document.querySelectorAll('[data-inspect]').forEach(button => button.addEventListener('click', () => {
    const image = button.querySelector('img');
    dialogOpener = button;
    dialogImage.src = image.currentSrc || image.src;
    dialogImage.alt = image.alt;
    document.getElementById('dialog-title').textContent = button.dataset.inspect;
    dialog.showModal();
  }));
  document.getElementById('dialog-close').addEventListener('click', () => dialog.close());

  const remainingDialog = document.getElementById('remaining-tiles-demo');
  let remainingOpener = null;
  const remainingTotal = [...remainingDialog.querySelectorAll('[data-count]')]
    .reduce((total, tile) => total + Number(tile.dataset.count), 0);
  remainingDialog.querySelector('[data-remaining-total]').textContent = `${remainingTotal}/80`;
  document.querySelectorAll('[data-open-remaining]').forEach(button => button.addEventListener('click', () => {
    remainingOpener = button;
    remainingDialog.showModal();
    remainingDialog.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
  }));
  const setupDialogDismissal = (element, getOpener) => {
    element.addEventListener('click', event => {
      if (event.target !== element) return;
      const bounds = element.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) element.close();
    });
    element.addEventListener('close', () => {
      const opener = getOpener();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  };
  setupDialogDismissal(dialog, () => dialogOpener);
  setupDialogDismissal(remainingDialog, () => remainingOpener);

  const navigationLinks = document.querySelectorAll('.contents a');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.find(entry => entry.isIntersecting);
      if (!visible) return;
      navigationLinks.forEach(link => {
        if (link.hash === `#${visible.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-18% 0px -60% 0px', threshold: 0 });
    document.querySelectorAll('section.chapter[id]').forEach(section => observer.observe(section));
  }

})();
