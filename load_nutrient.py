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

file_path = r"C:\Users\nikhi\OneDrive\Desktop\AI_Organic_Care\data\usda\FoodData_Central_csv_2026-04-30\nutrient.csv"

with open(file_path, encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)

    for row in reader:
        rank = row[4] if row[4] != "" else None

        cursor.execute(
            "INSERT INTO nutrient VALUES (%s, %s, %s, %s, %s)",
            (row[0], row[1], row[2], row[3], rank)
        )

conn.commit()
cursor.close()
conn.close()

print("✅ Nutrient data loaded!")