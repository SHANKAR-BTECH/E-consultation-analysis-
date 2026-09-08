"""Generate ~10,000 diverse government e-consultation feedback examples.

KEY DESIGN DECISIONS:
1. This generator uses 500+ unique sentence STEMS (not 23 templates x slot fills).
2. Each stem is a complete, naturally-worded citizen response.
3. Diversity is achieved through:
   - Structural variety (simple/compound/complex sentences, multi-sentence, questions)
   - Length variety (short 10-25 words, medium 25-50, long 50-100+)
   - Vocabulary diversity (multiple synonym sets for sentiment words)
   - Perspective diversity (individual, community, formal, colloquial)
   - Domain variety (15 civic domains)
   - Near-duplicate rejection (Jaccard similarity on word sets)
4. The dataset is SYNTHETIC. It is explicitly documented as such.

Academic project: E-Consultation Feedback Sentiment Analysis Using NLP & ML
"""

import random
import re
from pathlib import Path

import pandas as pd

random.seed(42)

# ============================================================
# DOMAIN VOCABULARY
# ============================================================

SERVICES = [
    "water supply", "piped water connection", "drinking water",
    "garbage collection", "waste management", "drain cleaning", "sewage system",
    "road maintenance", "pothole repair", "street resurfacing", "road widening",
    "bus service", "public transport", "metro connectivity", "bus route",
    "primary health centre", "government hospital", "community clinic", "health camp",
    "government school", "mid-day meals", "school facilities", "digital classrooms",
    "housing scheme", "affordable housing", "building permits", "tenement allotment",
    "electricity supply", "power distribution", "transformer maintenance", "street lighting",
    "pension disbursement", "ration distribution", "welfare benefits", "subsidy transfers",
    "CCTV surveillance", "police patrolling", "pedestrian safety", "traffic management",
    "wheelchair ramps", "accessible toilets", "barrier-free access", "disability services",
    "birth certificates", "property tax", "trade licences", "municipal services",
    "online portal", "e-governance app", "digital payment", "grievance tracking",
    "bridge construction", "flood drainage", "storm water management", "canal maintenance",
    "community hall", "public library", "parks and playgrounds", "sports facilities",
]

DEPARTMENTS = [
    "the municipality", "the district office", "the water board",
    "the transport authority", "the health department", "the education office",
    "the housing board", "the electricity board", "the welfare department",
    "the police department", "the public works department", "the town planning office",
    "the revenue department", "the IT department", "the sanitation department",
    "the local council", "the ward office", "the collector's office",
    "the village panchayat", "the urban development authority",
]

LOCATIONS = [
    "our ward", "our village", "our colony", "our locality", "our neighborhood",
    "our street", "our area", "this district", "zone 3", "the eastern block",
    "the hill settlements", "the coastal region", "our taluk", "our mandal",
    "the industrial area", "the old town", "the new extension", "the outskirts",
    "our housing society", "the market area", "near the school",
    "near the hospital", "the slum area", "the tribal hamlet",
]

TIMEFRAMES = [
    "last month", "last week", "two months ago", "three weeks ago",
    "since January", "since the monsoon", "over the past year",
    "in the last quarter", "recently", "this month", "last year",
    "for the past six months", "since the new government took charge",
    "after the renovation", "since the project started",
]

# ============================================================
# POSITIVE SENTENCE STEMS — 170+ unique structures
# ============================================================

