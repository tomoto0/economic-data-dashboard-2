import json
import math
import re
from pathlib import Path

import pandas as pd

SRC = Path('/home/ubuntu/economic-data-dashboard/economic_data.csv')
OUT_DIR = Path('/home/ubuntu/economic-data-dashboard-manus/server/data')
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_INDICATORS = {
    'GDP (current US$)': {
        'key': 'gdp',
        'label': 'GDP',
        'unit': 'current US$',
        'format': 'currency',
        'worldBankCode': 'NY.GDP.MKTP.CD',
    },
    'Population, total': {
        'key': 'population',
        'label': 'Population',
        'unit': 'people',
        'format': 'integer',
        'worldBankCode': 'SP.POP.TOTL',
    },
    'Inflation, consumer prices (annual %)': {
        'key': 'inflation',
        'label': 'Inflation',
        'unit': '% annual',
        'format': 'percent',
        'worldBankCode': 'FP.CPI.TOTL.ZG',
    },
    'Unemployment, total (% of total labor force)': {
        'key': 'unemployment',
        'label': 'Unemployment',
        'unit': '% labor force',
        'format': 'percent',
        'worldBankCode': 'SL.UEM.TOTL.ZS',
    },
    'Foreign direct investment, net inflows (BoP, current US$)': {
        'key': 'fdi',
        'label': 'FDI Net Inflows',
        'unit': 'current US$',
        'format': 'currency',
        'worldBankCode': 'BX.KLT.DINV.CD.WD',
    },
    'Total reserves (includes gold, current US$)': {
        'key': 'reserves',
        'label': 'Foreign Reserves',
        'unit': 'current US$',
        'format': 'currency',
        'worldBankCode': 'FI.RES.TOTL.CD',
    },
}

COUNTRY_ISO2_TO_ISO3 = {
    'US': 'USA',
    'CN': 'CHN',
    'JP': 'JPN',
    'DE': 'DEU',
    'GB': 'GBR',
    'FR': 'FRA',
    'IN': 'IND',
    'IT': 'ITA',
    'BR': 'BRA',
    'CA': 'CAN',
}

def clean(value):
    if value is None:
        return None
    try:
        if math.isnan(value):
            return None
    except TypeError:
        pass
    return float(value)


def main():
    df = pd.read_csv(SRC)
    countries = []
    records = []
    indicator_keys = {meta['key']: {**meta, 'sourceName': source} for source, meta in TARGET_INDICATORS.items()}

    for _, row in df.iterrows():
        country_id = str(row['CountryID'])
        country_name = str(row['CountryName'])
        countries.append({
            'code': country_id,
            'iso3': COUNTRY_ISO2_TO_ISO3.get(country_id, country_id),
            'name': country_name,
        })
        for source_name, meta in TARGET_INDICATORS.items():
            for year in range(2000, 2027):
                column = f'{source_name}_{year}'
                if column not in row:
                    continue
                value = clean(row[column])
                records.append({
                    'countryCode': country_id,
                    'countryIso3': COUNTRY_ISO2_TO_ISO3.get(country_id, country_id),
                    'countryName': country_name,
                    'indicatorKey': meta['key'],
                    'indicatorLabel': meta['label'],
                    'indicatorSourceName': source_name,
                    'unit': meta['unit'],
                    'format': meta['format'],
                    'worldBankCode': meta['worldBankCode'],
                    'year': year,
                    'value': value,
                    'source': 'World Bank Open Data via repository CSV',
                })

    payload = {
        'generatedFrom': str(SRC),
        'recordCount': len(records),
        'countries': countries,
        'indicators': list(indicator_keys.values()),
        'records': records,
    }

    json_path = OUT_DIR / 'economic-data.json'
    ts_path = OUT_DIR / 'economicData.ts'
    json_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    ts_path.write_text(
        'export const economicDataPayload = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ' as const;\n',
        encoding='utf-8',
    )
    print(f'wrote {json_path} and {ts_path}; records={len(records)}')

if __name__ == '__main__':
    main()
