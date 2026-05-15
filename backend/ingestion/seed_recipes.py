"""
Seeds the database with curated organic recipes tied to ailment tags.
Run once after initial migration: python -m ingestion.seed_recipes
"""
import asyncio
import uuid
from app.database import AsyncSessionLocal
from app.models.recipe import Recipe, Ingredient, RecipeIngredient
from app.services.embedding_service import embed_text
import structlog

logger = structlog.get_logger()

INGREDIENTS_DATA = [
    {"name": "Organic Spinach", "category": "Leafy Greens", "health_benefits": ["iron", "magnesium", "folate"], "ailment_tags": ["fatigue", "anemia"], "efficacy_score": 0.9, "is_organic": True},
    {"name": "Organic Kale", "category": "Leafy Greens", "health_benefits": ["vitamin C", "vitamin K", "antioxidants"], "ailment_tags": ["immune support", "inflammation"], "efficacy_score": 0.88, "is_organic": True},
    {"name": "Organic Ginger", "category": "Spices & Herbs", "health_benefits": ["anti-nausea", "anti-inflammatory", "digestive"], "ailment_tags": ["bloating", "nausea", "gut health"], "efficacy_score": 0.92, "is_organic": True},
    {"name": "Organic Turmeric", "category": "Spices & Herbs", "health_benefits": ["curcumin", "anti-inflammatory", "antioxidant"], "ailment_tags": ["inflammation", "joint pain", "immune support"], "efficacy_score": 0.91, "is_organic": True},
    {"name": "Organic Blueberries", "category": "Berries", "health_benefits": ["antioxidants", "vitamin C", "cognitive support"], "ailment_tags": ["brain fog", "inflammation", "immune support"], "efficacy_score": 0.89, "is_organic": True},
    {"name": "Organic Almonds", "category": "Nuts & Seeds", "health_benefits": ["magnesium", "vitamin E", "healthy fats"], "ailment_tags": ["fatigue", "stress", "insomnia"], "efficacy_score": 0.85, "is_organic": True},
    {"name": "Organic Oats", "category": "Whole Grains", "health_benefits": ["beta-glucan", "fiber", "tryptophan"], "ailment_tags": ["gut health", "fatigue", "insomnia"], "efficacy_score": 0.84, "is_organic": True},
    {"name": "Organic Salmon", "category": "Fish", "health_benefits": ["omega-3", "protein", "vitamin D"], "ailment_tags": ["inflammation", "brain fog", "fatigue"], "efficacy_score": 0.93, "is_organic": True},
    {"name": "Organic Lemon", "category": "Citrus", "health_benefits": ["vitamin C", "antioxidants", "alkalizing"], "ailment_tags": ["immune support", "cold", "digestion"], "efficacy_score": 0.82, "is_organic": True},
    {"name": "Organic Garlic", "category": "Alliums", "health_benefits": ["allicin", "immune boosting", "antibacterial"], "ailment_tags": ["immune support", "cold", "flu"], "efficacy_score": 0.90, "is_organic": True},
    {"name": "Organic Greek Yogurt", "category": "Dairy", "health_benefits": ["probiotics", "protein", "calcium"], "ailment_tags": ["gut health", "bloating", "immune support"], "efficacy_score": 0.86, "is_organic": True},
    {"name": "Organic Chia Seeds", "category": "Seeds", "health_benefits": ["omega-3", "fiber", "calcium"], "ailment_tags": ["gut health", "inflammation", "fatigue"], "efficacy_score": 0.87, "is_organic": True},
    {"name": "Organic Quinoa", "category": "Whole Grains", "health_benefits": ["complete protein", "iron", "magnesium"], "ailment_tags": ["fatigue", "muscle recovery"], "efficacy_score": 0.86, "is_organic": True},
    {"name": "Organic Avocado", "category": "Fruits", "health_benefits": ["healthy fats", "potassium", "magnesium"], "ailment_tags": ["stress", "fatigue", "insomnia"], "efficacy_score": 0.88, "is_organic": True},
    {"name": "Organic Chamomile", "category": "Herbs & Teas", "health_benefits": ["apigenin", "sedative", "anti-anxiety"], "ailment_tags": ["insomnia", "stress", "anxiety"], "efficacy_score": 0.85, "is_organic": True},
    {"name": "Organic Ashwagandha", "category": "Adaptogens", "health_benefits": ["cortisol reduction", "adaptogenic", "stress relief"], "ailment_tags": ["stress", "anxiety", "fatigue", "insomnia"], "efficacy_score": 0.90, "is_organic": True},
    {"name": "Organic Walnuts", "category": "Nuts & Seeds", "health_benefits": ["omega-3", "melatonin", "antioxidants"], "ailment_tags": ["insomnia", "brain fog", "inflammation"], "efficacy_score": 0.87, "is_organic": True},
    {"name": "Organic Honey", "category": "Sweeteners", "health_benefits": ["antibacterial", "soothing", "antioxidants"], "ailment_tags": ["cold", "immune support", "sore throat"], "efficacy_score": 0.80, "is_organic": True},
    {"name": "Organic Banana", "category": "Fruits", "health_benefits": ["potassium", "tryptophan", "vitamin B6"], "ailment_tags": ["fatigue", "muscle cramps", "insomnia"], "efficacy_score": 0.83, "is_organic": True},
    {"name": "Organic Sweet Potato", "category": "Root Vegetables", "health_benefits": ["beta-carotene", "vitamin C", "fiber"], "ailment_tags": ["immune support", "inflammation", "gut health"], "efficacy_score": 0.86, "is_organic": True},
    {"name": "Black Pepper", "category": "Spices & Herbs", "health_benefits": ["piperine", "bioavailability enhancer"], "ailment_tags": ["inflammation", "digestion"], "efficacy_score": 0.75, "is_organic": False},
    {"name": "Organic Coconut Oil", "category": "Oils", "health_benefits": ["MCT fats", "antimicrobial", "energy"], "ailment_tags": ["fatigue", "immune support"], "efficacy_score": 0.78, "is_organic": True},
    {"name": "Organic Broccoli", "category": "Cruciferous Vegetables", "health_benefits": ["sulforaphane", "vitamin C", "fiber"], "ailment_tags": ["immune support", "inflammation", "gut health"], "efficacy_score": 0.88, "is_organic": True},
    {"name": "Organic Lentils", "category": "Legumes", "health_benefits": ["iron", "protein", "fiber", "folate"], "ailment_tags": ["fatigue", "gut health", "anemia"], "efficacy_score": 0.85, "is_organic": True},
    {"name": "Organic Flaxseed", "category": "Seeds", "health_benefits": ["omega-3", "lignans", "fiber"], "ailment_tags": ["inflammation", "gut health", "hormones"], "efficacy_score": 0.84, "is_organic": True},
]

