export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const contact = req.body;

    const properties = {
      firstname: contact.firstname || '',
      lastname: contact.lastname || '',
      email: contact.email || '',
      phone: contact.phone || '',
      hs_lead_status: 'NEW',
      jobtitle: contact.contact_type === 'vendor' ? (contact.company || 'Vendor') : '',
      city: contact.location || '',

      // custom properties - verify these exact internal names in HubSpot
      contact_type_breven: contact.contact_type || '',
      desired_location: contact.location || '',
      square_footage: contact.sqft ? Number(contact.sqft) : null,
      finish_level: contact.finish_level || '',
      build_timeline: contact.timeline || '',
      project_notes: contact.notes || ''
    };

    console.log('HubSpot properties payload:', properties);

    const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties })
    });

    const createData = await createRes.json();

    if (createRes.ok) {
      return res.status(200).json({
        success: true,
        created: true,
        id: createData.id
      });
    }

    if (createData.status === 'error' && createData.message?.includes('already exists')) {
      const email = contact.email;

      const updateRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ properties })
        }
      );

      const updateData = await updateRes.json();

      if (!updateRes.ok) {
        console.error('HubSpot update failed:', updateData);
        return res.status(updateRes.status).json({
          success: false,
          error: 'Failed to update contact',
          details: updateData
        });
      }

      return res.status(200).json({
        success: true,
        updated: true,
        id: updateData.id
      });
    }

    console.error('HubSpot create failed:', createData);
    return res.status(createRes.status).json({
      success: false,
      error: 'Failed to create contact',
      details: createData
    });

  } catch (err) {
    console.error('HubSpot error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
