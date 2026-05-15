import os
import psycopg2
from dotenv import load_dotenv
from openai import OpenAI

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

BATCH_SIZE = 500

while True:
    cursor.execute("""
        SELECT fdc_id, search_text
        FROM food_ai_search
        WHERE embedding IS NULL
        LIMIT %s
    """, (BATCH_SIZE,))

    rows = cursor.fetchall()

    if not rows:
        print("✅ All embeddings generated!")
        break

    for fdc_id, text in rows:
        if not text:
            continue

        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )

        embedding = response.data[0].embedding

        cursor.execute("""
            UPDATE food_ai_search
            SET embedding = %s
            WHERE fdc_id = %s
        """, (embedding, fdc_id))

    conn.commit()
    print(f"✅ Processed {len(rows)} rows")

cursor.close()
conn.close()