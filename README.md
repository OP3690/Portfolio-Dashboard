# Portfolio Dashboard

A comprehensive portfolio management dashboard built with Next.js, React, MongoDB, and Tailwind CSS.

## Features

- 📊 **Dashboard Overview**: View portfolio summary, top performers, and analytics
- 📈 **Stock Analytics**: Detailed performance metrics, consistency tracking, and signals
- 🔍 **Stock Research**: Research stocks with detailed analysis
- 📤 **Excel Upload**: Upload and parse portfolio data from Excel files
- 🔐 **Secure Login**: Authentication system for authorized users
- 📉 **Realized Stocks**: Track realized profit/loss with current valuations
- 📅 **Monthly Tracking**: Month-over-month performance comparison

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Mongoose
- **Charts**: Recharts
- **File Processing**: XLSX for Excel parsing

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- MongoDB Atlas account (or local MongoDB)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/OP3690/Portfolio-Dashboard.git
cd Portfolio-Dashboard/portfolio-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the `portfolio-dashboard` directory:
```
MONGODB_URI=your_mongodb_connection_string
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

- `MONGODB_URI`: MongoDB connection string (required)

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions to Vercel and Render.

## Project Structure

```
portfolio-dashboard/
├── app/
│   ├── api/              # API routes
│   ├── login/            # Login page
│   └── page.tsx          # Dashboard page
├── components/           # React components
├── lib/                  # Utility functions
├── models/               # MongoDB models
├── scripts/              # Utility scripts
└── public/               # Static assets
```

## Features in Detail

### Dashboard
- Portfolio summary cards
- Top/worst performing stocks
- Monthly investment and dividend charts
- Industry distribution pie chart
- Holdings table with filtering
- Realized stocks table

### Stock Analytics
- Monthly consistency tracker
- Month-over-month comparison
- Volume trend analysis
- Advanced trading signals
- Alert & Action table

### Stock Research
- Detailed stock analysis
- Price trends and indicators

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run fetch-stocks` - Fetch stock data

## License

Private project

## Author

OP3690
