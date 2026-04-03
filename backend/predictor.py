from datetime import datetime, timedelta, date
import httpx
import pandas as pd
import numpy as np
from xgboost import XGBRegressor
from dateutil.easter import easter

CARBU_API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-carburants-quotidien/records"
FX_API = "https://api.frankfurter.app"
METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"
VACANCES_URL = "https://data.education.gouv.fr/api/records/1.0/search/"

FUEL_FIELDS = {
    "SP95": "sp95_prix",
    "SP98": "sp98_prix",
    "Gazole": "gazole_prix",
    "E10": "e10_prix",
    "E85": "e85_prix",
    "GPLc": "gplc_prix",
}

DEPT_COORDS = {
    "": (46.60, 1.89),
    "01": (46.21, 5.23), "02": (49.56, 3.62), "03": (46.34, 3.17),
    "04": (44.09, 6.24), "05": (44.56, 6.08), "06": (43.71, 7.26),
    "07": (44.74, 4.60), "08": (49.77, 4.72), "09": (42.97, 1.61),
    "10": (48.30, 4.08), "11": (43.21, 2.35), "12": (44.35, 2.57),
    "13": (43.30, 5.37), "14": (49.18, -0.37), "15": (45.03, 2.44),
    "16": (45.65, 0.15), "17": (45.75, -0.63), "18": (47.08, 2.40),
    "19": (45.27, 1.77), "21": (47.32, 5.04), "22": (48.51, -2.76),
    "23": (46.07, 1.87), "24": (45.18, 0.72), "25": (47.25, 6.02),
    "26": (44.73, 5.09), "27": (49.09, 1.15), "28": (48.45, 1.49),
    "29": (48.39, -4.49), "30": (43.83, 4.36), "31": (43.60, 1.44),
    "32": (43.65, 0.59), "33": (44.84, -0.58), "34": (43.61, 3.88),
    "35": (48.11, -1.68), "36": (46.81, 1.69), "37": (47.39, 0.69),
    "38": (45.19, 5.72), "39": (46.67, 5.55), "40": (43.89, -0.50),
    "41": (47.59, 1.33), "42": (45.44, 4.39), "43": (45.04, 3.88),
    "44": (47.22, -1.55), "45": (47.90, 1.90), "46": (44.45, 1.44),
    "47": (44.23, 0.62), "48": (44.52, 3.50), "49": (47.47, -0.56),
    "50": (48.88, -1.35), "51": (49.04, 3.96), "52": (48.11, 5.14),
    "53": (48.07, -0.77), "54": (48.69, 6.18), "55": (49.16, 5.38),
    "56": (47.66, -2.76), "57": (49.12, 6.18), "58": (47.07, 3.50),
    "59": (50.63, 3.06), "60": (49.42, 2.42), "61": (48.43, 0.09),
    "62": (50.43, 2.83), "63": (45.78, 3.08), "64": (43.30, -0.37),
    "65": (43.23, 0.08), "66": (42.70, 2.90), "67": (48.57, 7.75),
    "68": (47.75, 7.34), "69": (45.76, 4.84), "70": (47.62, 6.15),
    "71": (46.80, 4.44), "72": (47.99, 0.20), "73": (45.56, 6.57),
    "74": (46.07, 6.41), "75": (48.86, 2.35), "76": (49.44, 1.10),
    "77": (48.54, 2.66), "78": (48.80, 2.13), "79": (46.32, -0.46),
    "80": (49.89, 2.30), "81": (43.90, 2.15), "82": (44.02, 1.35),
    "83": (43.44, 6.07), "84": (44.06, 5.05), "85": (46.67, -1.43),
    "86": (46.58, 0.34), "87": (45.85, 1.25), "88": (48.17, 6.45),
    "89": (47.80, 3.57), "90": (47.64, 6.86), "91": (48.63, 2.44),
    "92": (48.83, 2.24), "93": (48.91, 2.48), "94": (48.78, 2.47),
    "95": (49.04, 2.08), "2A": (41.93, 8.74), "2B": (42.15, 9.10),
}

