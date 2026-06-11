#!/usr/bin/env python3
"""
Hilfsfunktionen für die Datenbankverbindung im Downloader.
Liest Verbindungsparameter aus Umgebungsvariablen (wie der Radio-Server).
"""

import os
import pymysql
import pymysql.cursors

def get_connection():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "database"),
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ.get("DB_USER", "metawave_user"),
        password=os.environ.get("DB_PASS", ""),
        database=os.environ.get("DB_NAME", "database_metawave"),
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10,
    )

def fetch_active_playlists():
    """Gibt alle aktiven Playlists aus der Datenbank zurück."""
    conn = get_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, name, url FROM playlists WHERE is_active = TRUE ORDER BY created_at ASC"
            )
            return cursor.fetchall()
    finally:
        conn.close()
