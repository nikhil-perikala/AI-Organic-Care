import psycopg2
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

conn = psycopg2.connect(
    dbname="organic_care",
    user="organic_user",
    password="Nikhil@7",
    host="localhost",
    port="5432"
)

cursor = conn.cursor()

user_query = "low carb dinner"

response = client.embeddings.create(
    model="text-embedding-3-small",
    input=user_query
)

query_embedding = response.data[0].embedding

filters = []

query_lower = user_query.lower()

if "high protein" in query_lower:
    filters.append("protein > 10")

if "low carb" in query_lower:
    filters.append("carbs < 20")

if "low fat" in query_lower:
    filters.append("fat < 5")

filters.append("embedding IS NOT NULL")

filter_clause = "WHERE " + " AND ".join(filters)

sql = f"""
SELECT description, calories, protein, carbs, fat
FROM food_ai_search
{filter_clause}
ORDER BY 
    protein DESC,                 -- 🔥 prioritize protein first
    embedding <-> %s::vector      -- 🔥 then similarity
LIMIT 5;
"""

cursor.execute(sql, (query_embedding,))

results = cursor.fetchall()

for r in results:
    print(r)

cursor.close()
conn.close()