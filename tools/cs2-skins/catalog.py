# Builds the catalogue of CS2 finishes this install can paint on the game's weapons, read fresh from the user's own CS2
# files each run (items_game.txt, csgo_english.txt, the paint materials): which kit fits which gun / star knife, its
# name, rarity, style, wear range, legacy flag and the resolved composite parameters + texture paths, plus each model's
# composite inputs. Output: a JSON file in the tool's work folder (local, git-ignored); nothing from it is committed.
# usage (Blender's python, -I): catalog.py <pak01_dir.vpk> <Source2Viewer-CLI> <work dir> <out.json> <models.json>
# models.json (written by tools/import-cs2-skins.mjs: identifiers only) maps game ids to CS2 model / item class names.
import sys, os, re, json, subprocess, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vpk import VPK
import kv, kv3

PAK, S2V, WORK, OUT, MODELS = sys.argv[1:6]
os.makedirs(WORK, exist_ok=True)
v = VPK(PAK); models = json.load(open(MODELS))


def text(p):
    b = v.read(p)
    if b.startswith(b'\xff\xfe') or b.startswith(b'\xfe\xff'): return b.decode('utf-16')
    return b.decode('utf-8-sig', 'replace')


ig = kv.get(kv.parse(text('scripts/items/items_game.txt')), 'items_game')
tok = kv.lang_tokens(text('resource/csgo_english.txt'))
loc = lambda k: tok.get((k or '').lstrip('#').lower())

# ---- paint kits
kits = {}
for blk in kv.get_all(ig, 'paint_kits'):
    for idx, body in blk:
        if not isinstance(body, list): continue
        d = kv.flat(body); n = d.get('name')
        if not n or n == 'default' or n == 'workshop_default': continue
        kits[n] = dict(id=int(idx) if idx.isdigit() else idx, style=int(float(d.get('style', 0) or 0)), wear=[float(d.get('wear_remap_min', 0.06)), float(d.get('wear_remap_max', 0.8))],
                       legacy=d.get('use_legacy_model') == '1', tag=d.get('description_tag'))
# rarity labels (items_game rarities -> their English weapon label) and per-kit rarity
rar_label, rar_value = {}, {}
for blk in kv.get_all(ig, 'rarities'):
    for k, body in blk:
        if isinstance(body, list): d = kv.flat(body); rar_label[k] = loc(d.get('loc_key_weapon')) or k; rar_value[k] = int(d.get('value', 0))
kit_rarity = {}
for blk in kv.get_all(ig, 'paint_kits_rarity'):
    for k, r in blk:
        if isinstance(r, str): kit_rarity[k] = r
# client loot lists: "[kit]weapon_x" under a list whose name ends in a rarity
loot = collections.defaultdict(dict)
RARS = sorted(rar_value, key=len, reverse=True)
for blk in kv.get_all(ig, 'client_loot_lists'):
    for lname, body in blk:
        if not isinstance(body, list): continue
        r = next((x for x in RARS if lname.endswith('_' + x)), None)
        for k, _ in body:
            m = re.match(r'\[([^\]]+)\](weapon_\w+)', k)
            if m and m.group(1) in kits:
                cur = loot[m.group(2)].get(m.group(1)); loot[m.group(2)][m.group(1)] = r if (cur is None or (r and rar_value.get(r, 0) > rar_value.get(cur, 0))) else cur
# econ icons this install has (default_generated/weapon_<class>_<kit>_light_png)
ICON = 'panorama/images/econ/default_generated/'
icons = collections.defaultdict(set); classes = sorted({m['cls'] for m in models.values()}, key=len, reverse=True)
for p in v.find(ICON, '_light_png.vtex_c'):
    s = p[len(ICON):-len('_light_png.vtex_c')]
    for c in classes:
        if s.startswith(c + '_') and s[len(c) + 1:] in kits: icons[c].add(s[len(c) + 1:]); break

# ---- materials: one Source2Viewer-CLI run prints the DATA block of every paint / composite material as KV3 text
dump = os.path.join(WORK, 'materials.txt')
if not os.path.exists(dump) or os.path.getmtime(dump) < os.path.getmtime(PAK):
    with open(dump + '.tmp', 'w') as f:
        subprocess.run(['nice', '-n', '10', S2V, '-i', PAK, '-f', 'materials/models/weapons/customization/,weapons/paints/,workshop/paintkits/templates/,weapons/models/', '-e', 'vmat_c,vcompmat_c', '-b', 'DATA'], stdout=f, stderr=subprocess.DEVNULL, check=True)
    os.replace(dump + '.tmp', dump)
D = kv3.split_dump(open(dump, encoding='utf-8', errors='replace').read())
comp_by_name = collections.defaultdict(list)
for p in D:
    if p.endswith('.vcompmat_c'): comp_by_name[os.path.basename(p)[:-len('.vcompmat_c')]].append(p)
_mat = {}


def mat(path):
    if path is None: return None
    p = path if path.endswith('_c') else path + '_c'
    if p not in _mat: _mat[p] = kv3.material(kv3.parse(D[p])) if p in D else None
    return _mat[p]


