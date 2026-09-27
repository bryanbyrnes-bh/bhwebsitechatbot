const HUBSPOT = 'https://api.hubapi.com';
const CONTACT_TYPES = new Set(['Potential Homeowner', 'Realtor', 'Contractor', 'Breven Homeowner']);

async function hubspot(path, method, body) {
  const response = await fetch(`${HUBSPOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `HubSpot returned ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function contactProperties(contact) {
  // Omitting unknown fields prevents a later chat turn from erasing CRM data.
  const source = {
    firstname: contact.firstname,
    lastname: contact.lastname,
    email: contact.email,
    phone: contact.phone,
    contact_type: CONTACT_TYPES.has(contact.contact_type) ? contact.contact_type : undefined,
    city: contact.location,
    desired_location: contact.location,
    square_footage: contact.sqft ? Number(contact.sqft) : undefined,
    finish_level: contact.finish_level,
    build_timeline: contact.timeline,
    project_notes: contact.notes
  };
  return Object.fromEntries(Object.entries(source).filter(([, value]) =>
    value !== undefined && value !== null && value !== '' &&
    (typeof value !== 'number' || Number.isFinite(value))
  ));
}

async function upsertContact(contact, contactId) {
  const properties = contactProperties(contact);
  if (contactId) {
    const existing = await hubspot(
      `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?properties=email,phone`, 'GET'
    );
    const sameEmail = contact.email && existing.properties?.email?.toLowerCase() === contact.email.toLowerCase();
    const samePhone = contact.phone && existing.properties?.phone === contact.phone;
    if (!sameEmail && !samePhone) {
      const error = new Error('Contact ID does not match the supplied contact details');
      error.status = 400;
      throw error;
    }
    return hubspot(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, 'PATCH', { properties });
  }
  try {
    return await hubspot('/crm/v3/objects/contacts', 'POST', {
      properties: { ...properties, hs_lead_status: 'NEW' }
    });
  } catch (error) {
    // HubSpot returns 409 for an email already attached to a contact.
    if (error.status !== 409 || !contact.email) throw error;
    return hubspot(
      `/crm/v3/objects/contacts/${encodeURIComponent(contact.email)}?idProperty=email`,
      'PATCH', { properties }
    );
  }
}

async function createFollowUp(contact, contactId) {
  const association = await hubspot('/crm/v4/associations/tasks/contacts/labels', 'GET');
  const defaultType = association.results?.find(item => item.category === 'HUBSPOT_DEFINED' && item.label === null);
  if (!defaultType) throw new Error('HubSpot task-to-contact association was not found');

  const name = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email || contact.phone;
  const details = [
    `Source: Breven Homes website chatbot`,
    `Type: ${contact.contact_type || 'Unknown'}`,
    `Name: ${name}`,
    `Email: ${contact.email || 'Not provided'}`,
    `Phone: ${contact.phone || 'Not provided'}`,
    contact.location && `Location: ${contact.location}`,
    contact.sqft && `Square footage: ${contact.sqft}`,
    contact.finish_level && `Finish level: ${contact.finish_level}`,
    contact.timeline && `Timeline: ${contact.timeline}`,
    contact.notes && `Project details: ${contact.notes}`
  ].filter(Boolean).join('\n');

  return hubspot('/crm/v3/objects/tasks', 'POST', {
    properties: {
      hs_timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      hs_task_subject: `Follow up: website chat — ${name}`,
      hs_task_body: details,
      hs_task_status: 'NOT_STARTED',
      hubspot_owner_id: process.env.HUBSPOT_TASK_OWNER_ID || '168491860'
    },
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: defaultType.category, associationTypeId: defaultType.typeId }]
    }]
  });
}

function noteBody(messages, finalized) {
  if (!Array.isArray(messages) || messages.length > 150) throw new Error('Invalid chat transcript');
  const lines = messages.map(message => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string') {
      throw new Error('Invalid chat transcript');
    }
    return `${message.role === 'user' ? 'VISITOR' : 'BREVEN ASSISTANT'}: ${message.content
      .replace(/\[ESTIMATE:.*?\]/gs, '').replace(/\[RENDER:.*?\]/gs, '').trim()}`;
  });
  const text = lines.join('\n\n');
  if (text.length > 100000) throw new Error('Chat transcript is too long');
  const escape = value => value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  return `<strong>Website chat transcript${finalized ? ' — completed' : ' — in progress'}</strong><br><br>` +
    escape(text).replace(/\n/g, '<br>');
}

async function saveTranscript(messages, contactId, noteId, finalized) {
  const properties = { hs_note_body: noteBody(messages, finalized) };
  if (noteId) {
    const note = await hubspot(
      `/crm/v3/objects/notes/${encodeURIComponent(noteId)}?associations=contacts`, 'GET'
    );
    const linked = note.associations?.contacts?.results?.some(item => String(item.id) === String(contactId));
    if (!linked) throw new Error('Transcript note is not linked to the contact');
    return hubspot(`/crm/v3/objects/notes/${encodeURIComponent(noteId)}`, 'PATCH', { properties });
  }
  return hubspot('/crm/v3/objects/notes', 'POST', {
    properties: { ...properties, hs_timestamp: new Date().toISOString() },
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
    }]
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.HUBSPOT_ACCESS_TOKEN) return res.status(500).json({ error: 'HubSpot is not configured' });

  const { contact, contactId, createTask, triggerWorkflow, messages, noteId, finalized } = req.body || {};
  const email = typeof contact?.email === 'string' ? contact.email.trim() : '';
  const phone = typeof contact?.phone === 'string' ? contact.phone.trim() : '';
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone is required' });

  try {
    const saved = await upsertContact({ ...contact, email, phone }, contactId);
    const followUp = { taskCreated: false, workflowTriggered: false, noteSaved: false, errors: [] };

    if (Array.isArray(messages) && messages.length) {
      try {
        const note = await saveTranscript(messages, saved.id, noteId, Boolean(finalized));
        followUp.noteSaved = true;
        followUp.noteId = note.id;
      } catch (error) {
        console.error('HubSpot transcript note failed:', error);
        followUp.errors.push('Transcript note save failed');
      }
    }

    if (createTask) {
      try {
        const task = await createFollowUp({ ...contact, email, phone }, saved.id);
        followUp.taskCreated = true;
        followUp.taskId = task.id;
      } catch (error) {
        console.error('HubSpot task creation failed:', error);
        followUp.errors.push('Task creation failed');
      }
    }

    if (triggerWorkflow) {
      const property = process.env.HUBSPOT_CHAT_EVENT_PROPERTY || 'bh_chat_inquiry_at';
      if (!property || !/^[a-z][a-z0-9_]*$/.test(property)) {
        followUp.errors.push('HubSpot chat workflow property is not configured');
      } else {
        try {
          await hubspot(`/crm/v3/objects/contacts/${saved.id}`, 'PATCH', {
            properties: { [property]: new Date().toISOString() }
          });
          followUp.workflowTriggered = true;
        } catch (error) {
          console.error('HubSpot workflow event update failed:', error);
          followUp.errors.push('Workflow event update failed');
        }
      }
    }

    return res.status(200).json({ success: true, id: saved.id, followUp });
  } catch (error) {
    console.error('HubSpot contact save failed:', error);
    return res.status(error.status >= 400 && error.status < 500 ? error.status : 502)
      .json({ success: false, error: 'Contact could not be saved' });
  }
}
