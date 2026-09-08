"""Generate ~10,000 high-quality, realistic public consultation feedback examples.

Covers 15 civic & public-policy domains:
1. clean water
2. sanitation & waste management
3. roads & street infrastructure
4. public transport & transit fleet
5. public healthcare & clinics
6. public education & schools
7. civic housing & grants
8. electricity & power supply
9. social welfare schemes & pensions
10. public safety & street lighting
11. disability accessibility & barrier-free access
12. municipal services & grievance desks
13. digital government portals & online filing
14. bridges & flood drainage infrastructure
15. community development & public recreation
"""

import random
from pathlib import Path
import pandas as pd

random.seed(42)

# 15 Civic Domains with realistic entities and concepts
DOMAINS = {
    "water": {
        "topics": ["clean drinking water", "piped water connection", "water pressure", "chlorination and water testing", "tanker supply schedule", "water purification plant", "borewell contamination", "pipeline leakage"],
        "departments": ["Water Supply Board", "Municipal Water Department", "Rural Water Supply Mission", "Public Health Engineering Department"]
    },
    "sanitation": {
        "topics": ["garbage segregation", "door-to-door waste collection", "sanitary landfill", "community toilet maintenance", "drain cleaning and desilting", "sewage treatment plant", "litter bin placement", "open drain hazards"],
        "departments": ["Solid Waste Management Cell", "Sanitation Department", "City Cleaning Mission", "Public Health Division"]
    },
    "roads": {
        "topics": ["pothole repairs", "bitumen resurfacing", "road widening", "speed breaker installation", "zebra crossings and lane marking", "pavement repair", "stormwater runoff on roads", "traffic diversion signage"],
        "departments": ["Roads and Buildings Division", "Public Works Department", "Highways Authority", "Municipal Engineering Wing"]
    },
    "transport": {
        "topics": ["bus route 42 frequency", "electric bus deployment", "ticket pricing and smart cards", "bus stop shelters", "metro feeder shuttle", "low-floor accessible buses", "transit timetable accuracy", "conductor courtesy"],
        "departments": ["City Transport Corporation", "Metropolitan Transit Authority", "State Road Transport Division", "Urban Mobility Cell"]
    },
    "healthcare": {
        "topics": ["primary health clinic hours", "doctor availability at CHC", "generic medicine stock", "emergency intake response", "maternal and child care desk", "diagnostic laboratory equipment", "patient queue management", "telemedicine consultation booth"],
        "departments": ["District Health Society", "Department of Health & Family Welfare", "National Health Mission Desk", "Community Health Center Bureau"]
    },
    "education": {
        "topics": ["government school teacher attendance", "mid-day meal nutrition", "science lab equipment", "digital classroom connectivity", "school roof waterproofing", "drinking water and pupil toilets", "free textbook distribution", "after-school tutoring programme"],
        "departments": ["Department of School Education", "District Education Office", "Samagra Shiksha Cell", "Municipal School Board"]
    },
    "housing": {
        "topics": ["affordable housing subsidy", "tenement allotment verification", "building permit approval turnaround", "slum rehabilitation tenements", "housing cooperative deed transfer", "structural audit of old blocks", "waterproofing in public quarters", "title deed regularization"],
        "departments": ["State Housing Board", "Urban Development Authority", "Affordable Housing Mission", "Slum Clearance Board"]
    },
    "electricity": {
        "topics": ["voltage fluctuation and surges", "transformer replacement", "scheduled load shedding notices", "smart meter billing disputes", "underground cable laying", "damaged electric poles", "street transformer fencing", "rooftop solar grid tie-in"],
        "departments": ["Electricity Distribution Corporation", "Power Transmission Utility", "Energy Department Grievance Cell", "District Power Bureau"]
    },
    "welfare": {
        "topics": ["widow and disability pension disbursement", "food grain ration distribution", "farmer subsidy direct transfer", "artisan livelihood allowance", "BPL card renewal and KYC", "maternity benefit tranche", "senior citizen welfare pension", "unemployment stipend portal"],
        "departments": ["Department of Social Justice", "Civil Supplies & Consumer Affairs", "Social Welfare Directorate", "Direct Benefit Transfer Cell"]
    },
    "safety": {
        "topics": ["CCTV surveillance camera coverage", "street lighting along dark alleys", "night police patrolling", "women helpdesk at police stations", "pedestrian underpass lighting", "abandoned vehicle clearance", "neighborhood watch coordination", "emergency SOS kiosk functionality"],
        "departments": ["City Police Commissionerate", "Public Safety Directorate", "Municipal Electrical Lighting Wing", "Traffic & Crime Monitoring Cell"]
    },
    "accessibility": {
        "topics": ["tactile paving on footpaths", "wheelchair ramps at administrative offices", "braille signage in public buildings", "accessible toilet stalls", "audio announcements at bus terminals", "low-counter service windows for disabled citizens", "sign language interpreter availability", "step-free railway foot overbridge"],
        "departments": ["Department of Empowerment of Persons with Disabilities", "Barrier-Free Access Cell", "Social Welfare Accessibility Wing", "Civic Infrastructure Accessibility Board"]
    },
    "municipal": {
        "topics": ["birth and death certificate issuance", "trade licence online renewal", "property tax assessment disputes", "building layout plan sanction", "encroachment removal drives", "stray animal management and immunization", "park maintenance and walking tracks", "grievance redressal token tracker"],
        "departments": ["Municipal Corporation Office", "Revenue & Property Tax Section", "Urban Local Body Directorate", "Citizen Services Citizen Facilitation Center"]
    },
    "digital": {
        "topics": ["single-window citizen service portal", "mobile governance smartphone app", "digital payment gateway failures", "OTP authentication delays", "document locker integration", "server downtime during peak submission", "multilingual portal interface", "helpdesk ticket response speed"],
        "departments": ["Department of Information Technology", "E-Governance Mission Team", "Digital Citizen Services Directorate", "NIC State Centre Support"]
    },
    "infrastructure": {
        "topics": ["railway overbridge construction", "river embankment flood protection wall", "underground drainage trunk line", "inter-district bypass road", "causeway height raising", "stormwater retention basin", "flyover lighting and expansion joints", "irrigation canal desilting"],
        "departments": ["Infrastructure Development Corporation", "Irrigation & Flood Control Department", "Major Works Wing", "Urban Infrastructure Board"]
    },
    "community": {
        "topics": ["ward-level gram sabha consultations", "public library book stock and reading room", "open-air gymnasium equipment", "children play area swings and soft turf", "community hall booking portal", "public tree planting drive and maintenance", "youth sports ground leveling", "senior citizens shaded seating area"],
        "departments": ["Panchayati Raj Department", "Community Development Directorate", "Youth & Sports Welfare Wing", "Municipal Parks & Gardens Cell"]
    }
}

