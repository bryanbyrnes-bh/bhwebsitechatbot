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

const EXTRACTION_PROMPT = `You are a data extractor. Review this conversation and extract any contact information the user has provided.

If the conversation contains at minimum a name AND email address, respond with ONLY this JSON (no markdown, no explanation):
{"hasContact": true, "firstname": "John", "lastname": "Doe", "email": "john@example.com", "phone": "5551234", "contact_type": "vendor", "company": "Company Name", "location": "", "sqft": "", "finish_level": "", "timeline": "", "notes": "brief summary"}

Rules:
- contact_type = "vendor" if they mentioned being a vendor/contractor, otherwise "lead"
- Use empty string "" for any field not mentioned
- lastname can be empty string if only first name given
- If no name AND email present yet, respond with only: {"hasContact": false}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;

    // Main chat response
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1000,
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

    // Separately extract contact info from the full conversation
    const allMessages = [...messages, { role: 'assistant', content: text }];

    const extractResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 300,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          ...allMessages
        ]
      })
    });

    const extractData = await extractResponse.json();
    let contactInfo = null;

    try {
      const raw = extractData.choices[0].message.content.trim();
      console.log('Extraction result:', raw);
      const parsed = JSON.parse(raw);
      if (parsed.hasContact === true) {
        contactInfo = parsed;
        console.log('Contact extracted:', contactInfo.email);
      }
    } catch(e) {
      console.log('Extraction parse error:', e.message);
    }

    return res.status(200).json({ text, contactInfo });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
