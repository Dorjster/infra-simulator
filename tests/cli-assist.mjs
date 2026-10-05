// CLI assistance: Tab completion, "?" help, suggestions and abbreviation expansion on real device command lists.
import assert from 'node:assert/strict';
import { createAssist } from '../dist/cli-assist.js';
import { CLI_COMMANDS } from '../dist/native-cli.js';
import { commands as sw } from '../dist/device-logic/switch.js';
import { commands as fw } from '../dist/device-logic/firewall.js';
const S = createAssist([...sw, ...CLI_COMMANDS.filter(c => !/^(config |edit|set|unset|next|get )/.test(c)), 'status']);
// Tab: unique word completes with a space; several extend to the common part; otherwise list the options.
assert.deepEqual(S.complete('sw'), { line: 'switchport ', list: [] });
assert.equal(S.complete('show int').line, 'show interface', 'extends to the common part of interface / interfaces');
assert.deepEqual(S.complete('show interfaces ').list.sort(), ['counters', 'status', 'transceiver']);
assert.deepEqual(S.complete('power inline priority ').list, ['low', 'high', 'critical'], 'choices offered');
assert.deepEqual(S.complete('sh').list.sort(), ['show', 'shutdown']);
assert(S.complete('channel-group ', { '<n>': '10' }).list[0].startsWith('<n>  e.g. 10'), 'placeholder with an example');
// "?": next words, or words starting with the letters typed.
assert(S.help('show ').includes('vlan')); assert.deepEqual(S.help('show int'), ['interfaces', 'interface']); assert.deepEqual(S.help('show vlan brief '), ['<cr>']);
// Abbreviations run as the full command; ambiguous input is left as typed; a single "sh" never becomes "shutdown".
for (const [a, b] of [['sh int st', 'show interfaces status'], ['sh ip int br', 'show ip interface brief'], ['conf t', 'configure terminal'], ['sh vl br', 'show vlan brief'], ['wr mem', 'write memory'], ['no sh', 'no shutdown'], ['sh run', 'show running-config'], ['copy run start', 'copy running-config startup-config']]) assert.equal(S.expand(a), b, a);
for (const a of ['sh', 'sh int', 'show interfaces status', 'channel-group 5 mode active', 'hostname core-a']) assert.equal(S.expand(a), a, 'unchanged: ' + a);
assert.equal(S.suggest('show sp'), 'show spanning-tree'); assert.equal(S.suggest('zzz'), null);
// FortiOS list.
const F = createAssist([...fw, 'config system interface', 'end', 'next']);
assert.equal(F.expand('get sys stat'), 'get system status'); assert.equal(F.expand('diag sys sess list'), 'diagnose sys session list');
assert.deepEqual(F.complete('config firewall ').list.sort(), ['policy', 'vip']); assert.equal(F.expand('edit port1'), 'edit port1');
console.log('PASS: CLI assistance · Tab completion, ? help, suggestions, abbreviations (sh int st → show interfaces status), ambiguity kept, FortiOS lists');