# Rich varied sentence patterns for realistic public consultation submissions

# 1. POSITIVE PATTERNS (Satisfaction, verified improvements, prompt handling, commendations)
POSITIVE_PATTERNS = [
    "The newly introduced {topic} has significantly improved daily life in our ward. Staff at the {department} were courteous and responsive.",
    "I want to commend the {department} for resolving our concerns regarding {topic}. The work was finished ahead of schedule.",
    "Prompt service and clear communication on the {topic}. It saved our family multiple visits to government offices.",
    "The recent upgrades to {topic} are functioning very smoothly. The neighborhood is genuinely pleased with this progress.",
    "Appointments and consultations for {topic} were handled with professionalism and great care by the on-duty officers.",
    "We have noticed a major positive transformation in {topic} over the past three months. Transparent and efficient service.",
    "Submitting our feedback on {topic} was straightforward, and the municipal team implemented the suggestions within two weeks.",
    "The team dispatched for {topic} arrived on time, listened patiently to residents, and completed the work cleanly.",
    "Everything regarding {topic} has been managed with commendable speed and clarity by the {department}.",
    "The modern approach to {topic} is working exceedingly well. Online tracking showed clear stage-by-stage updates.",
    "Reliable, clean, and consistent delivery of {topic}. This intervention has made a measurable difference for local citizens.",
    "Heartfelt appreciation to the municipal engineers who supervised the {topic}. The outcome exceeded our community's expectations.",
    "Thanks to the proactive action on {topic}, our neighborhood no longer faces the disruptions that troubled us last year.",
    "The staff at {department} explained the complete procedure for {topic} patiently and cleared our verification without delay.",
    "High quality work and sustained follow-up on {topic}. We hope this excellent standard of governance is maintained.",
    "Very satisfied with the speed of approval for our application under {topic}. The online portal was simple and effective.",
    "The field staff deployed for {topic} were attentive, polite, and resolved our community's request efficiently.",
    "Commendable progress on {topic}. Commuters and local residents have benefited immensely from these timely measures.",
    "The new schedule for {topic} is prompt, transparent, and strictly followed by the administration. Truly appreciative.",
    "A wonderful initiative by the {department}. The implementation of {topic} has brought immense relief to senior citizens.",
    "Our cooperative society is thoroughly pleased with the swift completion of {topic}. Excellent coordination by the authorities.",
    "The {department} acted decisively to ensure {topic} was delivered without any red tape or unnecessary delays.",
    "Transparent grievance handling regarding {topic}. We received an SMS confirmation and the ground work was completed in 48 hours."
]

