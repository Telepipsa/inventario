// /src/services/notifications.js
import { isToday } from './expiry.js';

export function scheduleTodayExpiryCheck(callback) {
  // Chequeo inmediato y cada hora
  callback();
  setInterval(callback, 60 * 60 * 1000);
}

export function notifyExpiryToday(product) {
  if (!isToday(product.caducidad)) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  new Notification('Inventario', {
    body: `"${product.producto}" caduca hoy`,
    icon: '../public/icons/' + (product.icon || 'icon-192.png')
  });
}
