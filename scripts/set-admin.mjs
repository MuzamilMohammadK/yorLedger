// One-time admin provisioning (spec §4.1: no public admin signup).
// Usage (run locally, never in CI):
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/set-admin.mjs admin@example.com [--role=super_admin|support|viewer] [--revoke]
// The user must already exist in Firebase Auth. They must sign out and back in afterwards.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');
const roleArg = process.argv.find(a => a.startsWith('--role='));
const role = roleArg ? roleArg.split('=')[1] : 'super_admin';
const validRoles = ['super_admin', 'support', 'viewer'];

if (!email || (!revoke && !validRoles.includes(role))) {
  console.error('Usage: node scripts/set-admin.mjs <email> [--role=super_admin|support|viewer] [--revoke]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(
  user.uid,
  revoke ? {} : { admin: true, adminRole: role }
);
await getAuth().revokeRefreshTokens(user.uid);
console.log(`${revoke ? 'Revoked' : `Granted (${role})`} admin for ${email} (uid ${user.uid}). Sign in again to refresh the token.`);
