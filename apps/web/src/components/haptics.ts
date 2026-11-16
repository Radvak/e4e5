import { HAPTICS_KEY } from '../settings';

/**
 * A short vibration for a wrong move, on phones (turned off in Paramètres). Called from the
 * move's pointer event: iOS only gives haptic feedback during a user gesture.
 */
export function buzzError() {
  if (localStorage.getItem(HAPTICS_KEY) === 'false') return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([40, 50, 40]); // Android
    return;
  }
  // iOS Safari has no Vibration API, but toggling a switch checkbox gives a haptic tick (iOS 18+).
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  label.style.display = 'none';
  document.body.appendChild(label);
  label.click();
  label.remove();
}
