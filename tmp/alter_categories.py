import sys
import os

# Adjust path to import from backend
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import engine
from sqlalchemy import text

def add_image_url_column():
    with engine.connect() as conn:
        try:
            conn.execute(text('ALTER TABLE categories ADD COLUMN "imageUrl" VARCHAR;'))
            conn.commit()
            print("Successfully added imageUrl column to categories table.")
        except Exception as e:
            if 'already exists' in str(e).lower():
                print("Column already exists.")
            else:
                print(f"Error: {e}")

if __name__ == "__main__":
    add_image_url_column()