RECIPES_DATA = [
    {
        "title": "Golden Turmeric Ginger Sleep Latte",
        "description": "A warm, calming bedtime drink with ashwagandha and chamomile to support deep sleep.",
        "instructions": "1. Heat 1 cup organic milk over medium heat.\n2. Whisk in 1 tsp turmeric, ½ tsp ginger, ½ tsp ashwagandha powder.\n3. Add 1 tsp honey and a pinch of black pepper.\n4. Froth and pour over brewed chamomile tea.\n5. Sip 30 minutes before bed.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 5,
        "servings": 1,
        "meal_type": "beverage",
        "cuisine_type": "Ayurvedic",
        "ailment_tags": ["insomnia", "stress", "anxiety", "fatigue"],
        "health_benefits": ["promotes sleep", "reduces cortisol", "calming", "anti-inflammatory"],
        "dietary_labels": ["vegetarian", "gluten-free"],
        "efficacy_score": 0.93,
        "nutritional_info": {"calories": 120, "protein_g": 4, "carbs_g": 18, "fat_g": 4, "magnesium_mg": 45},
        "ingredients": [
            ("Organic Turmeric", "1", "tsp"),
            ("Organic Ginger", "0.5", "tsp"),
            ("Organic Ashwagandha", "0.5", "tsp"),
            ("Organic Chamomile", "1", "tea bag"),
            ("Organic Honey", "1", "tsp"),
            ("Black Pepper", "pinch", ""),
        ],
    },
    {
        "title": "Iron-Boost Spinach & Lentil Power Bowl",
        "description": "Protein and iron-packed bowl to fight fatigue and restore energy.",
        "instructions": "1. Cook 1 cup lentils per package instructions.\n2. Sauté spinach with garlic in olive oil until wilted.\n3. Arrange lentils and spinach in a bowl.\n4. Top with avocado slices and pumpkin seeds.\n5. Squeeze lemon juice to enhance iron absorption.\n6. Season with turmeric and black pepper.",
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "servings": 2,
        "meal_type": "lunch",
        "cuisine_type": "Mediterranean",
        "ailment_tags": ["fatigue", "anemia", "low energy"],
        "health_benefits": ["iron-rich", "energy boost", "protein", "folate"],
        "dietary_labels": ["vegan", "gluten-free", "high-protein"],
        "efficacy_score": 0.91,
        "nutritional_info": {"calories": 380, "protein_g": 22, "carbs_g": 48, "fat_g": 12, "iron_mg": 8},
        "ingredients": [
            ("Organic Lentils", "1", "cup"),
            ("Organic Spinach", "2", "cups"),
            ("Organic Garlic", "3", "cloves"),
            ("Organic Avocado", "0.5", "whole"),
            ("Organic Lemon", "0.5", "whole"),
            ("Organic Turmeric", "0.5", "tsp"),
            ("Black Pepper", "pinch", ""),
        ],
    },
    {
        "title": "Anti-Stress Blueberry Walnut Oat Bowl",
        "description": "Magnesium and tryptophan-rich overnight oats for calm energy and stress relief.",
        "instructions": "1. Combine ½ cup oats with 1 cup almond milk in a jar.\n2. Add 1 tbsp chia seeds and stir.\n3. Refrigerate overnight.\n4. Top with blueberries, walnuts, banana slices, and a drizzle of honey.\n5. Eat cold or warm for breakfast.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 0,
        "servings": 1,
        "meal_type": "breakfast",
        "cuisine_type": "Western",
        "ailment_tags": ["stress", "anxiety", "fatigue", "brain fog"],
        "health_benefits": ["magnesium", "tryptophan", "omega-3", "antioxidants", "sustained energy"],
        "dietary_labels": ["vegan", "gluten-free"],
        "efficacy_score": 0.88,
        "nutritional_info": {"calories": 420, "protein_g": 12, "carbs_g": 58, "fat_g": 16, "magnesium_mg": 82},
        "ingredients": [
            ("Organic Oats", "0.5", "cup"),
            ("Organic Blueberries", "0.5", "cup"),
            ("Organic Walnuts", "0.25", "cup"),
            ("Organic Chia Seeds", "1", "tbsp"),
            ("Organic Banana", "0.5", "whole"),
            ("Organic Honey", "1", "tsp"),
            ("Organic Almonds", "1", "tbsp", True),
        ],
    },
    {
        "title": "Immune-Defense Garlic Ginger Lemon Broth",
        "description": "A potent immune-boosting broth to take at the first sign of a cold.",
        "instructions": "1. Bring 4 cups water or vegetable broth to a simmer.\n2. Add 5 minced garlic cloves, 1 tbsp grated ginger.\n3. Add juice of 1 lemon and 1 tsp turmeric.\n4. Simmer 15 minutes.\n5. Strain or serve as-is. Add honey to taste.\n6. Drink 2-3 cups daily when fighting illness.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 15,
        "servings": 3,
        "meal_type": "beverage",
        "cuisine_type": "Traditional",
        "ailment_tags": ["immune support", "cold", "flu", "illness"],
        "health_benefits": ["allicin", "vitamin C", "anti-inflammatory", "antiviral"],
        "dietary_labels": ["vegan", "gluten-free", "keto"],
        "efficacy_score": 0.94,
        "nutritional_info": {"calories": 25, "vitamin_c_mg": 30, "allicin_mg": 5},
        "ingredients": [
            ("Organic Garlic", "5", "cloves"),
            ("Organic Ginger", "1", "tbsp"),
            ("Organic Lemon", "1", "whole"),
            ("Organic Turmeric", "1", "tsp"),
            ("Organic Honey", "1", "tsp"),
            ("Black Pepper", "pinch", ""),
        ],
    },
    {
        "title": "Gut-Healing Probiotic Yogurt Bowl",
        "description": "A fiber and probiotic-rich bowl to restore gut flora and reduce bloating.",
        "instructions": "1. Spoon 1 cup Greek yogurt into a bowl.\n2. Stir in 1 tbsp ground flaxseed.\n3. Top with blueberries, banana slices, and 1 tbsp chia seeds.\n4. Drizzle with 1 tsp honey.\n5. Optional: add a pinch of ginger powder for additional digestive support.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 0,
        "servings": 1,
        "meal_type": "breakfast",
        "cuisine_type": "Western",
        "ailment_tags": ["bloating", "gut health", "digestive issues", "IBS"],
        "health_benefits": ["probiotics", "fiber", "prebiotics", "anti-bloating"],
        "dietary_labels": ["vegetarian", "gluten-free"],
        "efficacy_score": 0.89,
        "nutritional_info": {"calories": 320, "protein_g": 20, "carbs_g": 42, "fat_g": 8, "probiotics_billion_cfu": 10},
        "ingredients": [
            ("Organic Greek Yogurt", "1", "cup"),
            ("Organic Flaxseed", "1", "tbsp"),
            ("Organic Blueberries", "0.25", "cup"),
            ("Organic Banana", "0.5", "whole"),
            ("Organic Chia Seeds", "1", "tbsp"),
            ("Organic Honey", "1", "tsp"),
            ("Organic Ginger", "pinch", "", True),
        ],
    },
    {
        "title": "Omega-3 Baked Salmon with Broccoli",
        "description": "Anti-inflammatory omega-3 rich dinner to combat brain fog and joint pain.",
        "instructions": "1. Preheat oven to 400°F.\n2. Place salmon on a baking sheet, drizzle with olive oil.\n3. Season with turmeric, garlic powder, salt, and pepper.\n4. Arrange broccoli florets around salmon.\n5. Bake 18-20 minutes until salmon flakes easily.\n6. Squeeze lemon over everything and serve over quinoa.",
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "servings": 2,
        "meal_type": "dinner",
        "cuisine_type": "Mediterranean",
        "ailment_tags": ["inflammation", "brain fog", "joint pain", "fatigue"],
        "health_benefits": ["omega-3 DHA/EPA", "complete protein", "sulforaphane", "anti-inflammatory"],
        "dietary_labels": ["gluten-free", "paleo", "high-protein"],
        "efficacy_score": 0.95,
        "nutritional_info": {"calories": 520, "protein_g": 42, "carbs_g": 32, "fat_g": 24, "omega3_g": 3.5},
        "ingredients": [
            ("Organic Salmon", "200", "g"),
            ("Organic Broccoli", "2", "cups"),
            ("Organic Quinoa", "0.5", "cup"),
            ("Organic Turmeric", "0.5", "tsp"),
            ("Organic Garlic", "2", "cloves"),
            ("Organic Lemon", "0.5", "whole"),
            ("Organic Coconut Oil", "1", "tbsp"),
        ],
    },
    {
        "title": "Sweet Potato & Kale Energy Bowl",
        "description": "Complex-carb, vitamin-rich bowl for sustained energy and immune defence.",
        "instructions": "1. Roast cubed sweet potato with coconut oil, cumin, and cinnamon at 400°F for 25 min.\n2. Massage kale with olive oil and lemon juice until tender.\n3. Cook quinoa per package instructions.\n4. Assemble bowl: quinoa base, kale, roasted sweet potato.\n5. Top with almonds and a tahini-lemon drizzle.",
        "prep_time_minutes": 10,
        "cook_time_minutes": 25,
        "servings": 2,
        "meal_type": "lunch",
        "cuisine_type": "Western",
        "ailment_tags": ["fatigue", "immune support", "inflammation"],
        "health_benefits": ["beta-carotene", "vitamin C", "vitamin K", "sustained energy", "antioxidants"],
        "dietary_labels": ["vegan", "gluten-free"],
        "efficacy_score": 0.87,
        "nutritional_info": {"calories": 440, "protein_g": 16, "carbs_g": 62, "fat_g": 14, "vitamin_a_iu": 18000},
        "ingredients": [
            ("Organic Sweet Potato", "1", "large"),
            ("Organic Kale", "2", "cups"),
            ("Organic Quinoa", "0.5", "cup"),
            ("Organic Almonds", "2", "tbsp"),
            ("Organic Lemon", "0.5", "whole"),
            ("Organic Coconut Oil", "1", "tbsp"),
        ],
    },
    {
        "title": "Stress-Relief Avocado Toast with Chia",
        "description": "Magnesium and healthy-fat-rich toast that supports the nervous system and reduces stress.",
        "instructions": "1. Toast 2 slices sourdough bread.\n2. Mash 1 ripe avocado with lemon juice, salt, and red pepper flakes.\n3. Spread on toast.\n4. Top with chia seeds, sliced banana, and a drizzle of honey.\n5. Sprinkle with a pinch of flaxseed.",
        "prep_time_minutes": 5,
        "cook_time_minutes": 5,
        "servings": 1,
        "meal_type": "breakfast",
        "cuisine_type": "Western",
        "ailment_tags": ["stress", "anxiety", "fatigue", "brain fog"],
        "health_benefits": ["magnesium", "potassium", "omega-3", "tryptophan", "mood support"],
        "dietary_labels": ["vegetarian"],
        "efficacy_score": 0.86,
        "nutritional_info": {"calories": 380, "protein_g": 9, "carbs_g": 44, "fat_g": 20, "magnesium_mg": 55},
        "ingredients": [
            ("Organic Avocado", "1", "whole"),
            ("Organic Chia Seeds", "1", "tbsp"),
            ("Organic Banana", "0.5", "whole"),
            ("Organic Lemon", "0.25", "whole"),
            ("Organic Flaxseed", "1", "tsp"),
            ("Organic Honey", "1", "tsp"),
        ],
    },
]


