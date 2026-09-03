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
    """Build a direct supermarket search URL for a list of items."""
    template = SUPERMARKET_SEARCH_URLS.get(supermarket_domain, f"https://www.{supermarket_domain}/groceries")
    # Use first item as the search query (supermarkets search one term at a time)
    query = items[0].replace(" ", "+") if items else "groceries"
    return template.format(query=query)


def grocery_intent_prompt(user_message: str, history: list[dict] = None) -> str:
    history_lines = ""
    if history:
        history_lines = "\nConversation so far:\n"
        for msg in history[-10:]:
            role = "Customer" if msg.get("role") == "user" else "Veda"
            history_lines += f"{role}: {msg.get('text', '')}\n"

    return (
        "You are Veda's grocery shopping assistant. Your job is to build a CUMULATIVE grocery list.\n\n"
        "Rules:\n"
        "1. Collect ALL items the customer has mentioned across the ENTIRE conversation — not just the latest message.\n"
        "   If they said 'I need milk' earlier and now say 'I need eggs', the list is ['milk', 'eggs'].\n"
        "2. Deduplicate items — if the same item appears multiple times, include it once.\n"
        "3. Identify which UK supermarket they want. Once chosen, keep it — do not change it.\n"
        "   UK supermarkets: Tesco (tesco.com), Sainsbury's (sainsburys.co.uk), "
        "Asda (asda.com), Waitrose (waitrose.com), Morrisons (groceries.morrisons.com)\n"
        "   Default to Tesco if no supermarket is mentioned.\n"
        "4. Write a short friendly confirmation reply listing all the items collected so far.\n\n"
        "Examples:\n"
        "- History: 'I need milk' / 'Tesco' | New: 'I need eggs' → items: ['milk', 'eggs'], supermarket: tesco.com\n"
        "- History: 'milk, eggs' / 'Sainsbury's' | New: 'also bread' → items: ['milk', 'eggs', 'bread'], supermarket: sainsburys.co.uk\n"
        "- Single message: 'I need milk, eggs and bread from Tesco' → items: ['milk', 'eggs', 'bread'], supermarket: tesco.com\n\n"
        f"{history_lines}"
        f"\nCustomer's latest message: {user_message}"
    )
