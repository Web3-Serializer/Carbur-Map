# CarburMap

CarburMap provides real-time fuel price predictions across France with **an interactive map**, combining official datasets with advanced machine learning for precise short-term forecasts.

## Overview

The model leverages **an ensemble of 8 XGBoost regressors trained via bootstrap aggregation** using 40+ features:  

- **Price history:** lags from D-1 to D-30, moving averages (3/7/14/21/30 days), exponential moving averages (EMA).  
- **Price dynamics:** rate of change, momentum, volatility.  
- **Seasonality:** Fourier terms capturing weekly, monthly, and yearly patterns.  
- **Temporal features:** school holidays, public holidays.  
- **External factors:** local weather data via Open-Meteo, EUR/USD exchange rate from Frankfurter API.  

Confidence intervals are computed from ensemble dispersion and residual standard deviation, scaled with the square root of the forecast horizon. The **R²** metric represents explained variance.  

Data is sourced from the **official API of the French Ministry of Economy**.  

## Features

- Predict daily fuel prices: **SP95, SP98, Gazole, E10, E85, GPLc**.  
- Department-level predictions with historical trends.  
- Weekly variations and confidence intervals.  
- Interactive map showing stations, prices, and trends.  
- Fully free; no API keys required.  
- FastAPI backend with frontend charts, tables, and map integration.  

## Usage

Run the server:

```bash
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

Open in a browser: `http://<your-ip>:5000`  

## Download

You can download the entire repository as a **ZIP** directly from GitHub:

[Download CarburMap](https://github.com/web3-serializer/CarburMap/archive/refs/heads/main.zip)  

Or clone it:

```bash
git clone https://github.com/web3-serializer/CarburMap.git
```

## Technologies

- Python 3.11  
- FastAPI  
- XGBoost  
- NumPy, Pandas, Scikit-learn  
- Leaflet.js for interactive maps  
- Open-Meteo API, Frankfurter API, French Ministry of Economy API  

## License

MIT License

