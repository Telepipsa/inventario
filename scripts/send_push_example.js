// Example server script to send a push notification using web-push
// Usage:
// 1) npm install web-push
// 2) Generate VAPID keys: npx web-push generate-vapid-keys - this will print public/private keys
// 3) Set the VAPID keys below and the subscription object you receive from the client
// 4) node scripts/send_push_example.js

const webpush = require('web-push');

// TODO: replace with your generated keys
const VAPID_PUBLIC = '<YOUR_PUBLIC_KEY>'; // provide this to the client as window.__VAPID_PUBLIC_KEY
const VAPID_PRIVATE = '<YOUR_PRIVATE_KEY>';

webpush.setVapidDetails('mailto:you@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

// Example subscription object — replace with the real JSON you get from client
const exampleSubscription = /* paste subscription JSON here */ null;

async function send() {
  if (!exampleSubscription) return console.error('No subscription provided. Paste the subscription JSON into this file.');
  try {
    const res = await webpush.sendNotification(exampleSubscription, 'Producto caducado: Leche');
    console.log('Push sent', res);
  } catch (err) {
    console.error('Push error', err);
  }
}

send();
