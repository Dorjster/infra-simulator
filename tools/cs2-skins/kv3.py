# KeyValues3 text (what `Source2Viewer-CLI -b DATA` prints for .vmat_c / .vcompmat_c) and the dump of many files in
# one run ("[i/N] path" headers). Only the text format and the material-parameter layout live here, no Valve data.
import re

_TOK = re.compile(r'\s*(?:(//[^\n]*)|(<!--.*?-->)|([{}\[\]=,])|"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*)(?::"((?:[^"\\]|\\.)*)")?|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?))', re.S)


def parse(text):
    toks = []
    for m in _TOK.finditer(text):
        com, hdr, p, s, ident, typed, num = m.groups()
        if com or hdr: continue
        if p: toks.append(('p', p))
        elif s is not None: toks.append(('v', s.encode().decode('unicode_escape') if '\\' in s else s))
        elif ident is not None:
            if typed is not None: toks.append(('v', typed))          # resource:"…", resource_name:"…"
            elif ident in ('true', 'false'): toks.append(('v', ident == 'true'))
            elif ident == 'null': toks.append(('v', None))
            else: toks.append(('i', ident))
        elif num is not None: toks.append(('v', float(num) if ('.' in num or 'e' in num.lower()) else int(num)))
    pos = [0]

    def val():
        t, v = toks[pos[0]]; pos[0] += 1
        if t == 'p' and v == '{':
            obj = {}
            while toks[pos[0]] != ('p', '}'):
                k = toks[pos[0]][1]; pos[0] += 1
                if toks[pos[0]] == ('p', '='): pos[0] += 1
                obj[k] = val()
            pos[0] += 1; return obj
        if t == 'p' and v == '[':
            arr = []
            while toks[pos[0]] != ('p', ']'):
                if toks[pos[0]] == ('p', ','): pos[0] += 1; continue
                arr.append(val())
            pos[0] += 1; return arr
        return v
    return val() if toks else None


def split_dump(text):
    """the output of one s2v -b DATA run over many files -> {vpk path: KV3 text of its DATA block}"""
    out = {}; parts = re.split(r'^\[\d+/\d+\] (\S+)\s*$', text, flags=re.M)
    for i in range(1, len(parts) - 1, 2):
        path, body = parts[i], parts[i + 1]; j = body.find('--- Data for block "DATA" ---')
        if j >= 0: out[path] = body[j + len('--- Data for block "DATA" ---'):]
    return out


def material(kv):
    """material DATA (KV3 dict) -> {'params': {name: number | [4 floats]}, 'tex': {name: vtex path}, 'attr': {name: str}}"""
    p, t, a = {}, {}, {}
    for e in kv.get('m_intParams', []) or []: p[e['m_name']] = e.get('m_nValue', 0)
    for e in kv.get('m_floatParams', []) or []: p[e['m_name']] = e.get('m_flValue', 0.0)
    for e in kv.get('m_vectorParams', []) or []: p[e['m_name']] = list(e.get('m_value', [0, 0, 0, 0]))
    for e in kv.get('m_textureParams', []) or []: t[e['m_name']] = e.get('m_pValue')
    for e in kv.get('m_stringAttributes', []) or []: a[e['m_name']] = e.get('m_value')
    return {'name': kv.get('m_materialName'), 'shader': kv.get('m_shaderName'), 'params': p, 'tex': t, 'attr': a}


def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values(): yield from walk(v)
    elif isinstance(o, list):
        for v in o: yield from walk(v)


def compmat(kv):
    """vcompmat DATA -> {'includes': [...], 'paint': vmat path | None, 'loose': {name: value}} (exposed variables override the
    paint material's parameters: colours become sRGB 0..1 floats like a vmat's, textures their runtime .vtex path)"""
    inc, paint, loose = [], None, {}
    for d in walk(kv):
        for r in d.get('m_vecCompMatIncludes', []) or []: inc.append(r)
        if d.get('m_strAlias') == 'paint' and d.get('m_strSpecificContainerMaterial'): paint = d['m_strSpecificContainerMaterial']
        if 'm_strName' in d and 'm_nVariableType' in d:
            n, ty = d['m_strName'], d['m_nVariableType']
            if ty.endswith('FLOAT1'): loose[n] = d.get('m_flValueFloatX', 0.0)
            elif ty.endswith('FLOAT2'): loose[n] = [d.get('m_flValueFloatX', 0.0), d.get('m_flValueFloatY', 0.0), 0.0, 0.0]
            elif ty.endswith('FLOAT3'): loose[n] = [d.get('m_flValueFloatX', 0.0), d.get('m_flValueFloatY', 0.0), d.get('m_flValueFloatZ', 0.0), 0.0]
            elif 'COLOR4' in ty: c = list(d.get('m_cValueColor4', [255, 255, 255])) + [255]; loose[n] = [c[0] / 255, c[1] / 255, c[2] / 255, c[3] / 255]
            elif 'INTEGER' in ty: loose[n] = d.get('m_nValueIntX', 0)
            elif 'BOOLEAN' in ty: loose[n] = 1 if d.get('m_bValueBoolean') else 0
            elif 'TEXTURE' in ty: loose[n] = d.get('m_strTextureRuntimeResourcePath')
    return {'includes': inc, 'paint': paint, 'loose': loose}
