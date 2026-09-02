UK_SUPERMARKETS = {
    "tesco": "tesco.com",
    "tesco.com": "tesco.com",
    "sainsburys": "sainsburys.co.uk",
    "sainsbury's": "sainsburys.co.uk",
    "sainsburys.co.uk": "sainsburys.co.uk",
    "asda": "asda.com",
    "asda.com": "asda.com",
    "waitrose": "waitrose.com",
    "waitrose.com": "waitrose.com",
    "morrisons": "groceries.morrisons.com",
    "groceries.morrisons.com": "groceries.morrisons.com",
}

SUPERMARKET_NAMES = {
    "tesco.com": "Tesco",
    "sainsburys.co.uk": "Sainsbury's",
    "asda.com": "Asda",
    "waitrose.com": "Waitrose",
    "groceries.morrisons.com": "Morrisons",
}

# Direct search URLs for in-app browser fallback (no Pepesto API key needed)
SUPERMARKET_SEARCH_URLS = {
    "tesco.com": "https://www.tesco.com/groceries/en-GB/search?query={query}",
    "sainsburys.co.uk": "https://www.sainsburys.co.uk/gol-ui/SearchDisplayView?filters[keyword]={query}",
    "asda.com": "https://groceries.asda.com/search/{query}",
    "waitrose.com": "https://www.waitrose.com/ecom/shop/search?&searchTerm={query}",
    "groceries.morrisons.com": "https://groceries.morrisons.com/search?entry={query}",
}


def supermarket_search_url(supermarket_domain: str, items: list[str]) -> str:
    """Build a direct supermarket search URL for a list of items (first item as query)."""
    template = SUPERMARKET_SEARCH_URLS.get(supermarket_domain, f"https://www.{supermarket_domain}/groceries")
    query = "+".join(items[0].replace(" ", "+").split() if items else ["groceries"])
    return template.format(query=query)


def grocery_intent_prompt(user_message: str, history: list[dict] = None) -> str:
    history_lines = ""
    if history:
        history_lines = "\nRecent conversation:\n"
        for msg in history[-4:]:
            role = "Customer" if msg.get("role") == "user" else "Veda"
            history_lines += f"{role}: {msg.get('text', '')}\n"

    return (
        "You are Veda's grocery shopping assistant. Extract the user's grocery shopping intent.\n\n"
        "Your job:\n"
        "1. Identify the items they want to buy (be specific, normalise quantities where possible)\n"
        "2. Identify which UK supermarket they want (default to Tesco if not stated)\n"
        "   UK supermarkets: Tesco (tesco.com), Sainsbury's (sainsburys.co.uk), "
        "Asda (asda.com), Waitrose (waitrose.com), Morrisons (groceries.morrisons.com)\n"
        "3. Write a short friendly reply to show the user before building their basket\n\n"
        "Examples:\n"
        "- 'I need milk, eggs and bread from Tesco' → items: ['milk', 'eggs', 'bread'], supermarket: tesco.com\n"
        "- 'Get me ingredients for chicken tikka masala at Sainsbury's' → items: ['chicken breast', 'yoghurt', "
        "'tomatoes', 'onion', 'garlic', 'tikka masala paste', 'cream', 'rice'], supermarket: sainsburys.co.uk\n"
        "- 'Weekly shop' → items: ['milk', 'bread', 'eggs', 'butter', 'cheese'], supermarket: tesco.com\n\n"
        f"{history_lines}"
        f"\nCustomer's message: {user_message}"
    )
