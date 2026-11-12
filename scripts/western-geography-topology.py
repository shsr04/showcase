#!/usr/bin/env python3
"""Check the extracted boundary with Shapely 2.2.0 and its GEOS backend.

Usage: python3 scripts/western-geography-topology.py
It exits with the reason when a jurisdiction or the union of all of them is invalid.
"""
import json
import pathlib

from shapely import union_all
from shapely.geometry import shape
from shapely.validation import explain_validity

path = pathlib.Path(__file__).resolve().parent.parent / 'public/western/data/1881-jurisdictions.geojson'
features = json.loads(path.read_text(encoding='utf-8'))['features']
geometries = []
for feature in features:
    geometry = shape(feature['geometry'])
    if not geometry.is_valid:
        raise SystemExit(f"{feature['properties']['NAME']}: {explain_validity(geometry)}")
    geometries.append(geometry)
merged = union_all(geometries)
if not merged.is_valid:
    raise SystemExit(f'Combined boundary: {explain_validity(merged)}')
print(f'{len(geometries)} valid jurisdictions; combined boundary is valid')
