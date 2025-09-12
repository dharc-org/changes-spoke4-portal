from flask import Blueprint, render_template, abort, jsonify, request, url_for, redirect, make_response
import json
import os
from .extensions import get_locale
from SPARQLWrapper import SPARQLWrapper, JSON
import math
import re
from urllib.parse import unquote

# Helpers to load and validate registry/configs

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, '..', 'data')


def _load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _validate_collections(collections):
    if not isinstance(collections, list):
        raise ValueError("collections.json must be a list")
    seen = set()
    for idx, c in enumerate(collections):
        if not isinstance(c, dict):
            raise ValueError(f"Collection at index {idx} is not an object")
        for key in ["id", "title_it", "title_en", "config_path"]:
            if key not in c:
                raise ValueError(
                    f"Collection '{c.get('id', f'#${idx}')}' missing key: {key}")
        if c["id"] in seen:
            raise ValueError(f"Duplicate collection id: {c['id']}")
        seen.add(c["id"])
        # header/description optional but if present should be dict
        for block in ["header", "description"]:
            if block in c and not isinstance(c[block], dict):
                raise ValueError(
                    f"Collection '{c['id']}' field '{block}' must be an object")
        # Ensure config file exists (relative to data/)
        cfg_path = os.path.join(DATA_DIR, c["config_path"]).replace("\\", "/")
        if not os.path.exists(cfg_path):
            raise ValueError(
                f"Missing config file for collection '{c['id']}': {cfg_path}")


def load_collections():
    path = os.path.join(DATA_DIR, 'collections.json')
    collections = _load_json(path)
    _validate_collections(collections)
    return collections


def get_collection(collection_id):
    collections = load_collections()
    return next((c for c in collections if c['id'] == collection_id), None)


def _validate_config(config, collection_id):
    if not isinstance(config, dict):
        raise ValueError(f"Config for '{collection_id}' must be an object")
    if 'sparql_endpoint' not in config or not isinstance(config['sparql_endpoint'], str):
        raise ValueError(
            f"Config for '{collection_id}' missing 'sparql_endpoint'")
    if 'cards' not in config or not isinstance(config['cards'], dict):
        raise ValueError(f"Config for '{collection_id}' missing 'cards' block")
    cards = config['cards']
    for key in ['select', 'where']:
        if key not in cards or not isinstance(cards[key], str):
            raise ValueError(
                f"Config for '{collection_id}' cards missing '{key}'")


main = Blueprint('main', __name__)


@main.route('/')
def homepage():
    collections = load_collections()

    lang = get_locale()
    title_key = f'title_{lang}'
    keywords_key = f'keywords_{lang}'
    for c in collections:
        c['display_title'] = c.get(title_key, c.get('title_it'))
        # Prepare localized keywords list if available
        if isinstance(c.get(keywords_key), list):
            c['display_keywords'] = c.get(keywords_key)
        elif isinstance(c.get('keywords_it'), list):
            c['display_keywords'] = c.get('keywords_it')
        else:
            c['display_keywords'] = []
    return render_template('homepage.html', collections=collections)


@main.route('/collection/<collection_id>')
def collection_home(collection_id):
    collections = load_collections()
    collection = next(
        (c for c in collections if c['id'] == collection_id), None)
    if not collection:
        abort(404)

    lang = get_locale()
    # Optional short nav title; fallback to localized title
    nav_title = collection.get(f'nav_title_{lang}', collection.get(
        f'title_{lang}', collection['title_it']))
    collection_data = {
        'id': collection['id'],
        'display_title': collection.get(f'title_{lang}', collection['title_it']),
        'header_title': collection['header'].get(f'title_{lang}', collection['header']['title_it']),
        'header_subtitle': collection['header'].get(f'subtitle_{lang}', collection['header']['subtitle_it']),
        'description_title': collection['description'].get(f'title_{lang}', collection['description']['title_it']),
        'description_text': collection['description'].get(f'text_{lang}', collection['description']['text_it']),
        'image': collection.get('image'),
        'nav_title': nav_title,
        # Derive links from routes to avoid drift/typos
        'overview_link': url_for('main.collection_overview', collection_id=collection['id']),
        'catalogue_link': url_for('main.catalogue', collection_id=collection['id']),
    }

    return render_template('collection_home.html', collection=collection_data)


