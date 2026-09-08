"""
E-Consultation Sentiment Analysis — Premium Glassmorphism UI
Streamlit entry point.

ML pipeline (model, vectorizer, preprocessing) is unchanged.
Only the UI layer has been redesigned.
"""

import streamlit as st

from config import PROJECT_TITLE
from evaluation_info import load_evaluation
from model_service import get_service, InvalidFeedback, ModelUnavailable


# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────


EXAMPLES = [
    {
        "label": "Positive",
        "icon": "✦",
        "text": "The policy consultation was useful and the public service staff were very helpful. I received clear answers to all my questions and felt completely supported throughout the process.",
        "color": "positive",
    },
    {
        "label": "Negative",
        "icon": "✦",
        "text": "I waited for a very long time and my issue was not resolved at all. The staff were unhelpful and I left feeling frustrated and ignored.",
        "color": "negative",
    },
    {
        "label": "Neutral",
        "icon": "✦",
        "text": "The department has announced a new consultation service for residents. The program will be available starting next month at the community center.",
        "color": "neutral",
    },
]


# ──────────────────────────────────────────────────────────────────────────────
# Page configuration  (must be first Streamlit call)
# ──────────────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title=PROJECT_TITLE,
    page_icon="◈",
    layout="centered",
    initial_sidebar_state="collapsed",
)


