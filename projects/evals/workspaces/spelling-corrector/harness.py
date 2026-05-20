"""Read-only evaluation harness for the spell autoresearch run.

DO NOT MODIFY. This is the ground-truth eval. The agent should only edit
spell.py. Modifying this file invalidates the experiment.

Loads spell.py, runs `correction` over both test sets, and prints a metric
block in the same shape as autoresearch's prepare.py output.
"""

import importlib.util
import sys
import time

DEV_SET = 'spell-testset1.txt'      # drives keep/discard
FINAL_SET = 'spell-testset2.txt'    # held out — reported, never optimized
WPS_FLOOR = 10                      # words/sec hard floor for "keep"
TIME_BUDGET_SECONDS = 60            # per-experiment wall-clock cap

def load_spell():
    """Fresh import of spell.py each run, so edits take effect."""
    spec = importlib.util.spec_from_file_location("spell", "spell.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def parse_testset(path):
    """Parse 'right: wrong1 wrong2 ...' lines into [(right, wrong), ...] pairs."""
    with open(path) as f:
        return [(right, wrong)
                for (right, wrongs) in (line.split(':') for line in f)
                for wrong in wrongs.split()]

def evaluate(spell, tests):
    n = len(tests)
    start = time.perf_counter()
    good = 0
    unknown = 0
    for right, wrong in tests:
        w = spell.correction(wrong)
        good += (w == right)
        if w != right and right not in spell.WORDS:
            unknown += 1
    dt = time.perf_counter() - start
    return {
        'n': n,
        'correct': good,
        'unknown': unknown,
        'accuracy': good / n,
        'wps': n / dt if dt > 0 else 0.0,
        'unknown_rate': unknown / n,
        'eval_seconds': dt,
    }

def main():
    overall_start = time.perf_counter()
    spell = load_spell()
    dev_tests = parse_testset(DEV_SET)
    final_tests = parse_testset(FINAL_SET)

    dev = evaluate(spell, dev_tests)
    final = evaluate(spell, final_tests)
    total = time.perf_counter() - overall_start

    print('---')
    print(f"dev_accuracy:      {dev['accuracy']:.6f}")
    print(f"dev_wps:           {dev['wps']:.1f}")
    print(f"dev_unknown_rate:  {dev['unknown_rate']:.4f}")
    print(f"dev_n:             {dev['n']}")
    print(f"final_accuracy:    {final['accuracy']:.6f}  # held-out, do not optimize")
    print(f"final_wps:         {final['wps']:.1f}")
    print(f"eval_seconds:      {dev['eval_seconds'] + final['eval_seconds']:.2f}")
    print(f"total_seconds:     {total:.2f}")
    print(f"wps_floor:         {WPS_FLOOR}")
    print(f"meets_floor:       {dev['wps'] >= WPS_FLOOR}")

    if total > TIME_BUDGET_SECONDS:
        print(f"# WARNING: exceeded {TIME_BUDGET_SECONDS}s budget", file=sys.stderr)
        sys.exit(2)

if __name__ == '__main__':
    main()
