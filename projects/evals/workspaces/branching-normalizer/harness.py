"""Read-only harness for the branching normalizer autoresearch eval."""

import time

from normalizer import normalize

DEV_SET = "dev-cases.tsv"
FINAL_SET = "final-cases.tsv"
WPS_FLOOR = 100
TIME_BUDGET_SECONDS = 10


def parse_cases(path):
    with open(path, encoding="utf8") as file:
        rows = [line.rstrip("\n").split("\t") for line in file]

    return [
        {
            "category": row[0],
            "source": row[1],
            "expected": row[2],
        }
        for row in rows[1:]
    ]


def evaluate(cases):
    start = time.perf_counter()
    correct = 0
    by_category = {}

    for case in cases:
        actual = normalize(case["source"])
        passed = actual == case["expected"]
        correct += int(passed)
        bucket = by_category.setdefault(case["category"], {"correct": 0, "total": 0})
        bucket["correct"] += int(passed)
        bucket["total"] += 1

    elapsed = time.perf_counter() - start

    return {
        "accuracy": correct / len(cases),
        "wps": len(cases) / elapsed if elapsed > 0 else 0.0,
        "n": len(cases),
        "seconds": elapsed,
        "by_category": by_category,
    }


def print_category_metrics(prefix, metrics):
    for category, bucket in sorted(metrics["by_category"].items()):
        accuracy = bucket["correct"] / bucket["total"]
        safe_category = category.replace("+", "_").replace("-", "_")
        print(f"{prefix}_{safe_category}_accuracy: {accuracy:.6f}")


def main():
    start = time.perf_counter()
    dev = evaluate(parse_cases(DEV_SET))
    final = evaluate(parse_cases(FINAL_SET))
    total = time.perf_counter() - start

    print("---")
    print(f"dev_accuracy:      {dev['accuracy']:.6f}")
    print(f"dev_wps:           {dev['wps']:.1f}")
    print(f"dev_n:             {dev['n']}")
    print(f"final_accuracy:    {final['accuracy']:.6f}  # held-out, do not optimize")
    print(f"final_wps:         {final['wps']:.1f}")
    print(f"eval_seconds:      {dev['seconds'] + final['seconds']:.4f}")
    print(f"total_seconds:     {total:.4f}")
    print(f"wps_floor:         {WPS_FLOOR}")
    print(f"meets_floor:       {dev['wps'] >= WPS_FLOOR}")
    print_category_metrics("dev", dev)
    print_category_metrics("final", final)

    if total > TIME_BUDGET_SECONDS:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
