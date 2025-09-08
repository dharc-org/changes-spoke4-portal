from flask import request
from flask_babel import Babel


def get_locale():
    """Select locale, preferring user cookie, then Accept-Language.

    Supports two locales: 'it' and 'en'.
    """
    # 1) Explicit user choice persisted in cookie
    cookie_lang = (request.cookies.get("lang") or "").lower()
    if cookie_lang in {"it", "en"}:
        return cookie_lang

    # 2) Fallback to browser preference
    language = request.accept_languages.best_match(["it", "en"]) or "it"
    return language


babel = Babel()
