from flask import Blueprint, render_template, request

main = Blueprint('main', __name__)


@main.route("/")
def homepage():
    return render_template("base.html")
