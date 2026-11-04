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
# manifest.json (the old one kept first as <assets>/manifest.bak-<stamp>.json), with a new hash so browsers fetch them.
# --replace (knives only): a knife set already installed is moved to <assets>/fp.bak-<stamp>/ first, then the new one
# goes in (the back-up rule: nothing deleted; the asset pack leaves the *.bak-* copies out).
# The AUG's model is from CS2's October 2026 update (KV3 node types 26 / 27) which Source 2 Viewer 20.0 cannot read:
# kv3_compat.py rewrites a scratch copy first. Valve's files: they stay on this computer, never shipped.
import json, os, shutil, subprocess, sys, hashlib, time
H = os.path.expanduser('~/CS2-extract'); X = H + '/tools/s2v/Source2Viewer-CLI'; PAK = H + '/game/game/csgo/pak01_dir.vpk'; GI = H + '/game/game/csgo/gameinfo.gi'
C = H + '/export/clips/animation/anims/viewmodel'; GLOVE = os.environ.get('GLOVE', H + '/export/arms/glove_slick2.glb')
BPY = '/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13'; BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'; HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]; opt = lambda k, d: (argv.pop(argv.index(k) + 1), argv.remove(k))[0] if k in argv else d
ASSETS = os.path.abspath(opt('--assets', os.path.join(HERE, '..', '..', 'user-assets'))); WORK = os.path.abspath(opt('--work', os.path.join(os.environ.get('TMPDIR', '/tmp'), 'cs2-fp-missing')))
INSTALL = '--install' in argv; REPLACE = '--replace' in argv; ids = [a for a in argv if not a.startswith('--')]
STAMP = time.strftime('%Y%m%d-%H%M%S')
R, G, K = 'rifle/_default_rifle', 'grenade/_default_grenade', 'knife/_default_knife'
# id: (CS2 model path in pak01, own clip folder, default clip folder, kind, textures: colour / normal / rough / ao — the names Source 2 Viewer writes)
ITEMS = {
 'aug': ('weapons/models/aug/weapon_rif_aug', 'rifle/rifle_aug', R, 'gun', ('aug_default_color_psd_e209ca89', 'aug_default_normal_tga_31e3d49f', 'aug_default_rough_psd_3b83f877', 'aug_ao_tga_c1ddac19')),
 'decoy': ('weapons/models/grenade/decoy/weapon_decoy', None, G, 'nade', ('decoy_color_tga_98f734ae', 'decoy_normal_tga_73ed28cb', 'decoy_rough_tga_ccd5a76c', 'decoy_ao_tga_2329195e')),   # (CS2 has no decoy clips of its own: its graph plays the default grenade's)
 'incendiary': ('weapons/models/grenade/incendiary/weapon_incendiarygrenade', 'grenade/grenade_incendiary', G, 'nade', ('incendiary_grenade_color_tga_1a0321a7', 'incendiary_grenade_normal_tga_ed9c9b24', 'incendiary_grenade_rough_tga_cc1cc38a', 'incendiary_grenade_ao_tga_e55fed76')),
 # the molotov: its first-person set exists (build_all.py cs2_molotov); only the world model is new (other players' hands,
 # in flight, dropped: it was the CC0 bottle) — the bottle, its rag and its liquid hull on the bottle's own texture (as the
 # set paints them), without the lighter (left hand) or the flame card.
 'molotov': ('weapons/models/grenade/molotov/weapon_molotov', None, G, 'world', ('molotov_color_tga_799db119', 'molotov_normal_tga_f176d626', 'molotov_rough_tga_733f549c', 'molotov_ao_tga_e9ab63da')),
 # v53 KNIVES: CS2's Bayonet, Skeleton, Talon (CS2's class weapon_knife_widowmaker, model knife_talon), Flip and Nomad
 # (weapon_knife_outdoor) — first-person sets only, as the four star knives before them (build_all.py): their third-person
 # model is baked from the set at load (fp-view.js bakeKnife), so no world .bin. Textures: None = found in the export by
 # CS2's own suffixes (<name>_color_psd_*, _rough_psd_*, _ao_psd_*; the knives' normal is CS2's flat default_normal).
 'bayonet': ('weapons/models/knife/knife_bayonet/weapon_knife_bayonet', 'knife/knife_bayonet', K, 'knife', None),
 'skeleton': ('weapons/models/knife/knife_skeleton/weapon_knife_skeleton', 'knife/knife_skeleton', K, 'knife', None),
 'talon': ('weapons/models/knife/knife_talon/weapon_knife_talon', 'knife/knife_talon', K, 'knife', None),
 'flip': ('weapons/models/knife/knife_flip/weapon_knife_flip', 'knife/knife_flip', K, 'knife', None),
 'nomad': ('weapons/models/knife/knife_outdoor/weapon_knife_outdoor', 'knife/knife_outdoor', K, 'knife', None),
}
WORLD_ARGS = {'molotov': ['--drop-joints', 'lighter,lighter_flame,lighter_hinge,lighter_lever', '--drop-mats', 'flame']}
# The clips each kind plays (build_all.py's WANT: the game's clip name, CS2's file prefix, prefixes left out)
WANT = {'gun': [('idle', 'idle', ('slide_back', 'idle2', 'from_activity')), ('draw', 'draw', ('lookat', 'crouch', 'silenced')), ('fire', 'shoot1', ()), ('reload', 'reload', ('empty',)), ('inspect', 'lookat01', ('draw', 'transfix', 'lgcy'))],
        'nade': [('idle', 'idle', ()), ('draw', 'draw', ()), ('prime', 'pullpin', ()), ('throw', 'throw_overhand', ()), ('throwlow', 'throw_underhand', ()), ('inspect', 'lookat01', ())],
        # (v53 KNIVES: CS2's own knife clips, as viewmodel_knife.vnmgraph+<knife> plays them (decompiled with s2v):
        #  draw    — 'DeployOptions': a Parameterized Clip Selector on deploy_variation, option weights [1, 8, 1] over
        #            deploy0 = draw_<k>, deploy1 = draw2_<k>, deploy2 = none (m_bIgnoreInvalidOptions): where a knife has a
        #            draw2 (the Skeleton, the Nomad) it is the usual draw (8 in 9) and draw_<k> the rare one ('drawrare');
        #  light / light2 — LightMiss: a Parameterized Selector on attack_variation over light_miss1 / light_miss2;
        #  lighthit / lighthit2 — LightHit (light_hit1 / 2); backstab / backstab2 — LightBackstab (light_backstab / 2);
        #  heavy, heavyhit, heavystab — HeavyMiss (heavy_miss1), HeavyHit (heavy_hit1), HeavyBackstab (heavy_backstab);
        #  inspect / inspect2 — lookat01 / lookat02 (viewmodel_inspects graph, weights [2, 1, 1]); inspectdraw —
        #            lookat01_draw, the inspects graph's 'Draw' state (the Bayonet's and the Flip's), entered while the draw
        #            clip's WPN_INSPECT_USE_DRAW_VERSION event is on;
        #  idle    — idle1 (idle2 is CS2's idle breaker, not played here).
        # A prefix tuple: the first that the knife has. own: only the knife's own folder (no default-knife stand-in).)
        'knife': [('idle', 'idle', ('idle2',)), ('draw', ('draw2', 'draw'), ()), ('drawrare', 'draw', ('draw2',), 'own'),
                  ('light', 'light_miss1', ()), ('light2', 'light_miss2', ()), ('lighthit', 'light_hit1', ()), ('lighthit2', 'light_hit2', ()),
                  ('backstab', 'light_backstab', ('backstab2',)), ('backstab2', 'light_backstab2', ()),
                  ('heavy', 'heavy_miss1', ()), ('heavyhit', 'heavy_hit1', ()), ('heavystab', 'heavy_backstab', ()),
                  ('inspect', 'lookat01', ('lookat01_draw',)), ('inspect2', 'lookat02', (), 'own'), ('inspectdraw', 'lookat01_draw', (), 'own')]}
