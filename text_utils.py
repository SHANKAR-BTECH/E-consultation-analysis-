"""Shared text preprocessing for training and prediction."""
import re


def preprocess_text(text: object) -> str:
    """Apply deliberately light cleaning while retaining negation words."""
    if text is None:
        return ""
    value = str(text).lower().strip()
    value = re.sub(r"\s+", " ", value)
    # Keep apostrophes inside words (for example, "don't") and preserve words
    # such as "not", "never", and "no", which can change sentiment.
    value = re.sub(r"[^a-z0-9\s']", " ", value)
    return re.sub(r"\s+", " ", value).strip()
