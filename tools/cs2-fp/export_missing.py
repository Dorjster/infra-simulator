# export_missing.py [ids…] [--assets <user-assets>] [--work <dir>] [--install]
# The CS2 items the game offers that had no CS2 model here yet — the AUG, the decoy and the incendiary grenade (no
# cs2_aug / cs2_decoy / cs2_incendiary first-person set, no world model: the old pack's AUG, recoloured smoke cans) —
# made from the CS2 install on this computer (~/CS2-extract: its pak01 and Source 2 Viewer CLI), the same way as the
# 37 sets already in user-assets/fp (~/CS2-extract/build/build_all.py → build_set.py: CS2's Driver Gloves view-model
# mesh with the set's 'cs2_glove' slot, which the game paints with the imported glove's material; the weapon's HD body;
# CS2's own view-model clips baked on; CS2's camera offset) and the CS2 world models in user-assets/weapons (the
# weapon's own mesh, centimetres, muzzle −z: world_bin.py). Per id:
#   fp/cs2_<id>.glb                    first-person set: idle, draw, fire / prime, throw, throwlow, reload, inspect
#   weapons/<id>.bin + -main-{base,normal,orm}.jpg   world model: other players' hands, in flight, landed, dropped
#   (the molotov: the world model only — its set was made with the others; CS2's bottle without the lighter or flame card)
# Never written over an existing file (each name is new). --install puts them in <assets> and lists them in its
# manifest.json (a copy of the old one kept beside the work folder first), with a new hash so browsers fetch them.
# The AUG's model is from CS2's October 2026 update (KV3 node types 26 / 27) which Source 2 Viewer 20.0 cannot read:
# kv3_compat.py rewrites a scratch copy first. Valve's files: they stay on this computer, never shipped.
import json, os, shutil, subprocess, sys, hashlib, time
H = os.path.expanduser('~/CS2-extract'); X = H + '/tools/s2v/Source2Viewer-CLI'; PAK = H + '/game/game/csgo/pak01_dir.vpk'; GI = H + '/game/game/csgo/gameinfo.gi'
C = H + '/export/clips/animation/anims/viewmodel'; GLOVE = os.environ.get('GLOVE', H + '/export/arms/glove_slick2.glb')
BPY = '/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13'; BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'; HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]; opt = lambda k, d: (argv.pop(argv.index(k) + 1), argv.remove(k))[0] if k in argv else d
ASSETS = os.path.abspath(opt('--assets', os.path.join(HERE, '..', '..', 'user-assets'))); WORK = os.path.abspath(opt('--work', os.path.join(os.environ.get('TMPDIR', '/tmp'), 'cs2-fp-missing')))
INSTALL = '--install' in argv; ids = [a for a in argv if not a.startswith('--')]
R, G = 'rifle/_default_rifle', 'grenade/_default_grenade'
# id: (CS2 model path in pak01, own clip folder, default clip folder, kind, textures: colour / normal / rough / ao — the names Source 2 Viewer writes)
ITEMS = {
 'aug': ('weapons/models/aug/weapon_rif_aug', 'rifle/rifle_aug', R, 'gun', ('aug_default_color_psd_e209ca89', 'aug_default_normal_tga_31e3d49f', 'aug_default_rough_psd_3b83f877', 'aug_ao_tga_c1ddac19')),
 'decoy': ('weapons/models/grenade/decoy/weapon_decoy', None, G, 'nade', ('decoy_color_tga_98f734ae', 'decoy_normal_tga_73ed28cb', 'decoy_rough_tga_ccd5a76c', 'decoy_ao_tga_2329195e')),   # (CS2 has no decoy clips of its own: its graph plays the default grenade's)
 'incendiary': ('weapons/models/grenade/incendiary/weapon_incendiarygrenade', 'grenade/grenade_incendiary', G, 'nade', ('incendiary_grenade_color_tga_1a0321a7', 'incendiary_grenade_normal_tga_ed9c9b24', 'incendiary_grenade_rough_tga_cc1cc38a', 'incendiary_grenade_ao_tga_e55fed76')),
 # the molotov: its first-person set exists (build_all.py cs2_molotov); only the world model is new (other players' hands,
 # in flight, dropped: it was the CC0 bottle) — the bottle, its rag and its liquid hull on the bottle's own texture (as the
 # set paints them), without the lighter (left hand) or the flame card.
 'molotov': ('weapons/models/grenade/molotov/weapon_molotov', None, G, 'world', ('molotov_color_tga_799db119', 'molotov_normal_tga_f176d626', 'molotov_rough_tga_733f549c', 'molotov_ao_tga_e9ab63da')),
}
WORLD_ARGS = {'molotov': ['--drop-joints', 'lighter,lighter_flame,lighter_hinge,lighter_lever', '--drop-mats', 'flame']}
# The clips each kind plays (build_all.py's WANT: the game's clip name, CS2's file prefix, prefixes left out)
WANT = {'gun': [('idle', 'idle', ('slide_back', 'idle2', 'from_activity')), ('draw', 'draw', ('lookat', 'crouch', 'silenced')), ('fire', 'shoot1', ()), ('reload', 'reload', ('empty',)), ('inspect', 'lookat01', ('draw', 'transfix', 'lgcy'))],
        'nade': [('idle', 'idle', ()), ('draw', 'draw', ()), ('prime', 'pullpin', ()), ('throw', 'throw_overhand', ()), ('throwlow', 'throw_underhand', ()), ('inspect', 'lookat01', ())]}
