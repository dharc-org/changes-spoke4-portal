from flask import request
from flask_babel import Babel


def get_locale():
    language = request.accept_languages.best_match(['it', 'en'])
    print('Selected language', language)
    return language


babel = Babel()
