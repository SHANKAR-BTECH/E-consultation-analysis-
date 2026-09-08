"""Interactive CLI using the same inference service as both web interfaces."""
import pandas as pd

from config import OUTPUT_DIR
from model_service import get_service, InvalidFeedback, ModelUnavailable

OUTPUT_PATH = OUTPUT_DIR / "predictions.csv"


def main():
    try:
        service = get_service()
    except ModelUnavailable as exc:
        print(str(exc))
        return 1
    history = []
    print("Enter English consultation feedback. Type 'exit' to close.")
    while True:
        try:
            feedback = input("Feedback: ")
        except (EOFError, KeyboardInterrupt):
            break
        if feedback.strip().lower() == "exit":
            break
        try:
            result = service.predict(feedback)
        except InvalidFeedback as exc:
            print(str(exc))
            continue
        print(f"Predicted sentiment: {result['sentiment']}")
        print(f"Confidence: {result['confidence']:.2%} (model probability; not calibrated accuracy)")
        history.append({"feedback": feedback.strip(), "predicted_sentiment": result["sentiment"].lower(),
                        "confidence": result["confidence"]})
    if history:
        OUTPUT_PATH.parent.mkdir(exist_ok=True)
        pd.DataFrame(history).to_csv(OUTPUT_PATH, index=False)
        print(f"Saved {len(history)} prediction(s) to {OUTPUT_PATH}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
