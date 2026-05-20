from normalizers.casefold import normalize_case
from normalizers.numbers import normalize_numbers
from normalizers.punctuation import normalize_punctuation
from normalizers.spacing import normalize_spacing


def normalize(text):
    text = normalize_case(text)
    text = normalize_punctuation(text)
    text = normalize_numbers(text)
    text = normalize_spacing(text)
    return text