def pick(dirs, prefix, exclude=()):
    for d in dirs:
        if not d or not os.path.isdir(f'{C}/{d}'): continue
        for f in sorted(os.listdir(f'{C}/{d}')):
            if f.startswith(prefix) and f.endswith('.glb') and 'non_additive' not in f and not any(x in f for x in exclude): return f'{C}/{d}/{f}'
def run(cmd, **kw): r = subprocess.run(cmd, capture_output=True, text=True, **kw); return r.returncode, (r.stdout or '') + (r.stderr or '')
def glb_ok(p):   # an export with the weapon's skeleton ('weapon' bone) and a mesh
    if not os.path.exists(p): return False
    import struct; b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + n]); return any(nd.get('name') == 'weapon' for nd in g['nodes']) and bool(g.get('meshes'))
def export(gid, model):   # → <work>/<gid>/<name>.glb with its textures (PNG) beside it; --gltf_export_animations: without it no skeleton is written
    d = os.path.join(WORK, gid); os.makedirs(d, exist_ok=True); out = os.path.join(d, os.path.basename(model) + '.glb')
    if glb_ok(out): return out, d
    flags = ['-d', '--gltf_export_format', 'glb', '--gltf_export_materials', '--gltf_export_animations']
    rc, log = run([X, '-i', PAK, '-f', model + '.vmdl_c', '-o', out] + flags, cwd=d)
    if not glb_ok(out) and 'Unknown KVType' in log:   # (newer KV3 than this Source 2 Viewer reads: a rewritten copy, exported by its relative path so the mesh names stay CS2's)
        raw = os.path.join(d, 'raw.vmdl_c'); run([X, '-i', PAK, '-f', model + '.vmdl_c', '-o', raw]); fixed = os.path.join(d, 'fixed'); os.makedirs(os.path.join(fixed, os.path.dirname(model)), exist_ok=True)
        rc, l2 = run(['python3', '-I', os.path.join(HERE, 'kv3_compat.py'), raw, os.path.join(fixed, model + '.vmdl_c')]); print(l2.strip())
        rc, log = run([X, '-i', model + '.vmdl_c', '--game', GI, '-o', out] + flags, cwd=fixed)
        for f in os.listdir(fixed):
            if f.endswith('.png'): shutil.move(os.path.join(fixed, f), os.path.join(d, f))
    if not glb_ok(out): sys.exit(f'{gid}: export failed\n{log[-1500:]}')
    return out, d
def new(path):   # never over an existing file
    if os.path.exists(path): sys.exit(f'{path} exists: not written over (move it away first if it is to be rebuilt)')
    return path
