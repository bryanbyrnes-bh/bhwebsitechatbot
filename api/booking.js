export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const value = process.env.CONSULTATION_BOOKING_URL ||
    'https://meetings-na2.hubspot.com/melinda-blackmon';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Booking URL must use HTTPS');
    return res.status(200).json({ url: url.toString() });
  } catch {
    return res.status(200).json({ url: null });
  }
}
