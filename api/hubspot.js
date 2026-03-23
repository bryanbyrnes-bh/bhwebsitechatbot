export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const contact = req.body;

    const properties = {
      firstname: contact.firstname || '',
      lastname: contact.lastname || '',
      email: contact.email || '',
      phone: contact.phone || '',
      hs_lead_status: 'NEW',
      jobtitle: contact.contact_type === 'vendor' ? contact.company || 'Vendor' : '',
      city: contact.location || '',
      message: `Type: ${contact.contact_type || 'lead'} | Sq Ft: ${contact.sqft || 'N/A'} | Finish: ${contact.finish_level || 'N/A'} | Timeline: ${contact.timeline || 'N/A'} | Notes: ${contact.notes || ''}`
    };

    // Try to create contact, if duplicate email update instead
    const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });

    const createData = await createRes.json();

    // If contact already exists, update them
    if (createData.status === 'error' && createData.message?.includes('already exists')) {
      const email = contact.email;
      const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${email}?idProperty=email`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties })
      });
      const updateData = await updateRes.json();
      return res.status(200).json({ success: true, updated: true, id: updateData.id });
    }

    return res.status(200).json({ success: true, created: true, id: createData.id });

  } catch (err) {
    console.error('HubSpot error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
