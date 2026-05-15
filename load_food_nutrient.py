import psycopg2
import csv

conn = psycopg2.connect(
    dbname="organic_care",
    user="organic_user",
    password="Nikhil@7",
    host="localhost",
    port="5432"
)

cursor = conn.cursor()

# 👇 THIS WAS MISSING
file_path = r"C:\Users\nikhi\OneDrive\Desktop\AI_Organic_Care\data\usda\FoodData_Central_csv_2026-04-30\food_nutrient.csv"

with open(file_path, encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)

    count = 0

    for row in reader:
        amount = row[3] if row[3] != "" else None

        try:
            cursor.execute(
                """
                INSERT INTO food_nutrient VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (row[0], row[1], row[2], amount)
            )

            count += 1

            if count % 10000 == 0:
                conn.commit()
                print(f"Inserted {count} rows...")

        except Exception as e:
            conn.rollback()

conn.commit()
cursor.close()
conn.close()

print("✅ Food_nutrient data loaded!")