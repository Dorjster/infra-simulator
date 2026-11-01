# Builds the catalogue of CS2 gloves this install has, read fresh from the user's own CS2 files each run: the eight
# paintable glove types (items_game "hands_paintable" items: CS2's English name, model) and every finish CS2 ships an
# econ icon for (default_generated/<item>_<kit>_light_png), with its paint kit id, English name, rarity, wear range,
# the composite material that paints it (gloves/paints/[volatile_02/]<kit>.vcompmat -> its "paint" .vmat) and that
# material's resolved parameters + texture paths. Output: JSON in the tool's work folder (local, never committed).
# usage (Blender's python, -I): catalog.py <pak01_dir.vpk> <Source2Viewer-CLI> <work dir> <out.json>
import sys, os, re, json, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(1, os.path.join(os.path.dirname(HERE), 'cs2-skins'))
from vpk import VPK
import kv, kv3

PAK, S2V, WORK, OUT = sys.argv[1:5]
os.makedirs(WORK, exist_ok=True)
v = VPK(PAK)


def text(p):
    b = v.read(p)
    if b.startswith(b'\xff\xfe') or b.startswith(b'\xfe\xff'): return b.decode('utf-16')
    return b.decode('utf-8-sig', 'replace')


ig = kv.get(kv.parse(text('scripts/items/items_game.txt')), 'items_game')
tok = kv.lang_tokens(text('resource/csgo_english.txt'))
loc = lambda k: tok.get((k or '').lstrip('#').lower())

# ---- glove items (prefab hands_paintable); the game's short id is the model folder: glove_<id>
types = {}
for blk in kv.get_all(ig, 'items'):
    for idx, body in blk:
        if not isinstance(body, list): continue
        d = kv.flat(body)
        if d.get('prefab') != 'hands_paintable': continue
        m = re.search(r'/glove_(\w+)/glove_\w+\.vmdl$', d.get('model_player', ''))
        if not m: continue
        types[m.group(1)] = dict(id=m.group(1), item=d['name'], defindex=int(idx), name=loc(d.get('item_name')) or d['name'], model=d['model_player'] + '_c', finishes={})

# ---- paint kits + rarity
kits = {}
for blk in kv.get_all(ig, 'paint_kits'):
    for idx, body in blk:
        if not isinstance(body, list): continue
        d = kv.flat(body); n = d.get('name')
        if n: kits[n] = dict(id=int(idx) if idx.isdigit() else idx, tag=d.get('description_tag'), wear=[float(d.get('wear_remap_min', 0.06)), float(d.get('wear_remap_max', 0.8))], vmt=d.get('vmt_path'))
rar_label, rar_value = {}, {}
for blk in kv.get_all(ig, 'rarities'):
    for k, body in blk:
        if isinstance(body, list): d = kv.flat(body); rar_label[k] = loc(d.get('loc_key')) or k; rar_value[k] = int(d.get('value', 0))
kit_rarity = {}
for blk in kv.get_all(ig, 'paint_kits_rarity'):
    for k, r in blk:
        if isinstance(r, str): kit_rarity[k] = r

# ---- material dump: one Source2Viewer-CLI run prints the DATA block of every glove material / composite as KV3 text
dump = os.path.join(WORK, 'glove-materials.txt')
if not os.path.exists(dump) or os.path.getmtime(dump) < os.path.getmtime(PAK):
    with open(dump + '.tmp', 'w') as f:
        subprocess.run(['nice', '-n', '10', S2V, '-i', PAK, '-f', 'gloves/,items/assets/paintkits/,characters/models/shared/arms/,workshop/paintkits/templates/',
                        '-e', 'vmat_c,vcompmat_c', '-b', 'DATA'], stdout=f, stderr=subprocess.DEVNULL, check=True)
    os.replace(dump + '.tmp', dump)
D = kv3.split_dump(open(dump, encoding='utf-8', errors='replace').read())
comp_by_kit = {}
for p in D:
    if p.startswith('gloves/paints/') and p.endswith('.vcompmat_c'): comp_by_kit.setdefault(os.path.basename(p)[:-len('.vcompmat_c')], p)
_mat = {}


