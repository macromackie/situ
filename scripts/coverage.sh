#!/usr/bin/env bash
set -euo pipefail

rm -rf coverage
bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage

if [ ! -f coverage/lcov.info ]; then
  echo "coverage/lcov.info was not created" >&2
  exit 1
fi

awk '
  BEGIN {
    line_threshold = 80
    function_threshold = 80
    branch_threshold = 70
    lines_found = 0
    lines_hit = 0
    functions_found = 0
    functions_hit = 0
    branches_found = 0
    branches_hit = 0
  }

  /^LF:/ {
    lines_found += substr($0, 4)
  }

  /^LH:/ {
    lines_hit += substr($0, 4)
  }

  /^FNF:/ {
    functions_found += substr($0, 5)
  }

  /^FNH:/ {
    functions_hit += substr($0, 5)
  }

  /^BRF:/ {
    branches_found += substr($0, 5)
  }

  /^BRH:/ {
    branches_hit += substr($0, 5)
  }

  END {
    printf "{\n"
    write_metric("lines", lines_hit, lines_found, line_threshold, ",")
    write_metric("functions", functions_hit, functions_found, function_threshold, ",")
    write_metric("branches", branches_hit, branches_found, branch_threshold, "")
    printf "}\n"
  }

  function write_metric(name, covered, total, threshold, suffix) {
    printf "  \"%s\": { ", name
    printf "\"covered\": %d, \"total\": %d, ", covered, total
    printf "\"percent\": %.2f, \"threshold\": %d, ", percent(covered, total), threshold
    printf "\"measured\": %s, \"enforced\": %s }%s\n", bool(total > 0), bool(total > 0), suffix
  }

  function bool(value) {
    if (value) {
      return "true"
    }

    return "false"
  }

  function percent(covered, total) {
    if (total == 0) {
      return 100
    }

    return covered * 100 / total
  }
' coverage/lcov.info > coverage/summary.json

cat coverage/summary.json

awk '
  BEGIN {
    line_threshold = 80
    function_threshold = 80
    branch_threshold = 70
    lines_found = 0
    lines_hit = 0
    functions_found = 0
    functions_hit = 0
    branches_found = 0
    branches_hit = 0
    failures = 0
  }

  /^LF:/ {
    lines_found += substr($0, 4)
  }

  /^LH:/ {
    lines_hit += substr($0, 4)
  }

  /^FNF:/ {
    functions_found += substr($0, 5)
  }

  /^FNH:/ {
    functions_hit += substr($0, 5)
  }

  /^BRF:/ {
    branches_found += substr($0, 5)
  }

  /^BRH:/ {
    branches_hit += substr($0, 5)
  }

  END {
    failures += require_measured("Line", lines_found)
    failures += require_measured("Function", functions_found)

    if (branches_found == 0) {
      print "Branch coverage was not measured because lcov.info contained no branch totals." > "/dev/stderr"
    }

    if (lines_found > 0) {
      failures += require_threshold("Line", percent(lines_hit, lines_found), line_threshold)
    }

    if (functions_found > 0) {
      failures += require_threshold("Function", percent(functions_hit, functions_found), function_threshold)
    }

    if (branches_found > 0) {
      failures += require_threshold("Branch", percent(branches_hit, branches_found), branch_threshold)
    }

    if (failures > 0) {
      exit 1
    }
  }

  function require_measured(metric, total) {
    if (total > 0) {
      return 0
    }

    printf "%s coverage could not be enforced because lcov.info contained no %s totals.\n",
      metric, tolower(metric) > "/dev/stderr"
    return 1
  }

  function require_threshold(metric, measured, threshold) {
    if (measured >= threshold) {
      return 0
    }

    printf "%s coverage %.4f%% is below threshold %.2f%%.\n",
      metric, measured, threshold > "/dev/stderr"
    return 1
  }

  function percent(covered, total) {
    if (total == 0) {
      return 100
    }

    return covered * 100 / total
  }
' coverage/lcov.info
