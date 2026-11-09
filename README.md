# ♻️ WASTE WISE AI
### Intelligent Inventory Management & Food Waste Reduction System

**Smarter Inventory. Less Waste. A Greener Future.**

WASTE WISE AI is an AI-powered inventory management and food waste reduction platform designed to help businesses monitor products, manage inventory, analyze sales, predict demand, identify expiry risks, and make data-driven decisions.

The platform combines Machine Learning, data analytics, and a modern web application to transform inventory data into actionable business insights.

---
## 📌 Project Overview

Food waste and inefficient inventory management can lead to financial losses and unnecessary resource consumption.

WASTE WISE AI addresses these challenges through an integrated platform that provides:

- Product and inventory management.
- Sales tracking and analytics.
- Machine Learning-based demand forecasting.
- Expiry risk identification.
- Food waste prediction and analysis.
- AI-driven inventory and discount recommendations.
- Model performance monitoring and evaluation.

The goal is to support smarter inventory decisions, reduce potential waste, and improve operational efficiency.

## ✨ Key Features

### 📊 Interactive Dashboard
- Overview of products, inventory, sales, and predicted waste.
- Business performance indicators.
- Inventory and sales visualizations.
- Demand outlook and product analytics.

### 🛒 Product Management
- Product catalogue with product images.
- Product information and pricing.
- Product availability information.

### 📦 Inventory Management
- Inventory record management.
- Stock monitoring.
- Expiry date tracking.
- Inventory risk visibility.

### 💰 Sales Analytics
- Sales transaction history.
- Revenue and quantity analysis.
- Product-level sales performance.

### 🔮 Demand Forecasting
- Machine Learning-based demand predictions.
- Product-level forecasting.
- Forecast performance evaluation.

### ⚠️ Expiry Risk Analysis
- Identification of products approaching expiry.
- Expiry risk predictions.
- Risk-based inventory insights.

### 🤖 AI Recommendations
- Inventory management recommendations.
- Discount recommendations.
- Waste reduction insights.

### 📈 Model Metrics
- Model evaluation reports.
- Performance metrics.
- Data validation and experiment reports.

### 🔐 Authentication
- Login functionality.
- Protected application routes.
- Password reset through email configuration.

---

## 🧠 Machine Learning

The project includes multiple Machine Learning workflows:

| Model | Purpose |
|---|---|
| Demand Forecasting | Estimate future product demand |
| Expiry Risk Model | Identify potential expiry risks |
| Food Waste Model | Estimate potential food waste |
| Discount Recommendation Model | Support discount decisions |

**Machine Learning workflow:**

1. Data collection and exploration.
2. Data cleaning and preprocessing.
3. Exploratory Data Analysis (EDA).
4. Feature engineering.
5. Model training.
6. Model evaluation.
7. Prediction and integration.
8. Performance reporting.

Trained model artifacts and evaluation reports are maintained in the `ml/artifacts/` directory.

## 🏗️ System Architecture

```text
                 WASTE WISE AI
                       |
          +------------+------------+
          |                         |
     React Frontend             FastAPI Backend
     (Vite + TypeScript)             |
          |                  +------+------+
          |                  |             |
     Dashboard             REST API    Authentication
     Products                  |        & Services
     Inventory                 |
     Sales                SQLite Database
     Forecasts                 |
     Analytics          +------+------+
                        |             |
                   Product Data   Sales & Inventory
                                      |
                              Machine Learning
                                      |
                         +------------+------------+
                         |            |            |
                      Demand       Expiry       Waste &
                    Forecasting     Risk       Discount
```

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Programming | Python, SQL, TypeScript, JavaScript |
| Frontend | React, Vite, HTML, CSS |
| Backend | FastAPI |
| Database | SQLite |
| Data Analysis | Pandas, NumPy |
| Visualization | Matplotlib, Seaborn |
| Machine Learning | Scikit-learn |
| Model Storage | Joblib |
| API Testing | Swagger UI |
| Version Control | Git, GitHub |

## 📁 Project Structure

```text
WASTE_WISE_AI/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
│
├── database/
│   ├── schema.sql
│   └── seed_data.sql
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
│
├── ml/
│   ├── artifacts/
│   ├── data/
│   │   ├── raw/
│   │   └──
│   ├── notebooks/
│   ├── reports/
│   ├── src/
│   └── requirements.txt
│
├── docs/
├── scripts/
├── docker-compose.yml
├── .gitignore
└── README.md
```

## ⚙️ Installation & Setup

### Prerequisites

Install the following before running the project:

- Python 3.12+
- Node.js and npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/chavansantosh/WASTE_WISE_AI.git
cd WASTE_WISE_AI
```

### 2. Backend Setup

Create and activate a virtual environment:

**Windows PowerShell**

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

Install backend dependencies:

```powershell
pip install -r backend/requirements.txt
```

Configure environment variables:

```powershell
Copy-Item backend/.env.example backend/.env
```

Update `backend/.env` with the required local configuration. Configure authentication secrets and SMTP credentials where needed. Never commit real credentials.

Start the backend:

```powershell
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8001 --reload
```

Backend API:

`http://127.0.0.1:8001`

Swagger documentation:

`http://127.0.0.1:8001/docs`

### 3. Frontend Setup

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend application:

`http://localhost:5173`

Ensure the frontend API configuration points to the running backend.

### 4. Database Setup

The project uses SQLite for local data storage.

Database schema and seed scripts are available in:

```text
database/schema.sql
database/seed_data.sql
```

Follow the database initialization requirements in the project documentation before running the application.

---

## 📊 Model Evaluation & Reports

The project maintains model evaluation artifacts and analytical reports to support experimentation and performance assessment.

Available reports include:

- Demand forecasting metrics.
- Expiry risk model metrics.
- Food waste model metrics.
- Discount model metrics.
- Data validation reports.
- Inventory and waste summaries.

See `ml/artifacts/` and `ml/reports/` for available results.

**Note:** Model metrics are based on the datasets and experiments used during development. They should not be interpreted as guaranteed real-world business performance.

## 🔒 Security & Data Handling

- Environment files containing secrets are excluded from version control.
- Local SQLite databases and backups are excluded.
- Virtual environments and dependency folders are excluded.
- Authentication and password-reset configuration should use private credentials.
- Never publish passwords, API keys, JWT secrets, or email credentials.

## ⚠️ Dataset Note

The large `ml/data/raw/sell_prices.csv` file is intentionally excluded from this GitHub repository because it exceeds GitHub's standard file-size limit.

The original file is retained locally. Obtain the required dataset separately before running workflows that depend on it.

## 🚀 Future Improvements

- Cloud deployment and production configuration.
- Automated model retraining pipelines.
- Advanced model drift and performance monitoring.
- Real-time inventory synchronization.
- Enhanced forecasting and recommendation capabilities.
- Expanded analytics and reporting.

## 👨‍💻 Author

**Santosh Chavan**

B.Sc. Computer Science Graduate | Data Science & Machine Learning

- **GitHub:** https://github.com/chavansantosh
- **LinkedIn:** https://linkedin.com/in/santosh-chavan-986aaa283/
- **Kaggle:** https://www.kaggle.com/santoshnarayanchavan

---

## 📄 License

This project is available for educational and portfolio purposes. A formal open-source license can be added when the distribution terms are decided.

---

**Built with Python, Machine Learning, FastAPI, React, and a vision for reducing food waste. 🌱**
