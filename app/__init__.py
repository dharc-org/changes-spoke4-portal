from flask import Flask
from .extensions import babel, get_locale
from .routes import main


def create_app():
    app = Flask(__name__)
    app.jinja_env.globals['get_locale'] = get_locale
    app.config["BABEL_TRANSLATION_DIRECTORIES"] = "../translations"

    babel.init_app(app, locale_selector=get_locale)

    app.register_blueprint(main)

    return app
