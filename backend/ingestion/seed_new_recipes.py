"""
Adds 5 new detailed recipes to the database.
Run: docker exec organic_care_backend python -m ingestion.seed_new_recipes
"""
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.recipe import Recipe, Ingredient, RecipeIngredient
from app.services.embedding_service import embed_text

NEW_INGREDIENTS = [
    {"name": "Organic Spinach", "category": "Leafy Greens", "health_benefits": ["iron", "magnesium", "folate"], "ailment_tags": ["fatigue", "anemia"], "efficacy_score": 0.9, "is_organic": True},
    {"name": "Organic Coconut Milk", "category": "Dairy Alternatives", "health_benefits": ["MCT fats", "energy", "antimicrobial"], "ailment_tags": ["fatigue", "gut health"], "efficacy_score": 0.80, "is_organic": True},
    {"name": "Organic Cinnamon", "category": "Spices & Herbs", "health_benefits": ["blood sugar balance", "anti-inflammatory", "antioxidant"], "ailment_tags": ["inflammation", "blood sugar"], "efficacy_score": 0.82, "is_organic": True},
    {"name": "Organic Dates", "category": "Fruits", "health_benefits": ["natural sugars", "fiber", "magnesium", "potassium"], "ailment_tags": ["fatigue", "low energy"], "efficacy_score": 0.79, "is_organic": True},
    {"name": "Organic Pumpkin Seeds", "category": "Nuts & Seeds", "health_benefits": ["zinc", "magnesium", "tryptophan"], "ailment_tags": ["insomnia", "stress", "immune support"], "efficacy_score": 0.83, "is_organic": True},
    {"name": "Organic Apple Cider Vinegar", "category": "Condiments", "health_benefits": ["gut health", "blood sugar balance", "antimicrobial"], "ailment_tags": ["bloating", "gut health", "digestion"], "efficacy_score": 0.78, "is_organic": True},
    {"name": "Organic Chickpeas", "category": "Legumes", "health_benefits": ["plant protein", "fiber", "folate", "magnesium"], "ailment_tags": ["fatigue", "gut health", "blood sugar"], "efficacy_score": 0.84, "is_organic": True},
    {"name": "Organic Olive Oil", "category": "Oils", "health_benefits": ["monounsaturated fats", "antioxidants", "anti-inflammatory"], "ailment_tags": ["inflammation", "heart health"], "efficacy_score": 0.87, "is_organic": True},
    {"name": "Organic Cumin", "category": "Spices & Herbs", "health_benefits": ["digestive", "iron", "anti-inflammatory"], "ailment_tags": ["bloating", "gut health", "fatigue"], "efficacy_score": 0.76, "is_organic": True},
    {"name": "Organic Mint", "category": "Herbs & Teas", "health_benefits": ["cooling", "digestive", "anti-nausea"], "ailment_tags": ["bloating", "nausea", "headache"], "efficacy_score": 0.74, "is_organic": True},
    # Re-reference existing ingredients by name (won't re-create if they exist)
    {"name": "Organic Turmeric", "category": "Spices & Herbs", "health_benefits": ["curcumin", "anti-inflammatory"], "ailment_tags": ["inflammation"], "efficacy_score": 0.91, "is_organic": True},
    {"name": "Organic Ginger", "category": "Spices & Herbs", "health_benefits": ["anti-nausea", "digestive"], "ailment_tags": ["bloating", "gut health"], "efficacy_score": 0.92, "is_organic": True},
    {"name": "Organic Lemon", "category": "Citrus", "health_benefits": ["vitamin C"], "ailment_tags": ["immune support"], "efficacy_score": 0.82, "is_organic": True},
    {"name": "Organic Honey", "category": "Sweeteners", "health_benefits": ["antibacterial", "soothing"], "ailment_tags": ["cold", "immune support"], "efficacy_score": 0.80, "is_organic": True},
    {"name": "Organic Oats", "category": "Whole Grains", "health_benefits": ["beta-glucan", "fiber"], "ailment_tags": ["gut health", "fatigue"], "efficacy_score": 0.84, "is_organic": True},
    {"name": "Organic Banana", "category": "Fruits", "health_benefits": ["potassium", "tryptophan"], "ailment_tags": ["fatigue", "insomnia"], "efficacy_score": 0.83, "is_organic": True},
    {"name": "Organic Almonds", "category": "Nuts & Seeds", "health_benefits": ["magnesium", "vitamin E"], "ailment_tags": ["fatigue", "stress"], "efficacy_score": 0.85, "is_organic": True},
    {"name": "Organic Blueberries", "category": "Berries", "health_benefits": ["antioxidants", "cognitive support"], "ailment_tags": ["brain fog", "inflammation"], "efficacy_score": 0.89, "is_organic": True},
    {"name": "Organic Kale", "category": "Leafy Greens", "health_benefits": ["vitamin C", "vitamin K"], "ailment_tags": ["immune support", "inflammation"], "efficacy_score": 0.88, "is_organic": True},
    {"name": "Organic Garlic", "category": "Alliums", "health_benefits": ["allicin", "immune boosting"], "ailment_tags": ["immune support", "cold"], "efficacy_score": 0.90, "is_organic": True},
    {"name": "Organic Lentils", "category": "Legumes", "health_benefits": ["iron", "protein", "fiber"], "ailment_tags": ["fatigue", "gut health"], "efficacy_score": 0.85, "is_organic": True},
    {"name": "Black Pepper", "category": "Spices & Herbs", "health_benefits": ["piperine"], "ailment_tags": ["digestion"], "efficacy_score": 0.75, "is_organic": False},
    {"name": "Organic Coconut Oil", "category": "Oils", "health_benefits": ["MCT fats", "energy"], "ailment_tags": ["fatigue"], "efficacy_score": 0.78, "is_organic": True},
    {"name": "Organic Chia Seeds", "category": "Seeds", "health_benefits": ["omega-3", "fiber"], "ailment_tags": ["gut health", "inflammation"], "efficacy_score": 0.87, "is_organic": True},
    {"name": "Organic Walnuts", "category": "Nuts & Seeds", "health_benefits": ["omega-3", "melatonin"], "ailment_tags": ["insomnia", "brain fog"], "efficacy_score": 0.87, "is_organic": True},
    {"name": "Organic Avocado", "category": "Fruits", "health_benefits": ["healthy fats", "potassium"], "ailment_tags": ["stress", "fatigue"], "efficacy_score": 0.88, "is_organic": True},
    {"name": "Organic Sweet Potato", "category": "Root Vegetables", "health_benefits": ["beta-carotene", "fiber"], "ailment_tags": ["immune support", "gut health"], "efficacy_score": 0.86, "is_organic": True},
    {"name": "Organic Quinoa", "category": "Whole Grains", "health_benefits": ["complete protein", "iron"], "ailment_tags": ["fatigue", "muscle recovery"], "efficacy_score": 0.86, "is_organic": True},
    {"name": "Organic Broccoli", "category": "Cruciferous Vegetables", "health_benefits": ["sulforaphane", "vitamin C"], "ailment_tags": ["immune support", "inflammation"], "efficacy_score": 0.88, "is_organic": True},
    {"name": "Organic Salmon", "category": "Fish", "health_benefits": ["omega-3", "protein"], "ailment_tags": ["inflammation", "brain fog"], "efficacy_score": 0.93, "is_organic": True},
]

