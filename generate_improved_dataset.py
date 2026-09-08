"""Create the deterministic prototype feedback dataset used by this project."""
from itertools import product
from pathlib import Path

import pandas as pd


OUTPUT_PATH = Path("sentiment_dataset_improved.csv")


def build_examples() -> list[dict[str, str]]:
    """Create 600 varied, labelled prototype examples (200 per class)."""
    services = [
        "online application portal", "licence renewal service", "public transport helpdesk",
        "housing support office", "citizen grievance portal", "district service centre",
        "water connection process", "benefit application system", "municipal helpline", "document upload page",
    ]
    positive_actions = [
        "resolved my issue quickly", "gave clear guidance", "made the process easy",
        "responded within a day", "handled my request politely", "provided useful updates",
        "saved me a visit to the office", "worked smoothly on my phone", "explained every step clearly", "processed my application efficiently",
    ]
    positive_openers = [
        "I appreciate how the", "The", "My experience with the", "I was pleased because the",
        "The staff at the", "Using the", "I am satisfied with the", "Our family found the",
        "The recent improvement to the", "In my case, the",
    ]
    negative_actions = [
        "has not responded to my request", "keeps showing an error", "made me wait for weeks",
        "provided unclear instructions", "closed my complaint without a solution", "is difficult to use on a phone",
        "asked for the same documents repeatedly", "did not explain the delay", "transferred me between departments", "failed during submission",
    ]
    negative_openers = [
        "I am disappointed because the", "The", "My experience with the", "It is frustrating that the",
        "The staff handling the", "Trying to use the", "I still have problems with the", "For several days, the",
        "The current", "Unfortunately, the",
    ]
    neutral_events = [
        "will open next Monday", "is available in selected districts", "has published revised guidance",
        "will be reviewed after six months", "accepts applications until the stated deadline",
        "is scheduled for maintenance this weekend", "has announced a public meeting",
        "requires an identity document for registration", "will issue notices by email", "is listed on the department website",
    ]
    neutral_openers = [
        "The department announced that the", "According to the notice, the", "The website states that the",
        "A recent circular says the", "The service update confirms that the", "The public notice reports the",
        "The department calendar shows the", "The information page explains that the", "The announcement mentions the", "The office notification says the",
    ]
    details = [
        "for residents in this area", "during normal working hours", "after online registration",
        "from the official service portal", "subject to document verification", "in the next service cycle",
        "as part of the current programme", "for eligible applicants", "until further notice", "under the revised procedure",
    ]

    rows: list[dict[str, str]] = []
    # Pair different list positions to avoid a single fixed sentence pattern.
    for label, openers, actions in [
        ("positive", positive_openers, positive_actions),
        ("negative", negative_openers, negative_actions),
        ("neutral", neutral_openers, neutral_events),
    ]:
        for index, (opener, service, variation) in enumerate(product(openers, services, range(2))):
            action = actions[(index * 3 + 1) % len(actions)]
            detail = details[(index * 7 + 2) % len(details)]
            if label == "neutral":
                ending = "" if variation == 0 else " The notice provides this information for applicants."
                feedback = f"{opener} {service} {action} {detail}.{ending}"
            elif index % 3 == 0:
                ending = "" if variation == 0 else " This was helpful for my request."
                if label == "negative":
                    ending = " This has delayed my request."
                feedback = f"{opener} {service} {action} {detail}.{ending}"
            elif index % 3 == 1:
                feedback = f"{opener} {service} {action} {detail}, and I value that experience."
                if label == "negative":
                    feedback = f"{opener} {service} {action} {detail}, which needs attention."
            else:
                feedback = f"Regarding the {service}, {opener.lower()} it {action} {detail}."
            rows.append({"feedback": feedback, "sentiment": label})
    return rows


def main() -> None:
    dataset = pd.DataFrame(build_examples())
    assert len(dataset) == 600
    assert dataset["feedback"].is_unique
    assert dataset["sentiment"].value_counts().to_dict() == {
        "positive": 200, "negative": 200, "neutral": 200
    }
    dataset.to_csv(OUTPUT_PATH, index=False)
    print(f"Created {OUTPUT_PATH} with {len(dataset)} samples.")
    print(dataset["sentiment"].value_counts().sort_index().to_string())


if __name__ == "__main__":
    main()
