import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    # Allow overriding port via PORT or FLASK_RUN_PORT env vars
    # Default to 5050 to avoid conflicts with 5000 (Flask default) and 3030 (Fuseki)
    port = int(os.environ.get('PORT')
               or os.environ.get('FLASK_RUN_PORT') or 5050)
    host = os.environ.get('HOST', '127.0.0.1')
    app.run(debug=True, host=host, port=port)