NEW_RECIPES = [
    {
        "title": "Coconut Turmeric Lentil Soup",
        "description": "A rich, creamy anti-inflammatory lentil soup with coconut milk and turmeric — warming, filling, and gut-friendly.",
        "instructions": "1. Heat 1 tbsp coconut oil in a pot over medium heat.\n2. Sauté 1 diced onion and 4 garlic cloves for 3 minutes.\n3. Add 1 tsp turmeric, 1 tsp cumin, 1 tsp ginger, and black pepper. Stir 1 minute.\n4. Add 1 cup rinsed red lentils and 3 cups vegetable broth. Bring to a boil.\n5. Reduce heat, simmer 20 minutes until lentils are soft.\n6. Stir in 1 cup coconut milk and juice of half a lemon.\n7. Blend partially for a creamy texture. Season and serve hot.",
        "prep_time_minutes": 10,
        "cook_time_minutes": 25,
        "servings": 3,
        "meal_type": "dinner",
        "cuisine_type": "Asian-Inspired",
        "ailment_tags": ["inflammation", "gut health", "fatigue", "bloating"],
        "health_benefits": ["anti-inflammatory", "high protein", "probiotics", "gut-healing", "iron-rich"],
        "dietary_labels": ["vegan", "gluten-free", "dairy-free"],
        "efficacy_score": 0.92,
        "nutritional_info": {"calories": 390, "protein_g": 18, "carbs_g": 46, "fat_g": 14, "iron_mg": 6},
        "ingredients": [
            ("Organic Lentils", "1", "cup"),
            ("Organic Coconut Milk", "1", "cup"),
            ("Organic Turmeric", "1", "tsp"),
            ("Organic Ginger", "1", "tsp"),
            ("Organic Garlic", "4", "cloves"),
            ("Organic Cumin", "1", "tsp"),
            ("Organic Lemon", "0.5", "whole"),
            ("Organic Coconut Oil", "1", "tbsp"),
            ("Black Pepper", "pinch", ""),
        ],
    },
    {
        "title": "Energising Spinach Almond Green Smoothie",
        "description": "A vibrant iron and magnesium-packed green smoothie that fights fatigue and gives you a clean energy boost.",
        "instructions": "1. Add 2 cups organic spinach to a blender.\n2. Add 1 frozen banana, 1 tbsp almond butter, and 1 cup coconut milk.\n3. Add 1 tsp ginger, 1 tsp honey, and a pinch of cinnamon.\n4. Blend on high for 60 seconds until completely smooth.\n5. Add ice if desired and serve immediately.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 0,
        "servings": 1,
        "meal_type": "breakfast",
        "cuisine_type": "Western",
        "ailment_tags": ["fatigue", "low energy", "stress", "brain fog"],
        "health_benefits": ["iron-rich", "magnesium", "energy boost", "potassium", "anti-inflammatory"],
        "dietary_labels": ["vegan", "gluten-free", "dairy-free"],
        "efficacy_score": 0.88,
        "nutritional_info": {"calories": 310, "protein_g": 8, "carbs_g": 42, "fat_g": 13, "iron_mg": 4},
        "ingredients": [
            ("Organic Spinach", "2", "cups"),
            ("Organic Banana", "1", "whole"),
            ("Organic Almonds", "1", "tbsp"),
            ("Organic Coconut Milk", "1", "cup"),
            ("Organic Ginger", "1", "tsp"),
            ("Organic Honey", "1", "tsp"),
            ("Organic Cinnamon", "0.25", "tsp"),
        ],
    },
    {
        "title": "Walnut Banana Oat Energy Balls",
        "description": "No-bake high-energy snack balls with melatonin-rich walnuts and tryptophan from banana — great before bed or as a daytime pick-me-up.",
        "instructions": "1. Mash 2 ripe bananas in a large bowl.\n2. Mix in 1.5 cups rolled oats, ½ cup chopped walnuts, 2 tbsp chia seeds.\n3. Add 1 tbsp honey and ½ tsp cinnamon. Mix well.\n4. Refrigerate dough for 15 minutes.\n5. Roll into 12 balls (about 1 tbsp each).\n6. Store in the fridge for up to 5 days.",
        "prep_time_minutes": 10,
        "cook_time_minutes": 0,
        "servings": 4,
        "meal_type": "snack",
        "cuisine_type": "Western",
        "ailment_tags": ["fatigue", "insomnia", "stress", "brain fog"],
        "health_benefits": ["tryptophan", "melatonin", "omega-3", "slow-release energy", "magnesium"],
        "dietary_labels": ["vegan", "gluten-free", "no-bake"],
        "efficacy_score": 0.86,
        "nutritional_info": {"calories": 220, "protein_g": 6, "carbs_g": 34, "fat_g": 8, "magnesium_mg": 48},
        "ingredients": [
            ("Organic Banana", "2", "whole"),
            ("Organic Oats", "1.5", "cups"),
            ("Organic Walnuts", "0.5", "cup"),
            ("Organic Chia Seeds", "2", "tbsp"),
            ("Organic Honey", "1", "tbsp"),
            ("Organic Cinnamon", "0.5", "tsp"),
        ],
    },
    {
        "title": "Blueberry Kale Detox Smoothie",
        "description": "A powerful antioxidant-rich detox smoothie with kale, blueberries, and ginger to reduce inflammation and support immunity.",
        "instructions": "1. Place 1.5 cups organic kale (stems removed) in blender.\n2. Add ¾ cup frozen blueberries, ½ banana.\n3. Add 1 tsp fresh ginger, 1 tbsp lemon juice, 1 tsp honey.\n4. Pour in 1 cup coconut milk or water.\n5. Blend until completely smooth. Serve immediately.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 0,
        "servings": 1,
        "meal_type": "breakfast",
        "cuisine_type": "Western",
        "ailment_tags": ["inflammation", "immune support", "brain fog", "fatigue", "detox"],
        "health_benefits": ["antioxidants", "vitamin C", "vitamin K", "cognitive support", "anti-inflammatory"],
        "dietary_labels": ["vegan", "gluten-free", "dairy-free", "detox"],
        "efficacy_score": 0.91,
        "nutritional_info": {"calories": 240, "protein_g": 5, "carbs_g": 46, "fat_g": 6, "vitamin_c_mg": 85},
        "ingredients": [
            ("Organic Kale", "1.5", "cups"),
            ("Organic Blueberries", "0.75", "cup"),
            ("Organic Banana", "0.5", "whole"),
            ("Organic Ginger", "1", "tsp"),
            ("Organic Lemon", "0.5", "whole"),
            ("Organic Honey", "1", "tsp"),
            ("Organic Coconut Milk", "0.5", "cup"),
        ],
    },
    {
        "title": "Garlic Broccoli Quinoa Bowl",
        "description": "A protein-packed immune-boosting bowl with sulforaphane-rich broccoli, complete-protein quinoa, and anti-inflammatory garlic olive oil dressing.",
        "instructions": "1. Cook ¾ cup quinoa according to package instructions.\n2. Steam or roast broccoli florets for 10 minutes until tender.\n3. Heat olive oil in a pan, add 4 sliced garlic cloves, sauté 2 minutes until golden.\n4. Toss broccoli in garlic oil, add turmeric and lemon juice.\n5. Assemble bowl: quinoa base, broccoli, pumpkin seeds on top.\n6. Season with black pepper and serve.",
        "prep_time_minutes": 8,
        "cook_time_minutes": 20,
        "servings": 2,
        "meal_type": "lunch",
        "cuisine_type": "Mediterranean",
        "ailment_tags": ["immune support", "inflammation", "fatigue", "gut health"],
        "health_benefits": ["sulforaphane", "complete protein", "allicin", "antioxidants", "vitamin C"],
        "dietary_labels": ["vegan", "gluten-free", "high-protein"],
        "efficacy_score": 0.90,
        "nutritional_info": {"calories": 410, "protein_g": 18, "carbs_g": 54, "fat_g": 12, "vitamin_c_mg": 110},
        "ingredients": [
            ("Organic Broccoli", "2", "cups"),
            ("Organic Quinoa", "0.75", "cup"),
            ("Organic Garlic", "4", "cloves"),
            ("Organic Olive Oil", "1.5", "tbsp"),
            ("Organic Lemon", "0.5", "whole"),
            ("Organic Pumpkin Seeds", "2", "tbsp"),
            ("Organic Turmeric", "0.5", "tsp"),
            ("Black Pepper", "pinch", ""),
        ],
    },
]


