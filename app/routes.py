from flask import Blueprint, render_template, abort, jsonify, request
import json
import os
from .extensions import get_locale
from SPARQLWrapper import SPARQLWrapper, JSON

main = Blueprint('main', __name__)


@main.route('/')
def homepage():
    base_path = os.path.dirname(__file__)
    data_path = os.path.join(base_path, '..', 'data', 'collections.json')
    with open(data_path, encoding='utf-8') as f:
        collections = json.load(f)

    lang = get_locale()
    title_key = f'title_{lang}'
    for c in collections:
        c['display_title'] = c.get(title_key, c.get('title_it'))
    return render_template('homepage.html', collections=collections)


@main.route('/collection/<collection_id>')
def collection_home(collection_id):

    base_path = os.path.dirname(__file__)
    data_path = os.path.join(base_path, '..', 'data', 'collections.json')
    print("Loading collections from:", os.path.abspath(data_path))
    with open(data_path, encoding='utf-8') as f:
        collections = json.load(f)

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
        'overview_link': collection['links']['overview'],
        'catalogue_link': collection['links']['catalogue'],
    }

    return render_template('collection_home.html', collection=collection_data)


@main.route('/catalogue/<collection_id>')
def catalogue(collection_id):
    with open('data/collections.json') as f:
        all_collections = json.load(f)

    # Find matching collection config
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

    with open("data/collections.json") as f:
        all_collections = json.load(f)
    collection = next(
        (c for c in all_collections if c["id"] == collection_id), None)
    if not collection:
        abort(404)

    config_path = os.path.join("data", collection["config_path"])
    with open(config_path) as f:
        config = json.load(f)

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
