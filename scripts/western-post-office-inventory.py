#!/usr/bin/env python3
"""Extract the Prototype 3 research ledger from the pinned Helbock/Blevins CSV.

Usage: python3 scripts/western-post-office-inventory.py SOURCE.csv OUTPUT.csv
The script stops before it reads anything unless SOURCE has the SHA-256 sum in SOURCE_SHA256.
The output is evidence to investigate, not a list of proven settlements.
"""
import csv
import hashlib
import pathlib
import sys

SOURCE_SHA256 = '5b73b3c4d77674e63abd5f021958aedd5705bc9b4838f3e20cdc0080b27091a3'
STATES = set('LA AR MO IA MN TX KS NE CO NV CA OR ND SD MT WY ID WA UT AZ NM OK'.split())


def main(source, output):
    source = pathlib.Path(source)
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit('Source checksum does not match the documented dataset revision')
    with source.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = []
        for row in reader:
            if row['State'] not in STATES:
                continue
            established = int(row['Established']) if row['Established'] else None
            discontinued = int(float(row['Discontinued'])) if row['Discontinued'] else None
            if established is not None and established > 1881:
                continue
            if discontinued is not None and discontinued < 1881:
                continue
            rows.append(row)
    with pathlib.Path(output).open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} records extracted')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
