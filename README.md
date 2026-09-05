# PocketSplit — Complete V1

Responsive personal finance and friend-splitting PWA.

## Included
- Dashboard and monthly budget
- Expense entry with date, category, payment method
- Day-wise transaction history
- Search + category filters
- Shared expenses with automatic equal split calculation
- Friends and balances
- Settlement action
- Spending analytics
- Local persistence via localStorage
- JSON export/import backup
- Reset data
- PWA manifest + service worker
- Mobile, tablet and desktop responsive layout

## Run
npm install
npm run dev

## Production build
npm run build

The `dist/` folder can be deployed to GitHub Pages or another static host.

## Suggested V2
- Unequal/custom shares
- Multiple currencies
- Recurring expenses/subscriptions
- Income tracking
- Bank/UPI CSV import
- Monthly reports
- PIN/biometric app lock
- Cloud sync across devices
- Authentication
- Notifications/reminders
- Debt history and partial settlements
- Attach receipts/photos
- Advanced charts


## GitHub Pages deployment

This project includes `.github/workflows/deploy.yml`.

1. Create a GitHub repository named `pocketsplit`.
2. Upload the project files to the repository root.
3. Push/commit to the `main` branch.
4. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
5. GitHub Actions will build and deploy the site automatically.
6. Your project site will normally be:
   `https://YOUR_GITHUB_USERNAME.github.io/pocketsplit/`

The Vite `base` is already configured as `/pocketsplit/`.
