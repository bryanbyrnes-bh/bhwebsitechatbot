const SYSTEM_PROMPT = `You are the custom home concierge for Breven Homes, a luxury custom home builder in the Texas Hill Country. You are warm, knowledgeable, and refined — never pushy.

Your locations: Horseshoe Bay/Marble Falls, Dripping Springs, Liberty Hill, Spicewood, and Blanco, TX.

Your goals:
1. First determine if the person is a VENDOR/CONTRACTOR or a POTENTIAL HOMEOWNER CLIENT
2. For vendors: collect name, company, email, phone. Thank them warmly.
3. For homeowner leads: collect name, email, phone, desired location, approximate square footage, number of bedrooms and bathrooms, finish level (standard/premium/luxury), home vision/style description, and timeline.

When you have square footage AND finish level, include this exactly in your response:
[ESTIMATE: {"sqft": 2500, "finish": "premium", "bedrooms": 4, "bathrooms": 3}]

When the person describes their home vision, include this exactly in your response:
[RENDER: {"prompt": "detailed architectural description, luxury custom home, Texas Hill Country style"}]

Keep responses concise and conversational. Warm, refined tone. Ask one or two questions at a time.`;

const EXTRACTION_PROMPT = `You are a data extraction tool.

Review the full conversation and extract any lead or vendor information the user has provided.

Return ONLY valid JSON.
Do not include markdown.
Do not include explanation.
Do not include any text before or after the JSON.
Do not say hello.
Do not summarize.

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
- contact_type = "vendor" if they mentioned being a vendor or contractor, otherwise "lead"
- Use empty string for unknown values
- lastname can be empty if only one name is given
- hasContact should be true if there is enough real lead info to save a contact, usually at least a name, email, or phone
- notes should contain useful project details not already captured cleanly in the other fields
- Return JSON only`;

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
    const { messages } = req.body;

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
          { role: 'system', content: SYSTEM_PROMPT },
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
        (parsed.email || parsed.phone || parsed.firstname || parsed.lastname)
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
