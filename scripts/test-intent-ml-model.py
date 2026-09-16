"""Local self-check for the active TF-IDF + Logistic Regression artifact."""

from pathlib import Path
import sys

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


DEFAULT_MODEL_PATH = (
    Path(__file__).resolve().parents[2]
    / "intent-ml-api"
    / "intent_model_tfidf_logreg_training_3.joblib"
)

QUESTIONS = [
    "stok getter masih ada",
    "berapa harga mazinger",
    "barang bisa diretur",
    "tolong rekomendasikan satu robot untuk koleksi",
]

DEMO_TEXTS = [
    "stok getter masih ada",
    "barang ini ready stock",
    "berapa stok mazinger",
    "berapa harga getter",
    "ada promo mazinger",
    "harga robot ini berapa",
    "barang bisa diretur",
    "bagaimana kebijakan pengembalian",
    "saya mau mengajukan retur",
]

DEMO_LABELS = [
    "stock_availability",
    "stock_availability",
    "stock_availability",
    "price_promo",
    "price_promo",
    "price_promo",
    "return_product",
    "return_product",
    "return_product",
]


def build_demo_model() -> Pipeline:
    model = Pipeline(
        [
            ("tfidf", TfidfVectorizer(lowercase=True, ngram_range=(1, 2))),
            ("clf", LogisticRegression(max_iter=500)),
        ]
    )
    model.fit(DEMO_TEXTS, DEMO_LABELS)
    return model


def main() -> None:
    demo_mode = len(sys.argv) > 1 and sys.argv[1] == "--demo"
    model_path = None
    if demo_mode:
        model = build_demo_model()
    else:
        model_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_MODEL_PATH
        if not model_path.is_file():
            raise FileNotFoundError(f"Model tidak ditemukan: {model_path}")
        model = joblib.load(model_path)
    if not hasattr(model, "named_steps"):
        raise AssertionError("Artefak bukan scikit-learn Pipeline")

    tfidf = model.named_steps.get("tfidf")
    classifier = model.named_steps.get("clf")
    if tfidf is None or classifier is None:
        raise AssertionError("Pipeline wajib memiliki step 'tfidf' dan 'clf'")
    if type(tfidf).__name__ != "TfidfVectorizer":
        raise AssertionError(f"Step tfidf tidak sesuai: {type(tfidf).__name__}")
    if type(classifier).__name__ != "LogisticRegression":
        raise AssertionError(f"Step clf tidak sesuai: {type(classifier).__name__}")

    features = tfidf.transform(QUESTIONS)
    explicit_predictions = classifier.predict(features)
    explicit_probabilities = classifier.predict_proba(features)
    pipeline_predictions = model.predict(QUESTIONS)
    pipeline_probabilities = model.predict_proba(QUESTIONS)

    if not np.array_equal(explicit_predictions, pipeline_predictions):
        raise AssertionError("Prediksi Pipeline berbeda dari eksekusi eksplisit")
    if not np.allclose(explicit_probabilities, pipeline_probabilities):
        raise AssertionError("Probabilitas Pipeline berbeda dari eksekusi eksplisit")
    if not np.allclose(pipeline_probabilities.sum(axis=1), 1.0):
        raise AssertionError("Jumlah probabilitas setiap pertanyaan bukan 1")
    if features.shape[0] != len(QUESTIONS) or features.nnz == 0:
        raise AssertionError("TF-IDF tidak menghasilkan fitur untuk data uji")

    classes = classifier.classes_
    print(f"Mode        : {'demo aman' if demo_mode else 'artefak aktif'}")
    print(f"Model       : {model_path or 'Pipeline dibuat di memory'}")
    print(f"Pipeline    : {type(model).__name__}")
    print(f"TF-IDF      : {type(tfidf).__name__}")
    print(f"Classifier  : {type(classifier).__name__}")
    print(f"Vocabulary  : {len(tfidf.vocabulary_)} fitur")
    print(f"Matrix      : shape={features.shape}, nonzero={features.nnz}")
    print(f"Classes     : {len(classes)}")

    for question, prediction, probabilities in zip(
        QUESTIONS,
        pipeline_predictions,
        pipeline_probabilities,
    ):
        top_indices = np.argsort(probabilities)[::-1][:3]
        top3 = ", ".join(
            f"{classes[index]}={probabilities[index]:.4f}" for index in top_indices
        )
        print(f"\nQuestion    : {question}")
        print(f"Prediction  : {prediction}")
        print(f"Top-3       : {top3}")

    print("\nPASS: TF-IDF dan Logistic Regression berjalan konsisten.")


if __name__ == "__main__":
    main()
