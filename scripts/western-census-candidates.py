#!/usr/bin/env python3
"""Extract 1880 city-population records from the pinned Stanford compilation.

Usage: python3 scripts/western-census-candidates.py SOURCE.csv OUTPUT.csv
The script stops before it reads anything unless SOURCE has the SHA-256 sum in SOURCE_SHA256.
These are candidate records, not a complete inventory of 1881 settlements.
"""
import csv
import hashlib
import pathlib
import sys

SOURCE_SHA256 = '4beb74cf86adb57bdd8d8481022b670af7299447dad78a5ed27c99337c0a83d7'
STATES = set('LA AR MO IA MN TX KS NE CO NV CA OR ND SD MT WY ID WA UT AZ NM OK'.split())


def main(source_path, output_path):
    source = pathlib.Path(source_path)
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit('Source checksum does not match the documented revision')
    with source.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = [row for row in reader if row['ST'] in STATES and int(row['1880'].replace(',', '') or 0) > 0]
    with pathlib.Path(output_path).open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} records extracted')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