# ──────────────────────────────────────────────────────────────────────────────
# Design system — injected CSS
# ──────────────────────────────────────────────────────────────────────────────
GLOBAL_CSS = """
<style>
/* ── Google Font ─────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* ── CSS variables ───────────────────────────────────────── */
:root {
  --bg:          #080c18;
  --bg-gradient: radial-gradient(ellipse 120% 80% at 50% -10%, #0d1a3a 0%, #080c18 65%);
  --surface:     rgba(255,255,255,0.035);
  --surface-md:  rgba(255,255,255,0.06);
  --surface-hi:  rgba(255,255,255,0.09);
  --border:      rgba(255,255,255,0.08);
  --border-hi:   rgba(255,255,255,0.14);
  --accent:      #38bdf8;
  --accent-dim:  rgba(56,189,248,0.12);
  --accent-glow: rgba(56,189,248,0.25);
  --positive:    #4ade80;
  --positive-bg: rgba(74,222,128,0.08);
  --positive-bd: rgba(74,222,128,0.22);
  --negative:    #f87171;
  --negative-bg: rgba(248,113,113,0.08);
  --negative-bd: rgba(248,113,113,0.22);
  --neutral:     #94a3b8;
  --neutral-bg:  rgba(148,163,184,0.08);
  --neutral-bd:  rgba(148,163,184,0.22);
  --text-hi:     #f0f4ff;
  --text-md:     #c2cde8;
  --text-lo:     #6b7fa3;
  --radius-sm:   10px;
  --radius-md:   16px;
  --radius-lg:   22px;
}

/* ── Base ────────────────────────────────────────────────── */
html, body, [data-testid="stAppViewContainer"] {
  background: var(--bg) !important;
}
[data-testid="stAppViewContainer"]::before {
  content: '';
  position: fixed;
  inset: 0;
  background: var(--bg-gradient);
  pointer-events: none;
  z-index: 0;
}
[data-testid="stMain"] {
  position: relative;
  z-index: 1;
}
* { font-family: 'Inter', sans-serif !important; box-sizing: border-box; }
[data-testid="stSidebar"] { display: none !important; }
[data-testid="collapsedControl"] { display: none !important; }
footer { visibility: hidden !important; }
#MainMenu { visibility: hidden !important; }
.block-container {
  max-width: 780px !important;
  padding: 2.5rem 2rem 4rem !important;
}

/* ── Glass card utility ──────────────────────────────────── */
.glass {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 2rem;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.glass:hover {
  border-color: var(--border-hi);
  box-shadow: 0 8px 40px rgba(0,0,0,0.4);
}

/* ── Hero ────────────────────────────────────────────────── */
.hero {
  text-align: center;
  padding: 3rem 2rem 2.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 2rem;
  position: relative;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  top: -60px; left: 50%;
  transform: translateX(-50%);
  width: 400px; height: 200px;
  background: radial-gradient(ellipse, rgba(56,189,248,0.12) 0%, transparent 70%);
  pointer-events: none;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-dim);
  border: 1px solid rgba(56,189,248,0.3);
  border-radius: 100px;
  padding: 4px 14px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--accent);
  text-transform: uppercase;
  margin-bottom: 1.25rem;
}
.hero-badge::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%,100% { opacity:1; transform: scale(1); }
  50%      { opacity:0.5; transform: scale(0.8); }
}
.hero-title {
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 700;
  color: var(--text-hi);
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0 0 0.75rem;
}
.hero-title span {
  background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.hero-subtitle {
  font-size: 0.95rem;
  font-weight: 400;
  color: var(--text-lo);
  line-height: 1.6;
  max-width: 520px;
  margin: 0 auto;
}

/* ── Section headers ─────────────────────────────────────── */
.section-header {
  margin-bottom: 1.25rem;
}
.section-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-hi);
  margin: 0 0 0.3rem;
  letter-spacing: -0.01em;
}
.section-sub {
  font-size: 0.82rem;
  color: var(--text-lo);
  margin: 0;
  line-height: 1.5;
}

/* ── Input area overrides ────────────────────────────────── */
[data-testid="stTextArea"] textarea {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-md) !important;
  color: var(--text-hi) !important;
  font-size: 0.93rem !important;
  line-height: 1.7 !important;
  padding: 1rem 1.1rem !important;
  transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
  resize: vertical !important;
}
[data-testid="stTextArea"] textarea:focus {
  border-color: rgba(56,189,248,0.45) !important;
  box-shadow: 0 0 0 3px rgba(56,189,248,0.1) !important;
  outline: none !important;
}
[data-testid="stTextArea"] textarea::placeholder {
  color: var(--text-lo) !important;
  font-style: italic;
}
[data-testid="stTextArea"] label {
  display: none !important;
}

/* ── Primary button ──────────────────────────────────────── */
[data-testid="stButton"] > button[kind="primary"] {
  background: linear-gradient(135deg, #1d6fa8 0%, #2563eb 50%, #4f46e5 100%) !important;
  border: none !important;
  border-radius: var(--radius-md) !important;
  color: #fff !important;
  font-size: 0.9rem !important;
  font-weight: 600 !important;
  letter-spacing: 0.02em !important;
  padding: 0.75rem 2rem !important;
  transition: all 0.2s ease !important;
  box-shadow: 0 4px 20px rgba(37,99,235,0.3) !important;
  width: 100% !important;
}
[data-testid="stButton"] > button[kind="primary"]:hover {
  transform: translateY(-1px) !important;
  box-shadow: 0 6px 28px rgba(37,99,235,0.45) !important;
  filter: brightness(1.1) !important;
}
[data-testid="stButton"] > button[kind="primary"]:active {
  transform: translateY(0) !important;
}

/* ── Secondary button (Clear) ────────────────────────────── */
[data-testid="stButton"] > button[kind="secondary"] {
  background: var(--surface-md) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-md) !important;
  color: var(--text-md) !important;
  font-size: 0.88rem !important;
  font-weight: 500 !important;
  padding: 0.72rem 1.5rem !important;
  transition: all 0.2s ease !important;
  width: 100% !important;
}
[data-testid="stButton"] > button[kind="secondary"]:hover {
  background: var(--surface-hi) !important;
  border-color: var(--border-hi) !important;
  color: var(--text-hi) !important;
}

/* ── Result card ─────────────────────────────────────────── */
.result-card {
  border-radius: var(--radius-lg);
  padding: 2rem;
  border: 1px solid;
  animation: fadeSlideIn 0.35s ease forwards;
  margin-bottom: 1.5rem;
}
@keyframes fadeSlideIn {
  from { opacity:0; transform: translateY(12px); }
  to   { opacity:1; transform: translateY(0); }
}
.result-card.positive {
  background: var(--positive-bg);
  border-color: var(--positive-bd);
}
.result-card.negative {
  background: var(--negative-bg);
  border-color: var(--negative-bd);
}
.result-card.neutral {
  background: var(--neutral-bg);
  border-color: var(--neutral-bd);
}
.result-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 0.6rem;
  color: var(--text-lo);
}
.result-sentiment {
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 1.4rem;
}
.result-sentiment.positive { color: var(--positive); }
.result-sentiment.negative { color: var(--negative); }
.result-sentiment.neutral  { color: var(--neutral); }
.result-confidence-label {
  font-size: 0.75rem;
  color: var(--text-lo);
  margin-bottom: 0.4rem;
  font-weight: 500;
}
.confidence-bar-track {
  background: rgba(255,255,255,0.07);
  border-radius: 100px;
  height: 6px;
  overflow: hidden;
  margin-bottom: 0.4rem;
}
.confidence-bar-fill {
  height: 100%;
  border-radius: 100px;
  transition: width 0.6s cubic-bezier(0.34,1.56,0.64,1);
}
.confidence-bar-fill.positive { background: var(--positive); }
.confidence-bar-fill.negative { background: var(--negative); }
.confidence-bar-fill.neutral  { background: var(--neutral); }
.confidence-value {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.confidence-value.positive { color: var(--positive); }
.confidence-value.negative { color: var(--negative); }
.confidence-value.neutral  { color: var(--neutral); }

/* ── Summary grid ────────────────────────────────────────── */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;
  margin-bottom: 1.75rem;
}
.summary-cell {
  background: var(--surface-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem 1.1rem;
}
.summary-cell-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-lo);
  margin-bottom: 0.4rem;
}
.summary-cell-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-hi);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Example cards ───────────────────────────────────────── */
.examples-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;
  margin-bottom: 0.5rem;
}
.example-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1.1rem;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
  cursor: pointer;
}
.example-card:hover {
  background: var(--surface-md);
  transform: translateY(-2px);
}
.example-card.positive:hover { border-color: var(--positive-bd); }
.example-card.negative:hover { border-color: var(--negative-bd); }
.example-card.neutral:hover  { border-color: var(--neutral-bd); }
.example-tag {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 0.55rem;
  display: flex;
  align-items: center;
  gap: 5px;
}
.example-tag.positive { color: var(--positive); }
.example-tag.negative { color: var(--negative); }
.example-tag.neutral  { color: var(--neutral); }
.example-tag::before {
  content: '';
  width: 5px; height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.example-tag.positive::before { background: var(--positive); }
.example-tag.negative::before { background: var(--negative); }
.example-tag.neutral::before  { background: var(--neutral); }
.example-text {
  font-size: 0.78rem;
  color: var(--text-md);
  line-height: 1.55;
}

/* ── Example "Use" buttons ───────────────────────────────── */
[data-testid="stButton"] > button.use-btn {
  background: transparent !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-sm) !important;
  color: var(--text-lo) !important;
  font-size: 0.75rem !important;
  font-weight: 500 !important;
  padding: 0.3rem 0.9rem !important;
  margin-top: 0.6rem !important;
  width: auto !important;
  transition: all 0.2s ease !important;
}

/* ── Expander (About model) ──────────────────────────────── */
[data-testid="stExpander"] {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-md) !important;
}
[data-testid="stExpander"] summary {
  color: var(--text-md) !important;
  font-size: 0.88rem !important;
  font-weight: 500 !important;
  padding: 0.9rem 1.1rem !important;
}
[data-testid="stExpander"] summary:hover {
  color: var(--text-hi) !important;
}
.model-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}
.model-info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.model-info-key {
  font-size: 0.67rem;
  font-weight: 600;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: var(--text-lo);
}
.model-info-val {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-hi);
}
.accuracy-caveat {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(56,189,248,0.06);
  border: 1px solid rgba(56,189,248,0.18);
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  color: var(--text-lo);
  line-height: 1.6;
}
.accuracy-caveat strong { color: var(--accent); }

/* ── Alerts override ─────────────────────────────────────── */
[data-testid="stAlert"] {
  border-radius: var(--radius-md) !important;
  font-size: 0.88rem !important;
}

/* ── Footer ──────────────────────────────────────────────── */
.app-footer {
  text-align: center;
  padding-top: 2.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--text-lo);
  line-height: 1.7;
}

/* ── Divider ─────────────────────────────────────────────── */
.section-divider {
  height: 1px;
  background: var(--border);
  margin: 2rem 0;
}

/* ── Responsive tweaks ───────────────────────────────────── */
@media (max-width: 600px) {
  .summary-grid { grid-template-columns: 1fr 1fr; }
  .examples-grid { grid-template-columns: 1fr; }
  .model-info-grid { grid-template-columns: 1fr; }
  .hero { padding: 2rem 1.25rem; }
  .block-container { padding: 1.5rem 1rem 3rem !important; }
}
</style>
"""

