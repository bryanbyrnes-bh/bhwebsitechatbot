import { createHmac } from 'node:crypto';

async function highLevel(path, method, body) {
  const response = await fetch('https://services.leadconnectorhq.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + process.env.GHL_PRIVATE_INTEGRATION_TOKEN,
      Version: '2021-07-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('HighLevel returned HTTP ' + response.status);
  return response.json();
}

async function upsertContact(contact) {
  const fields = {
    firstName: contact.firstname, lastName: contact.lastname,
    email: contact.email, phone: contact.phone
  };
  const payload = Object.fromEntries(Object.entries(fields).filter(([, value]) =>
    typeof value === 'string' && value.trim()
  ));
  const result = await highLevel('/contacts/upsert', 'POST', {
    ...payload, locationId: process.env.GHL_LOCATION_ID, source: 'Breven Homes website chatbot'
  });
  if (!result.contact?.id) throw new Error('Missing HighLevel contact ID');
  return result.contact;
}

function projectDetails(contact, entryPoint) {
  return [
    entryPoint === 'planning' && 'Complimentary Homeowner Planning Session',
    ...Object.entries({
      'Contact type': contact.contact_type, 'Build location': contact.location,
      'Square footage': contact.sqft, 'Finish level': contact.finish_level,
      'Timeline': contact.timeline, 'Project details': contact.notes
    }).filter(([, value]) => value).map(([key, value]) => key + ': ' + value)
  ].filter(Boolean).join('\n');
}

async function createFollowUp(contact, contactId, entryPoint) {
  const name = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email || contact.phone;
  const result = await highLevel('/contacts/' + encodeURIComponent(contactId) + '/tasks', 'POST', {
    title: 'Follow up: ' + (entryPoint === 'planning' ? 'planning session' : 'website chat') + ' — ' + name,
    body: projectDetails(contact, entryPoint), completed: false,
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    assignedTo: process.env.GHL_TASK_OWNER_ID || undefined
  });
  if (!result.task?.id) throw new Error('Missing HighLevel task ID');
  return result.task;
}

function noteBody(messages, finalized, details) {
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
    escape([details, text].filter(Boolean).join('\n\n')).replace(/\n/g, '<br>');
}

function noteSignature(contactId, id) {
  return createHmac('sha256', process.env.GHL_PRIVATE_INTEGRATION_TOKEN)
    .update(JSON.stringify([contactId, id])).digest('hex');
}

async function saveTranscript(messages, contactId, noteId, finalized, details) {
  const path = '/contacts/' + encodeURIComponent(contactId) + '/notes';
  const body = { body: noteBody(messages, finalized, details) };
  if (noteId) {
    const [id, signature] = String(noteId).split('.');
    if (!id || signature !== noteSignature(contactId, id)) throw new Error('Invalid transcript reference');
    await highLevel(path + '/' + encodeURIComponent(id), 'PUT', body);
    return { id: noteId };
  }
  const result = await highLevel(path, 'POST', body);
  const id = result.note?.id;
  if (!id) throw new Error('Missing HighLevel note ID');
  return { id: id + '.' + noteSignature(contactId, id) };
}

async function sendLeadAlert(contact, contactId, entryPoint) {
  const to = (process.env.LEAD_ALERT_TO || '').split(',').map(value => value.trim()).filter(Boolean);
  const from = process.env.LEAD_ALERT_FROM;
  if (!process.env.RESEND_API_KEY || !from || !to.length) {
    throw new Error('Email alert is not configured');
  }
  const name = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || 'Website visitor';
  const fields = [
    entryPoint === 'planning' ? 'New complimentary planning session inquiry' : 'New Breven Homes website chat inquiry',
    `Name: ${name}`,
    `Email: ${contact.email || 'Not provided'}`,
    `Phone: ${contact.phone || 'Not provided'}`,
    `Type: ${contact.contact_type || 'Unknown'}`,
    contact.location && `Location: ${contact.location}`,
    contact.sqft && `Square footage: ${contact.sqft}`,
    contact.timeline && `Timeline: ${contact.timeline}`,
    `HighLevel contact: https://app.gohighlevel.com/v2/location/${encodeURIComponent(process.env.GHL_LOCATION_ID)}/contacts/detail/${encodeURIComponent(contactId)}`
  ].filter(Boolean);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New Breven Homes ${entryPoint === 'planning' ? 'planning session' : 'chat inquiry'} — ${name.replace(/[\r\n]/g, ' ').slice(0, 100)}`,
      text: fields.join('\n')
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Email provider returned ${response.status}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GHL_PRIVATE_INTEGRATION_TOKEN || !process.env.GHL_LOCATION_ID) return res.status(500).json({ error: 'HighLevel is not configured' });

  const { contact, createTask, recordInquiry, sendAlert, messages, noteId, finalized, entryPoint } = req.body || {};
  const email = typeof contact?.email === 'string' ? contact.email.trim() : '';
  const phone = typeof contact?.phone === 'string' ? contact.phone.trim() : '';
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone is required' });

  try {
    const saved = await upsertContact({ ...contact, email, phone });
    const followUp = { taskCreated: false, inquiryRecorded: false, alertSent: false, noteSaved: false, errors: [] };

    if (Array.isArray(messages) && messages.length) {
      try {
        const note = await saveTranscript(messages, saved.id, noteId, Boolean(finalized), projectDetails(contact, entryPoint));
        followUp.noteSaved = true;
        followUp.noteId = note.id;
      } catch (error) {
        console.error('HighLevel transcript note failed:', error);
        followUp.errors.push('Transcript note save failed');
      }
    }

    if (createTask) {
      try {
        const task = await createFollowUp({ ...contact, email, phone }, saved.id, entryPoint);
        followUp.taskCreated = true;
        followUp.taskId = task.id;
      } catch (error) {
        console.error('HighLevel task creation failed:', error);
        followUp.errors.push('Task creation failed');
      }
    }

    // The contact note records each inquiry and its creation time.
    followUp.inquiryRecorded = Boolean(recordInquiry && followUp.noteSaved);

    if (sendAlert) {
      try {
        const alert = await sendLeadAlert({ ...contact, email, phone }, saved.id, entryPoint);
        followUp.alertSent = true;
        followUp.alertId = alert.id;
      } catch (error) {
        console.error('Lead email alert failed:', error);
        followUp.errors.push('Email alert failed');
      }
    }

    return res.status(200).json({ success: true, id: saved.id, followUp });
  } catch (error) {
    console.error('HighLevel contact save failed:', error);
    return res.status(error.status >= 400 && error.status < 500 ? error.status : 502)
      .json({ success: false, error: 'Contact could not be saved' });
  }
}