async def seed_new_recipes():
    async with AsyncSessionLocal() as db:
        ingredient_map: dict = {}

        # Upsert all referenced ingredients
        for ing_data in NEW_INGREDIENTS:
            result = await db.execute(select(Ingredient).where(Ingredient.name == ing_data["name"]))
            existing = result.scalar_one_or_none()
            if existing:
                ingredient_map[ing_data["name"]] = existing
            else:
                ingredient = Ingredient(**{k: v for k, v in ing_data.items()})
                db.add(ingredient)
                await db.flush()
                ingredient_map[ing_data["name"]] = ingredient
                print(f"  ✓ Created ingredient: {ing_data['name']}")

        # Add new recipes (skip if title already exists)
        for recipe_data in NEW_RECIPES:
            existing = await db.execute(select(Recipe).where(Recipe.title == recipe_data["title"]))
            if existing.scalar_one_or_none():
                print(f"  — Skipped (already exists): {recipe_data['title']}")
                continue

            ingredients_spec = recipe_data.pop("ingredients")

            embed_str = (
                f"{recipe_data['title']}. {recipe_data['description']}. "
                f"Ailments: {', '.join(recipe_data['ailment_tags'])}. "
                f"Benefits: {', '.join(recipe_data['health_benefits'])}."
            )
            embedding = await embed_text(embed_str)

            recipe = Recipe(**recipe_data, embedding=embedding)
            db.add(recipe)
            await db.flush()

            for spec in ingredients_spec:
                ing_name = spec[0]
                qty      = spec[1]
                unit     = spec[2] if len(spec) > 2 else ""
                optional = spec[3] if len(spec) > 3 else False

                if ing_name in ingredient_map:
                    db.add(RecipeIngredient(
                        recipe_id=recipe.id,
                        ingredient_id=ingredient_map[ing_name].id,
                        quantity=qty,
                        unit=unit,
                        is_optional=optional,
                    ))

            print(f"  ✓ Created recipe: {recipe_data['title']}")

        await db.commit()
        print("Done — new recipes seeded.")


if __name__ == "__main__":
    asyncio.run(seed_new_recipes())