FIXED_HOLIDAYS = [(1, 1), (5, 1), (5, 8), (7, 14), (8, 15), (11, 1), (11, 11), (12, 25)]


class Predictor:
    def __init__(self):
        self._vacances = set()
        self._holidays = set()
        self._load_vacances()
        self._build_holidays()

    def _load_vacances(self):
        try:
            params = {"dataset": "fr-en-calendrier-scolaire", "rows": 1000}
            r = httpx.get(VACANCES_URL, params=params, timeout=10)
            for rec in r.json().get("records", []):
                fields = rec.get("fields", {})
                start = fields.get("start")
                end = fields.get("end")
                if start and end:
                    for d in pd.date_range(pd.to_datetime(start), pd.to_datetime(end)):
                        self._vacances.add(d.date())
        except Exception:
            pass

    def _build_holidays(self):
        for year in range(2020, 2032):
            for month, day in FIXED_HOLIDAYS:
                self._holidays.add(date(year, month, day))
            e = easter(year)
            self._holidays.add(e + timedelta(days=1))
            self._holidays.add(e + timedelta(days=39))
            self._holidays.add(e + timedelta(days=50))

    def _coords(self, dept):
        return DEPT_COORDS.get(dept or "", DEPT_COORDS[""])

    def _fetch_prices(self, fuel, dept, depth):
        field = FUEL_FIELDS.get(fuel)
        if not field:
            return pd.DataFrame()
        where = f"{field} is not null"
        if dept:
            where += f" AND cp like '{dept}%'"
        params = {
            "select": f"date,{field}",
            "where": where,
            "order_by": "date",
            "limit": 10000,
        }
        try:
            r = httpx.get(CARBU_API, params=params, timeout=30)
            records = r.json().get("results", [])
        except Exception:
            return pd.DataFrame()
        rows = []
        for rec in records:
            d = str(rec.get("date", ""))[:10]
            v = rec.get(field)
            if d and v and float(v) > 0:
                rows.append({"date": d, "price": float(v)})
        if not rows:
            return pd.DataFrame()
        df = pd.DataFrame(rows)
        df["date"] = pd.to_datetime(df["date"])
        df = df.groupby("date").agg({"price": "mean"}).sort_index()
        df = df.asfreq("D").ffill()
        cutoff = df.index.max() - timedelta(days=depth)
        return df[df.index >= cutoff]

    def _fetch_weather_history(self, lat, lng, start, end):
        try:
            params = {
                "latitude": lat,
                "longitude": lng,
                "start_date": start,
                "end_date": end,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
                "timezone": "Europe/Paris",
            }
            r = httpx.get(METEO_ARCHIVE, params=params, timeout=20)
            data = r.json().get("daily", {})
            df = pd.DataFrame({
                "temp_max": data.get("temperature_2m_max", []),
                "temp_min": data.get("temperature_2m_min", []),
                "precip": data.get("precipitation_sum", []),
                "wind": data.get("wind_speed_10m_max", []),
            }, index=pd.to_datetime(data.get("time", [])))
            return df
        except Exception:
            return pd.DataFrame()

    def _fetch_weather_forecast(self, lat, lng, horizon):
        try:
            params = {
                "latitude": lat,
                "longitude": lng,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
                "timezone": "Europe/Paris",
                "forecast_days": min(horizon, 16),
            }
            r = httpx.get(METEO_FORECAST, params=params, timeout=15)
            data = r.json().get("daily", {})
            result = {}
            times = data.get("time", [])
            tmax = data.get("temperature_2m_max") or []
            tmin = data.get("temperature_2m_min") or []
            prec = data.get("precipitation_sum") or []
            wspd = data.get("wind_speed_10m_max") or []
            for i, t in enumerate(times):
                result[t] = {
                    "temp_max": tmax[i] if i < len(tmax) else None,
                    "temp_min": tmin[i] if i < len(tmin) else None,
                    "precip": prec[i] if i < len(prec) else None,
                    "wind": wspd[i] if i < len(wspd) else None,
                }
            return result
        except Exception:
            return {}

    def _fetch_fx(self, start, end):
        try:
            url = f"{FX_API}/{start}..{end}"
            r = httpx.get(url, params={"from": "USD", "to": "EUR"}, timeout=15)
            rates = r.json().get("rates", {})
            rows = []
            for d, vals in rates.items():
                rows.append({"date": d, "eurusd": vals.get("EUR", 1.0)})
            if not rows:
                return pd.DataFrame()
            df = pd.DataFrame(rows)
            df["date"] = pd.to_datetime(df["date"])
            df = df.set_index("date").sort_index()
            df = df.asfreq("D").ffill()
            return df
        except Exception:
            return pd.DataFrame()

    def _add_features(self, df):
        p = df["price"]

        for lag in [1, 2, 3, 5, 7, 14, 21, 30]:
            df[f"lag_{lag}"] = p.shift(lag)

        for w in [3, 7, 14, 21, 30]:
            df[f"ma_{w}"] = p.rolling(w).mean()
            df[f"std_{w}"] = p.rolling(w).std()

        for span in [7, 14, 30]:
            df[f"ema_{span}"] = p.ewm(span=span).mean()

        for period in [1, 7, 14]:
            df[f"roc_{period}"] = p.pct_change(period)

        df["momentum_7"] = p.diff(7)
        df["momentum_14"] = p.diff(14)
        df["price_range_7"] = p.rolling(7).max() - p.rolling(7).min()
        df["price_range_14"] = p.rolling(14).max() - p.rolling(14).min()

        idx = df.index
        df["dow"] = idx.dayofweek
        df["dom"] = idx.day
        df["month"] = idx.month
        df["week"] = idx.isocalendar().week.values.astype(int)
        df["quarter"] = idx.quarter
        df["is_weekend"] = (idx.dayofweek >= 5).astype(int)
        df["is_holiday"] = [1 if d.date() in self._holidays else 0 for d in idx]
        df["is_vacation"] = [1 if d.date() in self._vacances else 0 for d in idx]

        doy = idx.dayofyear
        df["sin_week"] = np.sin(2 * np.pi * idx.dayofweek / 7)
        df["cos_week"] = np.cos(2 * np.pi * idx.dayofweek / 7)
        df["sin_month"] = np.sin(2 * np.pi * idx.day / 30.44)
        df["cos_month"] = np.cos(2 * np.pi * idx.day / 30.44)
        df["sin_year"] = np.sin(2 * np.pi * doy / 365.25)
        df["cos_year"] = np.cos(2 * np.pi * doy / 365.25)

        if "eurusd" in df.columns:
            df["eurusd_roc_1"] = df["eurusd"].pct_change(1)
            df["eurusd_roc_7"] = df["eurusd"].pct_change(7)

        if "temp_max" in df.columns:
            df["temp_range"] = df["temp_max"] - df["temp_min"]

        return df

    def _build_future_row(self, price_series, next_date, weather_fc, last_weather, last_fx, feature_cols):
        f = {}

        for lag in [1, 2, 3, 5, 7, 14, 21, 30]:
            idx = len(price_series) - lag
            f[f"lag_{lag}"] = float(price_series.iloc[idx]) if idx >= 0 else float(price_series.iloc[0])

        for w in [3, 7, 14, 21, 30]:
            tail = price_series.tail(w)
            f[f"ma_{w}"] = float(tail.mean())
            f[f"std_{w}"] = float(tail.std()) if len(tail) >= 2 else 0.0

        for span in [7, 14, 30]:
            f[f"ema_{span}"] = float(price_series.ewm(span=span).mean().iloc[-1])

        for period in [1, 7, 14]:
            curr = float(price_series.iloc[-1])
            pidx = len(price_series) - 1 - period
            prev = float(price_series.iloc[pidx]) if pidx >= 0 else curr
            f[f"roc_{period}"] = (curr - prev) / prev if prev != 0 else 0.0

        f["momentum_7"] = float(price_series.iloc[-1]) - float(price_series.iloc[-8] if len(price_series) > 7 else price_series.iloc[0])
        f["momentum_14"] = float(price_series.iloc[-1]) - float(price_series.iloc[-15] if len(price_series) > 14 else price_series.iloc[0])

        recent7 = price_series.tail(7)
        recent14 = price_series.tail(14)
        f["price_range_7"] = float(recent7.max() - recent7.min())
        f["price_range_14"] = float(recent14.max() - recent14.min())

        f["dow"] = next_date.weekday()
        f["dom"] = next_date.day
        f["month"] = next_date.month
        f["week"] = next_date.isocalendar()[1]
        f["quarter"] = (next_date.month - 1) // 3 + 1
        f["is_weekend"] = 1 if next_date.weekday() >= 5 else 0
        f["is_holiday"] = 1 if next_date.date() in self._holidays else 0
        f["is_vacation"] = 1 if next_date.date() in self._vacances else 0

        doy = next_date.timetuple().tm_yday
        f["sin_week"] = np.sin(2 * np.pi * next_date.weekday() / 7)
        f["cos_week"] = np.cos(2 * np.pi * next_date.weekday() / 7)
        f["sin_month"] = np.sin(2 * np.pi * next_date.day / 30.44)
        f["cos_month"] = np.cos(2 * np.pi * next_date.day / 30.44)
        f["sin_year"] = np.sin(2 * np.pi * doy / 365.25)
        f["cos_year"] = np.cos(2 * np.pi * doy / 365.25)

        date_key = next_date.strftime("%Y-%m-%d")
        wf = weather_fc.get(date_key, {})
        f["temp_max"] = wf.get("temp_max") or last_weather.get("temp_max", 15.0)
        f["temp_min"] = wf.get("temp_min") or last_weather.get("temp_min", 5.0)
        f["precip"] = wf.get("precip") or 0.0
        f["wind"] = wf.get("wind") or last_weather.get("wind", 10.0)
        f["temp_range"] = f["temp_max"] - f["temp_min"]

        f["eurusd"] = last_fx
        f["eurusd_roc_1"] = 0.0
        f["eurusd_roc_7"] = 0.0

        row = {}
        for col in feature_cols:
            row[col] = f.get(col, 0.0)
        return row

    def _history_to_df(self, history):
        if not history:
            return pd.DataFrame()
        df = pd.DataFrame(history)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()
        if "avg" in df.columns:
            df = df.rename(columns={"avg": "price"})
        df = df[["price"]]
        df = df.asfreq("D").ffill()
        return df

    def forecast(self, fuel="SP95", dept="", horizon=7, depth=180, confidence=95, fallback_history=None):
        prices = self._fetch_prices(fuel, dept, depth)
        if (prices.empty or len(prices) < 30) and fallback_history:
            prices = self._history_to_df(fallback_history)
        if prices.empty or len(prices) < 30:
            return {"history": [], "predictions": [], "model": {}}

        start = prices.index.min().strftime("%Y-%m-%d")
        end = prices.index.max().strftime("%Y-%m-%d")
        lat, lng = self._coords(dept)

        weather = self._fetch_weather_history(lat, lng, start, end)
        fx = self._fetch_fx(start, end)
        weather_fc = self._fetch_weather_forecast(lat, lng, horizon)

        df = prices.copy()

        if not weather.empty:
            df = df.join(weather, how="left")
        else:
            df["temp_max"] = 15.0
            df["temp_min"] = 5.0
            df["precip"] = 0.0
            df["wind"] = 10.0

        if not fx.empty:
            df = df.join(fx, how="left")
        else:
            df["eurusd"] = 1.0

        df = df.ffill().bfill()
        df = self._add_features(df)
        df = df.replace([np.inf, -np.inf], np.nan).dropna()

        if len(df) < 30:
            return {"history": [], "predictions": [], "model": {}}

        target = "price"
        feature_cols = [c for c in df.columns if c != target]
        X = df[feature_cols]
        y = df[target]

        n_ensemble = 8
        models = []
        for i in range(n_ensemble):
            model = XGBRegressor(
                n_estimators=500,
                learning_rate=0.03,
                max_depth=7,
                subsample=0.75,
                colsample_bytree=0.7,
                reg_alpha=0.1,
                reg_lambda=1.0,
                random_state=i * 37,
                tree_method="hist",
                verbosity=0,
            )
            rng = np.random.RandomState(i * 37)
            idx = rng.choice(len(X), size=len(X), replace=True)
            model.fit(X.iloc[idx], y.iloc[idx])
            models.append(model)

        train_preds = np.array([m.predict(X) for m in models])
        train_mean = train_preds.mean(axis=0)
        residuals = y.values - train_mean
        residual_std = float(np.std(residuals))
        ss_res = float(np.sum(residuals ** 2))
        ss_tot = float(np.sum((y.values - y.mean()) ** 2))
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
        mae = float(np.mean(np.abs(residuals)))
        rmse = float(np.sqrt(np.mean(residuals ** 2)))

        importances = np.mean([m.feature_importances_ for m in models], axis=0)
        top_idx = np.argsort(importances)[::-1][:8]
        top_features = [
            {"name": feature_cols[i], "importance": round(float(importances[i]), 4)}
            for i in top_idx
        ]

        z_map = {80: 1.282, 90: 1.645, 95: 1.960, 99: 2.576}
        z = z_map.get(confidence, 1.960)

        price_series = df[target].copy()
        last_date = df.index[-1]

        last_weather = {
            "temp_max": float(df["temp_max"].iloc[-1]) if "temp_max" in df.columns else 15.0,
            "temp_min": float(df["temp_min"].iloc[-1]) if "temp_min" in df.columns else 5.0,
            "wind": float(df["wind"].iloc[-1]) if "wind" in df.columns else 10.0,
        }
        last_fx = float(df["eurusd"].iloc[-1]) if "eurusd" in df.columns else 1.0

        preds = []
        for step in range(1, horizon + 1):
            next_date = last_date + timedelta(days=step)
            features = self._build_future_row(
                price_series, next_date, weather_fc, last_weather, last_fx, feature_cols
            )
            feat_df = pd.DataFrame([features])[feature_cols]
            ensemble_out = np.array([float(m.predict(feat_df)[0]) for m in models])
            pred_val = float(ensemble_out.mean())
            pred_spread = float(ensemble_out.std())
            total_std = np.sqrt(pred_spread ** 2 + residual_std ** 2) * np.sqrt(step * 0.5 + 0.5)
            low = round(pred_val - z * total_std, 4)
            high = round(pred_val + z * total_std, 4)

            preds.append({
                "date": next_date.strftime("%Y-%m-%d"),
                "pred": round(pred_val, 4),
                "low": low,
                "high": high,
            })
            price_series = pd.concat([
                price_series,
                pd.Series([pred_val], index=[next_date]),
            ])

        weekly_prices = price_series.tail(8)
        weekly_change = float(weekly_prices.iloc[-1] - weekly_prices.iloc[0]) if len(weekly_prices) > 1 else 0.0
        trend = "hausse" if weekly_change > 0.005 else "baisse" if weekly_change < -0.005 else "stable"

        hist = df[[target]].tail(60).reset_index()
        hist.columns = ["date", "avg"]
        hist["date"] = hist["date"].dt.strftime("%Y-%m-%d")

        return {
            "history": hist.to_dict("records"),
            "predictions": preds,
            "model": {
                "r2": round(r2, 4),
                "mae": round(mae, 4),
                "rmse": round(rmse, 4),
                "residual_std": round(residual_std, 4),
                "trend": trend,
                "weekly_change": round(weekly_change, 4),
                "volatility": round(float(df[target].tail(30).std()), 4),
                "data_points": len(df),
                "features_count": len(feature_cols),
                "ensemble_size": n_ensemble,
                "confidence": confidence,
                "top_features": top_features,
            },
        }
