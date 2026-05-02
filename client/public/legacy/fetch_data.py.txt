#!/usr/bin/env python3
"""
World Bank APIから経済データを取得するスクリプト
"""

import pandas as pd
import requests
import json
from datetime import datetime
import time

# World Bank API設定
BASE_URL = "https://api.worldbank.org/v2"
COUNTRIES = ["US", "CN", "JP", "DE", "GB", "FR", "IN", "IT", "BR", "CA"]  # ISO2コード
INDICATORS = {
    "NY.GDP.MKTP.CD": "GDP (current US$)",
    "SP.POP.TOTL": "Population, total", 
    "NY.GDP.MKTP.KD.ZG": "GDP growth (annual %)",
    "FP.CPI.TOTL.ZG": "Inflation, consumer prices (annual %)",
    "SL.UEM.TOTL.ZS": "Unemployment, total (% of total labor force)",
    "BX.KLT.DINV.CD.WD": "Foreign direct investment, net inflows (BoP, current US$)",
    "FI.RES.TOTL.CD": "Total reserves (includes gold, current US$)",
    "NE.EXP.GNFS.ZS": "Exports of goods and services (% of GDP)",
    "NE.IMP.GNFS.ZS": "Imports of goods and services (% of GDP)",
    "GC.DPT.TOTL.GD.ZS": "Central government debt, total (% of GDP)",
    "MS.MIL.XPND.GD.ZS": "Military expenditure (% of GDP)",
    "SH.XPD.CHEX.GD.ZS": "Current health expenditure (% of GDP)",
    "SE.XPD.TOTL.GD.ZS": "Government expenditure on education, total (% of GDP)",
    "EG.ELC.ACCS.ZS": "Access to electricity (% of population)",
    "IC.BUS.EASE.XQ": "Ease of doing business score",
    "EN.ATM.CO2E.KT": "CO2 emissions (kt)"
}

def fetch_indicator_data(indicator_code, countries, start_year=2000, end_year=datetime.now().year):
    """
    指定された指標のデータを取得
    """
    country_str = ";".join(countries)
    url = f"{BASE_URL}/country/{country_str}/indicator/{indicator_code}"
    
    params = {
        "format": "json",
        "date": f"{start_year}:{end_year}",
        "per_page": 1000
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        if len(data) > 1 and data[1]:
            return data[1]
        else:
            print(f"No data found for indicator {indicator_code}")
            return []
            
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {indicator_code}: {e}")
        return []

def process_data():
    """
    全ての指標データを取得し、CSVファイルに保存
    """
    all_data = []
    
    print("Fetching economic data from World Bank API...")
    
    for indicator_code, indicator_name in INDICATORS.items():
        print(f"Fetching {indicator_name}...")
        
        data = fetch_indicator_data(indicator_code, COUNTRIES)
        
        for item in data:
            if item["value"] is not None:
                all_data.append({
                    "CountryID": item["country"]["id"],
                    "CountryName": item["country"]["value"],
                    "IndicatorCode": indicator_code,
                    "IndicatorName": indicator_name,
                    "Year": item["date"],
                    "Value": item["value"]
                })
        
        # API制限を避けるため少し待機
        time.sleep(0.5)
    
    # DataFrameに変換
    df = pd.DataFrame(all_data)
    
    if df.empty:
        print("No data retrieved. Using existing data.")
        return
    
    # ピボットテーブルに変換（既存のCSV形式に合わせる）
    pivot_data = []
    
    for country_id in df["CountryID"].unique():
        country_data = df[df["CountryID"] == country_id]
        country_name = country_data["CountryName"].iloc[0]
        
        row = {
            "CountryID": country_id,
            "CountryName": country_name
        }
        
        # 各指標と年の組み合わせでカラムを作成
        for indicator_code, indicator_name in INDICATORS.items():
            indicator_data = country_data[country_data["IndicatorCode"] == indicator_code]
            
            for year in range(2000, datetime.now().year + 1):
                year_data = indicator_data[indicator_data["Year"] == str(year)]
                column_name = f"{indicator_name}_{year}"
                
                if not year_data.empty:
                    row[column_name] = year_data["Value"].iloc[0]
                else:
                    row[column_name] = None
        
        pivot_data.append(row)
    
    # CSVファイルに保存
    pivot_df = pd.DataFrame(pivot_data)
    pivot_df.to_csv("economic_data.csv", index=False)
    
    print(f"Data saved to economic_data.csv")
    print(f"Retrieved data for {len(pivot_df)} countries")
    
    # 更新時刻をJSONファイルに保存
    update_info = {
        "last_updated": datetime.now().isoformat(),
        "countries_count": len(pivot_df),
        "indicators_count": len(INDICATORS)
    }
    
    with open("data_update_info.json", "w") as f:
        json.dump(update_info, f, indent=2)
    
    print("Data fetch completed successfully!")

if __name__ == "__main__":
    process_data()



