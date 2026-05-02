
#!/usr/bin/env python3
"""
経済データダッシュボードを更新するスクリプト
"""

import pandas as pd
import json
from datetime import datetime
import os
import plotly.express as px
import plotly.io as pio

# HTMLファイルを保存するディレクトリ
OUTPUT_DIR = "./docs"

def update_dashboard():
    # 出力ディレクトリが存在しない場合は作成
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # economic_data.csvを読み込む
    df_raw = pd.read_csv("economic_data.csv")

    # データを整形し、年ごとのデータを時系列データに変換
    # 各指標の列名パターンを定義
    indicators = {
        "GDP (current US$)": "GDP (current US$)",
        "Population, total": "Population, total", 
        "GDP growth (annual %)": "GDP growth (annual %)",
        "Inflation, consumer prices (annual %)": "Inflation, consumer prices (annual %)",
        "Unemployment, total (% of total labor force)": "Unemployment, total (% of total labor force)",
        "Foreign direct investment, net inflows (BoP, current US$)": "Foreign direct investment, net inflows (BoP, current US$)",
        "Total reserves (includes gold, current US$)": "Total reserves (includes gold, current US$)",
        "Exports of goods and services (% of GDP)": "Exports of goods and services (% of GDP)",
        "Imports of goods and services (% of GDP)": "Imports of goods and services (% of GDP)",
        "Central government debt, total (% of GDP)": "Central government debt, total (% of GDP)",
        "Military expenditure (% of GDP)": "Military expenditure (% of GDP)",
        "Current health expenditure (% of GDP)": "Current health expenditure (% of GDP)",
        "Government expenditure on education, total (% of GDP)": "Government expenditure on education, total (% of GDP)",
        "Access to electricity (% of population)": "Access to electricity (% of population)",
        "Ease of doing business score": "Ease of doing business score",
        "CO2 emissions (kt)": "CO2 emissions (kt)"
    }

    # 最終的なデータフレームを格納するリスト
    df_list = []

    for country_id in df_raw["CountryID"].unique():
        country_data = df_raw[df_raw["CountryID"] == country_id].iloc[0]
        
        for year in range(2000, datetime.now().year + 1): # 2000年から最新年まで
            row = {"CountryID": country_id, "Date": datetime(year, 1, 1)}
            for indicator_key, indicator_name in indicators.items():
                col_name = f"{indicator_key}_{year}"
                if col_name in country_data:
                    row[indicator_name] = country_data[col_name]
                else:
                    row[indicator_name] = None # データがない場合はNone
            df_list.append(row)

    df = pd.DataFrame(df_list)
    df["Date"] = pd.to_datetime(df["Date"])

    # 各国、各指標のグラフを生成
    for country_id in df["CountryID"].unique():
        country_df = df[df["CountryID"] == country_id]
        for indicator_name in indicators.values():
            if indicator_name in country_df.columns:
                fig = px.line(country_df, x="Date", y=indicator_name, title=f"{indicator_name} Over Time ({country_id})")
                # ファイル名を生成 (例: GDP_current_US$_Over_Time_US.html)
                file_name = f"{indicator_name.replace(' ', '_').replace('(', '').replace(')', '').replace('%', '').replace('$', '').replace(',', '')}_Over_Time_{country_id}.html"
                pio.write_html(fig, file=os.path.join(OUTPUT_DIR, file_name), auto_open=False)

    print(f"Dashboard updated. HTML files saved to {OUTPUT_DIR}/")

if __name__ == "__main__":
    update_dashboard()



