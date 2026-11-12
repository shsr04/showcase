#!/usr/bin/env python3
"""Extract 1881 jurisdictions from the pinned Newberry GIS archive.

Requires pyshp 3.1.6. Usage:
  python3 scripts/western-historical-boundary.py SOURCE.zip OUTPUT.geojson
The script stops before it reads anything unless SOURCE has the SHA-256 sum in SOURCE_SHA256.
"""
import hashlib
import io
import json
import pathlib
import sys
import zipfile

import shapefile

SOURCE_SHA256 = 'd70a70307bc2dbd30145e35144d1643e5976f8f658b1ae545cbffcf6d9006b4d'
DATE = 18810912
JURISDICTIONS = set('Arkansas California Colorado Iowa Kansas Louisiana Minnesota Missouri Nebraska Nevada Oregon Texas'.split()) | {
    'Arizona Territory', 'Dakota Territory', 'Idaho Territory', 'Montana Territory',
    'New Mexico Territory', 'Utah Territory', 'Washington Territory', 'Wyoming Territory',
    'Indian Territory', 'Unorg. Fed. Terr.',
}


def main(source_path, output_path):
    raw = pathlib.Path(source_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise SystemExit('Source checksum does not match the documented revision')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        def component(extension):
            names = [name for name in archive.namelist() if name.endswith('/US_HistStateTerr_Gen001.' + extension)]
            if len(names) != 1:
                raise SystemExit(f'Expected one {extension} component in source archive')
            return io.BytesIO(archive.read(names[0]))

        reader = shapefile.Reader(shp=component('shp'), shx=component('shx'), dbf=component('dbf'))
        features = []
        for record in reader.iterShapeRecords():
            properties = record.record.as_dict()
            if properties['NAME'] not in JURISDICTIONS or not properties['START_N'] <= DATE < properties['END_N']:
                continue
            for date in ('START_DATE', 'END_DATE'):
                properties[date] = properties[date].isoformat()
            geometry = record.shape.__geo_interface__
            polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
            for rings in polygons:
                for index, ring in enumerate(rings):
                    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
                    if (area > 0) != (index == 0):
                        ring.reverse()
            features.append({'type': 'Feature', 'properties': properties, 'geometry': geometry})
    if len(features) != len(JURISDICTIONS) or {f['properties']['NAME'] for f in features} != JURISDICTIONS:
        raise SystemExit('Expected exactly one dated polygon for each specified jurisdiction')
    output = {'type': 'FeatureCollection', 'features': features}
    pathlib.Path(output_path).write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{len(features)} jurisdictions extracted')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