@main.route('/collection/<collection_id>/overview')
def collection_overview(collection_id):
    # Ensure the collection exists
    collection = get_collection(collection_id)
    if not collection:
        abort(404)

    # Load config to fetch visualizations and overview copy
    config_path = os.path.join(
        DATA_DIR, collection["config_path"])  # absolute within repo
    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)

    visualizations = config.get('visualizations', [])
    overview = config.get('overview', {})
    lang = get_locale()
    nav_title = collection.get(f'nav_title_{lang}', collection.get(
        f'title_{lang}', collection['title_it']))
    return render_template(
        'collection_overview.html',
        visualizations=visualizations,
        overview=overview,
        lang=lang,
        collection_meta={
            'id': collection['id'],
            'image': collection.get('image'),
            'nav_title': nav_title
        }
    )


@main.route('/catalogue/<collection_id>')
def catalogue(collection_id):
    all_collections = load_collections()
    collection = next(
        (c for c in all_collections if c['id'] == collection_id), None)
    if not collection:
        abort(404)
    lang = get_locale()
    nav_title = collection.get(f'nav_title_{lang}', collection.get(
        f'title_{lang}', collection['title_it']))
    return render_template(
        'collection_catalogue.html',
        collection_id=collection_id,
        collection_meta={
            'id': collection['id'],
            'image': collection.get('image'),
            'nav_title': nav_title
        }
    )


@main.route("/api/<collection_id>/filters")
def get_filters(collection_id):
    print(collection_id)
    lang = get_locale()
    structure_only = request.args.get("structureOnly") == "true"

    all_collections = load_collections()
    collection = next(
        (c for c in all_collections if c["id"] == collection_id), None)
    if not collection:
        abort(404)

    config_path = os.path.join(
        DATA_DIR, collection["config_path"])  # absolute within repo
    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)
    _validate_config(config, collection_id)

    sparql = SPARQLWrapper(config['sparql_endpoint'])
    results = []

    for group in config["filters"]:
        entry = {
            "label": group.get(f"label_{lang}", group.get("label_it")),
            "key": group["key"],
            "type": group.get("type", "checkbox"),
        }

        if not structure_only:
            sparql = SPARQLWrapper(config["sparql_endpoint"])
            # Inject dynamic language when placeholder is present
            q = group.get("query", "")
            gtype = entry["type"]
            if gtype == "range":
                range_q = group.get("range_query")
                if range_q:
                    if "$LANG$" in range_q:
                        range_q = range_q.replace("$LANG$", lang)
                    sparql.setQuery(range_q)
                    sparql.setReturnFormat(JSON)
                    raw = sparql.query().convert()
                    b = raw["results"]["bindings"]
                    if b:
                        try:
                            mn = int(float(b[0]["min"]["value"]))
                            mx = int(float(b[0]["max"]["value"]))
                            entry["range"] = {"min": mn, "max": mx}
                        except Exception:
                            pass
            else:
                if "$LANG$" in q:
                    q = q.replace("$LANG$", lang)
                sparql.setQuery(q)
                sparql.setReturnFormat(JSON)
                raw = sparql.query().convert()
                entry["options"] = [
                    {"label": r.get("label", {}).get("value"),
                     "uri": r.get("uri", {}).get("value")}
                    for r in raw["results"]["bindings"]
                    if r.get("label") and r.get("uri")
                ]
        results.append(entry)

    return jsonify(results)


def _sparql_prefixes():
    return "\n".join([
        "PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>",
        "PREFIX lrmoo: <http://iflastandards.info/ns/lrm/lrmoo/>",
        "PREFIX aat: <http://vocab.getty.edu/page/aat/>",
        "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>",
    ])


