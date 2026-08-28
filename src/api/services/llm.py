from . import config
from typing import List, Tuple

def build_prompt(history: List[Tuple[str, str]], user_input: str) -> List[dict]:
    """Convert memory + persona into chat format (dummy)."""
    system_msg = {
        "role": "system",
        "content": config.config["persona"]["style"],
    }
    messages = [system_msg]
    for role, content in history:
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_input})
    return messages

def generate_reply(history: List[Tuple[str, str]], user_input: str) -> str:
    """
    Dummy LLM that echoes the user's last message with a friendly prefix.
    Replace with real LLM call as needed.
    """
    # Simple response: acknowledge and echo
    return f"You said: \"{user_input}\". How can I help you further?"