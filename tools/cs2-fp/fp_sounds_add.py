# fp_sounds_add.py [ids…] [--assets <user-assets>] (v53 KNIVES): CS2's own clip sounds for the first-person sets that
# export_missing.py made (the five new knives: bayonet, skeleton, talon, flip, nomad), ADDED to the manifest's
# models.fpSounds beside the 38 sets ~/CS2-extract/build/fp_sounds.py made from build_all.py (which knows only its own
# sets and writes models.fpSounds whole). The same reading as fp_sounds.py: each clip's sound events (CNmSoundEvent: a
# name, a start as a fraction of the clip's m_flDuration) resolved through soundevents/game_sounds_weapons.vsndevts
# (files, volume, pitch, pitch_random) → <assets>/sounds/fp-<file>.ogg (Ogg Opus 96k, as fp_sounds.py) and
#   models.fpSounds[id] = { clip: { dur, ev: [[seconds, [sound names], volume, pitch, pitch random]] } }
# for every clip the set carries (export_missing.py clip_list: idle, draw(rare), light(2), light hits, backstabs, heavy,
# its hit and backstab, inspect(2) and the Bayonet's / Flip's inspect while drawing).
# The back-up rule: the manifest is copied to <assets>/manifest.bak-sounds-<stamp>.json (and the work folder) first; a sound file already
# there is never written over (the same CS2 file decodes to the same name). Valve's: stays on this computer.
import json, os, re, shutil, subprocess, sys, hashlib, time
H = os.path.expanduser('~/CS2-extract'); X = H + '/tools/s2v/Source2Viewer-CLI'; PAK = H + '/game/game/csgo/pak01_dir.vpk'; HERE = os.path.dirname(os.path.abspath(__file__))
C = H + '/export/clips/animation/anims/viewmodel'; DUMP = H + '/export/fpsnd'; SND = H + '/export/sounds'
argv = sys.argv[1:]; opt = lambda k, d: (argv.pop(argv.index(k) + 1), argv.remove(k))[0] if k in argv else d
ASSETS = os.path.abspath(opt('--assets', os.path.join(HERE, '..', '..', 'user-assets'))); WORK = os.path.abspath(opt('--work', os.path.join(os.environ.get('TMPDIR', '/tmp'), 'cs2-fp-missing')))
ids = [a for a in argv if not a.startswith('--')] or ['bayonet', 'skeleton', 'talon', 'flip', 'nomad']
# the sets' clips: export_missing.py's own tables (ITEMS, WANT, pick) — run up to where it starts exporting
src = open(os.path.join(HERE, 'export_missing.py')).read(); ns = {'__file__': os.path.join(HERE, 'export_missing.py')}; sys.argv = [sys.argv[0]]; exec(src[:src.index('def run(')], ns); ITEMS, WANT, pick, clip_list = ns['ITEMS'], ns['WANT'], ns['pick'], ns['clip_list']
os.makedirs(DUMP, exist_ok=True); os.makedirs(SND, exist_ok=True)
def dump(path, out):   # a resource's DATA block as text (cached, shared with fp_sounds.py)
    if not os.path.exists(out) or os.path.getsize(out) < 100:
        r = subprocess.run([X, '-i', PAK, '-f', path, '-b', 'DATA'], capture_output=True, text=True); open(out, 'w').write(r.stdout)
    return open(out).read()
EV = {}; cur = None; buf = []
for line in dump('soundevents/game_sounds_weapons.vsndevts_c', DUMP + '/game_sounds_weapons.txt').split('\n'):
    m = re.match(r'^\t([A-Za-z0-9_.\-]+) = $', line)
    if m: cur = m.group(1); buf = []; continue
    if cur is not None:
        if line == '\t}': EV[cur] = '\n'.join(buf); cur = None
        else: buf.append(line)
EVL = {k.lower(): v for k, v in EV.items()}
def resolve(name, depth=0):   # → (files, volume, pitch, pitch random) or None (fp_sounds.py's)
    b = EV.get(name) or EVL.get(name.lower())
    if b is None or depth > 4: return None
    num = lambda k, d: float(m.group(1)) if (m := re.search(r'^\t\t' + k + r' = (-?[\d.]+)', b, re.M)) else d
    files = re.findall(r'"(sounds/[^"]+\.vsnd)"', b)
    if not files and (m := re.search(r'^\t\tbase = "([^"]+)"', b, re.M)):
        r = resolve(m.group(1), depth + 1)
        return r and (r[0], num('volume', r[1]), num('pitch', r[2]), r[3])
    return files and (files, num('volume', 1.0), num('pitch', 1.0), num('pitch_random_max', 0.0) - num('pitch_random_min', 0.0))
