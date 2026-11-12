# PC Home Hostel: booking demo

A static demo of a hostel booking website for GitHub Pages. No server needed.

**Guest site** (`index.html`): pick a room type (2 in a room / 4 in a room) and dates, see live availability and a price quote, enter details, reserve or pay a simulated mobile-money deposit, get a booking reference. Guests can look up or cancel a booking with their reference and phone number.

**Manager page** (`admin.html`): see all bookings, confirm, cancel, mark deposits paid, search and filter, export CSV, edit the number of rooms and the monthly price per bed, and add sample data.

## Demo limitations
- Bookings are stored in the visitor's own browser (`localStorage`), so they are not shared between devices. A live version needs a backend and database.
- Mobile-money payment is simulated. No money moves.
- The manager page has no login in this demo.
- Prices and room counts are sample values, editable on the manager page.

## Preview locally
    python3 -m http.server 8000

Then open http://localhost:8000.

## Publish
Settings -> Pages -> Source: GitHub Actions. Every push to `main` redeploys via `.github/workflows/pages.yml`.
