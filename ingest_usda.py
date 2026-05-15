import requests
import psycopg2
import json

# DB connection
conn = psycopg2.connect(
    dbname="organic_care",
    user="organic_user",
    password="Nikhil@7",
    host="localhost",
    port="5432"
)

cursor = conn.cursor()

API_KEY = "hJ0qbdZ2YbGjUgJlW9H4CUc2xygvEQ8gx7CdnEQJ"

def fetch_foods(query):
    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {
        "api_key": API_KEY,
        "query": query,
        "pageSize": 5
    }
    response = requests.get(url, params=params)
    return response.json().get("foods", [])

def save_food(food):
    cursor.execute("""
        INSERT INTO usda_foods (fdc_id, description, data_type, raw_json)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (fdc_id) DO NOTHING;
    """, (
        food.get("fdcId"),
        food.get("description"),
        food.get("dataType"),
        json.dumps(food)
    ))

queries = ["apple", "banana", "milk"]

for q in queries:
    foods = fetch_foods(q)
    for food in foods:
        save_food(food)

conn.commit()
cursor.close()
conn.close()

print("✅ Data inserted successfully!")