from flask import Blueprint, render_template
import json
import os
from .extensions import get_locale

main = Blueprint('main', __name__)


@main.route("/")
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
