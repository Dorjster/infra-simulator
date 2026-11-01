# KeyValues (KV1) text: items_game.txt, csgo_english.txt and decompiled .vmat files. Keeps duplicate keys.
# Only the text format lives here, no Valve data.
import re
TOK = re.compile(r'"((?:[^"\\]|\\.)*)"|(\{)|(\})|//[^\n]*|([^\s"{}]+)')


def parse(text):
    """-> nested list of (key, value) pairs; a value is a str or another list"""
    stack = [[]]; key = None
    for m in TOK.finditer(text):
        s, o, c, b = m.groups()
        if o:
            new = []; stack[-1].append((key, new)); stack.append(new); key = None
        elif c:
            if len(stack) > 1: stack.pop()
        elif s is not None or b is not None:
            v = s if s is not None else b
            if key is None: key = v
            else: stack[-1].append((key, v)); key = None
    return stack[0]


def get_all(node, k): return [v for kk, v in node if kk == k]


def get(node, k, default=None):
    for kk, v in node:
        if kk == k: return v
    return default


def flat(node):
    """the non-block pairs of a node as a dict (last wins)"""
    return {k: v for k, v in node if not isinstance(v, list)}


def vmat(text):
    """decompiled .vmat -> {'params': {...}, 'tex': {'g_tColor': 'materials/...vtex', ...}}"""
    root = parse(text); layer = root[0][1] if root and isinstance(root[0][1], list) else root
    params = flat(layer); tex = flat(get(layer, 'Compiled Textures', []) or [])
    return {'params': params, 'tex': tex}


def vec(s, n=4):
    """'[0.1 0.2 0.3 1.0]' -> [floats]"""
    v = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?(?:e-?\d+)?', s or '')]
    return (v + [0.0] * n)[:n]


def lang_tokens(text):
    """csgo_english.txt -> {lower-case token: string}"""
    root = parse(text); lang = get(root, 'lang') or get(root, 'Lang') or []
    toks = get(lang, 'Tokens') or get(lang, 'tokens') or []
    return {k.lower(): v for k, v in toks if isinstance(v, str)}
