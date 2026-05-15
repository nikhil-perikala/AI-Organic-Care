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

file_path = r"C:\Users\nikhi\OneDrive\Desktop\AI_Organic_Care\data\usda\FoodData_Central_csv_2026-04-30\food.csv"

with open(file_path, encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # skip header

    count = 0

    for row in reader:
        try:
            cursor.execute(
                "INSERT INTO food VALUES (%s, %s, %s, %s, %s)",
                row[:5]
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

print("✅ Food data loaded!")