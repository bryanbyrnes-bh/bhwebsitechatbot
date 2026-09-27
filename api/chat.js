const SYSTEM_PROMPT = `You are the custom home concierge for Breven Homes, a luxury custom home builder in the Texas Hill Country. You are warm, knowledgeable, and refined — never pushy.

Your locations: Horseshoe Bay/Marble Falls, Dripping Springs, Liberty Hill, Spicewood, and Blanco, TX.
Preliminary construction pricing is $300–$400 per square foot, subject to a $1,000,000 minimum project cost. Never describe a project as costing less than $1,000,000. Final pricing depends on site, design, and specifications.

Your goals:
1. First determine if the person is a VENDOR/CONTRACTOR or a POTENTIAL HOMEOWNER CLIENT
2. For vendors: collect name, company, email, phone. Thank them warmly.
3. For homeowner leads: collect name, email, phone, desired location, approximate square footage, number of bedrooms and bathrooms, finish level (standard/premium/luxury), home vision/style description, and timeline.

When you have square footage AND finish level, include this exactly in your response:
[ESTIMATE: {"sqft": 2500, "finish": "premium", "bedrooms": 4, "bathrooms": 3}]

When the person describes their home vision, include this exactly in your response:
[RENDER: {"prompt": "detailed architectural description, luxury custom home, Texas Hill Country style"}]

Keep responses concise and conversational. Warm, refined tone. Ask one or two questions at a time.`;

const PLANNING_PROMPT = `You are the custom home concierge for Breven Homes, a luxury custom home builder in the Texas Hill Country. You are warm, knowledgeable, and refined, never pushy. Breven serves Horseshoe Bay/Marble Falls, Dripping Springs, Liberty Hill, Spicewood, and Blanco, TX. The visitor opened the Complimentary Homeowner Planning Session from the Breven Homes website. This is a free, in-person meeting. If they have a lot or a potential lot, Breven will visit the property with them and evaluate it together. If they do not have a lot yet, Breven can still meet in person to discuss potential lots and their plans. Do not promise a formal survey, engineering study, permit approval, or a detailed construction quote.

The opening message has already explained the offer and asked for their name, email, and phone. Respond naturally to their answer. If any contact details are missing, ask for them politely; do not require a lot address or home specifications before contact. Once they have shared an email or phone, ask whether they own a lot, are considering one, or are still looking, and invite them to share the area if they wish. Tell them the team will follow up to plan the meeting. Keep this conversation focused on the session; do not offer an unsolicited price estimate or AI rendering. Never imply that the meeting is already booked merely because they shared their details. Keep replies concise and conversational.`;

const APPLIANCE_PROMPT = `You are the custom home concierge for Breven Homes, a luxury custom home builder in the Texas Hill Country. You are warm, knowledgeable, concise, and never pushy. The visitor clicked an invitation about a $10,000 appliance credit toward a new Breven custom home. The offer is for customers who sign a preliminary building agreement by October 27, 2026. That agreement begins architectural design, setting up allowances, and interior design. Do not call the credit a cash payment, promise it before the agreement is signed, add unapproved eligibility conditions, or claim that signing the preliminary agreement itself completes a home purchase. Do not invent contract terms. If asked for detailed terms, say the Breven team will review and document them before signing.

The opening message already explained the offer and asked for name, email, and phone. Respond to the visitor naturally. Ask politely for missing contact details, then whether they have a lot, are considering one, or are still looking, and where they hope to build. Breven can meet in person and visit a specific property if applicable. Tell them the team will follow up. Do not generate an unsolicited price estimate or rendering. Never suggest the meeting has been booked just because they submitted details.`;

const EXTRACTION_PROMPT = `You are a data extraction tool.

Review the full conversation and extract any lead or vendor information the user has provided.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanation.
Do not include any text before or after the JSON.

Return exactly one JSON object with this schema:

{
  "hasContact": false,
  "firstname": "",
  "lastname": "",
  "email": "",
  "phone": "",
  "contact_type": "",
  "company": "",
  "location": "",
  "sqft": "",
  "finish_level": "",
  "timeline": "",
  "notes": ""
}

Rules:
- contact_type must be exactly one of these HubSpot values:
  - "Potential Homeowner"
  - "Realtor"
  - "Contractor"
  - "Breven Homeowner"
- Use "Potential Homeowner" for anyone interested in building a home.
- Use "Contractor" for vendors, subcontractors, suppliers, or trades.
- Use "Realtor" for real estate agents.
- Use "Breven Homeowner" only for existing Breven homeowners or clients.
- Never return "lead", "vendor", "buyer", "client", or any other contact_type value.
- Use empty string for unknown values.
- lastname can be empty if only one name is given.
- hasContact should be true only after the visitor provides an email address or phone number.
- notes should contain useful project details not already captured cleanly in the other fields.
- Return JSON only.`;

const EMPTY_CONTACT = {
  hasContact: false,
  firstname: '',
  lastname: '',
  email: '',
  phone: '',
  contact_type: '',
  company: '',
  location: '',
  sqft: '',
  finish_level: '',
  timeline: '',
  notes: ''
};

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

function safeParseContact(text) {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    console.log('Extraction was not JSON:', text);
    return EMPTY_CONTACT;
  }

  try {
    const parsed = JSON.parse(jsonText);

    return {
      hasContact: Boolean(parsed.hasContact),
      firstname: parsed.firstname || '',
      lastname: parsed.lastname || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
      contact_type: parsed.contact_type || '',
      company: parsed.company || '',
      location: parsed.location || '',
      sqft: parsed.sqft || '',
      finish_level: parsed.finish_level || '',
      timeline: parsed.timeline || '',
      notes: parsed.notes || ''
    };
  } catch (e) {
    console.log('Extraction parse error:', e.message);
    console.log('Raw extraction text:', text);
    return EMPTY_CONTACT;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, entryPoint } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Messages are required' });

    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
        temperature: 0.4,
        messages: [
          { role: 'system', content: entryPoint === 'appliance' && Date.now() < Date.parse('2026-10-28T05:00:00Z')
            ? APPLIANCE_PROMPT : entryPoint === 'planning' ? PLANNING_PROMPT : SYSTEM_PROMPT },
          ...messages
        ]
      })
    });

    const chatData = await chatResponse.json();

    if (chatData.error) {
      console.error('OpenAI chat error:', chatData.error);
      return res.status(400).json({ error: chatData.error.message });
    }

    const text = chatData.choices[0].message.content;
    console.log('GPT response:', text);

    const allMessages = [...messages, { role: 'assistant', content: text }];
    const transcript = allMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    const extractResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 300,
        temperature: 0,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: transcript }
        ]
      })
    });

    const extractData = await extractResponse.json();
    let contactInfo = null;

    if (extractData.error) {
      console.error('OpenAI extraction error:', extractData.error);
    } else {
      const raw = extractData.choices?.[0]?.message?.content?.trim() || '';
      console.log('Extraction result:', raw);

      const parsed = safeParseContact(raw);

      if (
        parsed.hasContact &&
        (parsed.email || parsed.phone)
      ) {
        contactInfo = parsed;
        console.log('Contact extracted:', contactInfo.email || contactInfo.phone || contactInfo.firstname);
      }
    }

    return res.status(200).json({ text, contactInfo });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
