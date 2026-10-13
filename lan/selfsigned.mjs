// A self-signed TLS certificate for the LAN room's HTTPS address, so browsers on other computers get a secure origin
// (needed for the microphone: team voice). Built with Node's crypto only: an EC P-256 key and a minimal X.509 v3
// certificate (DER) naming this computer's LAN addresses and localhost. Browsers show a one-time warning (it is not
// signed by a public authority); the desktop app trusts it for LAN addresses on its own.
import crypto from 'node:crypto';

const len = n => n < 128 ? Buffer.from([n]) : (b => Buffer.concat([Buffer.from([0x80 | b.length]), b]))(Buffer.from(n.toString(16).padStart(n > 255 ? 4 : 2, '0').match(/../g).map(h => parseInt(h, 16))));
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...a) => tlv(0x30, Buffer.concat(a)), set = (...a) => tlv(0x31, Buffer.concat(a));
const int = buf => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);
const oid = s => { const p = s.split('.').map(Number), out = [40 * p[0] + p[1]]; for (const v of p.slice(2)) { const b = []; let x = v; do { b.unshift(x & 0x7f); x >>= 7; } while (x); for (let i = 0; i < b.length - 1; i++) b[i] |= 0x80; out.push(...b); } return tlv(0x06, Buffer.from(out)); };
const utf8 = s => tlv(0x0c, Buffer.from(s, 'utf8')), utc = d => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const bits = buf => tlv(0x03, Buffer.concat([Buffer.from([0]), buf])), octet = buf => tlv(0x04, buf);
const ipBytes = ip => ip.includes(':') ? null : Buffer.from(ip.split('.').map(Number));

export const LAN_CN = 'Infra Simulator LAN';
// { key, cert } as PEM strings for `addresses` (IPv4 strings) plus localhost / 127.0.0.1.
export function selfSigned(addresses = []) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const algo = seq(oid('1.2.840.10045.4.3.2')), name = seq(set(seq(oid('2.5.4.3'), utf8(LAN_CN))));
  const now = new Date(), from = new Date(now.getTime() - 864e5), to = new Date(now.getTime() + 10 * 365 * 864e5);
  const ips = [...new Set(['127.0.0.1', ...addresses])].map(ipBytes).filter(Boolean);
  const san = seq(...ips.map(b => tlv(0x87, b)), tlv(0x82, Buffer.from('localhost')));
  const exts = tlv(0xa3, seq(seq(oid('2.5.29.17'), octet(san)), seq(oid('2.5.29.19'), octet(seq()))));
  const tbs = seq(tlv(0xa0, int(Buffer.from([2]))), int(crypto.randomBytes(12)), algo, name, seq(utc(from), utc(to)), name, publicKey.export({ type: 'spki', format: 'der' }), exts);
  const sig = crypto.sign('sha256', tbs, { key: privateKey, dsaEncoding: 'der' });
  const der = seq(tbs, algo, bits(sig)), pem = (label, b) => `-----BEGIN ${label}-----\n${b.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: pem('CERTIFICATE', der) };
}