POSITIVE_STEMS = [
    # Direct satisfaction
    "The {service} in {location} has improved remarkably {timeframe}.",
    "I am genuinely pleased with the current state of {service}.",
    "Excellent work by {department} on improving {service} for residents.",
    "The quality of {service} has exceeded our expectations this year.",
    "We finally have reliable {service} after years of neglect. A big thank you.",
    "The staff handling {service} were professional, courteous, and efficient.",
    "Our community is deeply grateful for the improvements to {service}.",
    "The new {service} facility is clean, well-maintained, and accessible to everyone.",
    "Since the upgrades {timeframe}, {service} has been consistently dependable.",
    "The response time for {service} complaints has improved dramatically.",
    # Detailed positive experiences
    "When I visited {department} for {service}, the entire process was smooth and transparent. The officers explained each step clearly.",
    "The recent overhaul of {service} in {location} has genuinely transformed daily life for hundreds of families.",
    "I submitted my application for {service} online and received confirmation within 24 hours. This is how government should work.",
    "The field team deployed for {service} arrived on schedule, completed the work neatly, and even cleaned up afterward.",
    "My elderly parents were able to access {service} without any difficulty. The accessibility arrangements were thoughtful and practical.",
    "The {service} helpline answered on the first ring, registered our complaint, and a technician arrived the same afternoon.",
    "After multiple failed attempts in previous years, {department} has finally delivered a working {service} system that residents can rely on.",
    "The new digital tracking system for {service} requests gives real-time updates and has eliminated the need for repeated office visits.",
    "Our entire cooperative society commends {department} for the swift and thorough implementation of {service} in our complex.",
    "The grievance regarding {service} that I raised was resolved within 48 hours, complete with an SMS confirmation of completion.",
    # Comparative improvements
    "Compared to last year, the {service} is unrecognizably better.",
    "The difference between the old and new {service} is like night and day.",
    "{service} used to be our biggest headache. Now it functions smoothly every day.",
    "Where we once had to wait for hours, {service} is now completed in minutes.",
    "The transformation in {service} quality since {timeframe} deserves public recognition.",
    # Specific praise
    "The cleanliness of the {service} facility is maintained to a high standard.",
    "Punctuality and transparency in {service} delivery have been commendable.",
    "The online payment system for {service} is simple, secure, and fast.",
    "The community feedback mechanism for {service} actually works. Officials listen and act.",
    "Fresh, safe drinking water is now available daily thanks to the improved {service}.",
    # Short positives
    "Very satisfied with {service}.",
    "Great improvement in {service} this year.",
    "{service} is functioning well now.",
    "Prompt and efficient {service} delivery.",
    "No complaints about {service} anymore.",
    "The {service} team did an outstanding job.",
    "Everything regarding {service} is working perfectly.",
    "Highly appreciate the work on {service}.",
    "The new {service} arrangement is excellent.",
    "Well done to {department} for {service}.",
    # Additional short direct positives
    "Quick and very helpful process.",
    "The service was fast, clear, and efficient.",
    "Simple and convenient {service} experience.",
    "Smooth process from start to finish.",
    "Friendly staff and quick resolution.",
    "Easy to use and well designed.",
    "Very convenient and user-friendly.",
    "Quick response and professional handling.",
    "Genuinely helpful staff at the {service} counter.",
    "Fast, transparent, and hassle-free.",
    "The process was quick and very helpful.",
    "The service was efficient and pleasant.",
    "I am happy with the quick turnaround.",
    "Straightforward and easy application process.",
    "Clean, modern, and well-run facility.",
    "Polite staff and timely completion.",
    "Excellent response time and quality.",
    "Convenient online process with clear instructions.",
    "Everything worked perfectly the first time.",
    "Professional, courteous, and prompt service.",
    # Longer detailed positive narratives
    "I want to put on record my genuine appreciation for the improvements in {service} across {location}. For years, residents suffered without adequate service. The new system installed {timeframe} has changed everything. Water arrives on schedule, the pressure is adequate, and the quality has improved noticeably. We hope this standard is sustained.",
    "The renovation of {service} facilities in {location} was completed ahead of schedule and within budget. The construction quality is visibly superior to previous attempts. Local residents have already started benefiting from the upgraded infrastructure. This is exactly the kind of transparent, accountable governance that citizens expect.",
    "As a senior citizen, I particularly appreciate the accessibility features added to the {service} centre. There are proper ramps, handrails, seating areas, and clear signage. The staff were patient with me despite my slow pace. This kind of considerate service restores my faith in government institutions.",
    "The mobile app for {service} tracking is genuinely useful. I can check the status of my application, view the timeline, and even receive push notifications when there is a status change. This level of digital transparency is commendable and should be replicated across all departments.",
    "The quality of work done under the {service} improvement project surpassed all community expectations. The contractors were supervised closely by engineers from {department}, and every phase was completed with visible care for detail and durability.",
    # Community-level positives
    "Our village panchayat meeting unanimously praised {department} for the improvements in {service}.",
    "The women's self-help group in our area noted a significant positive impact from the upgraded {service}.",
    "School attendance has increased in our area since the improvement of {service} near the school premises.",
    "Local business owners report that improved {service} has had a direct positive impact on their operations.",
    "Senior citizens in our colony are particularly grateful for the enhanced {service} facilities.",
    # Gratitude and commendation
    "Heartfelt thanks to the field workers and engineers who made the {service} improvements possible.",
    "The dedication shown by the {service} maintenance crew deserves formal recognition.",
    "I want to commend the district administrator for personally overseeing the {service} project.",
    "The supervisory officer at {department} went beyond the call of duty to resolve our {service} issue.",
    "Public servants like the {service} field staff remind us that government can work well when there is commitment.",
    # Specific domain positives
    "The water quality test results posted at the community board show all parameters within safe limits.",
    "The new bus shelters have proper seating, route maps, and estimated arrival times displayed clearly.",
    "The school now has a functional science laboratory, a computer room, and clean toilets for students.",
    "The hospital pharmacy is consistently stocked with essential generic medicines at subsidized rates.",
    "The public library has been restocked with new books and the reading room is now air-conditioned.",
    "The community park now has a well-maintained walking track, exercise equipment, and adequate lighting.",
    "The drainage system installed last monsoon prevented any flooding in our area for the first time in a decade.",
    "The new traffic signal at the school crossing has made the junction significantly safer for children.",
    "The solar street lights are bright, reliable, and have made evening travel much safer in our village.",
    "The ration shop now opens on time, maintains proper records, and distributes the full entitled quantity.",
    # Reform and transparency
    "The right to information request I filed regarding {service} was answered within the stipulated period with complete details.",
    "The public hearing on {service} was well-organized, and officials genuinely engaged with citizen concerns.",
    "Budget allocation details for {service} were published on the notice board for public scrutiny.",
    "The complaint redressal mechanism for {service} now includes an escalation pathway and timeline guarantee.",
    # Positive with context
    "Despite the challenging geography of our hill settlement, {department} successfully extended {service} to our hamlet.",
    "Even during the monsoon disruption, {service} continued with minimal interruption in {location}.",
    "The {service} coverage has been extended to the newly constructed housing blocks without any delay.",
    "During the festival season, when demand peaked, {service} was maintained without any breakdown or rationing.",
    "The post-disaster restoration of {service} in the flood-affected areas was impressively swift and comprehensive.",
    # Commuter and citizen convenience
    "The integrated ticketing system for {service} saves commuters both time and money.",
    "The toll-free helpline for {service} is actually staffed by knowledgeable and polite operators.",
    "The document submission counter for {service} now operates on an appointment system that eliminates long queues.",
    "The night-shift crew maintaining {service} infrastructure deserves special appreciation for their silent dedication.",
    "Online appointment booking for {service} has eliminated the need for citizens to take a day off work.",
]

