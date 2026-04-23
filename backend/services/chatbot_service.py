import os
import itertools
import time  # <-- Added this for the retry delay
from google import genai
from google.genai import types
from dotenv import load_dotenv
from database import SessionLocal
from models.inventory import Product, StockBatch

load_dotenv()

# 1. Load both keys safely
api_keys_env = os.getenv("GEMINI_API_KEYS", os.getenv("GEMINI_API_KEY", ""))
api_keys = [k.strip() for k in api_keys_env.split(",") if k.strip()]

# Filter out any empty keys (in case one is missing)
valid_keys = [key for key in api_keys if key]

if not valid_keys:
    print("WARNING: No API keys found in .env file!")

# 2. Create a pool of Gemini clients based on the valid keys
clients = [genai.Client(api_key=key) for key in valid_keys]

# 3. Create an infinite round-robin cycle (Client 1 -> Client 2 -> Client 1...)
client_pool = itertools.cycle(clients)

def get_dynamic_catalog():
    db = SessionLocal()
    try:
        products = db.query(Product).all()
        if not products:
            return "No products available in the store right now."
        
        catalog_lines = []
        for p in products:
            batch = next((b for b in p.batches if b.current_quantity > 0), None)
            if not batch and p.batches:
                batch = p.batches[0]
                
            price = f"Rs. {batch.retail_price}" if batch else "Price not available"
            image = p.image_url or (batch.image_url if batch else None) or "No image available"
            catalog_lines.append(f"- {p.product_name} - {price} per {p.unit_of_measure}. Image URL: {image}")
            
        return "\n".join(catalog_lines)
    except Exception as e:
        print(f"Error fetching catalog: {e}")
        return "Catalog temporarily unavailable."
    finally:
        db.close()

# 4. Define our smarter store rules generator
def get_system_prompt():
    return f"""
You are a friendly and helpful AI assistant for Ransara Supermarket.

Here is the current product catalog (dynamically updated from the database):
{get_dynamic_catalog()}

YOUR RULES:
1. BROWSING: If the user asks about a product in the catalog (e.g., "Do you have sugar?"), tell them the price and include the image using this exact format on its own line: [IMAGE: url_here]
2. OUT OF STOCK: If the user asks for a grocery item NOT in the catalog (like Coffee or Milk), politely apologize and say we don't carry that item right now. Do NOT use the fallback error message for this.
3. ORDERING: If the user explicitly asks to order an item, calculate the total. Reply with the price, total price, and the image [IMAGE: url_here]. Then ask: "Would you like to proceed to payment?"
4. CONFIRMATION: If the user says "Yes" or confirms an order, you MUST put [PAYMENT_TRIGGER] at the very end of your reply.
5. OFF-TOPIC: ONLY if the user asks about completely unrelated topics (like cars, politics, or coding), reply EXACTLY with: "I can only help with supermarket related questions."
"""

# --- NEW: Auto-Retry Logic Added Here ---
def generate_ai_response(message: str) -> str:
    # Check if we have any valid clients
    if not valid_keys:
        return "I apologize, but the chatbot service is currently unavailable. Please set GEMINI_API_KEY or GEMINI_API_KEYS in your environment variables."
    
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            # Get the next available client from the rotating pool
            current_client = next(client_pool)

            response = current_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=message,
                config=types.GenerateContentConfig(
                    system_instruction=get_system_prompt(),
                    temperature=0.3,
                )
            )
            return response.text
            
        except Exception as e:
            error_msg = str(e)
            # If Google is busy (503) and we haven't run out of retries, wait and try again
            if "503" in error_msg and attempt < (max_retries - 1):
                print(f"Google servers busy. Retrying in 2 seconds... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(2)
                continue # Loops back to the top and tries again
            
            # If it's a different error, or we failed 3 times, show the fallback message
            print(f"Gemini API Error (Attempt {attempt + 1}): {e}")
            return "Sorry, I am having trouble connecting to my brain right now. My brain isn't braining....."