def mat(path):
    if not path: return None
    p = path.replace('\\', '/'); p = p if p.endswith('_c') else p + '_c'
    if p not in _mat: _mat[p] = kv3.material(kv3.parse(D[p])) if p in D else None
    return _mat[p]


def instance_vars(kc):
    """the composite's own per-finish values: loose variables of its "instance_params" containers (not the SET_VALUE
    instructions of its texture generators, which kv3.compmat() also walks)"""
    out = {}
    for d in kv3.walk(kc):
        if d.get('m_strAlias') != 'instance_params': continue
        sub = kv3.compmat({'m_vecLooseVariables': d.get('m_vecLooseVariables', [])})['loose']
        out.update({k: val for k, val in sub.items() if not k.startswith(('bSync', 'consumable_', 'g_nSeed'))})
    return out


# ---- econ icons: default_generated/<item>_<kit>_{light,medium,heavy}_png
ICON = 'panorama/images/econ/default_generated/'
problems = []
by_item = sorted(types.values(), key=lambda t: -len(t['item']))
for p in v.find(ICON, '_light_png.vtex_c'):
    s = p[len(ICON):-len('_light_png.vtex_c')]
    t = next((t for t in by_item if s.startswith(t['item'] + '_') and s[len(t['item']) + 1:] in kits), None)
    if not t: continue
    kit = s[len(t['item']) + 1:]; k = kits[kit]; comp = comp_by_kit.get(kit)
    if not comp: problems.append(f'{t["id"]}/{kit}: no composite material'); continue
    kc = kv3.parse(D[comp]); c = kv3.compmat(kc)
    if not c['paint']:   # newer composites name the paint as a loose resource variable (alias "paint": m_strResourceMaterial)
        c['paint'] = next((d['m_strResourceMaterial'] for d in kv3.walk(kc) if d.get('m_strResourceMaterial')), None)
    m = mat(c['paint'])
    if m is None: problems.append(f'{t["id"]}/{kit}: paint material {c["paint"]} missing'); continue
    params = dict(m['params']); tex = dict(m['tex'])
    for n, val in instance_vars(kc).items():
        if n.startswith('g_t') and isinstance(val, str): tex[n] = val
        else: params[n] = val
    layers = {}
    for i in range(1, 5):   # the textile layer materials the paint names (the new shader reads its per-layer values from them too)
        ln = m['attr'].get(f'layer_name_{i}'); lm = mat(ln) if ln else None
        if lm: layers[i] = dict(path=ln.replace('\\', '/'), shader=lm['shader'], params=lm['params'], tex=lm['tex'])
    r = kit_rarity.get(kit, 'ancient')
    icons = {w: ICON + f'{s}_{w}_png.vtex_c' for w in ('light', 'medium', 'heavy') if v.has(ICON + f'{s}_{w}_png.vtex_c')}
    t['finishes'][kit] = dict(kit=kit, id=k['id'], name=loc(k['tag']) or kit, rarity=r, rarityName=rar_label.get(r, r), rarityValue=rar_value.get(r, 0), wear=k['wear'],
                              comp=comp, paint=c['paint'], shader=m['shader'], params=params, tex=tex, layers=layers, icons=icons)
# the glove's own materials (left / right hand): attribute "left", the normal map it draws with
for t in types.values():
    base = os.path.dirname(t['model'].replace('agents/models/', 'characters/models/')) + '/materials/'
    t['materials'] = {}
    for hand in ('left', 'right'):
        m = mat(base + f'glove_{t["id"]}_{hand}.vmat')
        if m: t['materials'][hand] = dict(path=base + f'glove_{t["id"]}_{hand}.vmat', tex=m['tex'], params={k: m['params'][k] for k in m['params'] if not k.startswith('g_n')})
    if not t['finishes']: problems.append(f'{t["id"]}: no finishes')
out = dict(pak=dict(size=os.path.getsize(PAK), mtime=os.path.getmtime(PAK)), types=types, problems=problems)
json.dump(out, open(OUT + '.tmp', 'w'), indent=0); os.replace(OUT + '.tmp', OUT)
print('CATALOG ' + json.dumps({k: len(t['finishes']) for k, t in types.items()}) + (' problems: ' + '; '.join(problems[:20]) if problems else ''))