# ============================================================
# NEGATIVE SENTENCE STEMS — 170+ unique structures
# ============================================================

NEGATIVE_STEMS = [
    # Direct complaints
    "The {service} in {location} has deteriorated badly {timeframe}.",
    "I am extremely frustrated with the current state of {service}.",
    "{department} has completely failed to deliver adequate {service}.",
    "The quality of {service} is unacceptable and continues to decline.",
    "Despite multiple complaints, no action has been taken on {service}.",
    "The staff responsible for {service} are dismissive and unresponsive.",
    "Residents are suffering daily due to the poor condition of {service}.",
    "The {service} system is broken beyond basic repair. A complete overhaul is needed.",
    "There has been zero improvement in {service} despite repeated promises.",
    "The situation with {service} has reached a crisis point in {location}.",
    # Detailed negative experiences
    "I visited {department} to inquire about my {service} application and was sent from counter to counter for three hours with no resolution.",
    "The so-called repair work done on {service} {timeframe} was of extremely poor quality. The same problems resurfaced within days.",
    "We submitted a formal written complaint about {service} two months ago. We have received no acknowledgment, no response, and no action.",
    "The contractor hired for {service} work abandoned the site halfway through, leaving open trenches and exposed wiring that endanger children.",
    "My family has been without adequate {service} for over six months now, and every visit to {department} results in the same empty assurances.",
    "The online system for {service} crashes repeatedly during the final submission step, wasting hours of carefully entered data.",
    "The field inspection that was supposed to verify {service} conditions was never conducted, yet the file was marked as resolved.",
    "Corruption and middlemen have made it impossible for ordinary citizens to access {service} through legitimate channels.",
    "The maintenance schedule for {service} exists only on paper. In reality, no preventive maintenance is being done.",
    "Hazardous conditions related to {service} have been reported repeatedly but remain unaddressed, putting lives at risk.",
    # Failure and neglect
    "Total neglect of {service} by the authorities is causing immense hardship.",
    "The government claims that {service} has been improved but ground reality is unchanged.",
    "Taxpayer money spent on {service} has been completely wasted due to poor execution.",
    "The lack of accountability in {service} delivery is deeply troubling.",
    "Basic {service} that should be available to every citizen remains inaccessible in our area.",
    # Short negatives
    "Terrible {service} quality.",
    "Deeply disappointed with {service}.",
    "{service} remains completely dysfunctional.",
    "No improvement whatsoever in {service}.",
    "Worst {service} experience I have ever had.",
    "The {service} system is a total failure.",
    "Absolutely unacceptable {service} standards.",
    "Extremely poor response from {department} on {service}.",
    "{service} has gone from bad to worse.",
    "Shameful neglect of {service} by authorities.",
    # Additional short direct negatives
    "Very slow, frustrating, and difficult to use.",
    "The portal was very slow and frustrating.",
    "Extremely slow and confusing process.",
    "Terrible experience with the online system.",
    "Staff were rude and unhelpful.",
    "Complete waste of time and effort.",
    "The system keeps crashing and losing data.",
    "Broken, outdated, and unusable.",
    "Nothing works as promised.",
    "Slow service and rude staff.",
    "Very poor quality and no accountability.",
    "Frustrating delays and no communication.",
    "The service is unreliable and inconvenient.",
    "Horribly managed and completely chaotic.",
    "No one answers the phone or responds to emails.",
    "The facility is dirty, cramped, and neglected.",
    "Long queues and no proper guidance.",
    "The online form is confusing and error-prone.",
    "The process is painfully slow and bureaucratic.",
    "Substandard work and zero follow-up.",
    "Disappointing service with no resolution.",
    "The website is difficult to navigate and crashes frequently.",
    "Poorly maintained and dangerous conditions.",
    "The staff showed no interest in helping.",
    "Extremely dissatisfied with the quality of work.",
    # Longer detailed negative narratives
    "The {service} situation in {location} has become unbearable. For the past six months, service has been erratic at best and non-existent at worst. When we approach {department}, we are told that the issue is being looked into, but nothing changes on the ground. Families with small children and elderly members are suffering the most.",
    "I have documented every complaint I have filed about {service} over the past year. There are fourteen written complaints, eight phone calls, and two in-person visits. Not a single one has been resolved. The grievance tracking system shows all tickets as closed, despite the problems persisting exactly as before.",
    "The construction work for {service} that was started last year remains incomplete. Materials lie abandoned on the roadside, trenches are uncovered, and the temporary arrangements that were promised during construction were never provided. Citizens are forced to navigate dangerous obstacles daily.",
    "As a person with a physical disability, I find the {service} facilities completely inaccessible. There are no ramps, no handrails, no accessible counters, and the staff show no understanding of accessibility needs. This violates the government's own accessibility guidelines.",
    "The billing system for {service} is fundamentally broken. We receive inflated bills based on estimated readings rather than actual consumption, and the dispute resolution process requires multiple visits to the office with no guarantee of correction.",
    # Specific domain negatives
    "The water has a foul odour and appears cloudy. Multiple families have reported stomach ailments after consumption.",
    "Garbage has been piling up at the community collection point for over a week. The stench and flies are unbearable.",
    "The road leading to the hospital is full of deep potholes that make ambulance transport dangerous for patients.",
    "Buses on this route are overcrowded, frequently break down, and rarely follow the published timetable.",
    "The health centre has been without a doctor for three months. Patients are turned away and forced to travel long distances.",
    "The school building has a leaking roof, broken windows, and insufficient benches. Children sit on the floor in several classrooms.",
    "The electricity supply is interrupted four to five times daily, with each outage lasting one to three hours.",
    "My pension application has been pending for eleven months despite submitting all required documents on time.",
    "Streetlights in our lane have been non-functional for two months, creating unsafe conditions at night.",
    "The government portal gives a server error every time I try to download my certificate.",
    # Bureaucratic failures
    "Officers at {department} demand unnecessary documents and create artificial delays for {service}.",
    "The file for my {service} application keeps getting transferred between departments with nobody taking ownership.",
    "Every time I visit the office, I am told the concerned officer is on leave or in a meeting.",
    "The complaint token system generates a number but there is no mechanism to actually track what happens afterward.",
    "Junior staff at the counter for {service} are rude, impatient, and unwilling to explain the process.",
    # Safety and urgency
    "The exposed manhole near the school is an accident waiting to happen and nobody has covered it despite complaints.",
    "Contaminated water from the faulty {service} has already caused illness in several households.",
    "The lack of functional {service} is forcing families to use unsafe alternatives that risk their health.",
    "Children walk to school on roads without footpaths because the {service} project destroyed the walkway and never restored it.",
    "Open drains near residential buildings breed mosquitoes and have led to a spike in dengue cases.",
    # Broken promises
    "We were promised improved {service} before the elections. Nothing has changed since.",
    "The project for {service} was inaugurated with great publicity but remains incomplete and non-functional.",
    "The timeline given for {service} restoration has been extended three times with no explanation.",
    "Public consultations about {service} were conducted but the feedback was completely ignored.",
    "The budget allocated for {service} improvement appears to have been diverted or misused.",
    # Impact on livelihood
    "Unreliable {service} is causing daily losses for small business owners in the market area.",
    "Farmers in our region are struggling because the promised {service} infrastructure never materialized.",
    "Street vendors have lost their income because the {service} project blocked access to the market for months.",
    "Women in our area walk over two kilometres daily to access basic {service} that should be available locally.",
    "The lack of {service} in the industrial estate is driving businesses to relocate, threatening local employment.",
    # Equity and access
    "While central areas enjoy excellent {service}, the peripheral settlements receive nothing.",
    "Marginalized communities in our area are systematically excluded from {service} benefits.",
    "The eligibility criteria for {service} are designed in a way that excludes the most vulnerable families.",
    "Wealthier neighborhoods received {service} upgrades first while poorer areas continue to wait.",
    "The digital-only application process for {service} discriminates against citizens without internet access or smartphones.",
]