# 2. NEGATIVE PATTERNS (Complaints, breakdowns, unresponsiveness, recurring problems, severe friction)
NEGATIVE_PATTERNS = [
    "The situation regarding {topic} has deteriorated badly. Repeated complaints to the {department} have been closed without inspection.",
    "Extremely frustrated with the poor handling of {topic}. The portal crashes repeatedly and nobody answers the toll-free helpline.",
    "Severe delays in {topic} are causing immense hardship for working families in our ward. Zero accountability from field staff.",
    "Despite multiple public petitions, the {department} has failed to address the recurring breakdown of {topic}.",
    "The quality of work done for {topic} is unacceptably substandard. Within days of repair, the same problem has resurfaced.",
    "Staff at the {department} were dismissive and unhelpful when we requested updates on our pending file for {topic}.",
    "It is completely unacceptable that residents are forced to wait for months just to obtain basic service under {topic}.",
    "The online service for {topic} constantly throws server errors at the final submission step, wasting hours of citizen time.",
    "Neglect and lack of routine maintenance have turned {topic} into a serious safety hazard for children and elderly residents.",
    "We submitted formal grievances regarding {topic} three weeks ago, but no action or acknowledgment has been received.",
    "Corrupt practices and bureaucratic hurdles continue to plague the delivery of {topic}. Citizens deserve transparent service.",
    "The arbitrary disruption of {topic} without prior notice has thrown our entire neighborhood into chaos. Unacceptable governance.",
    "Contractors hired by the {department} abandoned the work on {topic} halfway through, leaving debris and deep trenches open.",
    "Mismanagement and total apathy regarding {topic}. The public deserves an urgent audit and strict action against negligent officials.",
    "Long queues, broken kiosks, and missing staff when visiting the counter for {topic}. A deeply disappointing experience.",
    "The {department} claims on paper that {topic} has been resolved, but ground realities remain completely unchanged.",
    "Frequent voltage dips and unannounced outages related to {topic} have damaged household appliances across our colony.",
    "Shockingly poor customer support for {topic}. Automated responses close our complaints while the ground issue remains intact.",
    "The lack of barrier-free ramps and accessible facilities for {topic} violates government accessibility guidelines and causes extreme distress.",
    "We are facing acute health risks due to the unaddressed contamination and overflow related to {topic}. Urgent intervention needed.",
    "The document verification desk for {topic} demands unnecessary affidavits and creates endless harassment for poor applicants.",
    "No progress on {topic} despite repeated promises by the ward council. Residents are forced to stage public protests."
]

# 3. NEUTRAL PATTERNS (Official announcements, informational submissions, procedural inquiries, factual observations)
NEUTRAL_PATTERNS = [
    "The {department} has notified that applications for {topic} will be accepted starting next Monday through the designated portal.",
    "According to the public circular, the scheduled inspection of {topic} will take place between 10 AM and 4 PM this Thursday.",
    "The revised guidelines for {topic} require applicants to submit proof of residence and an identity certificate.",
    "A public consultation meeting regarding the proposed expansion of {topic} is scheduled at the district civic center.",
    "The municipal bulletin indicates that maintenance works on {topic} are planned for the upcoming weekend across zones 3 and 4.",
    "Citizens seeking details about {topic} are advised to consult the published government gazette notification dated 12th February.",
    "The tender process for {topic} is currently under evaluation by the technical review committee of the {department}.",
    "Please clarify whether the eligibility criteria for {topic} apply to cooperative housing societies registered before 2020.",
    "The informational brochure on {topic} has been uploaded to the official website for public download and review.",
    "A survey is being conducted by the {department} to assess the current coverage and feeder requirements for {topic}.",
    "The notification specifies that offline submission for {topic} will remain operational alongside the new digital service desk.",
    "The quarterly audit report on {topic} was tabled during the district development coordination committee meeting.",
    "Inquiry regarding the timeline for the second phase of the public consultation on {topic}. Kindly share the schedule.",
    "The department circular confirms that existing beneficiaries of {topic} must complete biometrics verification before March 31.",
    "Notice is hereby given that the draft policy document on {topic} is available for public comments for a period of thirty days.",
    "The operational jurisdiction for {topic} is divided between the municipal corporation and the district rural development agency.",
    "Statistical data regarding {topic} will be published in the annual administrative report of the {department}.",
    "The registration window for the pilot test of {topic} will remain open until the allocated quota of 500 participants is reached.",
    "We request the {department} to state the designated nodal officer's contact details for matters pertaining to {topic}.",
    "The feasibility report on {topic} prepared by the urban planning institute is currently undergoing departmental review."
]