def _build_cards_where(base_where: str, config_filters: list, selected: dict):
    """Combine base WHERE with filter triples and VALUES clauses.

    - base_where: string with core triple patterns (from config['cards']['where'])
    - config_filters: list of filter config objects
    - selected: dict mapping filter key -> list of selected URIs
    """
    parts = [base_where.strip()]
    if not isinstance(selected, dict):
        selected = {}
    # Attach triples/VALUES for each selected group
    for group in config_filters or []:
        key = group.get('key')
        sel_val = selected.get(key)
        if not sel_val:
            continue
        triples = (group.get('triples') or '').strip()
        gtype = (group.get('type') or 'checkbox').lower()
        if gtype == 'range' and isinstance(sel_val, dict):
            # Expect begin/end year overlap against provided min/max
            min_y = sel_val.get('min')
            max_y = sel_val.get('max')
            # No filter if both missing or invalid
            if min_y is None and max_y is None:
                continue
            if triples:
                parts.append(triples)
            begin_var = group.get('begin_var', '?begin')
            end_var = group.get('end_var', '?end')
            conds = []
            if isinstance(min_y, (int, float, str)) and str(min_y).strip():
                conds.append(f"YEAR({end_var}) >= {int(float(min_y))}")
            if isinstance(max_y, (int, float, str)) and str(max_y).strip():
                conds.append(f"YEAR({begin_var}) <= {int(float(max_y))}")
            if conds:
                parts.append(f"FILTER( {' && '.join(conds)} )")
            continue

        # Default: checkbox/URIs or literal VALUES
        values = sel_val
        var = group.get('var') or ''
        value_type = (group.get('value_type') or 'uri').lower()
        if triples:
            parts.append(triples)
        if var and isinstance(values, list) and values:
            if value_type == 'literal':
                def _q(s):
                    return '"' + str(s).replace('"', '\\"') + '"'
                encoded = " ".join(_q(v) for v in values)
            else:
                encoded = " ".join(f"<" + v + ">" for v in values)
            parts.append(f"VALUES {var} {{ {encoded} }}")
    return "\n".join(parts)


def _inject_lang(query: str, lang: str) -> str:
    """Replace $LANG$ placeholders and simple lang(?var) = "it|en" patterns.

    Keeps the rest of the query intact. Case-insensitive for the LANG function.
    """
    if not isinstance(query, str):
        return query
    out = query.replace("$LANG$", lang)
    # Replace patterns like: lang(?title) = "it" (or EN)
    out = re.sub(r'(?i)(lang\s*\(\s*\?[A-Za-z0-9_]+\s*\)\s*=\s*")(?:(?:it)|(?:en))("\s*)',
                 r"\1" + lang + r"\2", out)
    # Replace LANGMATCHES(lang(?x), "it") if present
    out = re.sub(r'(?i)(langmatches\s*\(\s*lang\s*\(\s*\?[A-Za-z0-9_]+\s*\)\s*,\s*")(?:(?:it)|(?:en))("\s*\))',
                 r"\1" + lang + r"\2", out)
    return out


@main.route("/api/<collection_id>/cards", methods=["POST"])
def api_cards(collection_id):
    """Return paginated cards for a collection, applying selected filters.

    Expects JSON body: { filters: {key: [uris]}, page: n }
    """
    collection = get_collection(collection_id)
    if not collection:
        abort(404)

    config_path = os.path.join(
        DATA_DIR, collection["config_path"])  # absolute within repo
    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)
    _validate_config(config, collection_id)

    body = request.get_json(silent=True) or {}
    selected = body.get('filters') or {}
    page = max(1, int(body.get('page') or 1))
    limit = int(config.get('cards', {}).get('limit', 24))
    offset = (page - 1) * limit
    lang = get_locale()

    # Build WHERE with filters
    base_where = _inject_lang(config['cards']['where'], lang)
    where = _build_cards_where(base_where, config.get('filters', []), selected)

    prefixes = _sparql_prefixes()

    # Count total distinct items
    count_query = f"""
{prefixes}
SELECT (COUNT(DISTINCT ?item) AS ?total)
WHERE {{
  {where}
}}
"""

    sparql = SPARQLWrapper(config['sparql_endpoint'])
    sparql.setReturnFormat(JSON)
    sparql.setQuery(count_query)
    count_raw = sparql.query().convert()
    total = 0
    try:
        total = int(count_raw['results']['bindings'][0]['total']['value'])
    except Exception:
        total = 0
    total_pages = max(1, math.ceil(total / limit))

    # Fetch page of cards
    select_clause = _inject_lang(config['cards']['select'], lang)
    # Order results alphabetically by title (case-insensitive). If the
    # configured SELECT doesn't expose ?title, fall back to ?label.
    order_var = "?title" if "?title" in select_clause else (
        "?label" if "?label" in select_clause else None)

    data_query = f"""
{prefixes}
SELECT DISTINCT {select_clause}
WHERE {{
  {where}
}}
{f'ORDER BY LCASE({order_var})' if order_var else ''}
LIMIT {limit}
OFFSET {offset}
"""
    sparql.setQuery(data_query)
    data_raw = sparql.query().convert()
    rows = data_raw['results']['bindings']

    def get_val(b, key):
        x = b.get(key)
        return x.get('value') if isinstance(x, dict) else None

    cards = []
    for b in rows:
        item = get_val(b, 'item') or get_val(b, 'id') or get_val(b, 'uri')
        title = get_val(b, 'title') or get_val(
            b, 'label') or (item or 'Untitled')
        # Pass through optional metadata when present in the SELECT
        begin = get_val(b, 'begin')
        end = get_val(b, 'end')
        technique_label = get_val(b, 'technique_label')
        conservation_org_label = get_val(b, 'conservation_org_label')
        cards.append({
            'id': item,
            'title': title,
            'begin': begin,
            'end': end,
            'technique_label': technique_label,
            'conservation_org_label': conservation_org_label,
            'summary': ''
        })

    return jsonify({'cards': cards, 'totalPages': total_pages})


