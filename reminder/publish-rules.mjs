// Publishes firestore.rules to the Firebase project (GitHub Actions, .github/workflows/rules.yml).
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const r = await admin.securityRules().releaseFirestoreRulesetFromSource(source);
console.log('Database rules published:', r.name);
