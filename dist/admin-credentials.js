// Initial administrator credentials for rack switches, set from the device console or SSH.
// Each family uses its own syntax (FortiSwitchOS, NX-OS, OS10, AOS-CX). The result is the same
// product identity record the setup GUIs write (`identity.passwordSet`), so the GUI, checks and
// Campaign level 1 all read one value. The password itself is not stored (training simulator).
import {productProfile} from './product-profiles.js';

const MIN = 8;
const weak = pw => String(pw || '').length < MIN;
const weakText = family => ({
  fortiswitch: 'password must be at least ' + MIN + ' characters\nCommand fail. Return code -1',
  nxos: '% Password is too short. Minimum ' + MIN + ' characters',
  os10: '% Error: Password must contain at least ' + MIN + ' characters',
  aoscx: 'Password must be at least ' + MIN + ' characters.'
}[family]);

export function credentialCommand(input, session, change) {
  const n = session?.node; if (!n || n.type !== 'switch') return null;
  const family = productProfile(n).family, text = String(input).trim(), lower = text.toLowerCase();
  const setIdentity = () => change({ type: 'product', node: n.id, op: 'identity', value: { name: n.net.hostname || n.id, passwordChanged: true } });
  let m;
  if (family === 'fortiswitch') {
    if (lower === 'config system admin') { session.adminConfig = true; session.adminUser = null; return (n.net.hostname || n.id) + ' (admin) #'; }
    if (!session.adminConfig) return null;
    if (m = /^edit\s+(\S+)$/i.exec(text)) { session.adminUser = m[1]; return (n.net.hostname || n.id) + ' (' + m[1] + ') #'; }
    if (m = /^set password\s+(\S+)$/i.exec(text)) {
      if (session.adminUser !== 'admin') return 'Select the account first: edit admin';
      if (weak(m[1])) return weakText(family);
      session.adminPending = true; return '';
    }
    if (lower === 'next' || lower === 'end') {
      const pending = session.adminPending; session.adminPending = false; session.adminUser = null;
      if (lower === 'end') session.adminConfig = false;
      if (!pending) return lower === 'end' ? (n.net.hostname || n.id) + ' #' : '';
      return setIdentity();
    }
    return null;
  }
  if (!['nxos', 'os10', 'aoscx'].includes(family)) return null;
  const pattern = family === 'aoscx' ? /^user\s+(\S+)\s+password\s+plaintext\s+(\S+)$/i : /^username\s+(\S+)\s+password\s+(?:\d\s+)?(\S+)(?:\s+role\s+\S+)?$/i;
  if (!(m = pattern.exec(text))) return null;
  if (!session.config) return family === 'aoscx' ? 'Enter configuration mode first: config' : '% Enter configure terminal first';
  if (m[1] !== 'admin') return family === 'aoscx' ? 'Only the admin account is used in this training profile.' : '% Only the admin account is used in this training profile';
  if (weak(m[2])) return weakText(family);
  return setIdentity();
}

export const CREDENTIAL_SYNTAX = {
  fortiswitch: ['config system admin', 'edit admin', 'set password <8+ chars>', 'end'],
  nxos: ['configure terminal', 'username admin password <8+ chars> role network-admin', 'end'],
  os10: ['configure terminal', 'username admin password <8+ chars> role sysadmin', 'end'],
  aoscx: ['config', 'user admin password plaintext <8+ chars>', 'end']
};