@main.route('/set-language/<lang>')
def set_language(lang: str):
    """Persist user language preference in a cookie and redirect back.

    Only 'it' and 'en' are accepted; invalid values are ignored.
    """
    lang = (lang or '').lower()
    if lang not in {"it", "en"}:
        # Ignore invalid values; just go back without setting cookie
        target = request.referrer or url_for('main.homepage')
        return redirect(target)

    target = request.referrer or url_for('main.homepage')
    resp = make_response(redirect(target))
    # 180 days
    resp.set_cookie('lang', lang, max_age=60 * 60 *
                    24 * 180, path='/', samesite='Lax')
    return resp


@main.route('/collection/<collection_id>/item')
def item_detail(collection_id):
    """Simple item detail page using the same SELECT as cards.

    Expects query parameter `uri` with the item URI.
    """
    collection = get_collection(collection_id)
    if not collection:
        abort(404)

    item_uri = request.args.get('uri')
    if not item_uri:
        abort(400)
    # Decode potential encodings from the client
    item_uri = unquote(item_uri)

    config_path = os.path.join(
        DATA_DIR, collection["config_path"])  # absolute within repo
    with open(config_path, encoding='utf-8') as f:
        config = json.load(f)
    _validate_config(config, collection_id)

    lang = get_locale()
    prefixes = _sparql_prefixes()
    select_clause = _inject_lang(config['cards']['select'], lang)
    base_where = _inject_lang(config['cards']['where'], lang)
    # Constrain to single item
    where = base_where + f"\nVALUES ?item {{ <{item_uri}> }}\n"

    query = f"""
{prefixes}
SELECT DISTINCT {select_clause}
WHERE {{
  {where}
}}
LIMIT 1
"""
    sparql = SPARQLWrapper(config['sparql_endpoint'])
    sparql.setReturnFormat(JSON)
    sparql.setQuery(query)
    data_raw = sparql.query().convert()
    rows = data_raw['results']['bindings']

    def get_val(b, key):
        x = b.get(key)
        return x.get('value') if isinstance(x, dict) else None

    item = {
        'id': item_uri,
        'title': None,
        'begin': None,
        'end': None,
        'technique_label': None,
        'conservation_org_label': None,
    }
    if rows:
        b = rows[0]
        item.update({
            'title': get_val(b, 'title') or get_val(b, 'label') or item_uri,
            'begin': get_val(b, 'begin'),
            'end': get_val(b, 'end'),
            'technique_label': get_val(b, 'technique_label'),
            'conservation_org_label': get_val(b, 'conservation_org_label'),
        })

    lang = get_locale()
    nav_title = collection.get(f'nav_title_{lang}', collection.get(
        f'title_{lang}', collection['title_it']))
    return render_template(
        'item_detail.html',
        item=item,
        collection_meta={
            'id': collection['id'],
            'image': collection.get('image'),
            'nav_title': nav_title
        },
        item_api=config.get('item_api') or {}
    )