def pick(dirs, prefix, exclude=()):
    for pre in (prefix if isinstance(prefix, tuple) else (prefix,)):
        for d in dirs:
            if not d or not os.path.isdir(f'{C}/{d}'): continue
            for f in sorted(os.listdir(f'{C}/{d}')):
                if f.startswith(pre) and f.endswith('.glb') and 'non_additive' not in f and not any(x in f for x in exclude): return f'{C}/{d}/{f}'
def clip_list(gid):   # [(the game's clip name, CS2's clip file)] for an item (fp_sounds_add.py reads the same)
    model, own, dflt, kind, _ = ITEMS[gid]; out = []
    for w in WANT.get(kind, []):
        name, prefix, excl = w[:3]; p = pick([own] if w[3:] == ('own',) else [own, dflt], prefix, excl)
        if p: out.append((name, p))
    got = dict(out)   # (the rare draw only where the usual one is a draw2)
    return [(n, p) for n, p in out if n != 'drawrare' or 'draw2' in os.path.basename(got.get('draw', ''))]
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
    model, own, dflt, kind, tex = ITEMS[gid]; glb, d = export(gid, model); png = lambda n: os.path.join(d, n + '.png')
    if tex is None:   # (by suffix: the export's own texture names)
        fs = sorted(os.listdir(d)); by = lambda k: next((f[:-4] for f in fs if f.endswith('.png') and f'_{k}_' in f and not f.startswith('physics')), None)
        tex = (by('color'), by('normal') or 'default_normal_tga_4fc2d3dd', by('rough'), by('ao'))
    tc, tn, tr, ta = tex
    for n in (tc, tn, tr): assert os.path.exists(png(n)), f'{gid}: no {n}.png from the export'
    jobs = [{'out': os.path.join(d, 'color.jpg'), 'kind': 'rgb', 'src': png(tc), 'size': 2048}, {'out': os.path.join(d, 'normal.jpg'), 'kind': 'rgb', 'src': png(tn), 'size': 2048},
            {'out': os.path.join(d, 'orm.jpg'), 'kind': 'orm', 'src': png(tr), 'ao': png(ta) if os.path.exists(png(ta)) else None, 'size': 2048}]
    jf = os.path.join(d, 'tex.json'); json.dump(jobs, open(jf, 'w')); rc, log = run([BLENDER, '-b', '--factory-startup', '--python', os.path.join(HERE, 'textures.py'), '--', jf])
    if rc or not all(os.path.exists(j['out']) for j in jobs): sys.exit(f'{gid}: textures failed\n{log[-1500:]}')
    clips = [f'{name}={p}' for name, p in clip_list(gid)]; fp = None
    if kind != 'world':   # ('world': its set is already made — the world model only)
        # (a knife: its colour alone (CS2's normal is flat) and --weapon-ruby, the blade mask in vertex colours that
        # bakeKnife and the skins read — the four star knives' build_all.py options)
        wt = ['--weapon-tex', jobs[0]['out'], '--weapon-ruby', '1'] if kind == 'knife' else ['--weapon-tex', jobs[0]['out'] + ',' + jobs[1]['out']]
        if kind == 'knife':   # (its blade mask from CS2's own paint coverage, knife_mask.py: the Bayonet, Skeleton and Talon have no 'blade' bone to tell it)
            mk = os.path.join(d, 'mask.png'); rc, log = run([BPY, '-I', os.path.join(HERE, 'knife_mask.py'), model.split('/')[3], mk])
            if rc: sys.exit(f'{gid}: blade mask failed\n{log[-1500:]}')
            wt += ['--blade-mask', mk]
        fp = os.path.join(d, f'cs2_{gid}.glb'); rc, log = run([BPY, '-I', os.path.join(HERE, 'build_set.py'), '--glove-shared', '1'] + wt + [fp, GLOVE, glb] + clips)
        if rc: sys.exit(f'{gid}: first-person set failed\n{log[-1500:]}')
        print(gid, 'set', ' '.join(c.split('=')[0] + ':' + os.path.basename(c.split('=')[1]) for c in clips), os.path.getsize(fp) // 1024, 'KB')
    if kind == 'knife': made[gid] = (fp, None, jobs, None, [c.split('=')[0] for c in clips]); continue   # (no world model: see ITEMS)
    wb = os.path.join(d, f'{gid}.bin'); rc, log = run([BPY, '-I', os.path.join(HERE, 'world_bin.py'), glb, gid, wb] + WORLD_ARGS.get(gid, []))
    if rc: sys.exit(f'{gid}: world model failed\n{log[-1500:]}')
    info = json.loads(log.strip().splitlines()[-1]); print(gid, 'world', info); made[gid] = (fp, wb, jobs, info, [c.split('=')[0] for c in clips])
if INSTALL:
    # (the back-up rule: the manifest copied next to itself first — <assets>/manifest.bak-<stamp>.json, left out of the
    # asset pack — and to the work folder; v53 KNIVES final: it used to be kept only in the temporary work folder)
    mp = os.path.join(ASSETS, 'manifest.json'); m = json.load(open(mp)); bak = os.path.join(ASSETS, f'manifest.bak-{STAMP}.json'); shutil.copyfile(mp, new(bak)); shutil.copyfile(mp, os.path.join(WORK, f'manifest.before-{STAMP}.json')); print('manifest kept as', bak)
    for gid, (fp, wb, jobs, info, clips) in made.items():
        dst = os.path.join(ASSETS, 'fp', f'cs2_{gid}.glb')
        if fp and REPLACE and ITEMS[gid][3] == 'knife' and os.path.exists(dst):   # (--replace, a knife set made by this script before: the old one moved to <assets>/fp.bak-<stamp>/ first, never deleted)
            kd = os.path.join(ASSETS, f'fp.bak-{STAMP}'); os.makedirs(kd, exist_ok=True); shutil.move(dst, new(os.path.join(kd, f'cs2_{gid}.glb'))); print('old set kept as', os.path.join(kd, f'cs2_{gid}.glb'))
        if fp: shutil.copyfile(fp, new(dst))
        if fp: m['models'].setdefault('viewmodels', {})[f'cs2_{gid}'] = {'file': f'fp/cs2_{gid}.glb', 'from': f'CS2: its own view-model clips, Driver Gloves and {gid} model (Steam depot, converted on this computer)', 'bytes': os.path.getsize(fp), 'clips': clips}
        if not wb: continue   # (a knife: the set only)
        shutil.copyfile(wb, new(os.path.join(ASSETS, 'weapons', f'{gid}.bin')))
        for j, k in zip(jobs, ('base', 'normal', 'orm')): shutil.copyfile(j['out'], new(os.path.join(ASSETS, 'weapons', f'{gid}-main-{k}.jpg')))
        m['models'].setdefault('weapons', {})[gid] = {'file': f'weapons/{gid}.bin', 'maps': ['base', 'normal', 'orm'], 'tris': info['tris'], 'box': info['box'], 'from': f'CS2: {ITEMS[gid][0]}.vmdl (Steam depot, converted on this computer)'}
    m['hash'] = hashlib.sha1((m.get('hash', '') + str(time.time())).encode()).hexdigest()[:12]
    json.dump(m, open(mp, 'w'), indent=1); print('installed', ', '.join(made), '→', ASSETS, 'hash', m['hash'])