# 4. MIXED / NUANCED PATTERNS (Recognizes improvement BUT points out persistent secondary flaws or implementation gaps)
MIXED_PATTERNS = [
    ("positive", "The new infrastructure for {topic} is much cleaner and better than before, but {topic_neg} continues to cause severe frustration for local residents."),
    ("negative", "While the {department} has improved the speed of {topic}, the quality of service remains very poor and requires immediate inspection."),
    ("negative", "We appreciate that {topic} was initiated on time, however the staff were dismissive and the documents were repeatedly misplaced."),
    ("positive", "The online booking for {topic} is convenient and fast, although the physical intake counter at the office remains chaotic."),
    ("negative", "The main pipeline for {topic} was laid efficiently, but our street has been completely left out without any connection."),
    ("positive", "Public transport frequency has improved on the {topic} route, but the buses are overcrowded and lack wheelchair access."),
    ("negative", "The road was resurfaced nicely for {topic}, but the contractors failed to clear the debris and blocked the drainage inlets."),
    ("positive", "Staff at the {department} were very helpful and courteous, but the government portal itself kept crashing during submission."),
    ("negative", "The clinic has expanded doctor hours for {topic}, but essential generic medicines are still consistently out of stock."),
    ("positive", "The streetlights installed under {topic} are bright and modern, but three units on our lane have been dark for two weeks."),
    ("negative", "The grievance token system for {topic} is a good modern step, but the actual complaints get closed without any ground resolution.")
]

# 5. REQUEST PATTERNS (Explicit citizen proposals, appeals, calls for intervention)
REQUEST_PATTERNS = [
    ("negative", "Please increase the frequency of {topic} in our ward as the current schedule is totally inadequate."),
    ("negative", "The government should immediately deploy a dedicated inspection team to review the substandard work on {topic}."),
    ("negative", "We urge the {department} to repair the leaking valves and damaged pipes affecting {topic} without further delay."),
    ("neutral", "We request the authorities to publish the updated weekly timetable for {topic} on public noticeboards."),
    ("negative", "Please extend the reach of {topic} to the newly developed housing colonies that currently receive zero service."),
    ("negative", "The {department} must replace the damaged equipment and restore normal operations for {topic} immediately."),
    ("neutral", "We suggest introducing a digital token counter and senior citizen queue for {topic} to reduce waiting times."),
    ("negative", "Please conduct regular water quality and contamination testing for {topic} and publish the laboratory findings."),
    ("negative", "The municipal body should install protective speed breakers and clear warning signage near the school zone for {topic}."),
    ("neutral", "We request the administration to provide step-free ramps and audio announcements to make {topic} accessible to all citizens.")
]

# Informal / colloquial variations to simulate real-world citizen writing
COLLOQUIAL_VARIATIONS = [
    "pls check this asap",
    "still no response from office",
    "very bad experience with the portal",
    "thank you team for the quick help",
    "nobody is listening to our ward",
    "good job by municipal workers today",
    "hoping for a quick resolution",
    "worst service ever received"
]