made = {}
for gid in (ids or ITEMS):
    model, own, dflt, kind, (tc, tn, tr, ta) = ITEMS[gid]; glb, d = export(gid, model); png = lambda n: os.path.join(d, n + '.png')
    for n in (tc, tn, tr): assert os.path.exists(png(n)), f'{gid}: no {n}.png from the export'
    jobs = [{'out': os.path.join(d, 'color.jpg'), 'kind': 'rgb', 'src': png(tc), 'size': 2048}, {'out': os.path.join(d, 'normal.jpg'), 'kind': 'rgb', 'src': png(tn), 'size': 2048},
            {'out': os.path.join(d, 'orm.jpg'), 'kind': 'orm', 'src': png(tr), 'ao': png(ta) if os.path.exists(png(ta)) else None, 'size': 2048}]
    jf = os.path.join(d, 'tex.json'); json.dump(jobs, open(jf, 'w')); rc, log = run([BLENDER, '-b', '--factory-startup', '--python', os.path.join(HERE, 'textures.py'), '--', jf])
    if rc or not all(os.path.exists(j['out']) for j in jobs): sys.exit(f'{gid}: textures failed\n{log[-1500:]}')
    clips = [f'{name}={p}' for name, prefix, excl in WANT.get(kind, []) for p in [pick([own, dflt], prefix, excl)] if p]; fp = None
    if kind != 'world':   # ('world': its set is already made — the world model only)
        fp = os.path.join(d, f'cs2_{gid}.glb'); rc, log = run([BPY, '-I', os.path.join(HERE, 'build_set.py'), '--glove-shared', '1', '--weapon-tex', jobs[0]['out'] + ',' + jobs[1]['out'], fp, GLOVE, glb] + clips)
        if rc: sys.exit(f'{gid}: first-person set failed\n{log[-1500:]}')
        print(gid, 'set', ' '.join(c.split('=')[0] + ':' + os.path.basename(c.split('=')[1]) for c in clips), os.path.getsize(fp) // 1024, 'KB')
    wb = os.path.join(d, f'{gid}.bin'); rc, log = run([BPY, '-I', os.path.join(HERE, 'world_bin.py'), glb, gid, wb] + WORLD_ARGS.get(gid, []))
    if rc: sys.exit(f'{gid}: world model failed\n{log[-1500:]}')
    info = json.loads(log.strip().splitlines()[-1]); print(gid, 'world', info); made[gid] = (fp, wb, jobs, info, [c.split('=')[0] for c in clips])
if INSTALL:
    mp = os.path.join(ASSETS, 'manifest.json'); m = json.load(open(mp)); bak = os.path.join(WORK, 'manifest.before-' + time.strftime('%Y%m%d-%H%M%S') + '.json'); shutil.copyfile(mp, bak); print('manifest kept as', bak)
    for gid, (fp, wb, jobs, info, clips) in made.items():
        if fp: shutil.copyfile(fp, new(os.path.join(ASSETS, 'fp', f'cs2_{gid}.glb')))
        shutil.copyfile(wb, new(os.path.join(ASSETS, 'weapons', f'{gid}.bin')))
        for j, k in zip(jobs, ('base', 'normal', 'orm')): shutil.copyfile(j['out'], new(os.path.join(ASSETS, 'weapons', f'{gid}-main-{k}.jpg')))
        if fp: m['models'].setdefault('viewmodels', {})[f'cs2_{gid}'] = {'file': f'fp/cs2_{gid}.glb', 'from': f'CS2: its own view-model clips, Driver Gloves and {gid} model (Steam depot, converted on this computer)', 'bytes': os.path.getsize(fp), 'clips': clips}
        m['models'].setdefault('weapons', {})[gid] = {'file': f'weapons/{gid}.bin', 'maps': ['base', 'normal', 'orm'], 'tris': info['tris'], 'box': info['box'], 'from': f'CS2: {ITEMS[gid][0]}.vmdl (Steam depot, converted on this computer)'}
    m['hash'] = hashlib.sha1((m.get('hash', '') + str(time.time())).encode()).hexdigest()[:12]
    json.dump(m, open(mp, 'w'), indent=1); print('installed', ', '.join(made), '→', ASSETS, 'hash', m['hash'])