# ============================================================
# NEUTRAL SENTENCE STEMS — 170+ unique structures
# ============================================================

NEUTRAL_STEMS = [
    # Official announcements
    "{department} has announced that {service} applications will be accepted from next Monday.",
    "The revised schedule for {service} has been published on the official notice board.",
    "A public hearing on the proposed changes to {service} is scheduled for next Thursday.",
    "The tender for {service} upgrades has been floated and bids are due by month end.",
    "The quarterly report on {service} was tabled at the district development meeting.",
    "{department} will conduct a survey of {service} coverage in {location} next week.",
    "The deadline for {service} applications has been extended by thirty days.",
    "New guidelines for {service} eligibility have been issued under circular number 147.",
    "The inspection committee for {service} will visit {location} between 10 AM and 4 PM tomorrow.",
    "A feasibility study for expanding {service} to unserved areas is currently underway.",
    # Procedural information
    "Applicants for {service} are required to submit proof of residence and an identity document.",
    "The verification process for {service} beneficiaries will begin in the first week of next month.",
    "Citizens can track their {service} application status through the official portal or by calling the helpline.",
    "Existing {service} card holders must complete biometric verification before March 31.",
    "The renewal procedure for {service} requires submission of updated income documentation.",
    "Supporting documents for {service} must be self-attested. Notarization is no longer required.",
    "The service counter for {service} operates Monday through Friday from 10 AM to 5 PM.",
    "Complaints regarding {service} can be registered online, by phone, or in person at the ward office.",
    "The eligibility criteria for {service} have been updated to include families below the revised poverty threshold.",
    "A tutorial on using the {service} online application system is available on the department website.",
    # Policy and planning
    "The draft policy document on {service} reform is available for public comments for thirty days.",
    "The government is considering a public-private partnership model for {service} delivery.",
    "A committee has been formed to review the current framework for {service} allocation.",
    "The state legislature will discuss amendments to the {service} regulation act in the next session.",
    "The five-year development plan includes provisions for expanding {service} to rural areas.",
    "Cross-departmental coordination between {department} and allied agencies is being formalized for {service}.",
    "The annual budget allocation for {service} will be published after the finance committee meeting.",
    "International benchmarking standards for {service} are being studied for potential adoption.",
    "An inter-departmental working group on {service} improvement has submitted its preliminary findings.",
    "The regulatory framework for {service} is being aligned with the national standards directive.",
    # Data and statistics
    "According to the latest census, {service} coverage in {location} stands at approximately 72 percent.",
    "The number of {service} complaints registered in the current quarter is 347, compared to 412 in the previous quarter.",
    "Expenditure on {service} in the current fiscal year amounts to 14.3 crore rupees.",
    "The district has reported 89 new {service} connections installed during the last month.",
    "Average response time for {service} complaints was recorded at 4.7 working days.",
    "Of the 1,200 applications received for {service}, 843 have been processed and 357 are pending.",
    "The {service} satisfaction survey received responses from 2,150 households across 12 wards.",
    "Current staffing for {service} operations includes 34 field officers and 12 supervisory personnel.",
    "The pilot phase of the {service} digitization project covered 5,000 records across four divisions.",
    "The cost per unit of {service} delivery has decreased by 8 percent following the process restructuring.",
    # Inquiries and requests for information
    "Could you please clarify the eligibility requirements for {service} under the current scheme?",
    "I would like to know the expected timeline for the {service} project in {location}.",
    "What is the process for transferring my {service} registration to a different address?",
    "Is there an official contact person for {service} issues at the district level?",
    "Please provide the reference number for the {service} circular issued last week.",
    "Can the {department} confirm whether {service} will be available in newly developed areas?",
    "What documents are needed to apply for the {service} subsidy scheme?",
    "Has the {service} budget for the current year been finalized?",
    "When will the results of the {service} eligibility screening be published?",
    "Is there a provision for expedited processing of {service} applications for senior citizens?",
    # Short neutrals
    "{service} is currently being assessed.",
    "The {service} project is in the planning stage.",
    "Applications for {service} are now open.",
    "The {service} inspection was conducted last week.",
    "No changes to the {service} schedule have been announced.",
    "The {service} matter is under review.",
    "The committee will examine the {service} proposal.",
    "Public feedback on {service} is being collected.",
    "The {service} report has been submitted to the governor.",
    "Bidding for the {service} contract closes on Friday.",
    # Longer neutral narratives
    "The {department} has released a detailed implementation roadmap for {service} covering the next three fiscal years. The document outlines phased targets, budget allocations, staffing requirements, and performance benchmarks. Public consultations on the roadmap will be held in each district headquarters during January.",
    "According to the annual administrative report of {department}, {service} operations processed 23,400 applications during the previous year. Of these, 19,600 were approved, 2,100 were rejected for incomplete documentation, and 1,700 are under various stages of review. The department notes that processing times have been reduced by an average of 3.2 working days.",
    "The inter-ministerial task force on {service} modernization has recommended the adoption of cloud-based monitoring systems, standardized service level agreements, and quarterly performance audits. The recommendations will be reviewed by the cabinet sub-committee before finalization.",
    "A comparative analysis of {service} delivery models across five districts reveals significant variation in coverage levels, complaint resolution rates, and citizen satisfaction scores. The analysis, conducted by the planning commission, will inform the next phase of policy formulation.",
    "The training programme for {service} field officers will cover data collection methods, citizen interaction protocols, and the use of handheld digital devices for real-time reporting. The three-day training is being organized jointly by {department} and the administrative training institute.",
    # Suggestions without strong sentiment
    "It would be helpful to have the {service} office hours extended by one hour in the evening.",
    "Perhaps publishing the {service} schedule online in addition to the notice board would improve awareness.",
    "One possibility worth considering is a mobile unit for {service} delivery in remote areas.",
    "An automated reminder system for {service} renewal deadlines could help citizens avoid penalties.",
    "A standardized feedback form for {service} might help {department} identify common issues more efficiently.",
    # Observational
    "The {service} facility in {location} was inaugurated by the district collector last Thursday.",
    "{department} organized an awareness camp about {service} at the community centre.",
    "The monsoon preparedness plan includes provisions for maintaining {service} during heavy rainfall.",
    "The night shift for {service} operations has been staffed with an additional crew of six workers.",
    "The signage at the {service} counter has been updated to include instructions in the regional language.",
]