def generate_dataset(target_count=10000) -> pd.DataFrame:
    records = []
    seen_texts = set()

    domain_keys = list(DOMAINS.keys())

    # Target counts per class for near-perfect balance
    target_per_class = target_count // 3

    counts = {"positive": 0, "negative": 0, "neutral": 0}

    print(f"Generating ~{target_count} public consultation feedback records...")

    # Pass 1: High quality template combinatorics with random variations
    while min(counts.values()) < target_per_class:
        # Choose random domain
        domain_name = random.choice(domain_keys)
        domain = DOMAINS[domain_name]
        topic = random.choice(domain["topics"])
        dept = random.choice(domain["departments"])

        # Decide which class needs more rows
        needed_classes = [c for c, cnt in counts.items() if cnt < target_per_class]
        if not needed_classes:
            break
        chosen_class = random.choice(needed_classes)

        if chosen_class == "positive":
            pattern = random.choice(POSITIVE_PATTERNS)
            text = pattern.format(topic=topic, department=dept)
            # Occasional informal addition
            if random.random() < 0.15:
                text += " " + random.choice(["Greatly appreciated.", "Keep up the good work.", "Thanks to the entire department team.", "Very satisfied with this."])
            label = "positive"

        elif chosen_class == "negative":
            # 70% negative patterns, 30% negative requests
            if random.random() < 0.35:
                _, req_pattern = random.choice([p for p in REQUEST_PATTERNS if p[0] == "negative"])
                text = req_pattern.format(topic=topic, department=dept)
            else:
                pattern = random.choice(NEGATIVE_PATTERNS)
                text = pattern.format(topic=topic, department=dept)
            if random.random() < 0.15:
                text += " " + random.choice(["Kindly look into this immediately.", "Pls resolve this urgently.", "Hoping for prompt action.", "This requires immediate attention."])
            label = "negative"

        else: # neutral
            if random.random() < 0.25:
                _, req_pattern = random.choice([p for p in REQUEST_PATTERNS if p[0] == "neutral"])
                text = req_pattern.format(topic=topic, department=dept)
            else:
                pattern = random.choice(NEUTRAL_PATTERNS)
                text = pattern.format(topic=topic, department=dept)
            label = "neutral"

        # Minor punctuation or casing variations to simulate realistic text
        r_var = random.random()
        if r_var < 0.05:
            text = text.lower()
        elif r_var < 0.10:
            text = text.replace("please", "pls").replace("Please", "Pls")

        clean_key = text.strip().lower()
        if clean_key not in seen_texts and len(clean_key) > 20:
            seen_texts.add(clean_key)
            records.append({"feedback": text.strip(), "sentiment": label})
            counts[label] += 1

    # Pass 2: Mixed feedback generation (~1,000 mixed sentences strategically labeled by net polarity)
    mixed_target = 600
    mixed_added = 0
    while mixed_added < mixed_target:
        domain_name = random.choice(domain_keys)
        domain = DOMAINS[domain_name]
        topic1 = random.choice(domain["topics"])
        topic2 = random.choice(domain["topics"])
        dept = random.choice(domain["departments"])

        lbl, pattern = random.choice(MIXED_PATTERNS)
        text = pattern.format(topic=topic1, topic_neg=topic2, department=dept)
        clean_key = text.strip().lower()

        if clean_key not in seen_texts:
            seen_texts.add(clean_key)
            records.append({"feedback": text.strip(), "sentiment": lbl})
            counts[lbl] += 1
            mixed_added += 1

    # Pass 3: Incorporate original improved dataset (602 verified records)
    improved_csv = Path("sentiment_dataset_improved.csv")
    if improved_csv.exists():
        imp_df = pd.read_csv(improved_csv)
        for _, row in imp_df.iterrows():
            t = str(row["feedback"]).strip()
            s = str(row["sentiment"]).strip().lower()
            clean_k = t.lower()
            if clean_k and clean_k not in seen_texts and s in ("positive", "negative", "neutral"):
                seen_texts.add(clean_k)
                records.append({"feedback": t, "sentiment": s})
                counts[s] += 1

    # Pass 4: Real consultation canonical examples
    real_world_cases = [
        ("The portal was very slow, frustrating, and difficult to use.", "negative"),
        ("The website was very slow, confusing, and frustrating to use.", "negative"),
        ("The online portal is extremely slow, frustrating, and difficult to use for elderly citizens.", "negative"),
        ("Constant power cuts continue to disrupt small businesses daily.", "negative"),
        ("Severe power cuts disrupt businesses and cause extreme hardship.", "negative"),
        ("The process was quick and very helpful.", "positive"),
        ("The application was submitted for processing on Monday.", "neutral"),
        ("The new water supply is much better than before, but the water pressure remains low.", "positive"),
        ("The road has been repaired and travel is easier, although drainage is still a problem.", "negative"),
        ("The hospital appointment system is convenient, but specialist appointments remain difficult to obtain.", "negative"),
        ("Please conduct regular water-quality testing in our neighborhood.", "negative"),
        ("The bus service frequency has been improved significantly.", "positive")
    ]
    for t, s in real_world_cases:
        clean_k = t.strip().lower()
        if clean_k not in seen_texts:
            seen_texts.add(clean_k)
            records.append({"feedback": t.strip(), "sentiment": s})
            counts[s] += 1

    df = pd.DataFrame(records)
    # Shuffle dataset thoroughly
    df = df.sample(frac=1.0, random_state=42).reset_index(drop=True)

    # Validate no nulls or duplicates
    df = df.dropna().drop_duplicates(subset=["feedback"]).reset_index(drop=True)

    print(f"Generated {len(df)} records.")
    print("Class distribution:")
    print(df["sentiment"].value_counts())
    print(f"Average character length: {df['feedback'].str.len().mean():.1f}")
    print(f"Average word count: {df['feedback'].str.split().str.len().mean():.1f}")

    return df


if __name__ == "__main__":
    df = generate_dataset(10000)
    output_path = Path("sentiment_dataset_10k.csv")
    df.to_csv(output_path, index=False)
    print(f"Saved dataset to {output_path.resolve()}")