async def seed_recipes():
    async with AsyncSessionLocal() as db:
        # Create ingredients map
        ingredient_map = {}
        for ing_data in INGREDIENTS_DATA:
            from sqlalchemy import select
            result = await db.execute(
                select(Ingredient).where(Ingredient.name == ing_data["name"])
            )
            existing = result.scalar_one_or_none()
            if existing:
                ingredient_map[ing_data["name"]] = existing
                continue

            ingredient = Ingredient(**{k: v for k, v in ing_data.items()})
            db.add(ingredient)
            await db.flush()
            ingredient_map[ing_data["name"]] = ingredient
            logger.info("Created ingredient", name=ing_data["name"])

        # Create recipes
        for recipe_data in RECIPES_DATA:
            ingredients_spec = recipe_data.pop("ingredients")

            embed_text_str = f"{recipe_data['title']}. {recipe_data['description']}. Ailments: {', '.join(recipe_data['ailment_tags'])}. Benefits: {', '.join(recipe_data['health_benefits'])}."
            embedding = await embed_text(embed_text_str)

            recipe = Recipe(**recipe_data, embedding=embedding)
            db.add(recipe)
            await db.flush()

            for ing_spec in ingredients_spec:
                ing_name = ing_spec[0]
                qty = ing_spec[1]
                unit = ing_spec[2] if len(ing_spec) > 2 else ""
                optional = ing_spec[3] if len(ing_spec) > 3 else False

                if ing_name in ingredient_map:
                    ri = RecipeIngredient(
                        recipe_id=recipe.id,
                        ingredient_id=ingredient_map[ing_name].id,
                        quantity=qty,
                        unit=unit,
                        is_optional=optional,
                    )
                    db.add(ri)

            logger.info("Created recipe", title=recipe_data["title"])

        await db.commit()
        logger.info("Recipe seeding complete", count=len(RECIPES_DATA))


if __name__ == "__main__":
    asyncio.run(seed_recipes())