def clip_events(glb):
    rel = os.path.relpath(glb, H + '/export/clips').replace('.glb', '.vnmclip_c')
    t = dump(rel, DUMP + '/' + rel.replace('/', '__') + '.txt')
    dur = float(m.group(1)) if (m := re.search(r'^\tm_flDuration = ([\d.]+)', t, re.M)) else 0; ev = []
    for blk in t.split('_class = ')[1:]:
        if not blk.startswith('"CNmSoundEvent"'): continue
        st = re.search(r'm_flStartTime = \s*\{\s*m_flValue = ([\d.e\-]+)', blk); nm = re.search(r'm_name = "([^"]+)"', blk)
        if st and nm: ev.append((float(st.group(1)), nm.group(1)))
    return dur, ev
FP = {}; need = {}; unknown = set()
for gid in ids:
    for name, glb in clip_list(gid):   # (v53 KNIVES final: the same clips the set carries — export_missing.py clip_list)
        dur, ev = clip_events(glb); out = []
        for frac, en in ev:
            r = resolve(en)
            if not r: unknown.add(en); continue
            files, vol, pitch, pr = r; names = []
            for f in files: base = 'fp-' + os.path.basename(f)[:-5]; need[base] = f[:-5]; names.append(base)
            out.append([round(frac * dur, 4), names, round(vol, 3), round(pitch, 3), round(pr, 3)])
        if dur and out: FP.setdefault(gid, {})[name] = {'dur': round(dur, 4), 'ev': out}
print(len(FP), 'sets ·', sum(len(c['ev']) for s in FP.values() for c in s.values()), 'sound events ·', len(need), 'sounds · unresolved', len(unknown), sorted(unknown)[:8])
out_dir = os.path.join(ASSETS, 'sounds'); os.makedirs(out_dir, exist_ok=True); snd = {}; missing = []; made = 0
for base, path in sorted(need.items()):
    tmp = os.path.join(SND, path.replace('/', '__') + '.snd'); dst = os.path.join(out_dir, base + '.ogg')
    if not os.path.exists(tmp): subprocess.run([X, '-i', PAK, '-f', path + '.vsnd_c', '-o', tmp, '-d'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=SND)
    if not os.path.exists(dst):
        if not os.path.exists(tmp) or os.path.getsize(tmp) < 64: missing.append(path); continue
        subprocess.run(['ffmpeg', '-v', 'error', '-n', '-i', tmp, '-c:a', 'libopus', '-b:a', '96k', dst], check=True); made += 1
    snd[base] = {'file': 'sounds/' + base + '.ogg', 'from': 'CS2: ' + path}
for s in FP.values():
    for c in s.values(): c['ev'] = [e for e in ([t, [n for n in names if n in snd], v, p, r] for t, names, v, p, r in c['ev']) if e[1]]
mp = os.path.join(ASSETS, 'manifest.json'); os.makedirs(WORK, exist_ok=True); st = time.strftime('%Y%m%d-%H%M%S'); bak = os.path.join(ASSETS, f'manifest.bak-sounds-{st}.json')   # (the back-up rule: next to the manifest, left out of the pack; and in the work folder)
if os.path.exists(bak): sys.exit(f'{bak} exists')
shutil.copyfile(mp, bak); shutil.copyfile(mp, os.path.join(WORK, f'manifest.before-sounds-{st}.json'))
man = json.load(open(mp)); man['models'].setdefault('sounds', {}).update(snd); man['models'].setdefault('fpSounds', {}).update(FP)
man['hash'] = hashlib.sha1((man.get('hash', '') + str(time.time())).encode()).hexdigest()[:12]; json.dump(man, open(mp, 'w'), indent=1)
print('added', ', '.join(FP), '·', len(snd), 'clip sounds (', made, 'new files, missing', len(missing), ') · manifest kept as', bak, '· hash', man['hash'])