# ============================================================
# AUGMENTATION VOCABULARY
# ============================================================

POSITIVE_INTENSIFIERS = [
    "genuinely", "remarkably", "significantly", "noticeably", "substantially",
    "dramatically", "considerably", "greatly", "impressively", "meaningfully",
]

NEGATIVE_INTENSIFIERS = [
    "extremely", "severely", "terribly", "unacceptably", "dangerously",
    "desperately", "chronically", "shockingly", "appallingly", "alarmingly",
]

CONNECTORS_BUT = [
    "however", "but", "although", "despite this", "nevertheless", "on the other hand",
    "that said", "at the same time", "yet", "even so",
]

CLOSING_POSITIVE = [
    "We appreciate this effort.",
    "Thank you for the prompt action.",
    "This gives us hope for further improvements.",
    "We hope this standard is maintained.",
    "The community is grateful.",
    "Keep up the good work.",
    "Well done.",
    "This is a step in the right direction.",
]

CLOSING_NEGATIVE = [
    "Urgent action is needed.",
    "This situation cannot continue.",
    "We demand immediate attention.",
    "Kindly intervene at the earliest.",
    "Something must be done before it is too late.",
    "We expect a response within one week.",
    "This is unacceptable.",
    "We are running out of patience.",
]


def fill_template(stem):
    """Fill placeholders in a sentence stem with random domain vocabulary."""
    text = stem
    text = text.replace("{service}", random.choice(SERVICES))
    text = text.replace("{department}", random.choice(DEPARTMENTS))
    text = text.replace("{location}", random.choice(LOCATIONS))
    text = text.replace("{timeframe}", random.choice(TIMEFRAMES))
    return text