def resolve(kit):
    """-> (F, params, tex, source) for a kit, or None"""
    k = kits[kit]; cands = comp_by_name.get(kit, [])
    cands.sort(key=lambda p: (('/legacy/' in p) != k['legacy'], len(p)))
    loose, paint = {}, None
    if cands:
        c = kv3.compmat(kv3.parse(D[cands[0]])); paint, loose = c['paint'], c['loose']
    if not paint: paint = f'materials/models/weapons/customization/paints/vmats/{kit}.vmat'
    m = mat(paint)
    if m is None: return None
    params = dict(m['params']); tex = dict(m['tex'])
    for n, val in loose.items():
        if n.startswith('g_t'): tex[n] = val
        else: params[n] = val
    F = int(params.get('F_PAINT_STYLE', k['style'] - 1)) if 'F_PAINT_STYLE' in params else k['style'] - 1
    return F, params, tex, (cands[0] if cands else paint)


def composite(path):
    m = mat(path)
    if not m: return None
    t, pr = m['tex'], m['params']
    return dict(path=path, uvscale=float(pr.get('g_flUvScale1', 1)), len=float(pr.get('g_flWeaponLength1', 32)),
                color=t.get('g_tColor'), metal=t.get('g_tMetalness'), ao=t.get('g_tAmbientOcclusion'), masks=t.get('g_tMasks'), pos=t.get('g_tPosition'), surface=t.get('g_tSurface'),
                preview=m['attr'].get('PreviewModel'))


hd_comp = {}
for p in D:
    if p.endswith('_composite_inputs.vmat_c') and p.startswith('weapons/models/'):
        c = composite(p); mdl = os.path.basename(c['preview'] or '').replace('.vmdl', '')
        if mdl and (mdl not in hd_comp or len(p) < len(hd_comp[mdl]['path'])): hd_comp[mdl] = c


def name_of(kit):
    n = loc(kits[kit]['tag']) or kit
    m = re.search(r'phase(\d)', kit)
    if m: n += ' Phase ' + m.group(1)
    for g, label in (('ruby', 'Ruby'), ('sapphire', 'Sapphire'), ('emerald', 'Emerald'), ('blackpearl', 'Black Pearl'), ('black_pearl', 'Black Pearl')):
        if g in kit and label not in n: n += ' (' + label + ')'; break
    return n


def entry(kit, rarity):
    r = resolve(kit)
    if r is None: return None
    F, params, tex, src = r; k = kits[kit]
    return dict(kit=kit, id=k['id'], name=name_of(kit), F=F, style=k['style'], wear=k['wear'], legacy=k['legacy'], rarity=rarity, rarityName=rar_label.get(rarity, rarity),
                rarityValue=rar_value.get(rarity, 0), params=params, tex=tex, src=src)


out = dict(pak=dict(size=os.path.getsize(PAK), mtime=os.path.getmtime(PAK)), weapons={}, knives={}, shared={}, problems=[])
g = mat('materials/models/weapons/customization/paints/vmats/cu_ak47_cobra.vmat')
out['shared']['grunge'] = (g or {}).get('tex', {}).get('g_tGrunge'); out['shared']['wear'] = (g or {}).get('tex', {}).get('g_tWear')
for gid, m in models.items():
    cls = m['cls']; ks = set(loot.get(cls, {})) | icons.get(cls, set())
    if m['kind'] == 'knife':
        c = composite(m['composite'])
        if not c: out['problems'].append(f'{gid}: no composite inputs ({m["composite"]})'); continue
        fins = {}
        for kit in sorted(ks):
            e = entry(kit, 'ancient')
            if e is None: out['problems'].append(f'{gid}/{kit}: paint material missing'); continue
            toks = [t for t in kit.split('_') if t not in m['infix']]; fam = '_'.join(toks)
            e['family'] = fam; e['icon'] = ICON + f'{cls}_{kit}_light_png.vtex_c' if kit in icons.get(cls, ()) else None
            fins[kit] = e
        out['knives'][gid] = dict(cls=cls, model=m['model'], composite=c, finishes=fins, base=dict(color=c['color'], metal=c['metal'], ao=c['ao']))
    else:
        hd = hd_comp.get(m['model']); leg = composite(m['legacy_composite']) if m.get('legacy_composite') else None
        if not hd: out['problems'].append(f'{gid}: no HD composite inputs for {m["model"]}'); continue
        fins = {}
        for kit in sorted(ks):
            rr = loot.get(cls, {}).get(kit) or kit_rarity.get(kit) or 'common'
            e = entry(kit, rr)
            if e is None: out['problems'].append(f'{gid}/{kit}: paint material missing'); continue
            e['icon'] = ICON + f'{cls}_{kit}_light_png.vtex_c' if kit in icons.get(cls, ()) else None
            e['iconHeavy'] = ICON + f'{cls}_{kit}_heavy_png.vtex_c' if v.has(ICON + f'{cls}_{kit}_heavy_png.vtex_c') else None
            fins[kit] = e
        out['weapons'][gid] = dict(cls=cls, model=m['model'], composite=hd, legacy=leg, finishes=fins)
# one finish under several kit names on different knives (_b, _90, _fine, _prisma variants): one family, keyed by the shortest
byname = collections.defaultdict(list)
for k in out['knives'].values():
    for e in k['finishes'].values(): byname[e['name']].append(e)
for es in byname.values():
    key = min((e['family'] for e in es), key=lambda f: (len(f), f))
    for e in es: e['family'] = key
json.dump(out, open(OUT, 'w'), indent=0)
print(json.dumps(dict(weapons={k: len(w['finishes']) for k, w in out['weapons'].items()}, knives={k: len(w['finishes']) for k, w in out['knives'].items()}, problems=out['problems'][:30])))