st.markdown(GLOBAL_CSS, unsafe_allow_html=True)


# ──────────────────────────────────────────────────────────────────────────────
# Model loading  (unchanged ML logic)
# ──────────────────────────────────────────────────────────────────────────────
if "feedback_textarea" not in st.session_state:
    st.session_state.feedback_textarea = ""
if "result" not in st.session_state:
    st.session_state.result = None
if "show_error" not in st.session_state:
    st.session_state.show_error = False


def use_example(text: str) -> None:
    # Callbacks run before widgets are recreated on the next rerun.
    st.session_state.feedback_textarea = text
    st.session_state.result = None
    st.session_state.show_error = False


try:
    service = get_service()
    metadata = load_evaluation()
    assets_ok = True
except ModelUnavailable:
    assets_ok = False
    metadata = {}


# ══════════════════════════════════════════════════════════════════════════════
# HERO HEADER
# ══════════════════════════════════════════════════════════════════════════════
st.markdown("""
<div class="hero">
  <div class="hero-badge">AI Sentiment Engine</div>
  <h1 class="hero-title">E-Consultation<br><span>Sentiment Analysis</span></h1>
  <p class="hero-subtitle">
    Sentiment analysis of citizen feedback on public services and policy consultations.
  </p>
</div>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# MODEL LOAD ERROR STATE
# ══════════════════════════════════════════════════════════════════════════════
if not assets_ok:
    st.error(
        "**Model unavailable: files are missing or incompatible.**  \n"
        "Run `python train_model.py` to generate the trained model, then restart the app.",
        icon="⚠️",
    )
    st.stop()


# ══════════════════════════════════════════════════════════════════════════════
# ANALYZE FEEDBACK — input card
# ══════════════════════════════════════════════════════════════════════════════
st.markdown("""
<div class="section-header">
  <p class="section-title">Analyze Feedback</p>
  <p class="section-sub">Enter consultation feedback to identify the overall sentiment.</p>
</div>
""", unsafe_allow_html=True)

feedback = st.text_area(
    label="feedback_input",
    placeholder='Example: "The consultation was very helpful and my issue was resolved quickly."',
    height=148,
    key="feedback_textarea",
    label_visibility="collapsed",
)

col_btn, col_clr = st.columns([3, 1], gap="small")

with col_btn:
    analyze_clicked = st.button("⬡  Analyze Sentiment", type="primary", key="btn_analyze")

with col_clr:
    st.button("Clear", type="secondary", key="btn_clear", on_click=use_example, args=("",))


# ──────────────────────────────────────────────────────────────────────────────
# Handle prediction
# ──────────────────────────────────────────────────────────────────────────────
if analyze_clicked:
    st.session_state.show_error = False
    if not feedback.strip():
        st.session_state.show_error = True
        st.session_state.result = None
    else:
        with st.spinner("Analyzing feedback…"):
            try:
                st.session_state.result = service.predict(feedback)
            except InvalidFeedback as exc:
                st.session_state.result = None
                st.warning(str(exc))
            except Exception:
                st.session_state.result = None
                st.error("Prediction failed. Check the model artifacts and restart the application.")


# ──────────────────────────────────────────────────────────────────────────────
# Empty-input error
# ──────────────────────────────────────────────────────────────────────────────
if st.session_state.show_error:
    st.warning(
        "**Please enter feedback before running sentiment analysis.**  \n"
        "The input field cannot be empty.",
        icon="◈",
    )


# ══════════════════════════════════════════════════════════════════════════════
# PREDICTION RESULT
# ══════════════════════════════════════════════════════════════════════════════
result = st.session_state.result
if result:
    sentiment = result["sentiment"]          # e.g. "Positive"
    confidence = result["confidence"]        # float 0–1  or  None
    css_class = sentiment.lower()            # positive / negative / neutral

    # ── Confidence display
    if confidence is not None:
        conf_pct = f"{confidence:.2%}"
        conf_bar = int(confidence * 100)
    else:
        conf_pct = "N/A"
        conf_bar = 0

    conf_bar_html = (
        f'<div class="confidence-bar-track">'
        f'<div class="confidence-bar-fill {css_class}" style="width:{conf_bar}%"></div>'
        f'</div>'
        if confidence is not None else ""
    )

    st.markdown(f"""
<div class="result-card {css_class}">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
    <div>
      <div class="result-label">Sentiment Detected</div>
      <div class="result-sentiment {css_class}">{sentiment}</div>
    </div>
    <div style="text-align:right; flex:1; min-width:140px;">
      <div class="result-confidence-label">Confidence Score</div>
      {conf_bar_html}
      <div class="confidence-value {css_class}">{conf_pct}</div>
    </div>
  </div>
</div>
""", unsafe_allow_html=True)

    # ── Analysis Summary
    st.markdown("""
<div class="section-header" style="margin-bottom:0.8rem;">
  <p class="section-title" style="font-size:0.9rem;">Analysis Summary</p>
</div>
""", unsafe_allow_html=True)

    input_len = result["input_length"]
    word_count = result["word_count"]

    st.markdown(f"""
<div class="summary-grid">
  <div class="summary-cell">
    <div class="summary-cell-label">Detected Sentiment</div>
    <div class="summary-cell-value">{sentiment}</div>
  </div>
  <div class="summary-cell">
    <div class="summary-cell-label">Confidence Score</div>
    <div class="summary-cell-value">{conf_pct}</div>
  </div>
  <div class="summary-cell">
    <div class="summary-cell-label">Input Length</div>
    <div class="summary-cell-value">{word_count} words</div>
  </div>
</div>
""", unsafe_allow_html=True)

    st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# TRY AN EXAMPLE
# ══════════════════════════════════════════════════════════════════════════════
st.markdown("""
<div class="section-header">
  <p class="section-title">Try an Example</p>
  <p class="section-sub">Click an example below to load it into the input field.</p>
</div>
""", unsafe_allow_html=True)

ex_cols = st.columns(3, gap="small")
for i, (col, ex) in enumerate(zip(ex_cols, EXAMPLES)):
    with col:
        css_c = ex["color"]
        st.markdown(f"""
<div class="example-card {css_c}">
  <div class="example-tag {css_c}">{ex['label']}</div>
  <div class="example-text">"{ex['text'][:110]}…"</div>
</div>
""", unsafe_allow_html=True)
        st.button(f"Use {ex['label']} Example", key=f"use_ex_{i}",
                  on_click=use_example, args=(ex["text"],))

st.markdown('<div class="section-divider"></div>', unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# ABOUT THE AI MODEL
# ══════════════════════════════════════════════════════════════════════════════
model_name = metadata.get("model", type(service.model).__name__)
classes = service.classes
classes_display = " / ".join(c.title() for c in classes)

with st.expander("◈  About the AI Model", expanded=False):
    accuracy_display = f"{metadata['accuracy']:.2%}" if "accuracy" in metadata else "Unavailable"
    st.markdown(f"""
<div class="model-info-grid">
  <div class="model-info-row">
    <span class="model-info-key">Model</span>
    <span class="model-info-val">{model_name}</span>
  </div>
  <div class="model-info-row">
    <span class="model-info-key">Feature Extraction</span>
    <span class="model-info-val">TF-IDF (1–2 ngrams)</span>
  </div>
  <div class="model-info-row">
    <span class="model-info-key">Sentiment Classes</span>
    <span class="model-info-val">{classes_display}</span>
  </div>
  <div class="model-info-row">
    <span class="model-info-key">Dataset Size</span>
    <span class="model-info-val">{metadata.get("dataset_size", "Unavailable")}</span>
  </div>
  <div class="model-info-row">
    <span class="model-info-key">Training Split</span>
    <span class="model-info-val">{metadata.get("train_size", "Unavailable")} samples</span>
  </div>
  <div class="model-info-row">
    <span class="model-info-key">Test Split</span>
    <span class="model-info-val">{metadata.get("test_size", "Unavailable")} samples</span>
  </div>
</div>
<div class="accuracy-caveat">
  <strong>Prototype Test Accuracy: {accuracy_display}</strong><br>
  Evaluated on the existing generated-dataset test split ({metadata.get("test_size", "unavailable")} samples).
  This reflects performance on the academic demonstration dataset and is
  not a guarantee of real-world accuracy on unseen consultation feedback.
</div>
""", unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════════════════
# FOOTER
# ══════════════════════════════════════════════════════════════════════════════
st.markdown(f"""
<div class="app-footer">
  {PROJECT_TITLE}<br>Academic Demonstration Prototype<br>
  Model predictions use a generated prototype dataset. English only; confidence is not calibrated accuracy.
  Confidence scores are model-derived and not a guarantee of accuracy on real-world feedback.
</div>
""", unsafe_allow_html=True)