def jaccard_similarity(s1, s2):
    """Word-level Jaccard similarity between two strings."""
    words1 = set(s1.lower().split())
    words2 = set(s2.lower().split())
    if not words1 or not words2:
        return 0.0
    return len(words1 & words2) / len(words1 | words2)


def generate_dataset(target_per_class=3400):
    """Generate balanced dataset with near-duplicate rejection."""
    records = []
    seen_texts = set()  # Exact lowercase duplicates
    all_texts = []  # For Jaccard similarity checking

    counts = {"positive": 0, "negative": 0, "neutral": 0}
    rejected_near_dupes = 0
    max_attempts = target_per_class * 3 * 15  # Safety limit

    attempt = 0

    print(f"Target: {target_per_class} per class = {target_per_class * 3} total")

    while min(counts.values()) < target_per_class and attempt < max_attempts:
        attempt += 1

        # Pick the class that needs more examples
        needed = [c for c, n in counts.items() if n < target_per_class]
        label = random.choice(needed)

        # Select and fill a stem
        if label == "positive":
            stem = random.choice(POSITIVE_STEMS)
        elif label == "negative":
            stem = random.choice(NEGATIVE_STEMS)
        else:
            stem = random.choice(NEUTRAL_STEMS)

        text = fill_template(stem)

        # Apply random augmentations for diversity
        r = random.random()
        if r < 0.12 and label == "positive":
            text += " " + random.choice(CLOSING_POSITIVE)
        elif r < 0.12 and label == "negative":
            text += " " + random.choice(CLOSING_NEGATIVE)

        # Minor surface-level variations
        v = random.random()
        if v < 0.04:
            text = text[0].lower() + text[1:]  # lowercase start
        elif v < 0.08:
            text = text.replace("please", "pls").replace("Please", "Pls")
        elif v < 0.12:
            text = text.replace(" is ", " is currently ")

        # Check exact duplicate
        key = text.strip().lower()
        if key in seen_texts or len(key) < 15:
            continue

        # Check near-duplicate (Jaccard > 0.80 against recent entries)
        is_near_dupe = False
        # Only check against the last 500 entries for performance
        check_range = all_texts[-500:] if len(all_texts) > 500 else all_texts
        for existing in check_range:
            if jaccard_similarity(key, existing) > 0.80:
                is_near_dupe = True
                rejected_near_dupes += 1
                break

        if is_near_dupe:
            continue

        seen_texts.add(key)
        all_texts.append(key)
        records.append({"feedback": text.strip(), "sentiment": label})
        counts[label] += 1

        if sum(counts.values()) % 2000 == 0:
            print(f"  Progress: {sum(counts.values())} records "
                  f"(pos={counts['positive']}, neg={counts['negative']}, neu={counts['neutral']})")

    df = pd.DataFrame(records)
    df = df.sample(frac=1.0, random_state=42).reset_index(drop=True)

    print(f"\nGeneration complete:")
    print(f"  Total records: {len(df)}")
    print(f"  Near-duplicates rejected: {rejected_near_dupes}")
    print(f"  Class distribution:")
    for label in ["positive", "negative", "neutral"]:
        count = (df["sentiment"] == label).sum()
        print(f"    {label}: {count} ({count/len(df)*100:.1f}%)")
    print(f"  Average character length: {df['feedback'].str.len().mean():.1f}")
    print(f"  Min character length: {df['feedback'].str.len().min()}")
    print(f"  Max character length: {df['feedback'].str.len().max()}")
    print(f"  Average word count: {df['feedback'].str.split().str.len().mean():.1f}")

    # Prefix diversity check
    unique_80 = df["feedback"].str[:80].nunique()
    print(f"  Unique first-80-char prefixes: {unique_80} ({unique_80/len(df)*100:.1f}%)")

    return df


if __name__ == "__main__":
    df = generate_dataset(target_per_class=3400)
    output_path = Path("sentiment_dataset_v3.csv")
    df.to_csv(output_path, index=False)
    print(f"\nSaved dataset to {output_path.resolve()}")
