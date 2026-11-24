export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const value = process.env.GHL_BOOKING_URL ||
    'https://api.leadconnectorhq.com/widget/booking/esvy40TRqXyK4kuMBaq2';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Booking URL must use HTTPS');
    return res.status(200).json({ url: url.toString() });
  } catch {
    return res.status(200).json({ url: null });
  }
}
