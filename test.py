#!/usr/bin/env python3
"""Chạy lint + TOÀN BỘ test (unit, integration, acceptance) của CSMS trong Docker — không cần cài Node.

    python test.py                       lint + tất cả test
    python test.py --only unit           chỉ nhóm unit (hoặc integration, acceptance)
    python test.py --file tests/acceptance/S-04.station-management.test.js
    python test.py --lint-only
    python test.py --verbose             in toàn bộ output

Mã thoát 0 = đạt, khác 0 = không đạt (dùng được trong CI hoặc script khác).
Đây chỉ là lối tắt của: python run.py test
"""
import sys

import run

if __name__ == "__main__":
    sys.exit(run.main(["test", *sys.argv[1:]]))
