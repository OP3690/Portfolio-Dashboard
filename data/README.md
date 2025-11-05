# Data Directory

This directory is for storing external datasets used by the scripts.

## Kaggle NSE Stock Sector Dataset

To populate sector data for all stocks, download the Kaggle NSE Stock Sector Dataset and place it here.

### Steps:

1. **Download the dataset from Kaggle:**
   - Search for "NSE Stock Sector Dataset" on Kaggle
   - Download the CSV file

2. **Place the file in this directory:**
   - Rename it to: `nse-stock-sector-dataset.csv`
   - Or update the `KAGGLE_DATASET_PATH` in `scripts/populate-sectors.js`

3. **Expected CSV format:**
   - Must have columns containing "ISIN" (or "isin") and "Sector" (or "sector")
   - Example columns: `ISIN`, `Sector` or `isin`, `sector`

4. **Run the script:**
   ```bash
   node scripts/populate-sectors.js
   ```

The script will automatically:
- Load the Kaggle dataset
- Match ISINs from your database with the dataset
- Update all stocks with their sector information
- Fallback to Holdings collection and Yahoo Finance API if needed

