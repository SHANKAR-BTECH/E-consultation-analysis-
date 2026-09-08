"""One inference implementation for Flask, Streamlit, and the CLI."""
from functools import lru_cache
import logging
import re
import unicodedata

import joblib
import numpy as np
from sklearn.naive_bayes import MultinomialNB

from config import MODEL_PATH, VECTORIZER_PATH, MAX_INPUT_CHARACTERS, INFERENCE_BATCH_SIZE
from text_utils import preprocess_text

logger = logging.getLogger(__name__)


class InvalidFeedback(ValueError):
    """Input cannot be meaningfully processed by this English prototype."""


class ModelUnavailable(RuntimeError):
    """Saved artifacts could not be loaded or are incompatible."""


def validate_feedback(feedback):
    if not isinstance(feedback, str):
        raise InvalidFeedback("Feedback must be a non-empty text value.")
    if len(feedback) > MAX_INPUT_CHARACTERS:
        raise InvalidFeedback(f"Feedback must contain at most {MAX_INPUT_CHARACTERS} characters, including surrounding whitespace.")
    text = feedback.strip()
    if not text:
        raise InvalidFeedback("Feedback must be a non-empty text value.")
    # Script screening is not language identification. Do not silently discard
    # meaningful non-Latin portions of a mixed-script response.
    if any(c.isalpha() and "LATIN" not in unicodedata.name(c, "") for c in text):
        raise InvalidFeedback("This prototype supports English feedback only; non-Latin text is unsupported.")
    processed = preprocess_text(text)
    if not re.search(r"[a-z]{2,}", processed):
        raise InvalidFeedback("Feedback must contain usable English words, not only numbers or punctuation.")
    return text, processed


class InferenceService:
    def __init__(self, model_path=MODEL_PATH, vectorizer_path=VECTORIZER_PATH):
        try:
            self.model = joblib.load(model_path)
            self.vectorizer = joblib.load(vectorizer_path)
            if not isinstance(self.model, MultinomialNB):
                raise ValueError("The active academic model must be Multinomial Naive Bayes.")
            self.classes = tuple(str(c) for c in self.model.classes_)
            if self.model.n_features_in_ != len(self.vectorizer.vocabulary_):
                raise ValueError("Model and vectorizer feature counts differ.")
            self.model.predict_proba(self.vectorizer.transform([""]))
        except Exception as exc:
            logger.exception("Unable to load model artifacts")
            raise ModelUnavailable("Model unavailable. Check the saved artifacts or run python train_model.py, then restart.") from exc

    def predict(self, feedback):
        result = self.predict_batch([feedback])[0]
        if "message" in result:
            raise InvalidFeedback(result["message"])
        return result

    def predict_batch(self, feedbacks):
        """Ordered results or validation messages; sparse transforms in chunks.

        The caller bounds total input. Invalid rows never receive a prediction.
        Single and batch predictions deliberately share this implementation.
        """
        results = []
        for offset in range(0, len(feedbacks), INFERENCE_BATCH_SIZE):
            chunk = feedbacks[offset:offset + INFERENCE_BATCH_SIZE]
            outputs = [None] * len(chunk)
            valid = []
            for index, feedback in enumerate(chunk):
                try:
                    text, processed = validate_feedback(feedback)
                    valid.append((index, text, processed))
                except InvalidFeedback as exc:
                    outputs[index] = {"message": str(exc)}
            if valid:
                features = self.vectorizer.transform([row[2] for row in valid])
                usable = np.asarray(features.getnnz(axis=1)) > 0
                probabilities = self.model.predict_proba(features[usable]) if usable.any() else []
                prediction_index = 0
                for position, (index, text, _) in enumerate(valid):
                    if not usable[position]:
                        outputs[index] = {"message": "No vocabulary recognized by this English prototype. Please provide a meaningful English consultation response."}
                        continue
                    values = probabilities[prediction_index]
                    prediction_index += 1
                    best = int(np.argmax(values))
                    outputs[index] = {
                        "sentiment": self.classes[best].title(),
                        "confidence": round(float(values[best]), 6),
                        "input_length": len(text), "word_count": len(text.split()),
                    }
            results.extend(outputs)
        return results


@lru_cache(maxsize=1)
def get_service():
    """Load once per process; restarting picks up newly trained artifacts."""
    return InferenceService()
