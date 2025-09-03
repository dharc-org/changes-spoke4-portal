from flask import Blueprint, render_template, abort, jsonify, request, url_for
import json
import os
from .extensions import get_locale
from SPARQLWrapper import SPARQLWrapper, JSON
import math

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
    for c in collections:
        c['display_title'] = c.get(title_key, c.get('title_it'))
    return render_template('homepage.html', collections=collections)


@main.route('/collection/<collection_id>')
def collection_home(collection_id):
    collections = load_collections()
    collection = next(
        (c for c in collections if c['id'] == collection_id), None)
    if not collection:
        abort(404)

    lang = get_locale()
    collection_data = {
        'id': collection['id'],
        'display_title': collection.get(f'title_{lang}', collection['title_it']),
        'header_title': collection['header'].get(f'title_{lang}', collection['header']['title_it']),
        'header_subtitle': collection['header'].get(f'subtitle_{lang}', collection['header']['subtitle_it']),
        'description_title': collection['description'].get(f'title_{lang}', collection['description']['title_it']),
        'description_text': collection['description'].get(f'text_{lang}', collection['description']['text_it']),
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
    return render_template(
        'collection_overview.html',
        visualizations=visualizations,
        overview=overview,
        lang=lang
    )


@main.route('/catalogue/<collection_id>')
def catalogue(collection_id):
    all_collections = load_collections()
    collection = next(
        (c for c in all_collections if c['id'] == collection_id), None)
    if not collection:
        abort(404)

    return render_template('collection_catalogue.html', collection_id=collection_id)


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
        }

        if not structure_only:
            sparql = SPARQLWrapper(config["sparql_endpoint"])
            sparql.setQuery(group["query"])
            sparql.setReturnFormat(JSON)
            raw = sparql.query().convert()
            entry["options"] = [
                {"label": r["label"]["value"], "uri": r["uri"]["value"]}
                for r in raw["results"]["bindings"]
            ]

        results.append(entry)

    return jsonify(results)
